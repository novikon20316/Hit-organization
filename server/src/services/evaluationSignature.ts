// src/services/evaluationSignature.ts
//
// Digital signatures for the per-student evaluation form (see
// workflowTemplates.ts's finalGradeComponents.perStudent and
// evaluationFormController.ts). Every other "signature" in this system is a
// name+timestamp stamp — enough to say WHO signed, but nothing ties it to
// WHAT they signed. These additionally bind the signer's identity, faculty,
// role on the form, the milestone and the exact scores they entered into an
// HMAC, shown on the form as a short code (e.g. EE-7F3K-92QD). Changing any
// signed score afterwards (directly in Firestore, say) makes the stored
// digest stop matching, and the form shows that signature as invalid.
//
// The HMAC key is EVALUATION_SIGNATURE_SECRET when set; otherwise a random
// key generated once and kept in systemSecrets/evaluationSignatures — a
// collection firestore.rules never mentions, so it's unreadable to every
// client (default deny) and only reachable through the Admin SDK.

import crypto from 'crypto';
import { db } from '../config/firebase.js';
import { facultyName } from './studentProgress.js';

export interface EvaluationSignature {
  signerUid: string;
  signerName: string;
  role: 'supervisor' | 'examiner' | 'coordinator';
  positionHe: string;
  positionEn: string;
  facultyId: string;
  facultyNameHe: string;
  facultyNameEn: string;
  signedAt: string;
  /** Short human-readable code shown on the form — derived from `digest`. */
  code: string;
  /** Full HMAC-SHA256 hex digest over the canonical signed payload. */
  digest: string;
}

/** What gets signed, beyond the signer's own identity fields — the scores
 *  as plain numbers, keyed studentId -> componentKey -> score. */
export type SignedScores = Record<string, Record<string, number>>;
/** Anything JSON-serializable can be signed — scores, grades, or a written
 *  opinion (see examinerOpinion.ts). */
export type SignedPayload = SignedScores | Record<string, unknown>;

// Short, unambiguous faculty prefix for the visible code. Anything not
// listed falls back to 'SG' ("signature").
const FACULTY_CODE_PREFIX: Record<string, string> = {
  electrical: 'EE',
  industrial: 'IE',
  sciences: 'SC',
  data_science: 'DS',
  learning_tech: 'LT',
  medical_tech: 'MT',
  design: 'DE',
};

// Crockford base32 — no I/L/O/U, so the code can be read aloud or retyped.
const BASE32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

let cachedKey: Buffer | null = null;

async function signingKey(): Promise<Buffer> {
  if (cachedKey) return cachedKey;
  const fromEnv = process.env.EVALUATION_SIGNATURE_SECRET;
  if (fromEnv) {
    cachedKey = Buffer.from(fromEnv, 'utf8');
    return cachedKey;
  }
  const ref = db.collection('systemSecrets').doc('evaluationSignatures');
  // Transaction so two instances racing on first use agree on one key.
  const hex = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const existing = snap.data()?.key;
    if (typeof existing === 'string' && existing.length >= 64) return existing;
    const generated = crypto.randomBytes(32).toString('hex');
    tx.set(ref, { key: generated, createdAt: new Date().toISOString() });
    return generated;
  });
  cachedKey = Buffer.from(hex, 'hex');
  return cachedKey;
}

/** Deterministic JSON — object keys sorted at every level, so the same
 *  payload always produces the same digest regardless of insertion order
 *  (Firestore doesn't preserve map key order). */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.keys(value as Record<string, unknown>)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson((value as Record<string, unknown>)[k])}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}

function toBase32(bytes: Buffer, length: number): string {
  let bits = 0;
  let acc = 0;
  let out = '';
  for (const byte of bytes) {
    acc = (acc << 8) | byte;
    bits += 8;
    while (bits >= 5 && out.length < length) {
      out += BASE32[(acc >>> (bits - 5)) & 31];
      bits -= 5;
    }
    if (out.length >= length) break;
  }
  return out;
}

function payloadFor(milestoneId: string, sig: Omit<EvaluationSignature, 'code' | 'digest'>, scores: SignedPayload): string {
  return canonicalJson({
    v: 1,
    milestoneId,
    signerUid: sig.signerUid,
    signerName: sig.signerName,
    role: sig.role,
    positionHe: sig.positionHe,
    facultyId: sig.facultyId,
    signedAt: sig.signedAt,
    scores,
  });
}

async function digestFor(payload: string): Promise<Buffer> {
  return crypto.createHmac('sha256', await signingKey()).update(payload).digest();
}

export async function signEvaluation(params: {
  milestoneId: string;
  signerUid: string;
  signerName: string;
  role: 'supervisor' | 'examiner' | 'coordinator';
  positionHe: string;
  positionEn: string;
  facultyId: string;
  scores: SignedPayload;
}): Promise<EvaluationSignature> {
  const names = facultyName(params.facultyId);
  const base: Omit<EvaluationSignature, 'code' | 'digest'> = {
    signerUid: params.signerUid,
    signerName: params.signerName,
    role: params.role,
    positionHe: params.positionHe,
    positionEn: params.positionEn,
    facultyId: params.facultyId,
    facultyNameHe: names.he,
    facultyNameEn: names.en,
    signedAt: new Date().toISOString(),
  };
  const digest = await digestFor(payloadFor(params.milestoneId, base, params.scores));
  const short = toBase32(digest, 8);
  const prefix = FACULTY_CODE_PREFIX[params.facultyId] ?? 'SG';
  return { ...base, code: `${prefix}-${short.slice(0, 4)}-${short.slice(4)}`, digest: digest.toString('hex') };
}

/** Recomputes the digest from what's stored NOW and compares — false if the
 *  signature itself or any signed score was changed after signing. */
export async function verifyEvaluationSignature(milestoneId: string, sig: EvaluationSignature | null | undefined, scores: SignedPayload): Promise<boolean> {
  if (!sig?.digest) return false;
  const { code: _code, digest, ...base } = sig;
  const expected = await digestFor(payloadFor(milestoneId, base, scores));
  const actual = Buffer.from(digest, 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}
