// src/scripts/recovery.ts — disaster-recovery command line.
//
//   keygen  --out <file.hitkey>            create a new key pair (run on a key
//                                          holder's own computer, never a server)
//   rekey   --key <file> --out <file>      change the passphrase and/or set the
//           [--hash-config <json>]         Firebase password-hash parameters
//   pubkey  --key <file>                   print the public key for RECOVERY_PUBLIC_KEY
//   backup  --out <file.hitrec> [--kind]   write a recovery file locally
//   backup  --job [--kind auto|daily|weekly|manual]
//                                          what the recovery-backup Cloud Run Job
//                                          runs: bucket + Drive, status, alerts
//   inspect <file> --key <file>            decrypt + verify, print the manifest
//   drive-auth                             one-time: sign in as the backup-only
//                                          Google account, create its folder,
//                                          print the Drive refresh token + folder id
//   restore <file> --key <file> --mode dry-run|merge|full
//           [--journal <dir>] [--outage-from ISO --outage-to ISO] [--no-revoke] [--yes]
//                                          --journal: a folder of journal .hitrec files
//                                          (gsutil/gcloud cp from gs://…/journal/<day>/);
//                                          events after the backup are replayed on top
//
// The passphrase is read from RECOVERY_PASSPHRASE or prompted (hidden).
// Run against any project: set GOOGLE_APPLICATION_CREDENTIALS /
// FIREBASE_SERVICE_ACCOUNT_JSON and GOOGLE_CLOUD_PROJECT for the TARGET
// project (a brand-new one when rebuilding from scratch). Full procedure:
// RECOVERY_RUNBOOK_HE.md.
//
// Local: npx tsx src/scripts/recovery.ts <command> ...
// In the container: node dist/scripts/recovery.js <command> ...

import fs from 'fs';
import readline from 'readline';
import 'dotenv/config';

const args = process.argv.slice(2);
const command = args[0];
const flag = (name: string) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const has = (name: string) => args.includes(`--${name}`);
const positional = args[1] && !args[1].startsWith('--') ? args[1] : undefined;

function die(msg: string): never {
  console.error(`✖ ${msg}`);
  process.exit(1);
}

async function prompt(question: string, hidden = true): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  if (hidden) {
    const out = rl as unknown as { _writeToOutput: (s: string) => void; output: NodeJS.WriteStream };
    out._writeToOutput = (s: string) => { if (s.includes(question)) out.output.write(s); };
  }
  const answer = await new Promise<string>((resolve) => rl.question(question, resolve));
  rl.close();
  if (hidden) process.stdout.write('\n');
  return answer;
}

async function passphrase(label = 'Passphrase: '): Promise<string> {
  return process.env.RECOVERY_PASSPHRASE ?? prompt(label);
}

async function loadKit() {
  const { openKeyFile, parseKeyFile } = await import('../services/recovery/format.js');
  const keyPath = flag('key') ?? die('--key <file.hitkey> is required.');
  const file = parseKeyFile(fs.readFileSync(keyPath, 'utf8'));
  const kit = await openKeyFile(file, await passphrase());
  return { file, kit };
}

async function* readFileChunks(path: string): AsyncGenerator<Uint8Array> {
  for await (const chunk of fs.createReadStream(path, { highWaterMark: 1024 * 1024 })) yield chunk as Buffer;
}

function parseHashConfig(raw: string | undefined) {
  if (!raw) return null;
  const text = fs.existsSync(raw) ? fs.readFileSync(raw, 'utf8') : raw;
  const j = JSON.parse(text) as Record<string, unknown>;
  // Accept the console's own names (base64_signer_key, …) or ours.
  const pick = (...k: string[]) => k.map((x) => j[x]).find((v) => v !== undefined);
  const cfg = {
    algorithm: 'SCRYPT' as const,
    base64SignerKey: String(pick('base64SignerKey', 'base64_signer_key', 'signerKey') ?? ''),
    base64SaltSeparator: String(pick('base64SaltSeparator', 'base64_salt_separator', 'saltSeparator') ?? ''),
    rounds: Number(pick('rounds')),
    memCost: Number(pick('memCost', 'mem_cost', 'memoryCost')),
  };
  if (!cfg.base64SignerKey || !cfg.base64SaltSeparator || !cfg.rounds || !cfg.memCost) die('Hash config needs base64_signer_key, base64_salt_separator, rounds, mem_cost.');
  return cfg;
}

async function keygen() {
  const { generateKeyFile, MIN_PASSPHRASE_LENGTH } = await import('../services/recovery/format.js');
  const out = flag('out') ?? die('--out <file.hitkey> is required.');
  if (fs.existsSync(out)) die(`${out} already exists — refusing to overwrite a key.`);
  const p1 = await passphrase(`New passphrase (min ${MIN_PASSPHRASE_LENGTH} chars): `);
  const p2 = process.env.RECOVERY_PASSPHRASE ?? await prompt('Repeat passphrase: ');
  if (p1 !== p2) die('Passphrases do not match.');
  console.log('Generating RSA-4096 key pair…');
  const key = await generateKeyFile(p1, parseHashConfig(flag('hash-config')));
  fs.writeFileSync(out, JSON.stringify(key, null, 2), { flag: 'wx' });
  console.log(`\n✔ Key file written: ${out}`);
  console.log(`  Fingerprint: ${key.fingerprint}`);
  console.log(`  Firebase password-hash parameters: ${flag('hash-config') ? 'included' : 'NOT included (add with: rekey --hash-config ...)'}`);
  console.log('\nSet this on the api service and the recovery-backup job as RECOVERY_PUBLIC_KEY:\n');
  console.log(key.publicKeySpkiB64);
  console.log('\nKeep the key file + passphrase OFFLINE: each holder in a password manager, plus a sealed printed copy in the safe.');
}

async function rekey() {
  const { parseKeyFile, resealKeyFile, MIN_PASSPHRASE_LENGTH } = await import('../services/recovery/format.js');
  const keyPath = flag('key') ?? die('--key is required.');
  const out = flag('out') ?? die('--out is required (never overwrite the old key until the new one is tested).');
  if (fs.existsSync(out)) die(`${out} already exists.`);
  const file = parseKeyFile(fs.readFileSync(keyPath, 'utf8'));
  const oldP = await prompt('Current passphrase: ');
  const newP = await prompt(`New passphrase (min ${MIN_PASSPHRASE_LENGTH} chars, Enter = keep current): `) || oldP;
  const hash = flag('hash-config');
  const next = await resealKeyFile(file, oldP, newP, hash ? { firebaseHash: parseHashConfig(hash) } : undefined);
  fs.writeFileSync(out, JSON.stringify(next, null, 2), { flag: 'wx' });
  console.log(`✔ Written ${out} (same key ${next.fingerprint}; nothing changes on the server).`);
}

async function pubkey() {
  const { parseKeyFile } = await import('../services/recovery/format.js');
  const file = parseKeyFile(fs.readFileSync(flag('key') ?? die('--key is required.'), 'utf8'));
  console.log(`# fingerprint ${file.fingerprint}`);
  console.log(file.publicKeySpkiB64);
}

async function backup() {
  type Kind = import('../services/recovery/format.js').RecoveryKind;
  const kindArg = (flag('kind') ?? (has('job') ? 'auto' : 'manual')) as Kind | 'auto';
  if (!['auto', 'daily', 'weekly', 'manual'].includes(kindArg)) die('--kind must be auto|daily|weekly|manual');
  if (has('job')) {
    const { runTrackedJob } = await import('../services/systemHealth.js');
    const { runScheduledBackup } = await import('../services/recovery/job.js');
    let failed = false;
    await runTrackedJob('recoveryBackup', async () => {
      try { await runScheduledBackup(kindArg); } catch (e) { failed = true; throw e; }
    });
    process.exit(failed ? 1 : 0);
  }
  const { createRecoveryFile, autoKind } = await import('../services/recovery/backup.js');
  const { localFileSink } = await import('../services/recovery/destinations.js');
  const out = flag('out') ?? die('--out <file.hitrec> is required (or --job).');
  const publicKey = process.env.RECOVERY_PUBLIC_KEY ?? (flag('key') ? JSON.parse(fs.readFileSync(flag('key')!, 'utf8')).publicKeySpkiB64 : undefined) ?? die('Set RECOVERY_PUBLIC_KEY or pass --key <file.hitkey> (only its public half is used).');
  const kind = kindArg === 'auto' ? autoKind() : kindArg;
  const r = await createRecoveryFile({ kind, publicKeySpkiB64: publicKey, sinks: [localFileSink(out)], ...(has('no-files') ? { files: 'none' as const } : {}) });
  console.log(`✔ ${out}: ${(r.bytesWritten / 1048576).toFixed(1)} MB, key ${r.fingerprint}`);
  console.log(JSON.stringify({ authUsers: r.manifest.authUsers, withPassword: r.manifest.authUsersWithPassword, firestore: r.manifest.firestore, files: r.manifest.filesIncluded, warnings: r.manifest.warnings }, null, 2));
  process.exit(0);
}

async function inspect() {
  const { readRecoveryStream } = await import('../services/recovery/restore.js');
  const { parseJson } = await import('../services/recovery/format.js');
  const path = positional ?? die('Usage: inspect <file.hitrec> --key <file.hitkey>');
  const { kit } = await loadKit();
  const counts: Record<string, number> = {};
  let manifest: unknown = null;
  const dec = await readRecoveryStream(readFileChunks(path), kit, async (meta, body) => {
    counts[meta.t] = (counts[meta.t] ?? 0) + ('n' in meta ? meta.n : 1);
    if (meta.t === 'manifest') manifest = parseJson(body);
  });
  console.log(`✔ Decrypted and verified (key ${dec.header?.fingerprint}, created ${dec.header?.createdAt}).`);
  console.log('Entries:', counts);
  console.log('Manifest:', JSON.stringify(manifest, null, 2));
  process.exit(0);
}

async function restore() {
  const R = await import('../services/recovery/restore.js');
  const F = await import('../services/recovery/format.js');
  const { ensureCloudinaryConfigured } = await import('../services/recovery/cloudinaryFiles.js');
  const path = positional ?? die('Usage: restore <file.hitrec> --key <file.hitkey> --mode dry-run|merge|full');
  const mode = flag('mode') ?? 'dry-run';
  if (!['dry-run', 'merge', 'full'].includes(mode)) die('--mode must be dry-run|merge|full');
  const { kit } = await loadKit();
  const project = process.env.GOOGLE_CLOUD_PROJECT ?? '(from credentials)';

  // Pass 1 — always: decrypt, verify end to end, read the manifest.
  let manifest: import('../services/recovery/format.js').RecoveryManifest | null = null;
  await R.readRecoveryStream(readFileChunks(path), kit, async (meta, body) => {
    if (meta.t === 'manifest') manifest = F.parseJson(body);
  });
  if (!manifest) die('The file has no manifest (incomplete).');
  const m = manifest as import('../services/recovery/format.js').RecoveryManifest;
  console.log(`✔ File verified: ${m.kind} from ${m.createdAt} (project ${m.projectId}), ${m.authUsers} logins, ${Object.values(m.firestore).reduce((a, b) => a + b, 0)} documents, ${m.filesIncluded} files.`);
  if (m.authUsersWithPassword > 0 && !kit.firebaseHash) {
    console.warn('⚠ The key kit has no Firebase password-hash parameters: email/password users will be restored WITHOUT passwords (they must reset). Add them with `rekey --hash-config`.');
  }

  // Real-time journal: every event after the backup's snapshot instant.
  const overlay = new F.JournalOverlay(Date.parse(m.snapshotReadTime ?? m.createdAt));
  const journalDir = flag('journal');
  if (journalDir) {
    const files = fs.readdirSync(journalDir, { recursive: true }).map(String).filter((f) => f.endsWith('.hitrec')).sort();
    for (const f of files) {
      const dec = await R.readRecoveryStream(readFileChunks(`${journalDir}/${f}`), kit, async (meta, body) => overlay.add(meta, body));
      if (dec.header?.kind !== 'journal') die(`${f} is not a journal file.`);
    }
    console.log(`✔ Journal: ${overlay.events.size} events after the backup (${overlay.docCount} documents, ${overlay.files.length} files), last at ${overlay.lastEventAt ?? '—'}.`);
  }

  const toCloud = ensureCloudinaryConfigured();
  const rewriteCloud = m.cloudinaryCloud && toCloud && m.cloudinaryCloud !== toCloud ? { from: m.cloudinaryCloud, to: toCloud } : null;

  if (mode === 'dry-run') {
    const fs2: Record<string, { added: number; same: number; changed: number }> = {};
    const authTotals = { added: 0, existing: 0, emailChanged: 0, withoutPassword: 0 };
    await R.readRecoveryStream(readFileChunks(path), kit, async (meta, body) => {
      if (meta.t === 'auth') {
        const r = await R.dryRunAuthUsers(F.parseNdjson(body));
        for (const k of Object.keys(authTotals) as Array<keyof typeof authTotals>) authTotals[k] += r[k];
      } else if (meta.t === 'fs') {
        const r = await R.dryRunFirestoreDocs(overlay.overlay(F.parseNdjson(body)));
        for (const [c, v] of Object.entries(r)) {
          const t = (fs2[c] ??= { added: 0, same: 0, changed: 0 });
          t.added += v.added; t.same += v.same; t.changed += v.changed;
        }
      }
    });
    for (const [c, v] of Object.entries(await R.dryRunFirestoreDocs(overlay.leftovers()))) {
      const t = (fs2[c] ??= { added: 0, same: 0, changed: 0 });
      t.added += v.added; t.same += v.same; t.changed += v.changed;
    }
    console.log('Logins:', authTotals);
    console.table(fs2);
    console.log(`Dry run only — nothing was changed in ${project}.`);
    process.exit(0);
  }

  if (!has('yes')) {
    const expect = mode === 'full' ? `FULL RESTORE ${project}` : `MERGE ${project}`;
    const typed = await prompt(`This writes to project ${project}. Type "${expect}" to continue: `, false);
    if (typed.trim() !== expect) die('Not confirmed.');
  }
  if (!has('no-safety-backup')) {
    const pk = process.env.RECOVERY_PUBLIC_KEY;
    if (pk) {
      const { createRecoveryFile } = await import('../services/recovery/backup.js');
      const { localFileSink } = await import('../services/recovery/destinations.js');
      const safety = `safety-before-restore-${Date.now()}.hitrec`;
      console.log(`Taking a safety backup of the current state → ${safety}`);
      await createRecoveryFile({ kind: 'manual', publicKeySpkiB64: pk, sinks: [localFileSink(safety)], files: 'none' });
    } else {
      console.warn('⚠ RECOVERY_PUBLIC_KEY not set — no safety backup taken (pass --no-safety-backup to silence).');
    }
  }

  const restoreMode = mode as 'merge' | 'full';
  if (restoreMode === 'full') {
    console.log('Wiping backed-up collections…');
    await R.wipeForFullRestore(null, (msg) => console.log(`  ${msg}`));
  }
  const uidsInFile = new Set<string>();
  const totals = { auth: { imported: 0, skipped: 0, withoutPassword: 0, failed: 0 }, docs: { written: 0, skipped: 0 }, files: { uploaded: 0, existed: 0, failed: 0 } };
  await R.readRecoveryStream(readFileChunks(path), kit, async (meta, body) => {
    if (meta.t === 'auth') {
      const users = F.parseNdjson<import('../services/recovery/format.js').AuthUserLine>(body);
      users.forEach((u) => uidsInFile.add(u.uid));
      const r = await R.restoreAuthUsers(users, restoreMode, kit.firebaseHash, null);
      totals.auth.imported += r.imported; totals.auth.skipped += r.skipped; totals.auth.withoutPassword += r.withoutPassword; totals.auth.failed += r.failed.length;
      for (const f of r.failed.slice(0, 5)) console.warn(`  login ${f.uid}: ${f.error}`);
    } else if (meta.t === 'fs') {
      const r = await R.restoreFirestoreDocs(overlay.overlay(F.parseNdjson(body)), restoreMode, { rewriteCloud, protectUid: null });
      totals.docs.written += r.written; totals.docs.skipped += r.skipped;
      process.stdout.write(`\r  documents written: ${totals.docs.written}`);
    } else if (meta.t === 'file') {
      try {
        const r = await R.restoreFile(meta, Buffer.from(body), restoreMode);
        totals.files[r]++;
      } catch (e) {
        totals.files.failed++;
        console.warn(`\n  file ${meta.publicId}: ${(e as Error).message}`);
      }
    }
  });
  if (overlay.events.size) {
    // Journal: docs created after the backup, and recent uploads.
    const left = await R.restoreFirestoreDocs(overlay.leftovers(), restoreMode, { rewriteCloud, protectUid: null });
    totals.docs.written += left.written;
    for (const f of overlay.files) {
      try { totals.files[await R.restoreFile(f.meta, Buffer.from(f.body), restoreMode)]++; } catch (e) { totals.files.failed++; console.warn(`
  journal file ${f.meta.publicId}: ${(e as Error).message}`); }
    }
    console.log(`
Replayed ${overlay.events.size} journal events (up to ${overlay.lastEventAt}).`);
  }
  console.log('');
  if (restoreMode === 'full' && uidsInFile.size) {
    const n = await R.disableUsersNotIn(uidsInFile, null);
    console.log(`Disabled ${n} login(s) that were not in the file.`);
  }
  const from = flag('outage-from');
  const to = flag('outage-to');
  if (from && to) {
    const g = await R.applyOutageGrace(new Date(from), new Date(to), 'recovery-cli');
    console.log(`Outage grace: ${g.projects} projects paused for the outage window, ${g.milestones} due dates moved forward; reminders quiet for 24h.`);
  }
  if (!has('no-revoke')) {
    const n = await R.revokeAllSessions();
    console.log(`Signed out ${n} logins (they sign in again with the same password).`);
  }
  console.log('✔ Restore finished:', JSON.stringify(totals));
  process.exit(0);
}

/** Loopback OAuth for the backup-only Google account (Desktop OAuth client:
 *  RECOVERY_DRIVE_CLIENT_ID / RECOVERY_DRIVE_CLIENT_SECRET in env). The app
 *  creates the folder itself: with the drive.file scope it can only write
 *  into folders/files it created. */
async function driveAuth() {
  const http = await import('http');
  const { google } = await import('googleapis');
  const clientId = process.env.RECOVERY_DRIVE_CLIENT_ID ?? die('Set RECOVERY_DRIVE_CLIENT_ID.');
  const clientSecret = process.env.RECOVERY_DRIVE_CLIENT_SECRET ?? die('Set RECOVERY_DRIVE_CLIENT_SECRET.');
  const port = 53682;
  const redirect = `http://127.0.0.1:${port}`;
  const oauth = new google.auth.OAuth2(clientId, clientSecret, redirect);
  const url = oauth.generateAuthUrl({ access_type: 'offline', prompt: 'consent', scope: ['https://www.googleapis.com/auth/drive.file'] });
  console.log('Open this link signed in as the BACKUP-ONLY Google account:');
  console.log(url);
  const code = await new Promise<string>((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const u = new URL(req.url ?? '/', redirect);
      const c = u.searchParams.get('code');
      res.end(c ? 'Done - you can close this tab.' : 'No code.');
      server.close();
      if (c) resolve(c); else reject(new Error(u.searchParams.get('error') ?? 'No code returned.'));
    }).listen(port, '127.0.0.1');
  });
  const { tokens } = await oauth.getToken(code);
  if (!tokens.refresh_token) die('Google returned no refresh token. Remove the app from the account third-party access and run again.');
  oauth.setCredentials(tokens);
  const drive = google.drive({ version: 'v3', auth: oauth });
  const folder = await drive.files.create({ requestBody: { name: 'HIT recovery files', mimeType: 'application/vnd.google-apps.folder' }, fields: 'id' });
  console.log(`✔ Folder created. RECOVERY_DRIVE_FOLDER_ID=${folder.data.id}`);
  console.log('Store the refresh token in Secret Manager as RECOVERY_DRIVE_REFRESH_TOKEN (do not paste it anywhere else):');
  console.log(tokens.refresh_token);
  process.exit(0);
}

const commands: Record<string, () => Promise<void>> = { keygen, rekey, pubkey, backup, inspect, restore, 'drive-auth': driveAuth };
const run = command ? commands[command] : undefined;
if (!run) {
  console.log('Usage: recovery <keygen|rekey|pubkey|drive-auth|backup|inspect|restore> … (see the header of src/scripts/recovery.ts)');
  process.exit(command ? 1 : 0);
}
run().catch((err) => { console.error('✖', err instanceof Error ? err.message : err); process.exit(1); });
