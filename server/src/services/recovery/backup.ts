// src/services/recovery/backup.ts
//
// Builds one encrypted recovery file: every Firebase Auth login (incl.
// password hashes and Google/Apple links), every Firestore document with its
// original path and exact Timestamps (users, projects, milestones, grades,
// the project-record timeline, audit log, chats, 2FA secrets under
// users/{uid}/private, counters…), and the uploaded files from Cloudinary.
// See format.ts for the file layout and destinations.ts for where it goes.
//
// Runs in the recovery-backup Cloud Run Job (scripts/recovery.ts backup),
// never inside the api service — a weekly file with all uploads is far
// bigger than the api's 512 MiB / 5-minute request budget.

import zlib from 'zlib';
import { Readable, Writable } from 'stream';
import { pipeline } from 'stream/promises';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import { FieldPath, Timestamp, type CollectionReference, type DocumentReference, type Transaction } from 'firebase-admin/firestore';
import { auth, db } from '../../config/firebase.js';
import { encodeDoc } from './encode.js';
import {
  RecoveryEncryptor, encodeEntry, ndjson,
  type AuthUserLine, type FileIndexLine, type FsDocLine, type RecoveryKind, type RecoveryManifest,
} from './format.js';
import { DAILY_FILES_LOOKBACK_DAYS, ENV_VAR_NAMES, EXCLUDED_COLLECTIONS, RECOVERY_TZ, isExcludedDocPath } from './config.js';
import { downloadAsset, ensureCloudinaryConfigured, listAllAssets, type CloudinaryAsset } from './cloudinaryFiles.js';
import { FanOut, type RecoverySink } from './destinations.js';

dayjs.extend(utc);
dayjs.extend(timezone);

const DOCS_PER_ENTRY = 500;
const BYTES_PER_ENTRY = 4 * 1024 * 1024;
const SUBCOLLECTION_PARALLEL = 40;
const DOWNLOAD_PARALLEL = 6;

export function recoveryFileName(kind: RecoveryKind, at = new Date()): string {
  return `hit-recovery-${kind}-${dayjs(at).tz(RECOVERY_TZ).format('YYYY-MM-DD_HHmm')}.hitrec`;
}

/** Sunday (Israel time) runs are weekly — full files; other days daily. */
export function autoKind(at = new Date()): RecoveryKind {
  return dayjs(at).tz(RECOVERY_TZ).day() === 0 ? 'weekly' : 'daily';
}

/** Every document under `col` AS OF the snapshot's readTime, recursing
 *  into subcollections.
 *
 *  Consistency: all reads go through one read-only transaction pinned to a
 *  single readTime (createRecoveryFile), so the whole file is the database
 *  at that exact instant even though students keep working while it runs
 *  (no freeze window). The SDK opens no server transaction for this — it
 *  just sends readTime with each read — so a long walk can't time out.
 *  Docs are listed with a query at readTime (catches docs deleted after
 *  readTime) plus listDocuments, whose refs are only used to find "phantom"
 *  parents that have subcollections but no fields of their own. */
async function* walkCollection(col: CollectionReference, tx: Transaction): AsyncGenerator<FsDocLine> {
  const refs = new Map<string, DocumentReference>();
  let last: string | null = null;
  for (;;) {
    let q = col.orderBy(FieldPath.documentId()).limit(DOCS_PER_ENTRY);
    if (last) q = q.startAfter(last);
    const page = await tx.get(q);
    for (const d of page.docs) {
      refs.set(d.ref.path, d.ref);
      if (!isExcludedDocPath(d.ref.path)) yield { p: d.ref.path, d: encodeDoc(d.data()) };
    }
    if (page.size < DOCS_PER_ENTRY) break;
    last = page.docs[page.docs.length - 1]!.id;
  }
  for (const r of await col.listDocuments()) if (!refs.has(r.path)) refs.set(r.path, r);

  const all = [...refs.values()];
  for (let j = 0; j < all.length; j += SUBCOLLECTION_PARALLEL) {
    const part = all.slice(j, j + SUBCOLLECTION_PARALLEL);
    const found = await Promise.all(part.map(async (ref) => ({ ref, cols: await ref.listCollections() })));
    for (const { cols } of found) {
      for (const sub of cols) yield* walkCollection(sub, tx);
    }
  }
}

/** Whole-minute readTime: Firestore serves reads at any whole minute in the
 *  PITR window (7 days here), and at any instant within the last hour. */
export function snapshotReadTime(at = new Date()): Timestamp {
  return Timestamp.fromMillis(Math.floor(at.getTime() / 60_000) * 60_000);
}

/** A read-only transaction pinned to readTime, held open until release()
 *  (reads are made from a generator, so they can't sit inside the
 *  runTransaction callback itself). */
async function openSnapshot(readTime: Timestamp): Promise<{ tx: Transaction; release: () => void }> {
  let release!: () => void;
  const held = new Promise<void>((r) => { release = r; });
  const tx = await new Promise<Transaction>((resolve, reject) => {
    db.runTransaction(async (t) => { resolve(t); await held; }, { readOnly: true, readTime }).catch(reject);
  });
  return { tx, release };
}

function authLine(u: import('firebase-admin/auth').UserRecord): AuthUserLine {
  return {
    uid: u.uid,
    email: u.email ?? null,
    emailVerified: u.emailVerified,
    disabled: u.disabled,
    displayName: u.displayName ?? null,
    photoURL: u.photoURL ?? null,
    phoneNumber: u.phoneNumber ?? null,
    passwordHash: u.passwordHash ?? null,
    passwordSalt: u.passwordSalt ?? null,
    providerData: u.providerData.map((p) => ({
      uid: p.uid,
      providerId: p.providerId,
      email: p.email ?? null,
      displayName: p.displayName ?? null,
      photoURL: p.photoURL ?? null,
      phoneNumber: p.phoneNumber ?? null,
    })),
    creationTime: u.metadata.creationTime ?? null,
    lastSignInTime: u.metadata.lastSignInTime ?? null,
    customClaims: (u.customClaims as Record<string, unknown> | undefined) ?? null,
  };
}

export interface BackupOptions {
  kind: RecoveryKind;
  publicKeySpkiB64: string;
  sinks: RecoverySink[];
  /** Override the default (weekly/manual = all files, daily = last 8 days). */
  files?: 'all' | 'recent' | 'none';
  log?: (msg: string) => void;
}

export interface BackupResult {
  manifest: RecoveryManifest;
  fingerprint: string;
  bytesWritten: number;
  locations: Record<string, string>;
  errors: Record<string, string>;
}

export async function createRecoveryFile(opts: BackupOptions): Promise<BackupResult> {
  const log = opts.log ?? ((m: string) => console.log(`[recovery] ${m}`));
  const createdAt = new Date();
  const filesMode = opts.files ?? (opts.kind === 'daily' ? 'recent' : 'all');
  const filesSince = filesMode === 'recent' ? new Date(createdAt.getTime() - DAILY_FILES_LOOKBACK_DAYS * 86_400_000) : null;
  const cloudName = ensureCloudinaryConfigured();
  const readTime = snapshotReadTime(createdAt);

  const manifest: RecoveryManifest = {
    formatVersion: 1,
    kind: opts.kind,
    createdAt: createdAt.toISOString(),
    finishedAt: '',
    projectId: process.env.GOOGLE_CLOUD_PROJECT ?? process.env.GCLOUD_PROJECT ?? (db as unknown as { projectId?: string }).projectId ?? null,
    gitRevision: process.env.K_REVISION ?? process.env.CLOUD_RUN_EXECUTION ?? null,
    cloudinaryCloud: cloudName,
    firestore: {},
    authUsers: 0,
    authUsersWithPassword: 0,
    filesIncluded: 0,
    filesIncludedBytes: 0,
    filesIndexed: 0,
    filesSince: filesSince?.toISOString() ?? null,
    snapshotReadTime: readTime.toDate().toISOString(),
    excludedCollections: [...EXCLUDED_COLLECTIONS].sort(),
    envVarNames: ENV_VAR_NAMES,
    warnings: [],
  };

  async function* entries(): AsyncGenerator<Uint8Array> {
    // 1. Logins
    let pageToken: string | undefined;
    do {
      const page = await auth.listUsers(1000, pageToken);
      const lines = page.users.map(authLine);
      manifest.authUsers += lines.length;
      manifest.authUsersWithPassword += lines.filter((l) => l.passwordHash).length;
      if (lines.length) yield encodeEntry({ t: 'auth', n: lines.length }, ndjson(lines));
      pageToken = page.pageToken;
    } while (pageToken);
    if (manifest.authUsers > 0 && manifest.authUsersWithPassword === 0) {
      manifest.warnings.push('No password hashes were returned — the service account lacks permission to read them; restored email/password users would need a password reset.');
    }
    log(`auth: ${manifest.authUsers} users (${manifest.authUsersWithPassword} with password)`);

    // 2. Firestore — every document as of ONE instant (readTime).
    const cols = (await db.listCollections()).filter((c) => !EXCLUDED_COLLECTIONS.has(c.id)).sort((a, b) => a.id.localeCompare(b.id));
    const snap = await openSnapshot(readTime);
    try {
      for (const col of cols) {
        let lines: FsDocLine[] = [];
        let size = 0;
        let count = 0;
        for await (const line of walkCollection(col, snap.tx)) {
          const s = JSON.stringify(line).length;
          lines.push(line);
          size += s;
          count++;
          if (lines.length >= DOCS_PER_ENTRY || size >= BYTES_PER_ENTRY) {
            yield encodeEntry({ t: 'fs', collection: col.id, n: lines.length }, ndjson(lines));
            lines = [];
            size = 0;
          }
        }
        if (lines.length) yield encodeEntry({ t: 'fs', collection: col.id, n: lines.length }, ndjson(lines));
        manifest.firestore[col.id] = count;
        log(`firestore: ${col.id} ${count}`);
      }
    } finally {
      snap.release();
    }
    log(`firestore snapshot at ${readTime.toDate().toISOString()}`);

    // 3. Uploaded files
    let assets: CloudinaryAsset[] = [];
    try {
      assets = await listAllAssets();
    } catch (err) {
      manifest.warnings.push(`Could not list Cloudinary files: ${(err as Error).message}`);
    }
    const include = filesMode === 'none'
      ? []
      : assets.filter((a) => !filesSince || (a.createdAt && new Date(a.createdAt) >= filesSince));
    const included = new Set(include);
    const index: FileIndexLine[] = assets.map((a) => ({
      publicId: a.publicId, type: a.type, resourceType: a.resourceType, format: a.format,
      bytes: a.bytes, createdAt: a.createdAt, inThisFile: included.has(a),
    }));
    manifest.filesIndexed = index.length;
    yield encodeEntry({ t: 'fileindex', n: index.length }, ndjson(index));

    // Sliding window of downloads, written in order.
    const queue = include.map((a) => ({ a, p: null as Promise<Buffer | Error> | null }));
    const start = (i: number) => {
      const q = queue[i];
      if (q && !q.p) q.p = downloadAsset(q.a).catch((e: Error) => e);
    };
    for (let i = 0; i < Math.min(DOWNLOAD_PARALLEL, queue.length); i++) start(i);
    for (let i = 0; i < queue.length; i++) {
      start(i + DOWNLOAD_PARALLEL);
      const { a, p } = queue[i]!;
      const got = await p!;
      queue[i]!.p = null;
      if (got instanceof Error) {
        manifest.warnings.push(`File not saved: ${a.type}/${a.resourceType}/${a.publicId} (${got.message.slice(0, 120)})`);
        continue;
      }
      manifest.filesIncluded++;
      manifest.filesIncludedBytes += got.length;
      yield encodeEntry({
        t: 'file', publicId: a.publicId, type: a.type, resourceType: a.resourceType,
        format: a.format, bytes: got.length, createdAt: a.createdAt,
      }, got);
    }
    log(`files: ${manifest.filesIncluded}/${include.length} saved (${(manifest.filesIncludedBytes / 1048576).toFixed(1)} MB), ${index.length} indexed`);

    // 4. Manifest — always last
    manifest.finishedAt = new Date().toISOString();
    yield encodeEntry({ t: 'manifest' }, new TextEncoder().encode(JSON.stringify(manifest)));
  }

  const encryptor = await RecoveryEncryptor.create(opts.publicKeySpkiB64, opts.kind, { snapshotReadTime: readTime.toDate().toISOString() });
  const fan = new FanOut(opts.sinks);
  let bytesWritten = 0;
  const send = async (c: Uint8Array) => { bytesWritten += c.length; await fan.write(c); };

  try {
    await send(encryptor.headerChunk());
    await pipeline(
      Readable.from(entries(), { objectMode: false }),
      zlib.createGzip({ level: 6 }),
      new Writable({
        write(chunk: Buffer, _enc, cb) {
          encryptor.push(chunk)
            .then(async (frames) => { for (const f of frames) await send(f); })
            .then(() => cb(), cb);
        },
        final(cb) {
          encryptor.finish().then(send).then(() => cb(), cb);
        },
      }),
    );
    const { locations, errors } = await fan.finish();
    return { manifest, fingerprint: encryptor.header.fingerprint, bytesWritten, locations, errors };
  } catch (err) {
    fan.abortAll(err as Error);
    throw err;
  }
}
