// src/services/recovery/format.ts
//
// The encrypted recovery file (.hitrec) and the offline key kit (.hitkey).
//
// THIS FILE IS SHARED VERBATIM with web/lib/recovery/format.ts — the browser
// decrypts recovery files locally during a restore, so the private key never
// leaves the admin's computer. It only uses WebCrypto (globalThis.crypto.subtle),
// TextEncoder/TextDecoder and Uint8Array, all available in Node 22 and every
// modern browser. Keep the two copies identical (recovery.test.ts checks it).
//
// ── .hitrec layout ───────────────────────────────────────────────────────────
//   "HITREC01" (8 bytes) | u32 headerLen | header JSON (plaintext, not secret)
//   then frames: u32 len | u8 final | AES-256-GCM(ciphertext || 16-byte tag)
//
// Every file gets a fresh random AES-256 data key, wrapped with the
// RSA-OAEP-4096 *public* key — the server can create backups but can never
// read one. Each frame's nonce is noncePrefix(7) | final(1) | counter(4) and
// its additional data is SHA-256(header bytes), so frames can't be reordered,
// dropped, truncated (a final frame is required) or moved between files, and
// the header can't be swapped.
//
// The decrypted plaintext is gzip, and inside the gzip is a flat list of
// entries:  u32 metaLen | meta JSON | u32 bodyLen | body bytes
// (entry kinds: see RecoveryEntryMeta). The manifest is always the last entry.
//
// ── .hitkey layout ───────────────────────────────────────────────────────────
// JSON: the public key, its fingerprint, and the private-key "kit" (PKCS#8
// private key + optional Firebase Auth password-hash parameters) encrypted
// with AES-256-GCM under PBKDF2-SHA256(passphrase, 600k iterations).

export const RECOVERY_MAGIC = 'HITREC01';
export const FRAME_PLAINTEXT_BYTES = 1024 * 1024;
const PBKDF2_ITERATIONS = 600_000;

const subtle = (): SubtleCrypto => {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (!c?.subtle) throw new Error('WebCrypto is not available in this environment.');
  return c.subtle;
};

// Fresh ArrayBuffer-backed copy — WebCrypto's BufferSource typing rejects
// views over SharedArrayBuffer/ArrayBufferLike in newer TS lib versions.
function bs(view: Uint8Array): ArrayBuffer {
  const out = new ArrayBuffer(view.byteLength);
  new Uint8Array(out).set(view);
  return out;
}

const enc = new TextEncoder();
const dec = new TextDecoder();

export function randomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  // getRandomValues fills at most 65,536 bytes per call.
  for (let i = 0; i < n; i += 65536) (globalThis as { crypto: Crypto }).crypto.getRandomValues(out.subarray(i, Math.min(n, i + 65536)));
  return out;
}

export function toB64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(s);
}

export function fromB64(b64: string): Uint8Array {
  const s = atob(b64.replace(/\s+/g, ''));
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) { out.set(p, off); off += p.length; }
  return out;
}

function u32(n: number): Uint8Array {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n >>> 0, false);
  return b;
}

function readU32(b: Uint8Array, off: number): number {
  return new DataView(b.buffer, b.byteOffset + off, 4).getUint32(0, false);
}

async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await subtle().digest('SHA-256', bs(bytes)));
}

/** Human-checkable id of a public key: first 16 bytes of SHA-256(SPKI DER),
 *  as 8 groups of 4 hex chars. Shown on the admin page and in every file
 *  header so holders can tell which key a file needs. */
export async function publicKeyFingerprint(spkiDer: Uint8Array): Promise<string> {
  const h = await sha256(spkiDer);
  const hex = Array.from(h.subarray(0, 16), (b) => b.toString(16).padStart(2, '0')).join('');
  return hex.match(/.{4}/g)!.join('-');
}

// ── Key kit ──────────────────────────────────────────────────────────────────

/** Firebase Auth's scrypt password-hash parameters (Firebase Console →
 *  Authentication → Users → ⋮ → Password hash parameters). Needed so
 *  restored users keep their existing passwords. */
export interface FirebaseHashConfig {
  algorithm: 'SCRYPT';
  base64SignerKey: string;
  base64SaltSeparator: string;
  rounds: number;
  memCost: number;
}

export interface KeyKit {
  privateKeyPkcs8B64: string;
  firebaseHash: FirebaseHashConfig | null;
}

export interface KeyFile {
  format: 'hitrec-key-1';
  fingerprint: string;
  publicKeySpkiB64: string;
  createdAt: string;
  kdf: { name: 'PBKDF2'; hash: 'SHA-256'; iterations: number; saltB64: string };
  ivB64: string;
  encryptedKitB64: string;
  /** When the passphrase was last set — drives the 6-month reminder. */
  sealedAt: string;
}

const RSA_PARAMS: RsaHashedKeyGenParams = {
  name: 'RSA-OAEP',
  modulusLength: 4096,
  publicExponent: new Uint8Array([1, 0, 1]),
  hash: 'SHA-256',
};

async function passphraseKey(passphrase: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const base = await subtle().importKey('raw', bs(enc.encode(passphrase)), 'PBKDF2', false, ['deriveKey']);
  return subtle().deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: bs(salt), iterations },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function sealKit(kit: KeyKit, passphrase: string): Promise<Pick<KeyFile, 'kdf' | 'ivB64' | 'encryptedKitB64' | 'sealedAt'>> {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = await passphraseKey(passphrase, salt, PBKDF2_ITERATIONS);
  const sealed = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv: bs(iv) }, key, bs(enc.encode(JSON.stringify(kit)))));
  return {
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: PBKDF2_ITERATIONS, saltB64: toB64(salt) },
    ivB64: toB64(iv),
    encryptedKitB64: toB64(sealed),
    sealedAt: new Date().toISOString(),
  };
}

export const MIN_PASSPHRASE_LENGTH = 16;

/** Generates a new RSA-4096 key pair and seals the private half. Run on a
 *  holder's own computer (CLI `recovery keygen`), never on the server. */
export async function generateKeyFile(passphrase: string, firebaseHash: FirebaseHashConfig | null): Promise<KeyFile> {
  if (passphrase.length < MIN_PASSPHRASE_LENGTH) throw new Error(`Passphrase must be at least ${MIN_PASSPHRASE_LENGTH} characters.`);
  const pair = await subtle().generateKey(RSA_PARAMS, true, ['encrypt', 'decrypt']) as CryptoKeyPair;
  const spki = new Uint8Array(await subtle().exportKey('spki', pair.publicKey));
  const pkcs8 = new Uint8Array(await subtle().exportKey('pkcs8', pair.privateKey));
  return {
    format: 'hitrec-key-1',
    fingerprint: await publicKeyFingerprint(spki),
    publicKeySpkiB64: toB64(spki),
    createdAt: new Date().toISOString(),
    ...(await sealKit({ privateKeyPkcs8B64: toB64(pkcs8), firebaseHash }, passphrase)),
  };
}

export function parseKeyFile(text: string): KeyFile {
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { throw new Error('Not a recovery key file (invalid JSON).'); }
  const k = parsed as Partial<KeyFile>;
  if (k?.format !== 'hitrec-key-1' || !k.encryptedKitB64 || !k.kdf || !k.ivB64 || !k.publicKeySpkiB64 || !k.fingerprint) {
    throw new Error('Not a recovery key file.');
  }
  return k as KeyFile;
}

/** Decrypts the kit. A wrong passphrase fails the GCM tag check. */
export async function openKeyFile(file: KeyFile, passphrase: string): Promise<KeyKit> {
  const key = await passphraseKey(passphrase, fromB64(file.kdf.saltB64), file.kdf.iterations);
  let plain: ArrayBuffer;
  try {
    plain = await subtle().decrypt({ name: 'AES-GCM', iv: bs(fromB64(file.ivB64)) }, key, bs(fromB64(file.encryptedKitB64)));
  } catch {
    throw new Error('Wrong passphrase, or the key file is damaged.');
  }
  return JSON.parse(dec.decode(plain)) as KeyKit;
}

/** Re-seals the same key pair under a new passphrase and/or updated
 *  Firebase hash parameters. The public key and fingerprint don't change,
 *  so nothing on the server has to change either. */
export async function resealKeyFile(file: KeyFile, oldPassphrase: string, newPassphrase: string, update?: { firebaseHash?: FirebaseHashConfig | null }): Promise<KeyFile> {
  if (newPassphrase.length < MIN_PASSPHRASE_LENGTH) throw new Error(`Passphrase must be at least ${MIN_PASSPHRASE_LENGTH} characters.`);
  const kit = await openKeyFile(file, oldPassphrase);
  const next: KeyKit = { ...kit, ...(update && 'firebaseHash' in update ? { firebaseHash: update.firebaseHash ?? null } : {}) };
  return { ...file, ...(await sealKit(next, newPassphrase)) };
}

async function importPublicKey(spkiB64: string): Promise<CryptoKey> {
  return subtle().importKey('spki', bs(fromB64(spkiB64)), { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['encrypt']);
}

async function importPrivateKey(pkcs8B64: string): Promise<CryptoKey> {
  return subtle().importKey('pkcs8', bs(fromB64(pkcs8B64)), { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['decrypt']);
}

// ── Encrypted stream ─────────────────────────────────────────────────────────

export type RecoveryKind = 'daily' | 'weekly' | 'manual' | 'challenge' | 'journal';

export interface RecoveryHeader {
  v: 1;
  kind: RecoveryKind;
  createdAt: string;
  fingerprint: string;
  wrappedKeyB64: string;
  noncePrefixB64: string;
  compression: 'gzip';
  /** Backups: the instant every Firestore document in the file is from. */
  snapshotReadTime?: string;
}

function frameNonce(prefix: Uint8Array, final: boolean, counter: number): Uint8Array {
  const n = new Uint8Array(12);
  n.set(prefix, 0);
  n[7] = final ? 1 : 0;
  new DataView(n.buffer).setUint32(8, counter, false);
  return n;
}

/** Push-based encryptor: header() once, push() plaintext as it is produced,
 *  finish() exactly once. Output chunks are written in order. */
export class RecoveryEncryptor {
  private buffered: Uint8Array[] = [];
  private bufferedBytes = 0;
  private counter = 0;
  private done = false;

  private constructor(
    private readonly key: CryptoKey,
    private readonly noncePrefix: Uint8Array,
    private readonly headerBytes: Uint8Array,
    private readonly aad: Uint8Array,
    readonly header: RecoveryHeader,
  ) {}

  static async create(publicKeySpkiB64: string, kind: RecoveryKind, extra?: { snapshotReadTime?: string }): Promise<RecoveryEncryptor> {
    const spki = fromB64(publicKeySpkiB64);
    const pub = await importPublicKey(publicKeySpkiB64);
    const raw = randomBytes(32);
    const key = await subtle().importKey('raw', bs(raw), 'AES-GCM', false, ['encrypt']);
    const wrapped = new Uint8Array(await subtle().encrypt({ name: 'RSA-OAEP' }, pub, bs(raw)));
    raw.fill(0);
    const noncePrefix = randomBytes(7);
    const header: RecoveryHeader = {
      v: 1,
      kind,
      createdAt: new Date().toISOString(),
      fingerprint: await publicKeyFingerprint(spki),
      wrappedKeyB64: toB64(wrapped),
      noncePrefixB64: toB64(noncePrefix),
      compression: 'gzip',
      ...(extra?.snapshotReadTime ? { snapshotReadTime: extra.snapshotReadTime } : {}),
    };
    const json = enc.encode(JSON.stringify(header));
    const headerBytes = concat([enc.encode(RECOVERY_MAGIC), u32(json.length), json]);
    return new RecoveryEncryptor(key, noncePrefix, headerBytes, await sha256(headerBytes), header);
  }

  headerChunk(): Uint8Array {
    return this.headerBytes;
  }

  private async seal(plain: Uint8Array, final: boolean): Promise<Uint8Array> {
    const iv = frameNonce(this.noncePrefix, final, this.counter++);
    const ct = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv: bs(iv), additionalData: bs(this.aad), tagLength: 128 }, this.key, bs(plain)));
    return concat([u32(ct.length), new Uint8Array([final ? 1 : 0]), ct]);
  }

  async push(plain: Uint8Array): Promise<Uint8Array[]> {
    if (this.done) throw new Error('Encryptor already finished.');
    this.buffered.push(plain);
    this.bufferedBytes += plain.length;
    const out: Uint8Array[] = [];
    while (this.bufferedBytes > FRAME_PLAINTEXT_BYTES) {
      const all = concat(this.buffered);
      out.push(await this.seal(all.subarray(0, FRAME_PLAINTEXT_BYTES), false));
      const rest = all.slice(FRAME_PLAINTEXT_BYTES);
      this.buffered = [rest];
      this.bufferedBytes = rest.length;
    }
    return out;
  }

  async finish(): Promise<Uint8Array> {
    if (this.done) throw new Error('Encryptor already finished.');
    this.done = true;
    const last = concat(this.buffered);
    this.buffered = [];
    return this.seal(last, true);
  }
}

/** Reads just the plaintext header (to show which key a file needs). */
export function readRecoveryHeader(firstBytes: Uint8Array): { header: RecoveryHeader; headerLength: number } | null {
  if (firstBytes.length < 12) return null;
  if (dec.decode(firstBytes.subarray(0, 8)) !== RECOVERY_MAGIC) throw new Error('Not a recovery file.');
  const len = readU32(firstBytes, 8);
  if (len > 64 * 1024) throw new Error('Recovery file header is corrupt.');
  if (firstBytes.length < 12 + len) return null;
  const header = JSON.parse(dec.decode(firstBytes.subarray(12, 12 + len))) as RecoveryHeader;
  if (header.v !== 1) throw new Error(`Unsupported recovery file version ${String(header.v)}.`);
  return { header, headerLength: 12 + len };
}

/** Push-based decryptor: feed() raw file bytes in any chunking; returns
 *  verified plaintext. end() throws if the file was cut short. */
export class RecoveryDecryptor {
  private pending: Uint8Array = new Uint8Array(0);
  private key: CryptoKey | null = null;
  private aad: Uint8Array | null = null;
  private noncePrefix: Uint8Array | null = null;
  private counter = 0;
  private sawFinal = false;
  header: RecoveryHeader | null = null;

  constructor(private readonly kit: KeyKit, private readonly expectFingerprint?: string) {}

  async feed(chunk: Uint8Array): Promise<Uint8Array[]> {
    this.pending = this.pending.length ? concat([this.pending, chunk]) : chunk;
    const out: Uint8Array[] = [];
    if (!this.header) {
      const parsed = readRecoveryHeader(this.pending);
      if (!parsed) return out;
      this.header = parsed.header;
      if (this.expectFingerprint && parsed.header.fingerprint !== this.expectFingerprint) {
        throw new Error(`This file was locked with key ${parsed.header.fingerprint}, but the key you provided is ${this.expectFingerprint}.`);
      }
      const priv = await importPrivateKey(this.kit.privateKeyPkcs8B64);
      let raw: ArrayBuffer;
      try {
        raw = await subtle().decrypt({ name: 'RSA-OAEP' }, priv, bs(fromB64(parsed.header.wrappedKeyB64)));
      } catch {
        throw new Error('This key cannot open this file (wrong key).');
      }
      this.key = await subtle().importKey('raw', raw, 'AES-GCM', false, ['decrypt']);
      this.aad = await sha256(this.pending.subarray(0, parsed.headerLength));
      this.noncePrefix = fromB64(parsed.header.noncePrefixB64);
      this.pending = this.pending.slice(parsed.headerLength);
    }
    for (;;) {
      if (this.pending.length < 5) break;
      const len = readU32(this.pending, 0);
      if (len > FRAME_PLAINTEXT_BYTES + 64) throw new Error('Recovery file is corrupt (bad frame length).');
      if (this.pending.length < 5 + len) break;
      if (this.sawFinal) throw new Error('Recovery file has data after its final frame.');
      const final = this.pending[4] === 1;
      const ct = this.pending.subarray(5, 5 + len);
      const iv = frameNonce(this.noncePrefix!, final, this.counter++);
      let plain: ArrayBuffer;
      try {
        plain = await subtle().decrypt({ name: 'AES-GCM', iv: bs(iv), additionalData: bs(this.aad!), tagLength: 128 }, this.key!, bs(ct));
      } catch {
        throw new Error('Recovery file failed its integrity check (it was modified or damaged).');
      }
      out.push(new Uint8Array(plain));
      if (final) this.sawFinal = true;
      this.pending = this.pending.slice(5 + len);
    }
    return out;
  }

  end(): void {
    if (!this.header) throw new Error('Recovery file is empty or not a recovery file.');
    if (!this.sawFinal || this.pending.length) throw new Error('Recovery file is incomplete (cut short).');
  }
}

// ── Entry container (inside the gzip) ────────────────────────────────────────

export interface FsEntryMeta { t: 'fs'; collection: string; n: number }
export interface AuthEntryMeta { t: 'auth'; n: number }
export interface FileEntryMeta {
  t: 'file';
  publicId: string;
  type: string;
  resourceType: string;
  format: string | null;
  bytes: number;
  createdAt: string | null;
}
export interface FileIndexEntryMeta { t: 'fileindex'; n: number }
export interface ManifestEntryMeta { t: 'manifest' }
/** First entry of a journal file (kind 'journal', journal.ts): one event
 *  captured right after it happened, followed by 'fs' + 'file' entries. */
export interface JournalEntryMeta { t: 'journal'; id: string; at: string; event: string; projectId: string | null }
export type RecoveryEntryMeta = FsEntryMeta | AuthEntryMeta | FileEntryMeta | FileIndexEntryMeta | ManifestEntryMeta | JournalEntryMeta;

/** One Firestore document: full path + typed-encoded data (see encode.ts). */
export interface FsDocLine {
  p: string;
  d: Record<string, unknown>;
  /** Journal only: the doc's Firestore updateTime (ms) when captured — the
   *  newest version of each path wins on replay. */
  u?: number;
}

export interface AuthUserLine {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  disabled: boolean;
  displayName: string | null;
  photoURL: string | null;
  phoneNumber: string | null;
  passwordHash: string | null;
  passwordSalt: string | null;
  providerData: Array<{ uid: string; providerId: string; email: string | null; displayName: string | null; photoURL: string | null; phoneNumber: string | null }>;
  creationTime: string | null;
  lastSignInTime: string | null;
  customClaims: Record<string, unknown> | null;
}

export interface FileIndexLine {
  publicId: string;
  type: string;
  resourceType: string;
  format: string | null;
  bytes: number;
  createdAt: string | null;
  inThisFile: boolean;
}

export interface RecoveryManifest {
  formatVersion: 1;
  kind: RecoveryKind;
  createdAt: string;
  finishedAt: string;
  projectId: string | null;
  gitRevision: string | null;
  cloudinaryCloud: string | null;
  firestore: Record<string, number>;
  authUsers: number;
  authUsersWithPassword: number;
  filesIncluded: number;
  filesIncludedBytes: number;
  filesIndexed: number;
  filesSince: string | null;
  /** Every Firestore document in the file is as of this instant; journal
   *  events after it are replayed on top (journal.ts). */
  snapshotReadTime: string | null;
  excludedCollections: string[];
  envVarNames: string[];
  warnings: string[];
}

export function encodeEntry(meta: RecoveryEntryMeta, body: Uint8Array): Uint8Array {
  const m = enc.encode(JSON.stringify(meta));
  return concat([u32(m.length), m, u32(body.length), body]);
}

export function ndjson(lines: unknown[]): Uint8Array {
  return enc.encode(lines.map((l) => JSON.stringify(l)).join('\n'));
}

export function parseNdjson<T>(body: Uint8Array): T[] {
  const text = dec.decode(body);
  if (!text) return [];
  return text.split('\n').filter(Boolean).map((l) => JSON.parse(l) as T);
}

export function parseJson<T>(body: Uint8Array): T {
  return JSON.parse(dec.decode(body)) as T;
}

/** Push-based entry parser over decompressed plaintext. */
export class EntryParser {
  private pending: Uint8Array = new Uint8Array(0);

  feed(chunk: Uint8Array): Array<{ meta: RecoveryEntryMeta; body: Uint8Array }> {
    this.pending = this.pending.length ? concat([this.pending, chunk]) : chunk;
    const out: Array<{ meta: RecoveryEntryMeta; body: Uint8Array }> = [];
    let off = 0;
    for (;;) {
      if (this.pending.length - off < 4) break;
      const mLen = readU32(this.pending, off);
      if (this.pending.length - off < 8 + mLen) break;
      const bLen = readU32(this.pending, off + 4 + mLen);
      const end = off + 8 + mLen + bLen;
      if (this.pending.length < end) break;
      const meta = JSON.parse(dec.decode(this.pending.subarray(off + 4, off + 4 + mLen))) as RecoveryEntryMeta;
      out.push({ meta, body: this.pending.slice(off + 8 + mLen, end) });
      off = end;
    }
    this.pending = this.pending.slice(off);
    return out;
  }

  end(): void {
    if (this.pending.length) throw new Error('Recovery file content ends mid-entry.');
  }
}

// ── Journal overlay (restore) ────────────────────────────────────────────────

/** Combines a backup with the journal events captured after it. Feed every
 *  entry of every journal file to add(); then, while streaming the backup,
 *  pass each batch of documents through overlay() (a newer journal version
 *  replaces the backup's), and finally write leftovers() — documents created
 *  after the backup — and files. For each document path the version with the
 *  newest updateTime wins, so the order journal files are read in, or
 *  reading one twice, doesn't change the result. Only events after the
 *  backup's snapshotReadTime count. */
export class JournalOverlay {
  readonly events = new Map<string, { id: string; at: string; event: string; projectId: string | null }>();
  private readonly docs = new Map<string, FsDocLine & { u: number }>();
  private readonly fileMap = new Map<string, { meta: FileEntryMeta; body: Uint8Array }>();
  private readonly seen = new Set<string>();
  private eventAt = 0;

  constructor(readonly afterMs: number) {}

  add(meta: RecoveryEntryMeta, body: Uint8Array): void {
    if (meta.t === 'journal') {
      this.eventAt = Date.parse(meta.at);
      if (this.eventAt > this.afterMs) this.events.set(meta.id, { id: meta.id, at: meta.at, event: meta.event, projectId: meta.projectId });
    } else if (meta.t === 'fs') {
      for (const l of parseNdjson<FsDocLine>(body)) {
        if (l.u == null || l.u <= this.afterMs) continue;
        const cur = this.docs.get(l.p);
        if (!cur || l.u > cur.u) this.docs.set(l.p, { ...l, u: l.u });
      }
    } else if (meta.t === 'file' && this.eventAt > this.afterMs) {
      this.fileMap.set(`${meta.type}/${meta.resourceType}/${meta.publicId}`, { meta, body });
    }
  }

  get docCount(): number { return this.docs.size; }

  get files(): Array<{ meta: FileEntryMeta; body: Uint8Array }> { return [...this.fileMap.values()]; }

  overlay(lines: FsDocLine[]): FsDocLine[] {
    return lines.map((l) => {
      const j = this.docs.get(l.p);
      if (!j) return l;
      this.seen.add(l.p);
      return { p: j.p, d: j.d, u: j.u };
    });
  }

  leftovers(): FsDocLine[] {
    return [...this.docs.values()].filter((d) => !this.seen.has(d.p)).map((d) => ({ p: d.p, d: d.d, u: d.u }));
  }

  /** Newest event time, for "restored up to …". */
  get lastEventAt(): string | null {
    let max: string | null = null;
    for (const e of this.events.values()) if (!max || e.at > max) max = e.at;
    return max;
  }
}
