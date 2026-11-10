// src/services/recovery/restore.ts
//
// Applies a decrypted recovery file to the live (or a brand-new) project.
// Used by two callers with the same functions:
//   • the web restore wizard — the browser decrypts the file locally (the
//     private key never leaves the admin's computer) and sends small
//     batches to /api/admin/recovery/restore/* (recoveryController.ts);
//   • the CLI (scripts/recovery.ts restore) when the app itself is gone.
//
// Modes:
//   merge — only adds what is missing; never overwrites live data (default).
//   full  — returns the system to the file's state: included collections are
//           wiped then rewritten, file users replace live ones, live users
//           missing from the file are disabled (never deleted).
// Order: logins → Firestore → files → (optional) outage grace → revoke sessions.

import zlib from 'zlib';
import { Readable } from 'stream';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import type { UserImportRecord, UserImportOptions } from 'firebase-admin/auth';
import { auth, db } from '../../config/firebase.js';
import { decodeDoc, encodeDoc, stableStringify, type DecodeOptions } from './encode.js';
import {
  EntryParser, RecoveryDecryptor,
  type AuthUserLine, type FirebaseHashConfig, type FsDocLine, type KeyKit, type RecoveryEntryMeta,
} from './format.js';
import { EXCLUDED_COLLECTIONS, isExcludedDocPath } from './config.js';
import { restoreAsset } from './cloudinaryFiles.js';

export type RestoreMode = 'merge' | 'full';

// ── Reading a file (Node: CLI / tests) ───────────────────────────────────────

export async function readRecoveryStream(
  source: AsyncIterable<Uint8Array>,
  kit: KeyKit,
  onEntry: (meta: RecoveryEntryMeta, body: Uint8Array) => Promise<void>,
): Promise<RecoveryDecryptor> {
  const decryptor = new RecoveryDecryptor(kit);
  async function* plain(): AsyncGenerator<Uint8Array> {
    for await (const chunk of source) {
      for (const p of await decryptor.feed(chunk)) yield p;
    }
    decryptor.end();
  }
  const parser = new EntryParser();
  const gunzip = Readable.from(plain(), { objectMode: false }).pipe(zlib.createGunzip());
  for await (const chunk of gunzip as AsyncIterable<Buffer>) {
    for (const e of parser.feed(chunk)) await onEntry(e.meta, e.body);
  }
  parser.end();
  return decryptor;
}

// ── Firestore ────────────────────────────────────────────────────────────────

function topCollection(path: string): string {
  return path.split('/')[0] ?? '';
}

/** Paths a restore must never write or delete. */
function isProtectedPath(path: string, protectUid: string | null): boolean {
  if (isExcludedDocPath(path) || EXCLUDED_COLLECTIONS.has(topCollection(path))) return true;
  return !!protectUid && (path === `users/${protectUid}` || path.startsWith(`users/${protectUid}/`));
}

function isValidDocPath(path: string): boolean {
  const parts = path.split('/');
  return parts.length >= 2 && parts.length % 2 === 0 && parts.every((p) => p.length > 0 && p !== '.' && p !== '..');
}

export interface FsDryRun { added: number; same: number; changed: number }

export async function dryRunFirestoreDocs(lines: FsDocLine[]): Promise<Record<string, FsDryRun>> {
  const out: Record<string, FsDryRun> = {};
  const valid = lines.filter((l) => isValidDocPath(l.p));
  for (let i = 0; i < valid.length; i += 300) {
    const chunk = valid.slice(i, i + 300);
    const snaps = await db.getAll(...chunk.map((l) => db.doc(l.p)));
    snaps.forEach((snap, k) => {
      const line = chunk[k]!;
      const bucket = (out[topCollection(line.p)] ??= { added: 0, same: 0, changed: 0 });
      if (!snap.exists) bucket.added++;
      else if (stableStringify(encodeDoc(snap.data() ?? {})) === stableStringify(line.d)) bucket.same++;
      else bucket.changed++;
    });
  }
  return out;
}

export interface FsRestoreResult { written: number; skipped: number; protectedSkipped: number }

export async function restoreFirestoreDocs(
  lines: FsDocLine[],
  mode: RestoreMode,
  opts: { rewriteCloud: DecodeOptions['rewriteCloud']; protectUid: string | null },
): Promise<FsRestoreResult> {
  const res: FsRestoreResult = { written: 0, skipped: 0, protectedSkipped: 0 };
  const usable = lines.filter((l) => {
    if (!isValidDocPath(l.p)) { res.skipped++; return false; }
    if (isProtectedPath(l.p, opts.protectUid)) { res.protectedSkipped++; return false; }
    return true;
  });
  let toWrite = usable;
  if (mode === 'merge') {
    toWrite = [];
    for (let i = 0; i < usable.length; i += 300) {
      const chunk = usable.slice(i, i + 300);
      const snaps = await db.getAll(...chunk.map((l) => db.doc(l.p)));
      snaps.forEach((s, k) => {
        const l = chunk[k]!;
        // Missing → write. Journal versions (carry `u`, their updateTime)
        // also replace a live doc that is OLDER than them — and only then,
        // so replaying the same journal twice changes nothing.
        const newerJournal = l.u != null && !!s.updateTime && s.updateTime.toMillis() < l.u;
        if (!s.exists || newerJournal) toWrite.push(l); else res.skipped++;
      });
    }
  }
  const writer = db.bulkWriter();
  const decodeOpts: DecodeOptions = { db, rewriteCloud: opts.rewriteCloud ?? null };
  for (const l of toWrite) {
    // set() with the original data — original doc IDs and Timestamps, no
    // serverTimestamp(), so every record keeps its real date/time.
    void writer.set(db.doc(l.p), decodeDoc(l.d, decodeOpts));
  }
  await writer.close();
  res.written = toWrite.length;
  return res;
}

/** Full mode, step 1: delete every backed-up collection's documents (and
 *  their subcollections) so the file's state is reproduced exactly. Skips
 *  excluded collections/docs and the acting admin's own user doc. */
export async function wipeForFullRestore(protectUid: string | null, log: (m: string) => void = () => undefined): Promise<Record<string, number>> {
  const deleted: Record<string, number> = {};
  const cols = (await db.listCollections()).filter((c) => !EXCLUDED_COLLECTIONS.has(c.id));
  for (const col of cols) {
    const refs = await col.listDocuments();
    let n = 0;
    const writer = db.bulkWriter();
    for (const ref of refs) {
      if (isProtectedPath(ref.path, protectUid)) continue;
      await db.recursiveDelete(ref, writer);
      n++;
    }
    await writer.close();
    deleted[col.id] = n;
    log(`wiped ${col.id}: ${n}`);
  }
  return deleted;
}

// ── Logins (Firebase Auth) ───────────────────────────────────────────────────

export interface AuthDryRun { added: number; existing: number; emailChanged: number; withoutPassword: number }

export async function dryRunAuthUsers(users: AuthUserLine[]): Promise<AuthDryRun> {
  const out: AuthDryRun = { added: 0, existing: 0, emailChanged: 0, withoutPassword: 0 };
  for (let i = 0; i < users.length; i += 100) {
    const chunk = users.slice(i, i + 100);
    const res = await auth.getUsers(chunk.map((u) => ({ uid: u.uid })));
    const live = new Map(res.users.map((u) => [u.uid, u]));
    for (const u of chunk) {
      const l = live.get(u.uid);
      if (!l) out.added++;
      else { out.existing++; if ((l.email ?? null) !== u.email) out.emailChanged++; }
      if (!u.passwordHash && u.providerData.some((p) => p.providerId === 'password')) out.withoutPassword++;
    }
  }
  return out;
}

function importRecord(u: AuthUserLine, withPassword: boolean): UserImportRecord {
  const r: UserImportRecord = { uid: u.uid, emailVerified: u.emailVerified, disabled: u.disabled };
  if (u.email) r.email = u.email;
  if (u.displayName) r.displayName = u.displayName;
  if (u.photoURL) r.photoURL = u.photoURL;
  if (u.phoneNumber) r.phoneNumber = u.phoneNumber;
  if (u.customClaims) r.customClaims = u.customClaims as Record<string, unknown>;
  const meta: { creationTime?: string; lastSignInTime?: string } = {};
  if (u.creationTime) meta.creationTime = u.creationTime;
  if (u.lastSignInTime) meta.lastSignInTime = u.lastSignInTime;
  r.metadata = meta as NonNullable<UserImportRecord['metadata']>;
  if (withPassword && u.passwordHash) {
    r.passwordHash = Buffer.from(u.passwordHash, 'base64');
    if (u.passwordSalt) r.passwordSalt = Buffer.from(u.passwordSalt, 'base64');
  }
  // Federated links (Google / Apple) — 'password' and 'phone' come from the
  // fields above, importUsers doesn't accept them as providers.
  const providers = u.providerData.filter((p) => p.providerId !== 'password' && p.providerId !== 'phone');
  if (providers.length) {
    r.providerData = providers.map((p) => {
      const info: { uid: string; providerId: string; email?: string; displayName?: string; photoURL?: string } = { uid: p.uid, providerId: p.providerId };
      if (p.email) info.email = p.email;
      if (p.displayName) info.displayName = p.displayName;
      if (p.photoURL) info.photoURL = p.photoURL;
      return info;
    });
  }
  return r;
}

export function hashOptions(h: FirebaseHashConfig): UserImportOptions {
  return {
    hash: {
      algorithm: 'SCRYPT',
      key: Buffer.from(h.base64SignerKey, 'base64'),
      saltSeparator: Buffer.from(h.base64SaltSeparator, 'base64'),
      rounds: h.rounds,
      memoryCost: h.memCost,
    },
  };
}

export interface AuthRestoreResult { imported: number; skipped: number; withoutPassword: number; failed: Array<{ uid: string; error: string }> }

/** Restores logins with their EXISTING passwords (scrypt hashes + the
 *  project's hash parameters from the key kit). Without the parameters,
 *  email/password users are created without a password and need a reset. */
export async function restoreAuthUsers(
  users: AuthUserLine[],
  mode: RestoreMode,
  hash: FirebaseHashConfig | null,
  protectUid: string | null,
): Promise<AuthRestoreResult> {
  const res: AuthRestoreResult = { imported: 0, skipped: 0, withoutPassword: 0, failed: [] };
  let pending = users.filter((u) => {
    if (u.uid === protectUid) { res.skipped++; return false; }
    return true;
  });

  const existing = new Set<string>();
  for (let i = 0; i < pending.length; i += 100) {
    const r = await auth.getUsers(pending.slice(i, i + 100).map((u) => ({ uid: u.uid })));
    r.users.forEach((u) => existing.add(u.uid));
  }
  if (mode === 'merge') {
    pending = pending.filter((u) => { if (existing.has(u.uid)) { res.skipped++; return false; } return true; });
  } else {
    // full: the file's version replaces the live one (same uid, so every
    // Firestore reference to it stays valid).
    const replace = pending.filter((u) => existing.has(u.uid)).map((u) => u.uid);
    for (let i = 0; i < replace.length; i += 1000) await auth.deleteUsers(replace.slice(i, i + 1000));
  }

  const withPassword = pending.filter((u) => u.passwordHash && hash);
  const without = pending.filter((u) => !(u.passwordHash && hash));
  res.withoutPassword = without.filter((u) => u.passwordHash || u.providerData.some((p) => p.providerId === 'password')).length;

  const run = async (list: AuthUserLine[], opts: UserImportOptions | undefined, pw: boolean) => {
    for (let i = 0; i < list.length; i += 1000) {
      const chunk = list.slice(i, i + 1000);
      const r = opts
        ? await auth.importUsers(chunk.map((u) => importRecord(u, pw)), opts)
        : await auth.importUsers(chunk.map((u) => importRecord(u, pw)));
      res.imported += r.successCount;
      for (const e of r.errors) res.failed.push({ uid: chunk[e.index]?.uid ?? '?', error: e.error.message.slice(0, 200) });
    }
  };
  if (withPassword.length && hash) await run(withPassword, hashOptions(hash), true);
  if (without.length) await run(without, undefined, false);
  return res;
}

/** Full mode: live logins that aren't in the file are disabled (not deleted)
 *  — e.g. accounts an attacker created. Reversible from the Users page. */
export async function disableUsersNotIn(uids: Set<string>, protectUid: string | null): Promise<number> {
  let n = 0;
  let token: string | undefined;
  do {
    const page = await auth.listUsers(1000, token);
    for (const u of page.users) {
      if (uids.has(u.uid) || u.uid === protectUid || u.disabled) continue;
      await auth.updateUser(u.uid, { disabled: true });
      n++;
    }
    token = page.pageToken;
  } while (token);
  return n;
}

/** Last step: everyone signs in again (same password). */
export async function revokeAllSessions(): Promise<number> {
  let n = 0;
  let token: string | undefined;
  do {
    const page = await auth.listUsers(1000, token);
    for (let i = 0; i < page.users.length; i += 20) {
      await Promise.all(page.users.slice(i, i + 20).map((u) => auth.revokeRefreshTokens(u.uid)));
    }
    n += page.users.length;
    token = page.pageToken;
  } while (token);
  return n;
}

// ── Files ────────────────────────────────────────────────────────────────────

export async function restoreFile(
  meta: { publicId: string; type: string; resourceType: string; format: string | null },
  bytes: Buffer,
  mode: RestoreMode,
): Promise<'uploaded' | 'existed'> {
  if (!meta.publicId || meta.publicId.includes('..')) throw new Error('Invalid file id.');
  return restoreAsset(meta, bytes, mode === 'full');
}

// ── Outage grace ─────────────────────────────────────────────────────────────

const DONE_MILESTONE = new Set(['coordinator_approved', 'completed']);
export const GRACE_SUPPRESS_HOURS = 24;

/** So users continue as if nothing happened: the outage window is added to
 *  every active project as a completed clock pause (stuck/overdue math
 *  already subtracts pauses — studentProgress.ts totalPausedMs), open
 *  milestone due dates after the outage start move forward by its length,
 *  and reminder/escalation sweeps stay quiet for 24 hours. */
export async function applyOutageGrace(from: Date, to: Date, actorUid: string): Promise<{ projects: number; milestones: number }> {
  if (!(to > from)) throw new Error('The outage end must be after its start.');
  const deltaMs = to.getTime() - from.getTime();
  const pause = {
    id: db.collection('_').doc().id,
    reason: 'other',
    note: 'System outage — recovery',
    pausedBy: actorUid,
    pausedAt: Timestamp.fromDate(from),
    resumedBy: actorUid,
    resumedAt: Timestamp.fromDate(to),
  };

  const writer = db.bulkWriter();
  let projects = 0;
  const projSnap = await db.collection('projects').get();
  for (const d of projSnap.docs) {
    const p = d.data();
    if (p.isArchived || p.status === 'completed') continue;
    void writer.update(d.ref, { clockPauseHistory: FieldValue.arrayUnion(pause) });
    projects++;
  }

  let milestones = 0;
  const msSnap = await db.collection('milestones').where('dueDate', '>=', Timestamp.fromDate(from)).get();
  for (const d of msSnap.docs) {
    const m = d.data();
    if (DONE_MILESTONE.has(m.status) || !(m.dueDate instanceof Timestamp)) continue;
    void writer.update(d.ref, { dueDate: Timestamp.fromMillis(m.dueDate.toMillis() + deltaMs) });
    milestones++;
  }
  await writer.close();

  await db.doc('system/recoveryGrace').set({
    until: Timestamp.fromMillis(Date.now() + GRACE_SUPPRESS_HOURS * 3_600_000),
    outageFrom: Timestamp.fromDate(from),
    outageTo: Timestamp.fromDate(to),
    setBy: actorUid,
    setAt: FieldValue.serverTimestamp(),
  });
  return { projects, milestones };
}
