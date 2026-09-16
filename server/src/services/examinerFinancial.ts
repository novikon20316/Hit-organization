// src/services/examinerFinancial.ts
//
// External examiners have no Firebase Auth account (see examinerAccess.ts) —
// each examinerTokens/{code} document is a fresh, disposable, per-defense
// credential with the examiner's identity denormalized onto it. But an
// examiner is invited back for every defense they're asked to examine, and
// three things about them should be collected ONCE and reused forever:
// their professional identity (role/title/institution), their tax
// coordination document, and their bank account details (so the
// administrative coordinator can actually get them paid). None of those
// belong on the per-defense examinerTokens doc.
//
// Identity is resolved by email (the one stable field every examinerTokens
// doc already carries) — hashed into a safe Firestore doc id, never the raw
// address, so nothing ever has to special-case Firestore's forbidden
// document-id characters (a `.`/`/` in an email breaks a raw-email doc id).
//
// Bank account details are the most sensitive field in this app: unlike
// every other Cloudinary upload here (milestone files, staff records — see
// milestoneController.ts), these must be genuinely private, not just
// obscure. Tax/eval documents follow studentPhoto.ts's `type: 'authenticated'`
// + signed-URL-on-read convention (a plain secure_url 401s); bank account
// values themselves are just Firestore fields (no file), gated by
// firestore.rules AND, defense-in-depth, stripped from the admin listing
// response for any caller who isn't administrative_secretary (see
// externalExaminersController.ts) — system_admin must never see them.

import crypto from 'crypto';
import { v2 as cloudinary } from 'cloudinary';
import { db } from '../config/firebase.js';

export function hashExaminerEmail(email: string): string {
  return crypto.createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
}

export interface ExaminerIdentity {
  email: string;
  displayName: string;
  role: string;
  title: string;
  institution: string;
  createdAt: string;
  updatedAt: string;
}

/** Upserts the examiner's identity fields — unlike bank/tax below, this is
 *  NOT write-once: an examiner's title/institution can legitimately change
 *  between defenses years apart. */
export async function upsertExaminerIdentity(
  email: string,
  data: { displayName: string; role: string; title: string; institution: string },
): Promise<void> {
  const id = hashExaminerEmail(email);
  const now = new Date().toISOString();
  const ref = db.collection('examinerIdentities').doc(id);
  const snap = await ref.get();
  await ref.set(
    {
      email: email.trim().toLowerCase(),
      displayName: data.displayName,
      role: data.role,
      title: data.title,
      institution: data.institution,
      updatedAt: now,
      ...(snap.exists ? {} : { createdAt: now }),
    },
    { merge: true },
  );
}

export async function getExaminerIdentity(email: string): Promise<ExaminerIdentity | null> {
  const snap = await db.collection('examinerIdentities').doc(hashExaminerEmail(email)).get();
  return snap.exists ? (snap.data() as ExaminerIdentity) : null;
}

export interface ExaminerBankAccount {
  bankName: string;
  branch: string;
  accountNumber: string;
  accountHolderName: string;
  createdAt: string;
}

/** Write-once — the whole point is that an examiner enters this exactly one
 *  time, ever. Throws if one already exists; callers should surface that as
 *  409, not silently overwrite (bank details changing is rare enough, and
 *  sensitive enough, that it should go through a deliberate correction path
 *  later, not a resubmission of this same form). */
export async function createExaminerBankAccount(
  email: string,
  data: { bankName: string; branch: string; accountNumber: string; accountHolderName: string },
): Promise<void> {
  const id = hashExaminerEmail(email);
  const ref = db.collection('examinerBankAccounts').doc(id);
  const snap = await ref.get();
  if (snap.exists) throw new Error('Bank account details have already been submitted.');
  await ref.set({ ...data, createdAt: new Date().toISOString() });
}

export async function getExaminerBankAccount(email: string): Promise<ExaminerBankAccount | null> {
  const snap = await db.collection('examinerBankAccounts').doc(hashExaminerEmail(email)).get();
  return snap.exists ? (snap.data() as ExaminerBankAccount) : null;
}

export interface ExaminerTaxDocument {
  publicId: string;
  format?: string;
  originalFileName: string;
  createdAt: string;
}

const TAX_DOCUMENT_FOLDER = 'examinerTaxDocuments';
const EVALUATION_DOCUMENT_FOLDER = 'examinerEvaluationDocuments';

/** Uploads a document as an `authenticated` (never publicly fetchable)
 *  Cloudinary resource — same convention as studentPhoto.ts, generalized to
 *  `resource_type: 'raw'` for a document instead of `'image'`. Only the
 *  public_id is ever persisted; a URL is generated fresh on each authorized
 *  read (see resolveExaminerDocumentUrl). */
async function uploadAuthenticatedDocument(
  folder: string,
  publicId: string,
  file: { buffer: Buffer; mimetype: string; originalname: string },
): Promise<{ publicId: string; format?: string }> {
  const base64 = file.buffer.toString('base64');
  const dataUri = `data:${file.mimetype};base64,${base64}`;
  const ext = file.originalname.includes('.') ? file.originalname.split('.').pop() : undefined;
  const result = await cloudinary.uploader.upload(dataUri, {
    resource_type: 'raw',
    type: 'authenticated',
    folder,
    public_id: publicId,
    overwrite: true,
    ...(ext ? { format: ext } : {}),
  });
  // `format` isn't folded into result.public_id — it must be passed again to
  // cloudinary.url() at read time (resolveExaminerDocumentUrl) or the
  // regenerated signed URL comes back without the right extension/Content-Type.
  return { publicId: result.public_id, ...(ext ? { format: ext } : {}) };
}

/** Generates a signed, short-lived delivery URL for an `authenticated`-type
 *  document — a plain/unsigned URL 401s. `expires_at` (Unix seconds) bounds
 *  how long the link is usable, so a URL handed to a browser tab isn't
 *  fetchable indefinitely if it leaks (forwarded, cached, browser history). */
export function resolveExaminerDocumentUrl(publicId: string, format?: string): string {
  return cloudinary.url(publicId, {
    resource_type: 'raw',
    type: 'authenticated',
    sign_url: true,
    secure: true,
    ...(format ? { format } : {}),
    expires_at: Math.floor(Date.now() / 1000) + 5 * 60, // 5 minutes
  });
}

/** Write-once, mirroring createExaminerBankAccount. */
export async function createExaminerTaxDocument(
  email: string,
  file: { buffer: Buffer; mimetype: string; originalname: string },
): Promise<void> {
  const id = hashExaminerEmail(email);
  const ref = db.collection('examinerTaxDocuments').doc(id);
  const snap = await ref.get();
  if (snap.exists) throw new Error('A tax coordination document has already been submitted.');
  const { publicId, format } = await uploadAuthenticatedDocument(TAX_DOCUMENT_FOLDER, id, file);
  await ref.set({ publicId, ...(format ? { format } : {}), originalFileName: file.originalname, createdAt: new Date().toISOString() });
}

export async function getExaminerTaxDocument(email: string): Promise<ExaminerTaxDocument | null> {
  const snap = await db.collection('examinerTaxDocuments').doc(hashExaminerEmail(email)).get();
  return snap.exists ? (snap.data() as ExaminerTaxDocument) : null;
}

/** Per-defense (per-token), not per-identity — unlike bank/tax above, a new
 *  defense needs its own evaluation. Stored directly on the examinerTokens
 *  doc (evaluationDocumentRef) since it's already the per-defense record;
 *  see examinerOnboardingController.ts for the write-once-per-token gate
 *  (only allowed when the token has no online `opinion` yet). */
export async function uploadExaminerEvaluationDocument(
  token: string,
  file: { buffer: Buffer; mimetype: string; originalname: string },
): Promise<{ publicId: string; format?: string; originalFileName: string }> {
  const { publicId, format } = await uploadAuthenticatedDocument(EVALUATION_DOCUMENT_FOLDER, token, file);
  return { publicId, ...(format ? { format } : {}), originalFileName: file.originalname };
}
