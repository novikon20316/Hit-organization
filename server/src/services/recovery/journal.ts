// src/services/recovery/journal.ts — real-time event journal.
//
// The nightly recovery file can be up to ~24h old. To cut possible loss to
// seconds, every project event (submission, approval, rejection, grade,
// final-grade approval, defense date, form signature, exam step, …) — i.e.
// every projectRecordEntries write via logProjectRecordEntry — immediately
// writes a small ENCRYPTED journal object to the same locked off-site bucket:
// the record entry, the project, its milestones, grades and thesis exams as
// they are right after the event (typed encoding, original IDs, Timestamps
// and updateTime), plus any milestone file uploaded in the last 36 hours.
// Same format and public key as .hitrec (kind 'journal'), same
// objectCreator-only access: the server can add journal objects, never read
// or delete them.
//
// Restore = the nightly file overlaid with every journal event after its
// snapshotReadTime: for each document path the version with the newest
// updateTime wins (restore.ts overlayJournal) — replaying twice or out of
// order gives the same result.
//
// Never blocks or fails the user's action: capture runs with a 4 s budget;
// on timeout or error the event is queued (recoveryJournalQueue) and the
// retryRecoveryJournal job re-captures it (current state, newer updateTime —
// still correct). Old queue items alert system admins via System Health.

import crypto from 'crypto';
import { FieldValue, Timestamp, type DocumentSnapshot } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { app, db } from '../../config/firebase.js';
import { encodeDoc } from './encode.js';
import { RecoveryEncryptor, encodeEntry, ndjson, type FsDocLine } from './format.js';
import { recoveryEnv } from './config.js';
import { alertSystemAdmins } from './status.js';

const QUEUE = 'recoveryJournalQueue';
const STATUS_DOC = 'systemMeta/recoveryJournal';
const CAPTURE_BUDGET_MS = 4000;
const FILE_LOOKBACK_S = 36 * 3600;
const MAX_FILE_BYTES = 30 * 1024 * 1024;
const QUEUE_ALERT_AGE_MS = 60 * 60_000;

export interface JournalEvent {
  event: string;
  projectId: string | null;
  recordPath: string | null;
  milestoneId: string | null;
}

function enabled(): boolean {
  const env = recoveryEnv();
  return !!(env.publicKey && env.bucket);
}

const CLOUDINARY_URL = /^https:\/\/res\.cloudinary\.com\/[^/]+\/(raw|image|video)\/(upload)\/v(\d+)\/(.+)$/;

/** Cloudinary URLs anywhere inside a document (fileUrls, stageAttachments,
 *  supervisorGradeFileUrls, staffRecord/supervisorEvaluation files, …). */
function findFileUrls(v: unknown, out: Set<string>): void {
  if (typeof v === 'string') { if (CLOUDINARY_URL.test(v)) out.add(v); return; }
  if (Array.isArray(v)) { v.forEach((x) => findFileUrls(x, out)); return; }
  if (v && typeof v === 'object' && !(v instanceof Timestamp)) Object.values(v).forEach((x) => findFileUrls(x, out));
}

function line(s: DocumentSnapshot): FsDocLine | null {
  if (!s.exists) return null;
  return { p: s.ref.path, d: encodeDoc(s.data() ?? {}), u: s.updateTime?.toMillis() ?? Date.now() };
}

/** Builds the encrypted journal object for one event (reads current state). */
export async function buildJournalObject(ev: JournalEvent, id: string, publicKeySpkiB64: string): Promise<{ name: string; bytes: Buffer }> {
  const at = new Date();
  const reads: Promise<DocumentSnapshot[]>[] = [];
  if (ev.recordPath) reads.push(db.doc(ev.recordPath).get().then((s) => [s]));
  if (ev.projectId) {
    reads.push(db.collection('projects').doc(ev.projectId).get().then((s) => [s]));
    for (const c of ['milestones', 'grades', 'thesisExams']) {
      reads.push(db.collection(c).where('projectId', '==', ev.projectId).get().then((q) => q.docs));
    }
  }
  const snaps = (await Promise.all(reads)).flat();
  const lines = snaps.map(line).filter((l): l is FsDocLine => !!l);

  // Files uploaded for the milestone this event is about (recent ones only —
  // older files are already in a nightly/weekly file).
  const files: Array<{ meta: { publicId: string; type: string; resourceType: string; format: string | null }; bytes: Buffer }> = [];
  const milestone = ev.milestoneId ? snaps.find((s) => s.ref.path === `milestones/${ev.milestoneId}`) : null;
  if (milestone?.exists) {
    const urls = new Set<string>();
    findFileUrls(milestone.data(), urls);
    const cutoff = Math.floor(Date.now() / 1000) - FILE_LOOKBACK_S;
    for (const url of urls) {
      const m = url.match(CLOUDINARY_URL)!;
      if (Number(m[3]) < cutoff) continue;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`file ${url.slice(-60)}: HTTP ${res.status}`);
      const bytes = Buffer.from(await res.arrayBuffer());
      if (bytes.length > MAX_FILE_BYTES) continue;
      const rest = decodeURIComponent(m[4]!);
      const resourceType = m[1]!;
      const dot = rest.lastIndexOf('.');
      const isRaw = resourceType === 'raw';
      files.push({
        meta: {
          publicId: isRaw || dot < 0 ? rest : rest.slice(0, dot),
          type: m[2]!,
          resourceType,
          format: isRaw || dot < 0 ? null : rest.slice(dot + 1),
        },
        bytes,
      });
    }
  }

  const enc = await RecoveryEncryptor.create(publicKeySpkiB64, 'journal');
  const zlib = await import('zlib');
  const plain = Buffer.concat([
    encodeEntry({ t: 'journal', id, at: at.toISOString(), event: ev.event, projectId: ev.projectId }, new Uint8Array(0)),
    encodeEntry({ t: 'fs', collection: 'journal', n: lines.length }, ndjson(lines)),
    ...files.map((f) => encodeEntry({ t: 'file', ...f.meta, bytes: f.bytes.length, createdAt: at.toISOString() }, f.bytes)),
  ].map((b) => Buffer.from(b)));
  const parts: Uint8Array[] = [enc.headerChunk(), ...(await enc.push(zlib.gzipSync(plain))), await enc.finish()];
  const name = `journal/${at.toISOString().slice(0, 10)}/${at.toISOString().replace(/[:.]/g, '-')}-${id}.hitrec`;
  return { name, bytes: Buffer.concat(parts.map((p) => Buffer.from(p))) };
}

async function capture(ev: JournalEvent, id: string): Promise<void> {
  const env = recoveryEnv();
  const { name, bytes } = await buildJournalObject(ev, id, env.publicKey!);
  await getStorage(app).bucket(env.bucket!).file(name).save(bytes, {
    resumable: false,
    preconditionOpts: { ifGenerationMatch: 0 },
    contentType: 'application/octet-stream',
  });
}

async function noteOutcome(ok: boolean, error?: string): Promise<void> {
  await db.doc(STATUS_DOC).set(ok
    ? { lastOkAt: FieldValue.serverTimestamp(), okCount: FieldValue.increment(1) }
    : { lastFailAt: FieldValue.serverTimestamp(), lastError: (error ?? '').slice(0, 300), failCount: FieldValue.increment(1) },
  { merge: true }).catch(() => undefined);
}

async function enqueue(ev: JournalEvent, id: string, error: string): Promise<void> {
  await db.collection(QUEUE).doc(id).set({
    ...ev, createdAt: FieldValue.serverTimestamp(), attempts: 0, lastError: error.slice(0, 300),
  }).catch((e) => console.error('recovery journal: could not queue event', id, e));
}

/** Called from logProjectRecordEntry after every project record write.
 *  Waits at most ~4 s, never throws. */
export async function journalEvent(ev: JournalEvent): Promise<void> {
  if (!enabled()) return;
  const id = crypto.randomBytes(8).toString('hex');
  const work = capture(ev, id).then(
    () => { void noteOutcome(true); return 'ok' as const; },
    (e: Error) => { void noteOutcome(false, e.message); return e; },
  );
  const result = await Promise.race([work, new Promise<'timeout'>((r) => setTimeout(() => r('timeout'), CAPTURE_BUDGET_MS))]);
  if (result === 'ok') return;
  // Timeout: the capture keeps going in the background; queue a re-capture
  // anyway (a duplicate is harmless — newest updateTime wins on replay).
  await enqueue(ev, id, result === 'timeout' ? 'timeout' : result.message);
}

/** Every 5 minutes (index.ts): re-captures queued events. */
export async function retryRecoveryJournal(): Promise<void> {
  if (!enabled()) return;
  const due = await db.collection(QUEUE).orderBy('createdAt').limit(25).get();
  let oldestMs: number | null = null;
  for (const d of due.docs) {
    const q = d.data();
    try {
      await capture({ event: q.event, projectId: q.projectId ?? null, recordPath: q.recordPath ?? null, milestoneId: q.milestoneId ?? null }, d.id);
      await d.ref.delete();
      void noteOutcome(true);
    } catch (e) {
      const created = q.createdAt instanceof Timestamp ? q.createdAt.toMillis() : Date.now();
      oldestMs = Math.min(oldestMs ?? created, created);
      await d.ref.update({ attempts: FieldValue.increment(1), lastError: (e as Error).message.slice(0, 300) });
    }
  }
  if (oldestMs != null && Date.now() - oldestMs > QUEUE_ALERT_AGE_MS) {
    const ref = db.doc(STATUS_DOC);
    const last = (await ref.get()).data()?.lastQueueAlertAt;
    if (!(last instanceof Timestamp) || Date.now() - last.toMillis() > 6 * 3_600_000) {
      await ref.set({ lastQueueAlertAt: FieldValue.serverTimestamp() }, { merge: true });
      await alertSystemAdmins('יומן האירועים של מערכת השחזור לא מצליח לכתוב לכספת כבר יותר משעה (אירועים ממתינים בתור). הגיבוי הלילי עדיין רץ, אבל עד שזה יתוקן אובדן אפשרי הוא עד יממה ולא שניות. בדקו את עמוד "גיבוי ושחזור".');
    }
  }
}

export async function journalStatus() {
  const [s, q] = await Promise.all([db.doc(STATUS_DOC).get(), db.collection(QUEUE).count().get()]);
  const d = s.data() ?? {};
  const ms = (v: unknown) => (v instanceof Timestamp ? v.toMillis() : null);
  return {
    enabled: enabled(),
    lastOkAt: ms(d.lastOkAt),
    lastFailAt: ms(d.lastFailAt),
    lastError: (d.lastError as string | undefined) ?? null,
    okCount: Number(d.okCount ?? 0),
    queued: q.data().count,
  };
}
