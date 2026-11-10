// Run: npm run test:recovery   (node --import tsx --test)
// Pure tests — no Firebase/Cloudinary connection needed.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'zlib';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Timestamp } from 'firebase-admin/firestore';
import {
  EntryParser, JournalOverlay, RecoveryDecryptor, RecoveryEncryptor, encodeEntry, generateKeyFile, ndjson, openKeyFile,
  parseKeyFile, parseNdjson, randomBytes, resealKeyFile, type FsDocLine, type KeyFile, type KeyKit,
} from './format.js';
import { decodeDoc, encodeDoc, stableStringify } from './encode.js';

const PASS = 'correct horse battery staple 42';
const HASH = { algorithm: 'SCRYPT' as const, base64SignerKey: 'c2lnbmVy', base64SaltSeparator: 'Bw==', rounds: 8, memCost: 14 };

let keyFile: KeyFile;
let kit: KeyKit;

test('key file: create, open, wrong passphrase, reseal keeps fingerprint', async () => {
  keyFile = await generateKeyFile(PASS, HASH);
  const parsed = parseKeyFile(JSON.stringify(keyFile));
  kit = await openKeyFile(parsed, PASS);
  assert.deepEqual(kit.firebaseHash, HASH);
  await assert.rejects(openKeyFile(parsed, 'wrong passphrase entirely'), /Wrong passphrase/);
  await assert.rejects(generateKeyFile('short', null), /at least/);
  const resealed = await resealKeyFile(parsed, PASS, 'a brand new passphrase!!');
  assert.equal(resealed.fingerprint, keyFile.fingerprint);
  assert.equal(resealed.publicKeySpkiB64, keyFile.publicKeySpkiB64);
  assert.equal((await openKeyFile(resealed, 'a brand new passphrase!!')).privateKeyPkcs8B64, kit.privateKeyPkcs8B64);
  await assert.rejects(openKeyFile(resealed, PASS), /Wrong passphrase/);
});

async function buildFile(entries: Uint8Array[]): Promise<Buffer> {
  const encr = await RecoveryEncryptor.create(keyFile.publicKeySpkiB64, 'manual');
  const gz = zlib.gzipSync(Buffer.concat(entries));
  const parts: Uint8Array[] = [encr.headerChunk()];
  // push in uneven pieces to exercise framing
  for (let i = 0; i < gz.length; i += 700_001) parts.push(...(await encr.push(gz.subarray(i, i + 700_001))));
  parts.push(await encr.finish());
  return Buffer.concat(parts);
}

async function readFile(file: Buffer, useKit: KeyKit, chunk = 333_333) {
  const d = new RecoveryDecryptor(useKit);
  const plain: Uint8Array[] = [];
  for (let i = 0; i < file.length; i += chunk) plain.push(...(await d.feed(file.subarray(i, i + chunk))));
  d.end();
  const p = new EntryParser();
  const out = p.feed(zlib.gunzipSync(Buffer.concat(plain)));
  p.end();
  return out;
}

test('recovery file: round trip across many frames', async () => {
  const big = randomBytes(3_500_000); // incompressible → several 1 MB frames
  const docs: FsDocLine[] = [{ p: 'projects/a', d: { name: 'x' } }, { p: 'users/u1/private/totp', d: { secret: 'S' } }];
  const file = await buildFile([
    encodeEntry({ t: 'fs', collection: 'projects', n: 2 }, ndjson(docs)),
    encodeEntry({ t: 'file', publicId: 'milestones/f.pdf', type: 'upload', resourceType: 'raw', format: null, bytes: big.length, createdAt: null }, big),
    encodeEntry({ t: 'manifest' }, new TextEncoder().encode('{"ok":true}')),
  ]);
  const entries = await readFile(file, kit);
  assert.equal(entries.length, 3);
  assert.deepEqual(parseNdjson(entries[0]!.body), docs);
  assert.ok(Buffer.from(entries[1]!.body).equals(Buffer.from(big)));
  assert.equal(entries[2]!.meta.t, 'manifest');
});

test('recovery file: tampering, truncation and the wrong key all fail', async () => {
  const file = await buildFile([encodeEntry({ t: 'manifest' }, randomBytes(2_500_000))]);

  const flipped = Buffer.from(file);
  flipped[flipped.length - 100]! ^= 1;
  await assert.rejects(readFile(flipped, kit), /integrity/);

  const headerTampered = Buffer.from(file);
  const i = headerTampered.indexOf('"kind":"manual"');
  headerTampered.write('"kind":"weekly"', i);
  await assert.rejects(readFile(headerTampered, kit), /integrity/);

  // Drop the final frame: find the last frame boundary by re-walking frames.
  let off = 12 + file.readUInt32BE(8);
  let lastStart = off;
  while (off < file.length) { lastStart = off; off += 5 + file.readUInt32BE(off); }
  await assert.rejects(readFile(file.subarray(0, lastStart), kit), /incomplete/);

  const otherKey = await generateKeyFile(PASS, null);
  const otherKit = await openKeyFile(otherKey, PASS);
  await assert.rejects(readFile(file, otherKit), /wrong key/);
});

test('encode/decode keeps Timestamps (nested), bytes, ISO strings and __t keys', () => {
  const fakeDb = { doc: (p: string) => ({ path: p }) } as never;
  const original = {
    timestamp: new Timestamp(1_700_000_000, 123_000_000),
    editHistory: [{ editedAt: new Timestamp(1_700_000_100, 5), reason: 'fix' }],
    uploadedAt: '2026-11-10T08:00:00.000Z',
    nested: { deeper: { at: new Timestamp(1, 2) } },
    bytes: Buffer.from('hello'),
    weird: { __t: 'not a tag', v: 1 },
    url: 'https://res.cloudinary.com/oldcloud/raw/upload/v1/milestones/a.pdf',
    n: null,
    list: [1, 'two', true],
  };
  const enc = encodeDoc(original);
  const json = JSON.parse(JSON.stringify(enc)) as Record<string, unknown>;
  const back = decodeDoc(json, { db: fakeDb, rewriteCloud: { from: 'oldcloud', to: 'newcloud' } }) as typeof original;
  assert.ok(back.timestamp instanceof Timestamp && back.timestamp.isEqual(original.timestamp));
  assert.ok(back.editHistory[0]!.editedAt instanceof Timestamp && back.editHistory[0]!.editedAt.nanoseconds === 5);
  assert.equal(back.uploadedAt, original.uploadedAt);
  assert.ok(back.nested.deeper.at.isEqual(original.nested.deeper.at));
  assert.ok(Buffer.isBuffer(back.bytes) && back.bytes.toString() === 'hello');
  assert.deepEqual(back.weird, { __t: 'not a tag', v: 1 });
  assert.equal(back.url, 'https://res.cloudinary.com/newcloud/raw/upload/v1/milestones/a.pdf');
  assert.equal(stableStringify(encodeDoc({ b: 1, a: 2 })), stableStringify(encodeDoc({ a: 2, b: 1 })));
});


const normalize = (s: string) => s.split('\r\n').join('\n');

test('web copy of format.ts is identical to the server copy', () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const server = normalize(fs.readFileSync(path.join(here, 'format.ts'), 'utf8'));
  const webPath = path.resolve(here, '../../../../web/lib/recovery/format.ts');
  const web = normalize(fs.readFileSync(webPath, 'utf8'));
  // Only the first (path) comment line differs.
  assert.equal(web.slice(web.indexOf('\n')), server.slice(server.indexOf('\n')));
});

test('journal overlay: newest updateTime wins, old events ignored, idempotent', () => {
  const after = 1_000_000;
  const o = new JournalOverlay(after);
  const ev = (id: string, at: number, docs: FsDocLine[]) => {
    o.add({ t: 'journal', id, at: new Date(at).toISOString(), event: 'milestone_submitted', projectId: 'p1' }, new Uint8Array(0));
    o.add({ t: 'fs', collection: 'journal', n: docs.length }, ndjson(docs));
  };
  ev('old', after - 10, [{ p: 'milestones/m1', d: { status: 'stale' }, u: after - 10 }]);
  ev('b', after + 200, [{ p: 'milestones/m1', d: { status: 'graded' }, u: after + 200 }, { p: 'projectRecordEntries/r2', d: { type: 'grade' }, u: after + 200 }]);
  ev('a', after + 100, [{ p: 'milestones/m1', d: { status: 'submitted' }, u: after + 100 }, { p: 'projectRecordEntries/r1', d: { type: 'sub' }, u: after + 100 }]);
  ev('b', after + 200, [{ p: 'milestones/m1', d: { status: 'graded' }, u: after + 200 }]); // replayed twice
  assert.equal(o.events.size, 2);
  const merged = o.overlay([{ p: 'milestones/m1', d: { status: 'pending' } }, { p: 'projects/p1', d: { x: 1 } }]);
  assert.deepEqual(merged.map((l) => l.d), [{ status: 'graded' }, { x: 1 }]);
  assert.equal(merged[0]!.u, after + 200);
  assert.deepEqual(o.leftovers().map((l) => l.p).sort(), ['projectRecordEntries/r1', 'projectRecordEntries/r2']);
  assert.equal(o.lastEventAt, new Date(after + 200).toISOString());
});

test('selective restore: project scope picks the project, linked docs and their subcollections only', async () => {
  const { ProjectScopeCollector } = await import('./format.js');
  const c = new ProjectScopeCollector('P1');
  const lines = [
    { p: 'projects/P1', d: {} },
    { p: 'projects/P2', d: {} },
    { p: 'milestones/m1', d: { projectId: 'P1' } },
    { p: 'milestones/m2', d: { projectId: 'P2' } },
    { p: 'chats/c1', d: { relatedProjectId: 'P1' } },
    { p: 'chats/c1/messages/x', d: {} },
    { p: 'chats/c2/messages/y', d: { projectId: 'P1' } },
    { p: 'projectRecordEntries/r1', d: { projectId: 'P1' } },
  ];
  const picked = lines.filter((l) => c.add(l)).map((l) => l.p);
  assert.deepEqual(picked, ['projects/P1', 'milestones/m1', 'chats/c1', 'chats/c1/messages/x', 'projectRecordEntries/r1']);
});
