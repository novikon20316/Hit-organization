// src/services/recovery/job.ts — one scheduled/requested backup run, as done
// by the recovery-backup Cloud Run Job (scripts/recovery.ts backup --job).

import { Timestamp } from 'firebase-admin/firestore';
import { logAuditEvent } from '../auditLog.js';
import { createRecoveryFile, autoKind, recoveryFileName } from './backup.js';
import { recoveryEnv } from './config.js';
import { bucketSink, driveSink, pruneDrive, type RecoverySink } from './destinations.js';
import type { RecoveryKind } from './format.js';
import { alertSystemAdmins, recordRun, summarize, touchKey } from './status.js';

export async function runScheduledBackup(requested: RecoveryKind | 'auto'): Promise<void> {
  const env = recoveryEnv();
  const kind: RecoveryKind = requested === 'auto' ? autoKind() : requested;
  const started = Date.now();
  try {
    if (!env.publicKey) throw new Error('RECOVERY_PUBLIC_KEY is not set — run `recovery keygen` and set the public key first.');
    const name = recoveryFileName(kind);
    const sinks: RecoverySink[] = [];
    if (env.bucket) sinks.push(bucketSink(env.bucket, `${kind}/${name}`));
    if (env.drive) sinks.push(driveSink(env.drive, name));
    if (!sinks.length) throw new Error('No destination configured (RECOVERY_BUCKET / RECOVERY_DRIVE_*).');

    const result = await createRecoveryFile({ kind, publicKeySpkiB64: env.publicKey, sinks });
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
