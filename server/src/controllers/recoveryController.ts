// src/controllers/recoveryController.ts — system_admin's "Backup & Recovery"
// page (web/app/admin/recovery). See services/recovery/* for the format,
// backup and restore engines, and RECOVERY_RUNBOOK_HE.md for the procedure.
//
// Restore design: the admin's BROWSER decrypts the recovery file with the
// offline key kit — the private key and passphrase never reach this server.
// The browser then sends small batches (logins, documents, one file at a
// time) to the endpoints below. A restore is opened by /restore/begin with a
// fresh 2FA code and typed confirmation; every batch call must belong to
// that open restore (same admin, < 6 hours old).

import type { Response } from 'express';
import speakeasy from 'speakeasy';
import { google } from 'googleapis';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { createHash, randomBytes } from 'crypto';
import { db } from '../config/firebase.js';
import { hasAnyRole, type AuthenticatedRequest } from '../middleware/auth.js';
import { L } from '../utils/localize.js';
import { logAuditEvent } from '../services/auditLog.js';
import { clearMaintenanceStatus, setMaintenanceStatus, PLATFORMS } from '../services/maintenanceStatus.js';
import { RecoveryEncryptor, type AuthUserLine, type FirebaseHashConfig, type FsDocLine } from '../services/recovery/format.js';
import { recoveryEnv } from '../services/recovery/config.js';
import { currentKeyFingerprint, getRecoveryStatus, recordKeyTest } from '../services/recovery/status.js';
import { journalStatus } from '../services/recovery/journal.js';
import {
  applyOutageGrace, disableUsersNotIn, dryRunAuthUsers, dryRunFirestoreDocs, restoreAuthUsers,
  restoreFile, restoreFirestoreDocs, revokeAllSessions, type RestoreMode,
} from '../services/recovery/restore.js';
import { listAllAssets, ensureCloudinaryConfigured } from '../services/recovery/cloudinaryFiles.js';
import { EXCLUDED_COLLECTIONS, isExcludedDocPath } from '../services/recovery/config.js';

const RESTORE_DOC = 'systemMeta/recoveryRestore';
const RESTORE_MAX_AGE_MS = 6 * 3_600_000;
const MAX_BATCH_DOCS = 2000;
const MAX_BATCH_USERS = 1000;

function requireAdmin(req: AuthenticatedRequest, res: Response): req is AuthenticatedRequest & { user: NonNullable<AuthenticatedRequest['user']> } {
  if (!req.user) { res.status(401).json({ error: L(req, 'Unauthorized.', 'אין הרשאה.') }); return false; }
  if (!hasAnyRole(req.user, ['system_admin'])) {
    res.status(403).json({ error: L(req, 'Only a system administrator can do this.', 'רק מנהל/ת מערכת יכול/ה לבצע פעולה זו.') });
    return false;
  }
  return true;
}

async function displayName(uid: string): Promise<string> {
  const u = (await db.collection('users').doc(uid).get()).data();
  return u?.name || u?.displayName || u?.email || uid;
}

/** A fresh authenticator code — required to start a restore or a manual
 *  backup, on top of the signed-in session. */
async function checkFreshTotp(req: AuthenticatedRequest, res: Response, uid: string): Promise<boolean> {
  const code = String(req.body?.totpCode ?? '').replace(/\s+/g, '');
  const secret = (await db.collection('users').doc(uid).collection('private').doc('totp').get()).data()?.secret;
  if (!secret) {
    res.status(400).json({ error: L(req, 'Turn on two-step verification (authenticator app) for your account first.', 'יש להפעיל קודם אימות דו-שלבי (אפליקציית מאמת) בחשבון שלך.') });
    return false;
  }
  if (!/^\d{6}$/.test(code) || !speakeasy.totp.verify({ secret, encoding: 'base32', token: code, window: 1 })) {
    res.status(400).json({ error: L(req, 'The authenticator code is wrong or expired.', 'קוד האימות שגוי או שפג תוקפו.') });
    return false;
  }
  return true;
}

function fail(req: AuthenticatedRequest, res: Response, where: string, err: unknown) {
  console.error(`recovery ${where} error:`, err);
  res.status(500).json({ error: L(req, `Recovery step failed: ${(err as Error).message ?? err}`, `שלב השחזור נכשל: ${(err as Error).message ?? err}`) });
}

// ── Status / run now ─────────────────────────────────────────────────────────

export const getRecoveryStatusAdmin = async (req: AuthenticatedRequest, res: Response) => {
  if (!requireAdmin(req, res)) return;
  try {
    const [status, journal] = await Promise.all([getRecoveryStatus(), journalStatus()]);
    const restore = (await db.doc(RESTORE_DOC).get()).data();
    res.json({
      ...status,
      journal,
      openRestore: restore?.open ? {
        id: restore.id, mode: restore.mode, startedBy: restore.startedByName ?? restore.startedBy,
        startedAt: restore.startedAt instanceof Timestamp ? restore.startedAt.toMillis() : null,
      } : null,
    });
  } catch (err) { fail(req, res, 'status', err); }
};

/** Starts the recovery-backup Cloud Run Job now (same code as the nightly run). */
export const runRecoveryBackupNow = async (req: AuthenticatedRequest, res: Response) => {
  if (!requireAdmin(req, res)) return;
  if (!(await checkFreshTotp(req, res, req.user.uid))) return;
  const kind = req.body?.kind === 'weekly' ? 'weekly' : 'manual';
  try {
    const env = recoveryEnv();
    const gauth = new google.auth.GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
    const project = await gauth.getProjectId();
    const run = google.run({ version: 'v2', auth: gauth });
    await run.projects.locations.jobs.run({
      name: `projects/${project}/locations/${env.jobRegion}/jobs/${env.jobName}`,
      requestBody: { overrides: { containerOverrides: [{ args: ['dist/scripts/recovery.js', 'backup', '--job', '--kind', kind] }] } },
    });
    await logAuditEvent({
      userId: req.user.uid, userRole: 'system_admin', action: 'recovery_backup_requested', entityType: 'recovery', entityId: kind,
      userDisplayName: await displayName(req.user.uid),
    });
    res.json({ started: true, kind });
  } catch (err) { fail(req, res, 'run-now', err); }
};

// ── Test my key ──────────────────────────────────────────────────────────────

const challengeDoc = (uid: string) => db.collection('systemMeta').doc(`recoveryChallenge_${uid}`);

/** A tiny recovery file (kind "challenge") holding a random secret, locked
 *  with the server's public key. Only the matching private key can open it. */
export const startKeyTest = async (req: AuthenticatedRequest, res: Response) => {
  if (!requireAdmin(req, res)) return;
  try {
    const pk = recoveryEnv().publicKey;
    if (!pk) { res.status(400).json({ error: L(req, 'No recovery public key is set on the server yet.', 'עדיין לא הוגדר מפתח ציבורי לשחזור בשרת.') }); return; }
    const secret = randomBytes(32);
    const enc = await RecoveryEncryptor.create(pk, 'challenge');
    const parts = [enc.headerChunk(), ...(await enc.push(secret)), await enc.finish()];
    const file = Buffer.concat(parts.map((p) => Buffer.from(p)));
    await challengeDoc(req.user.uid).set({
      secretHash: createHash('sha256').update(secret).digest('hex'),
      expiresAt: Timestamp.fromMillis(Date.now() + 10 * 60_000),
    });
    res.json({ challengeB64: file.toString('base64'), fingerprint: enc.header.fingerprint });
  } catch (err) { fail(req, res, 'key-test-start', err); }
};

export const finishKeyTest = async (req: AuthenticatedRequest, res: Response) => {
  if (!requireAdmin(req, res)) return;
  try {
    const ref = challengeDoc(req.user.uid);
    const c = (await ref.get()).data();
    await ref.delete();
    const secret = Buffer.from(String(req.body?.secretB64 ?? ''), 'base64');
    const ok = !!c && c.expiresAt instanceof Timestamp && c.expiresAt.toMillis() > Date.now()
      && createHash('sha256').update(secret).digest('hex') === c.secretHash;
    const fingerprint = await currentKeyFingerprint();
    const sealedAt = typeof req.body?.sealedAt === 'string' ? req.body.sealedAt.slice(0, 40) : null;
    if (ok && fingerprint) await recordKeyTest(req.user.uid, await displayName(req.user.uid), fingerprint, sealedAt);
    await logAuditEvent({
      userId: req.user.uid, userRole: 'system_admin', action: 'recovery_key_tested', entityType: 'recovery', entityId: fingerprint ?? 'none',
      newValue: { ok }, userDisplayName: await displayName(req.user.uid),
    });
    res.json({ ok });
  } catch (err) { fail(req, res, 'key-test-finish', err); }
};

// ── Restore: dry run ─────────────────────────────────────────────────────────

export const restoreDryRun = async (req: AuthenticatedRequest, res: Response) => {
  if (!requireAdmin(req, res)) return;
  try {
    const users = Array.isArray(req.body?.users) ? (req.body.users as AuthUserLine[]).slice(0, MAX_BATCH_USERS) : null;
    const docs = Array.isArray(req.body?.docs) ? (req.body.docs as FsDocLine[]).slice(0, MAX_BATCH_DOCS) : null;
    res.json({
      auth: users ? await dryRunAuthUsers(users) : null,
      firestore: docs ? await dryRunFirestoreDocs(docs) : null,
    });
  } catch (err) { fail(req, res, 'dry-run', err); }
};

/** Every file currently in Cloudinary, so the browser can tell which files
 *  from the recovery file are missing. */
export const restoreLiveFiles = async (req: AuthenticatedRequest, res: Response) => {
  if (!requireAdmin(req, res)) return;
  try {
    const assets = await listAllAssets();
    res.json({ cloudName: ensureCloudinaryConfigured(), keys: assets.map((a) => `${a.type}/${a.resourceType}/${a.publicId}`) });
  } catch (err) { fail(req, res, 'live-files', err); }
};

export const restoreLiveCollections = async (req: AuthenticatedRequest, res: Response) => {
  if (!requireAdmin(req, res)) return;
  try {
    const cols = (await db.listCollections()).map((c) => c.id).filter((id) => !EXCLUDED_COLLECTIONS.has(id));
    res.json({ collections: cols });
  } catch (err) { fail(req, res, 'live-collections', err); }
};

// ── Restore: apply ───────────────────────────────────────────────────────────

async function openRestore(req: AuthenticatedRequest, res: Response): Promise<{ id: string; mode: RestoreMode } | null> {
  const r = (await db.doc(RESTORE_DOC).get()).data();
  const id = String(req.body?.restoreId ?? req.query?.restoreId ?? '');
  const fresh = r?.startedAt instanceof Timestamp && Date.now() - r.startedAt.toMillis() < RESTORE_MAX_AGE_MS;
  if (!r?.open || r.id !== id || r.startedBy !== req.user?.uid || !fresh) {
    res.status(409).json({ error: L(req, 'This restore is not open (expired, finished, or started by someone else). Start it again.', 'השחזור אינו פתוח (פג תוקף, הסתיים או הופעל ע"י מישהו אחר). יש להתחיל מחדש.') });
    return null;
  }
  return { id, mode: r.mode === 'full' ? 'full' : 'merge' };
}

export const beginRestore = async (req: AuthenticatedRequest, res: Response) => {
  if (!requireAdmin(req, res)) return;
  if (!(await checkFreshTotp(req, res, req.user.uid))) return;
  const mode: RestoreMode = req.body?.mode === 'full' ? 'full' : 'merge';
  if (mode === 'full' && String(req.body?.confirmText ?? '').trim() !== 'שחזור מלא') {
    res.status(400).json({ error: L(req, 'Type the confirmation text exactly to run a full restore.', 'יש להקליד בדיוק את טקסט האישור כדי לבצע שחזור מלא.') });
    return;
  }
  try {
    const id = randomBytes(12).toString('hex');
    const name = await displayName(req.user.uid);
    await db.doc(RESTORE_DOC).set({
      id, open: true, mode, startedBy: req.user.uid, startedByName: name, startedAt: FieldValue.serverTimestamp(),
      file: req.body?.file ?? null,
    });
    if (req.body?.maintenance !== false) {
      const now = new Date();
      await Promise.all(PLATFORMS.map((p) => setMaintenanceStatus(p, {
        title: 'המערכת בשחזור — נחזור בקרוב',
        shutdownAt: now,
        endsAt: new Date(now.getTime() + RESTORE_MAX_AGE_MS),
        broadcastEnabled: false,
        createdBy: req.user!.uid,
      })));
    }
    await logAuditEvent({
      userId: req.user.uid, userRole: 'system_admin', action: 'recovery_restore_started', entityType: 'recovery', entityId: id,
      newValue: { mode, file: req.body?.file ?? null }, userDisplayName: name,
    });
    res.json({ restoreId: id, mode });
  } catch (err) { fail(req, res, 'begin', err); }
};

/** Full mode: wipes one collection (browser walks the live list). */
export const restoreWipeCollection = async (req: AuthenticatedRequest, res: Response) => {
  if (!requireAdmin(req, res)) return;
  const r = await openRestore(req, res);
  if (!r) return;
  if (r.mode !== 'full') { res.status(400).json({ error: 'Wipe is only part of a full restore.' }); return; }
  const collection = String(req.body?.collection ?? '');
  if (!collection || collection.includes('/') || EXCLUDED_COLLECTIONS.has(collection)) { res.status(400).json({ error: 'Invalid collection.' }); return; }
  try {
    const col = db.collection(collection);
    const refs = await col.listDocuments();
    const writer = db.bulkWriter();
    let n = 0;
    for (const ref of refs) {
      const p = ref.path;
      if (p === `users/${req.user.uid}` || isExcludedDocPath(p)) continue;
      await db.recursiveDelete(ref, writer);
      n++;
    }
    await writer.close();
    res.json({ deleted: n });
  } catch (err) { fail(req, res, 'wipe', err); }
};

function parseHash(v: unknown): FirebaseHashConfig | null {
  const h = v as Partial<FirebaseHashConfig> | null | undefined;
  if (!h || !h.base64SignerKey || !h.base64SaltSeparator || !h.rounds || !h.memCost) return null;
  return { algorithm: 'SCRYPT', base64SignerKey: h.base64SignerKey, base64SaltSeparator: h.base64SaltSeparator, rounds: Number(h.rounds), memCost: Number(h.memCost) };
}

export const restoreAuthBatch = async (req: AuthenticatedRequest, res: Response) => {
  if (!requireAdmin(req, res)) return;
  const r = await openRestore(req, res);
  if (!r) return;
  try {
    const users = (Array.isArray(req.body?.users) ? req.body.users : []).slice(0, MAX_BATCH_USERS) as AuthUserLine[];
    res.json(await restoreAuthUsers(users, r.mode, parseHash(req.body?.hash), req.user.uid));
  } catch (err) { fail(req, res, 'auth', err); }
};

export const restoreFirestoreBatch = async (req: AuthenticatedRequest, res: Response) => {
  if (!requireAdmin(req, res)) return;
  const r = await openRestore(req, res);
  if (!r) return;
  try {
    const docs = (Array.isArray(req.body?.docs) ? req.body.docs : []).slice(0, MAX_BATCH_DOCS) as FsDocLine[];
    const from = typeof req.body?.fromCloud === 'string' ? req.body.fromCloud : null;
    const to = ensureCloudinaryConfigured();
    res.json(await restoreFirestoreDocs(docs, r.mode, {
      rewriteCloud: from && to && from !== to ? { from, to } : null,
      protectUid: req.user.uid,
    }));
  } catch (err) { fail(req, res, 'firestore', err); }
};

export const restoreFileUpload = async (req: AuthenticatedRequest, res: Response) => {
  if (!requireAdmin(req, res)) return;
  const r = await openRestore(req, res);
  if (!r) return;
  try {
    const q = req.query as Record<string, string | undefined>;
    const body = req.body;
    if (!Buffer.isBuffer(body) || !q.publicId || !q.type || !q.resourceType) { res.status(400).json({ error: 'Missing file or file details.' }); return; }
    const result = await restoreFile({ publicId: q.publicId, type: q.type, resourceType: q.resourceType, format: q.format || null }, body, r.mode);
    res.json({ result });
  } catch (err) { fail(req, res, 'file', err); }
};

export const restoreDisableMissingUsers = async (req: AuthenticatedRequest, res: Response) => {
  if (!requireAdmin(req, res)) return;
  const r = await openRestore(req, res);
  if (!r) return;
  if (r.mode !== 'full') { res.status(400).json({ error: 'Only part of a full restore.' }); return; }
  try {
    const uids = new Set<string>((Array.isArray(req.body?.uids) ? req.body.uids : []).map(String));
    if (uids.size === 0) { res.status(400).json({ error: 'No users listed — refusing to disable everyone.' }); return; }
    res.json({ disabled: await disableUsersNotIn(uids, req.user.uid) });
  } catch (err) { fail(req, res, 'disable-missing', err); }
};

export const finishRestore = async (req: AuthenticatedRequest, res: Response) => {
  if (!requireAdmin(req, res)) return;
  const r = await openRestore(req, res);
  if (!r) return;
  try {
    const name = await displayName(req.user.uid);
    let grace: { projects: number; milestones: number } | null = null;
    const g = req.body?.outageGrace;
    if (g?.from && g?.to) {
      grace = await applyOutageGrace(new Date(g.from), new Date(g.to), req.user.uid);
      await logAuditEvent({
        userId: req.user.uid, userRole: 'system_admin', action: 'recovery_outage_grace_applied', entityType: 'recovery', entityId: r.id,
        newValue: { from: g.from, to: g.to, ...grace }, userDisplayName: name,
      });
    }
    await db.doc(RESTORE_DOC).set({ open: false, finishedAt: FieldValue.serverTimestamp(), summary: req.body?.summary ?? null }, { merge: true });
    await Promise.all(PLATFORMS.map((p) => clearMaintenanceStatus(p)));
    await logAuditEvent({
      userId: req.user.uid, userRole: 'system_admin', action: 'recovery_restore_finished', entityType: 'recovery', entityId: r.id,
      newValue: { mode: r.mode, summary: req.body?.summary ?? null, grace }, userDisplayName: name,
    });
    // Last: everyone (including this admin) signs in again with the same password.
    const revoked = req.body?.revokeSessions === false ? 0 : await revokeAllSessions();
    res.json({ grace, revoked });
  } catch (err) { fail(req, res, 'finish', err); }
};

/** Abandons an open restore and lifts maintenance (nothing is undone —
 *  use the safety backup taken before the restore for that). */
export const cancelRestore = async (req: AuthenticatedRequest, res: Response) => {
  if (!requireAdmin(req, res)) return;
  try {
    await db.doc(RESTORE_DOC).set({ open: false, cancelledAt: FieldValue.serverTimestamp(), cancelledBy: req.user.uid }, { merge: true });
    await Promise.all(PLATFORMS.map((p) => clearMaintenanceStatus(p)));
    res.json({ cancelled: true });
  } catch (err) { fail(req, res, 'cancel', err); }
};

