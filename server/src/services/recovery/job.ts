// src/services/recovery/job.ts — one scheduled/requested backup run, as done
// by the recovery-backup Cloud Run Job (scripts/recovery.ts backup --job).

import { Timestamp } from 'firebase-admin/firestore';
import { logAuditEvent } from '../auditLog.js';
import { createRecoveryFile, autoKind, recoveryFileName, type BackupProgress } from './backup.js';
import { db } from '../../config/firebase.js';
import { recoveryEnv } from './config.js';
import { bucketSink, driveSink, pruneDrive, type RecoverySink } from './destinations.js';
import type { RecoveryKind } from './format.js';
import { alertSystemAdmins, recordRun, summarize, touchKey } from './status.js';

const PROGRESS_DOC = 'systemMeta/recoveryProgress';

/** Live progress for the admin page's progress bar (status.ts reads it). */
export async function setProgress(data: Record<string, unknown>): Promise<void> {
  await db.doc(PROGRESS_DOC).set({ ...data, updatedAt: Timestamp.now() }, { merge: true }).catch(() => undefined);
}

/** At most one write every 3 s, plus every phase change. */
function progressWriter(kind: RecoveryKind) {
  let last = 0;
  let lastPhase = '';
  let pending: Promise<void> = Promise.resolve();
  const write = (p: BackupProgress) => {
    const now = Date.now();
    if (p.phase === lastPhase && now - last < 3000) return;
    last = now;
    lastPhase = p.phase;
    pending = pending.then(() => setProgress({ state: 'running', kind, ...p }));
  };
  /** Waits for queued writes, so a late "running" can't overwrite done/failed. */
  const flush = () => pending;
  return { write, flush };
}

export async function runScheduledBackup(requested: RecoveryKind | 'auto'): Promise<void> {
  const env = recoveryEnv();
  const kind: RecoveryKind = requested === 'auto' ? autoKind() : requested;
  const started = Date.now();
  const progress = progressWriter(kind);
  await db.doc(PROGRESS_DOC).set({ state: 'running', kind, phase: 'auth', percent: 0, startedAt: Timestamp.now(), updatedAt: Timestamp.now(), error: null });
  try {
    if (!env.publicKey) throw new Error('RECOVERY_PUBLIC_KEY is not set — run `recovery keygen` and set the public key first.');
    const name = recoveryFileName(kind);
    const sinks: RecoverySink[] = [];
    if (env.bucket) sinks.push(bucketSink(env.bucket, `${kind}/${name}`));
    if (env.drive) sinks.push(driveSink(env.drive, name));
    if (!sinks.length) throw new Error('No destination configured (RECOVERY_BUCKET / RECOVERY_DRIVE_*).');

    const result = await createRecoveryFile({ kind, publicKeySpkiB64: env.publicKey, sinks, onProgress: progress.write });
    await progress.flush();
    await setProgress({ state: 'done', kind, percent: 100, finishedAt: Timestamp.now() });
    await touchKey(result.fingerprint).catch(() => undefined);

    if (env.drive && result.locations.drive) {
      await pruneDrive(env.drive, kind).catch((e: Error) => { result.errors.driveCleanup = e.message.slice(0, 200); });
    }
    await recordRun(kind, {
      at: Timestamp.now(),
      ok: true,
      bytes: result.bytesWritten,
      fingerprint: result.fingerprint,
      locations: result.locations,
      errors: result.errors,
      warnings: result.manifest.warnings.slice(0, 50),
      counts: summarize(result.manifest),
      durationMs: Date.now() - started,
    });
    await logAuditEvent({
      userId: 'system', userRole: 'system', action: 'recovery_backup_created', entityType: 'recovery', entityId: name,
      newValue: { kind, bytes: result.bytesWritten, locations: result.locations, errors: result.errors, counts: summarize(result.manifest) },
    });
    // A destination that failed while another succeeded still needs a human.
    if (Object.keys(result.errors).length) {
      await alertSystemAdmins(`קובץ השחזור (${kind}) נוצר, אבל חלק מהיעדים נכשלו: ${Object.entries(result.errors).map(([k, v]) => `${k}: ${v}`).join(' | ')}`);
    }
  } catch (err) {
    const message = (err as Error).message ?? String(err);
    await progress.flush();
    await setProgress({ state: 'failed', kind, error: message.slice(0, 300), finishedAt: Timestamp.now() });
    await recordRun(kind, {
      at: Timestamp.now(),
      ok: false, bytes: 0, fingerprint: null, locations: {}, errors: { run: message.slice(0, 300) }, warnings: [], counts: null,
      durationMs: Date.now() - started,
    }).catch(() => undefined);
    await logAuditEvent({
      userId: 'system', userRole: 'system', action: 'recovery_backup_failed', entityType: 'recovery', entityId: kind,
      newValue: { error: message.slice(0, 300) },
    });
    await alertSystemAdmins(`יצירת קובץ השחזור המוצפן (${kind}) נכשלה: ${message.slice(0, 300)}`);
    throw err;
  }
}
