// src/services/recovery/destinations.ts
//
// Where a recovery file goes while it is being written. The file is never
// held whole in memory or on disk on Cloud Run: encrypted chunks are fanned
// out to every destination at once. One destination failing (e.g. Drive
// quota) doesn't stop the others; the run fails only if none succeeded.
//
//   A. Locked bucket in a SEPARATE GCP project (RECOVERY_BUCKET). The
//      runtime service account has only storage.objectCreator there: it can
//      add files but cannot read, overwrite or delete them, and the bucket's
//      retention lock stops anyone else deleting them early.
//   B. Google Drive folder of a backup-only account (RECOVERY_DRIVE_*), for
//      easy browsing/downloading. Old copies are pruned here.
//   C. A local file (CLI only).

import fs from 'fs';
import { PassThrough, Writable } from 'stream';
import { google } from 'googleapis';
import { getStorage } from 'firebase-admin/storage';
import { app } from '../../config/firebase.js';
import { DRIVE_KEEP } from './config.js';
import type { RecoveryKind } from './format.js';

export interface RecoverySink {
  name: string;
  write(chunk: Uint8Array): Promise<void>;
  finish(): Promise<string>;
  abort(err: Error): void;
}

function writeTo(w: Writable, chunk: Uint8Array): Promise<void> {
  return new Promise((resolve, reject) => {
    if (w.destroyed) { reject(new Error('destination closed')); return; }
    const cleanup = () => { w.off('error', onError); w.off('close', onClose); w.off('drain', onDrain); };
    const onError = (e: Error) => { cleanup(); reject(e); };
    const onClose = () => { cleanup(); reject(new Error('destination closed')); };
    const onDrain = () => { cleanup(); resolve(); };
    w.once('error', onError);
    w.once('close', onClose);
    const ok = w.write(chunk, (err) => { if (err) onError(err); });
    if (ok) { cleanup(); resolve(); return; }
    w.once('drain', onDrain);
  });
}

function endWritable(w: Writable, doneEvent: 'finish' | 'close' = 'finish'): Promise<void> {
  return new Promise((resolve, reject) => {
    w.once('error', reject);
    w.once(doneEvent, () => resolve());
    w.end();
  });
}

export function localFileSink(path: string): RecoverySink {
  const w = fs.createWriteStream(path, { flags: 'wx' });
  w.on('error', () => undefined); // surfaced via write()/finish()
  return {
    name: 'local',
    write: (c) => writeTo(w, c),
    finish: async () => { await endWritable(w, 'close'); return path; },
    abort: (err) => { w.destroy(err); fs.rmSync(path, { force: true }); },
  };
}

export function bucketSink(bucketName: string, objectName: string): RecoverySink {
  const file = getStorage(app).bucket(bucketName).file(objectName);
  // ifGenerationMatch: 0 — create only, never overwrite an existing object.
  const w = file.createWriteStream({
    resumable: true,
    preconditionOpts: { ifGenerationMatch: 0 },
    metadata: { contentType: 'application/octet-stream' },
  });
  w.on('error', () => undefined); // surfaced via write()/finish()
  return {
    name: 'bucket',
    write: (c) => writeTo(w, c),
    finish: async () => { await endWritable(w); return `gs://${bucketName}/${objectName}`; },
    abort: (err) => { w.destroy(err); },
  };
}

function driveClient(cfg: { clientId: string; clientSecret: string; refreshToken: string }) {
  const oauth = new google.auth.OAuth2(cfg.clientId, cfg.clientSecret);
  oauth.setCredentials({ refresh_token: cfg.refreshToken });
  return google.drive({ version: 'v3', auth: oauth });
}

export function driveSink(cfg: { clientId: string; clientSecret: string; refreshToken: string; folderId: string }, fileName: string): RecoverySink {
  const drive = driveClient(cfg);
  const body = new PassThrough({ highWaterMark: 4 * 1024 * 1024 });
  body.on('error', () => undefined); // surfaced via write()/finish()
  const upload = drive.files.create({
    requestBody: { name: fileName, parents: [cfg.folderId], mimeType: 'application/octet-stream' },
    media: { mimeType: 'application/octet-stream', body },
    fields: 'id',
  });
  let failed: Error | null = null;
  const settled = upload.then((r) => r.data.id ?? '', (e: Error) => { failed = e; body.destroy(e); throw e; });
  settled.catch(() => undefined);
  return {
    name: 'drive',
    write: async (c) => { if (failed) throw failed; await writeTo(body, c); },
    finish: async () => { body.end(); const id = await settled; return `drive:${id}`; },
    abort: (err) => { body.destroy(err); },
  };
}

/** Deletes the oldest Drive copies beyond DRIVE_KEEP for this kind. Only
 *  touches files this app created (drive.file scope). */
export async function pruneDrive(cfg: { clientId: string; clientSecret: string; refreshToken: string; folderId: string }, kind: RecoveryKind): Promise<number> {
  if (kind === 'challenge' || kind === 'journal') return 0;
  const keep = DRIVE_KEEP[kind];
  const drive = driveClient(cfg);
  const res = await drive.files.list({
    q: `'${cfg.folderId}' in parents and name contains '-${kind}-' and trashed = false`,
    orderBy: 'createdTime desc',
    fields: 'files(id,name,createdTime)',
    pageSize: 200,
  });
  const stale = (res.data.files ?? []).slice(keep);
  for (const f of stale) {
    if (f.id) await drive.files.delete({ fileId: f.id });
  }
  return stale.length;
}

export interface FanOutResult {
  locations: Record<string, string>;
  errors: Record<string, string>;
}

/** Writes each chunk to every sink still alive. */
export class FanOut {
  private alive: RecoverySink[];
  readonly errors: Record<string, string> = {};

  constructor(sinks: RecoverySink[]) {
    this.alive = [...sinks];
  }

  private drop(sink: RecoverySink, err: unknown) {
    const e = err instanceof Error ? err : new Error(String(err));
    this.errors[sink.name] = e.message.slice(0, 300);
    this.alive = this.alive.filter((s) => s !== sink);
    try { sink.abort(e); } catch { /* already gone */ }
  }

  async write(chunk: Uint8Array): Promise<void> {
    if (!this.alive.length) throw new Error(`Every destination failed: ${JSON.stringify(this.errors)}`);
    await Promise.all(this.alive.map((s) => s.write(chunk).catch((e) => this.drop(s, e))));
    if (!this.alive.length) throw new Error(`Every destination failed: ${JSON.stringify(this.errors)}`);
  }

  async finish(): Promise<FanOutResult> {
    const locations: Record<string, string> = {};
    await Promise.all(this.alive.map(async (s) => {
      try { locations[s.name] = await s.finish(); } catch (e) { this.drop(s, e); }
    }));
    if (!Object.keys(locations).length) throw new Error(`Every destination failed: ${JSON.stringify(this.errors)}`);
    return { locations, errors: this.errors };
  }

  abortAll(err: Error): void {
    for (const s of this.alive) { try { s.abort(err); } catch { /* ignore */ } }
    this.alive = [];
  }
}
