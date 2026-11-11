// web/lib/recovery/client.ts
// Browser side of disaster recovery (app/admin/recovery):
//  • readRecoveryFile — decrypts a .hitrec file LOCALLY with the holder's
//    key kit (the private key and passphrase never leave this computer),
//    streaming, so even multi-GB weekly files work;
//  • recoveryApi — calls to /api/admin/recovery/* (server/src/controllers/
//    recoveryController.ts). Kept out of lib/apiClient.ts on purpose: these
//    calls need long timeouts and raw file uploads.

import { getToken as getAppCheckToken } from 'firebase/app-check';
import { auth, appCheck } from '../firebase';
import { getApiBaseUrl } from '../apiClient';
import type { AuthUserLine, FirebaseHashConfig, FsDocLine } from './format';
export { readRecoveryFile } from './reader';

async function headers(json: boolean): Promise<Headers> {
  const h = new Headers({ Accept: 'application/json', 'X-Client-Platform': 'web' });
  if (typeof window !== 'undefined') h.set('X-Lang', window.localStorage.getItem('hit-web-lang') === 'en' ? 'en' : 'he');
  if (json) h.set('Content-Type', 'application/json; charset=utf-8');
  await auth.authStateReady();
  const token = await auth.currentUser?.getIdToken();
  if (token) h.set('Authorization', `Bearer ${token}`);
  if (appCheck) {
    try { h.set('X-Firebase-AppCheck', (await getAppCheckToken(appCheck)).token); } catch { /* monitor mode */ }
  }
  return h;
}

async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown, attempt = 0): Promise<T> {
  const url = `${getApiBaseUrl()}/api/admin/recovery${path}`;
  const isRaw = body instanceof Blob || body instanceof Uint8Array;
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: await headers(!isRaw && body !== undefined),
      body: body === undefined ? undefined : isRaw ? (body as BodyInit) : JSON.stringify(body),
    });
  } catch (err) {
    // A network blip mid-restore shouldn't kill an hour-long run.
    if (attempt < 3) { await new Promise((r) => setTimeout(r, 2000 * (attempt + 1))); return call(method, path, body, attempt + 1); }
    throw err;
  }
  if (res.status >= 500 && res.status !== 500 && attempt < 3) {
    await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
    return call(method, path, body, attempt + 1);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
  return data as T;
}

export interface RunSummary {
  at: number | null;
  ok: boolean;
  bytes: number;
  fingerprint: string | null;
  locations: Record<string, string>;
  errors: Record<string, string>;
  warnings: string[];
  counts: { authUsers: number; authUsersWithPassword: number; firestoreDocs: number; collections: number; filesIncluded: number; filesIndexed: number } | null;
  durationMs: number;
}

/** Live state of the current/last backup run (server status.ts). */
export interface BackupProgress {
  state: 'starting' | 'running' | 'done' | 'failed' | 'stalled';
  kind: string | null;
  phase: 'auth' | 'firestore' | 'files' | 'finishing' | null;
  percent: number;
  authUsers: number;
  collectionsDone: number;
  collectionsTotal: number;
  docs: number;
  filesDone: number;
  filesTotal: number;
  fileBytesDone: number;
  fileBytesTotal: number;
  startedAt: number | null;
  updatedAt: number | null;
  finishedAt: number | null;
  error: string | null;
}

export interface RecoveryStatus {
  configured: { publicKey: boolean; bucket: boolean; drive: boolean; job: string };
  key: {
    fingerprint: string | null;
    firstSeenAt: number | null;
    rotationDue: boolean;
    rotateAfterDays: number;
    passphraseRotateAfterDays: number;
    holders: Array<{ uid: string; name: string; verifiedAt: number | null; passphraseSealedAt: number | null; passphraseDue: boolean }>;
  };
  progress: BackupProgress | null;
  lastSuccessAt: number | null;
  lastFailureAt: number | null;
  stale: boolean;
  runs: { daily: RunSummary | null; weekly: RunSummary | null; manual: RunSummary | null };
  job: { lastStartedAt: number | null; lastOk: boolean | null; lastError: string | null } | null;
  openRestore: { id: string; mode: 'merge' | 'full' | 'selective'; startedBy: string; startedAt: number | null } | null;
  journal: { enabled: boolean; lastOkAt: number | null; lastFailAt: number | null; lastError: string | null; okCount: number; queued: number };
}

export type RestoreMode = 'merge' | 'full' | 'selective';

export type RestoreScope =
  | { kind: 'collections'; collections: string[] }
  | { kind: 'project'; projectId: string; roots: string[] };

export const recoveryApi = {
  status: () => call<RecoveryStatus>('GET', '/status'),
  runNow: (kind: 'manual' | 'weekly', totpCode: string) => call<{ started: boolean }>('POST', '/run', { kind, totpCode }),
  keyTestStart: () => call<{ challengeB64: string; fingerprint: string }>('POST', '/key-test/start', {}),
  keyTestFinish: (secretB64: string, sealedAt: string | null) => call<{ ok: boolean }>('POST', '/key-test/finish', { secretB64, sealedAt }),
  dryRun: (payload: { users?: AuthUserLine[]; docs?: FsDocLine[] }) =>
    call<{ auth: { added: number; existing: number; emailChanged: number; withoutPassword: number } | null; firestore: Record<string, { added: number; same: number; changed: number }> | null }>('POST', '/restore/dry-run', payload),
  liveFiles: () => call<{ cloudName: string | null; keys: string[] }>('GET', '/restore/live-files'),
  liveCollections: () => call<{ collections: string[] }>('GET', '/restore/live-collections'),
  begin: (p: { mode: RestoreMode; totpCode: string; confirmText: string; file: Record<string, unknown>; scope?: RestoreScope | null }) => call<{ restoreId: string; mode: RestoreMode }>('POST', '/restore/begin', p),
  wipe: (restoreId: string, collection: string) => call<{ deleted: number }>('POST', '/restore/wipe', { restoreId, collection }),
  auth: (restoreId: string, users: AuthUserLine[], hash: FirebaseHashConfig | null) =>
    call<{ imported: number; skipped: number; withoutPassword: number; failed: Array<{ uid: string; error: string }> }>('POST', '/restore/auth', { restoreId, users, hash }),
  firestore: (restoreId: string, docs: FsDocLine[], fromCloud: string | null) =>
    call<{ written: number; skipped: number; protectedSkipped: number }>('POST', '/restore/firestore', { restoreId, docs, fromCloud }),
  file: (restoreId: string, meta: { publicId: string; type: string; resourceType: string; format: string | null }, bytes: Uint8Array) => {
    const q = new URLSearchParams({ restoreId, publicId: meta.publicId, type: meta.type, resourceType: meta.resourceType, format: meta.format ?? '' });
    return call<{ result: 'uploaded' | 'existed' }>('POST', `/restore/file?${q.toString()}`, new Blob([bytes as BlobPart], { type: 'application/octet-stream' }));
  },
  disableMissing: (restoreId: string, uids: string[]) => call<{ disabled: number }>('POST', '/restore/disable-missing', { restoreId, uids }),
  finish: (restoreId: string, p: { outageGrace: { from: string; to: string } | null; revokeSessions: boolean; summary: unknown }) =>
    call<{ grace: { projects: number; milestones: number } | null; revoked: number }>('POST', '/restore/finish', { restoreId, ...p }),
  cancel: () => call<{ cancelled: boolean }>('POST', '/restore/cancel', {}),
};

/** Splits documents into request-sized batches (< ~3 MB JSON, ≤ 400 docs). */
export function batchDocs(lines: FsDocLine[]): FsDocLine[][] {
  const out: FsDocLine[][] = [];
  let cur: FsDocLine[] = [];
  let size = 0;
  for (const l of lines) {
    const s = JSON.stringify(l).length;
    if (cur.length && (cur.length >= 400 || size + s > 3_000_000)) { out.push(cur); cur = []; size = 0; }
    cur.push(l);
    size += s;
  }
  if (cur.length) out.push(cur);
  return out;
}
