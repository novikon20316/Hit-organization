// src/services/recovery/status.ts
//
// What the admin Recovery page shows, and the alerts when backups stop.
//   systemMeta/recoveryStatus — last daily/weekly/manual run (size, where it
//     went, counts, warnings, errors) + when a "late backup" alert was sent.
//   systemMeta/recoveryKey    — fingerprint of the public key in use, when it
//     was first seen, and per-holder "Test my key" results. The private key
//     and passphrase are never sent to or stored by the server.

import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { db } from '../../config/firebase.js';
import { sendNotificationEmail } from '../emailService.js';
import { BACKUP_STALE_HOURS, KEY_ROTATE_AFTER_DAYS, PASSPHRASE_ROTATE_AFTER_DAYS, recoveryEnv } from './config.js';
import { fromB64, publicKeyFingerprint, type RecoveryKind, type RecoveryManifest } from './format.js';

const STATUS_DOC = 'systemMeta/recoveryStatus';
const KEY_DOC = 'systemMeta/recoveryKey';

export interface RunSummary {
  at: Timestamp;
  ok: boolean;
  bytes: number;
  fingerprint: string | null;
  locations: Record<string, string>;
  errors: Record<string, string>;
  warnings: string[];
  counts: { authUsers: number; authUsersWithPassword: number; firestoreDocs: number; collections: number; filesIncluded: number; filesIndexed: number } | null;
  durationMs: number;
}

export function summarize(manifest: RecoveryManifest | null): RunSummary['counts'] {
  if (!manifest) return null;
  return {
    authUsers: manifest.authUsers,
    authUsersWithPassword: manifest.authUsersWithPassword,
    firestoreDocs: Object.values(manifest.firestore).reduce((a, b) => a + b, 0),
    collections: Object.keys(manifest.firestore).length,
    filesIncluded: manifest.filesIncluded,
    filesIndexed: manifest.filesIndexed,
  };
}

export async function recordRun(kind: RecoveryKind, summary: RunSummary): Promise<void> {
  await db.doc(STATUS_DOC).set({
    [`last_${kind}`]: summary,
    ...(summary.ok ? { lastSuccessAt: summary.at } : { lastFailureAt: summary.at }),
  }, { merge: true });
}

async function systemAdmins(): Promise<Array<{ email: string; name: string }>> {
  const [a, b] = await Promise.all([
    db.collection('users').where('role', '==', 'system_admin').get(),
    db.collection('users').where('roles', 'array-contains', 'system_admin').get(),
  ]);
  const seen = new Map<string, { email: string; name: string }>();
  for (const d of [...a.docs, ...b.docs]) {
    const u = d.data();
    if (u.email && u.isActive !== false) seen.set(d.id, { email: u.email, name: u.name || u.displayName || '' });
  }
  return [...seen.values()];
}

export async function alertSystemAdmins(messageHe: string): Promise<void> {
  const admins = await systemAdmins();
  await Promise.all(admins.map((a) => sendNotificationEmail({
    toEmail: a.email, type: 'broadcast', lang: 'he', data: { name: a.name, message: messageHe },
  }).catch((e) => console.error('recovery alert email failed:', e))));
}

/** Hourly (index.ts): alerts system admins once a day while no backup has
 *  succeeded for BACKUP_STALE_HOURS. Silent until a public key is set. */
export async function checkRecoveryBackupFreshness(): Promise<void> {
  if (!recoveryEnv().publicKey) return;
  const ref = db.doc(STATUS_DOC);
  const snap = await ref.get();
  const d = snap.data() ?? {};
  const lastOk = d.lastSuccessAt instanceof Timestamp ? d.lastSuccessAt.toMillis() : 0;
  const lastAlert = d.lastStaleAlertAt instanceof Timestamp ? d.lastStaleAlertAt.toMillis() : 0;
  const now = Date.now();
  if (now - lastOk < BACKUP_STALE_HOURS * 3_600_000) return;
  if (now - lastAlert < 24 * 3_600_000) return;
  await ref.set({ lastStaleAlertAt: FieldValue.serverTimestamp() }, { merge: true });
  const when = lastOk ? new Date(lastOk).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' }) : 'אף פעם';
  await alertSystemAdmins(`לא נוצר קובץ שחזור מוצפן מאז ${when}. יש לבדוק את משימת recovery-backup ב-Google Cloud ואת עמוד "גיבוי ושחזור" במערכת.`);
}

export async function currentKeyFingerprint(): Promise<string | null> {
  const pk = recoveryEnv().publicKey;
  if (!pk) return null;
  try { return await publicKeyFingerprint(fromB64(pk)); } catch { return null; }
}

/** Notes the key in use (first time seen = its age for the rotation reminder). */
export async function touchKey(fingerprint: string): Promise<void> {
  const ref = db.doc(KEY_DOC);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.data()?.fingerprint === fingerprint) return;
    tx.set(ref, { fingerprint, firstSeenAt: FieldValue.serverTimestamp(), holders: {} });
  });
}

export async function recordKeyTest(uid: string, name: string, fingerprint: string, sealedAt: string | null): Promise<void> {
  await db.doc(KEY_DOC).set({
    holders: { [uid]: { name, fingerprint, verifiedAt: FieldValue.serverTimestamp(), passphraseSealedAt: sealedAt } },
  }, { merge: true });
}

const ms = (v: unknown) => (v instanceof Timestamp ? v.toMillis() : null);

function runOut(v: unknown) {
  if (!v || typeof v !== 'object') return null;
  const r = v as RunSummary;
  return { ...r, at: ms(r.at) };
}

/** True when the latest daily/weekly/manual run that succeeded reached `dest`. */
function deliveredTo(s: Record<string, unknown>, dest: string): boolean {
  return ['last_daily', 'last_weekly', 'last_manual'].some((k) => {
    const r = s[k] as RunSummary | undefined;
    return !!r?.ok && !!r.locations?.[dest];
  });
}

export async function getRecoveryStatus() {
  const env = recoveryEnv();
  const fingerprint = await currentKeyFingerprint();
  if (fingerprint) await touchKey(fingerprint).catch(() => undefined);
  const [statusSnap, keySnap, jobSnap] = await Promise.all([
    db.doc(STATUS_DOC).get(),
    db.doc(KEY_DOC).get(),
    db.collection('systemJobRuns').doc('recoveryBackup').get(),
  ]);
  const s = statusSnap.data() ?? {};
  const k = keySnap.data() ?? {};
  const keyFirstSeen = k.fingerprint === fingerprint ? ms(k.firstSeenAt) : null;
  const holders = Object.entries((k.holders ?? {}) as Record<string, { name?: string; fingerprint?: string; verifiedAt?: unknown; passphraseSealedAt?: string | null }>)
    .filter(([, h]) => h.fingerprint === fingerprint)
    .map(([uid, h]) => {
      const sealedMs = h.passphraseSealedAt ? Date.parse(h.passphraseSealedAt) : null;
      return {
        uid,
        name: h.name ?? '',
        verifiedAt: ms(h.verifiedAt),
        passphraseSealedAt: sealedMs,
        passphraseDue: sealedMs != null && Date.now() - sealedMs > PASSPHRASE_ROTATE_AFTER_DAYS * 86_400_000,
      };
    });
  const lastOk = ms(s.lastSuccessAt);
  return {
    // Drive credentials live only on the recovery-backup job (the api never
    // uploads to Drive), so "configured" also counts a recent run that
    // actually delivered there.
    configured: {
      publicKey: !!fingerprint,
      bucket: !!env.bucket || deliveredTo(s, 'bucket'),
      drive: !!env.drive || deliveredTo(s, 'drive'),
      job: env.jobName,
    },
    key: {
      fingerprint,
      firstSeenAt: keyFirstSeen,
      rotationDue: keyFirstSeen != null && Date.now() - keyFirstSeen > KEY_ROTATE_AFTER_DAYS * 86_400_000,
      rotateAfterDays: KEY_ROTATE_AFTER_DAYS,
      passphraseRotateAfterDays: PASSPHRASE_ROTATE_AFTER_DAYS,
      holders,
    },
    lastSuccessAt: lastOk,
    lastFailureAt: ms(s.lastFailureAt),
    stale: !!fingerprint && (lastOk == null || Date.now() - lastOk > BACKUP_STALE_HOURS * 3_600_000),
    runs: { daily: runOut(s.last_daily), weekly: runOut(s.last_weekly), manual: runOut(s.last_manual) },
    job: jobSnap.exists ? { lastStartedAt: ms(jobSnap.data()?.lastStartedAt), lastOk: jobSnap.data()?.lastOk ?? null, lastError: jobSnap.data()?.lastError ?? null } : null,
  };
}
