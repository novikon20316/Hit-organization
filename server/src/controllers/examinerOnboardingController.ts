// src/controllers/examinerOnboardingController.ts
//
// One-time (per examiner identity) onboarding external examiners complete
// via their existing token-based access link — bank account details, a tax
// coordination document, and (only when no online evaluation exists for
// this specific defense) an uploaded evaluation document. Same public,
// token-based, no-Firebase-Auth auth model as examinerAccessController.ts:
// every handler re-checks isOtpSessionFresh itself, since these go through
// the Admin SDK and bypass firestore.rules entirely.
import { Request, Response, RequestHandler } from 'express';
import multer from 'multer';
import { db } from '../config/firebase.js';
import { isOtpSessionFresh } from '../services/examinerAccess.js';
import {
  upsertExaminerIdentity, getExaminerIdentity,
  createExaminerBankAccount, getExaminerBankAccount,
  createExaminerTaxDocument, getExaminerTaxDocument,
  uploadExaminerEvaluationDocument,
} from '../services/examinerFinancial.js';
import { MILESTONE_FILE_TYPES } from '../services/workflowTemplates.js';
import { fixMulterFilenameEncoding } from '../utils/fileNameEncoding.js';

const ALLOWED_MIME_TYPES = new Set(MILESTONE_FILE_TYPES.flatMap((t) => t.mimeTypes));

class UnsupportedFileTypeError extends Error {
  code = 'UNSUPPORTED_FILE_TYPE';
  constructor(public fileName: string) {
    super(`Unsupported file type: ${fileName}`);
  }
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(new UnsupportedFileTypeError(fixMulterFilenameEncoding(file.originalname)));
      return;
    }
    cb(null, true);
  },
});
export const onboardingUploadMiddleware: RequestHandler = upload.single('file') as unknown as RequestHandler;

export const handleOnboardingUploadError: import('express').ErrorRequestHandler = (err, _req, res, next) => {
  if (err instanceof UnsupportedFileTypeError) {
    return res.status(400).json({ message: `Unsupported file type: ${err.fileName}.` });
  }
  next(err);
};

async function loadFreshToken(token: string): Promise<{ ref: FirebaseFirestore.DocumentReference; doc: FirebaseFirestore.DocumentData } | null> {
  const ref = db.collection('examinerTokens').doc(token);
  const snap = await ref.get();
  if (!snap.exists) return null;
  const doc = snap.data()!;
  if (!isOtpSessionFresh(doc)) return null;
  return { ref, doc };
}

/**
 * GET /api/examiner-access/:token/onboarding-status
 */
export const getOnboardingStatus = async (req: Request, res: Response) => {
  const { token } = req.params;
  if (!token || typeof token !== 'string') return res.status(400).json({ message: 'Missing token.' });

  try {
    const loaded = await loadFreshToken(token);
    if (!loaded) return res.status(403).json({ message: 'Please verify your access code first.' });
    const { doc } = loaded;
    const email = doc.examinerEmail as string;

    const [identity, bankAccount, taxDocument] = await Promise.all([
      getExaminerIdentity(email),
      getExaminerBankAccount(email),
      getExaminerTaxDocument(email),
    ]);

    return res.status(200).json({
      identity: identity ? { role: identity.role, title: identity.title, institution: identity.institution } : null,
      hasBankAccount: !!bankAccount,
      hasTaxDocument: !!taxDocument,
      hasOnlineEvaluation: !!doc.opinion,
      hasEvaluationDocument: !!doc.evaluationDocumentRef,
    });
  } catch (error: any) {
    console.error('getOnboardingStatus error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * POST /api/examiner-access/:token/onboarding/identity
 * Body: { role: string; title: string; institution: string }
 */
export const submitExaminerIdentity = async (req: Request, res: Response) => {
  const { token } = req.params;
  const { role, title, institution } = req.body ?? {};
  if (!token || typeof token !== 'string') return res.status(400).json({ message: 'Missing token.' });
  if (!role?.trim() || !title?.trim() || !institution?.trim()) {
    return res.status(400).json({ message: 'role, title, and institution are all required.' });
  }

  try {
    const loaded = await loadFreshToken(token);
    if (!loaded) return res.status(403).json({ message: 'Please verify your access code first.' });
    const { doc } = loaded;

    await upsertExaminerIdentity(doc.examinerEmail, {
      displayName: doc.examinerName ?? '',
      role: role.trim(),
      title: title.trim(),
      institution: institution.trim(),
    });
    return res.status(200).json({ success: true });
  } catch (error: any) {
    console.error('submitExaminerIdentity error:', error);
    return res.status(500).json({ message: 'Failed to save your details.' });
  }
};

/**
 * POST /api/examiner-access/:token/onboarding/bank-details
 * Body: { bankName, branch, accountNumber, accountHolderName }
 * Write-once — 409 if this examiner (by email) already submitted one.
 */
export const submitExaminerBankDetails = async (req: Request, res: Response) => {
  const { token } = req.params;
  const { bankName, branch, accountNumber, accountHolderName } = req.body ?? {};
  if (!token || typeof token !== 'string') return res.status(400).json({ message: 'Missing token.' });
  if (!bankName?.trim() || !branch?.trim() || !accountNumber?.trim() || !accountHolderName?.trim()) {
    return res.status(400).json({ message: 'All bank detail fields are required.' });
  }

  try {
    const loaded = await loadFreshToken(token);
    if (!loaded) return res.status(403).json({ message: 'Please verify your access code first.' });
    const { doc } = loaded;

    await createExaminerBankAccount(doc.examinerEmail, {
      bankName: bankName.trim(),
      branch: branch.trim(),
      accountNumber: accountNumber.trim(),
      accountHolderName: accountHolderName.trim(),
    });
    return res.status(200).json({ success: true });
  } catch (error: any) {
    if (error.message?.includes('already been submitted')) {
      return res.status(409).json({ message: error.message });
    }
    console.error('submitExaminerBankDetails error:', error);
    return res.status(500).json({ message: 'Failed to save bank details.' });
  }
};

/**
 * POST /api/examiner-access/:token/onboarding/tax-document (multipart, field "file")
 * Write-once — 409 if this examiner (by email) already submitted one.
 */
export const submitExaminerTaxDocument = async (req: Request, res: Response) => {
  const { token } = req.params;
  const file = (req as Request & { file?: Express.Multer.File }).file;
  if (!token || typeof token !== 'string') return res.status(400).json({ message: 'Missing token.' });
  if (!file) return res.status(400).json({ message: 'No file uploaded.' });

  try {
    const loaded = await loadFreshToken(token);
    if (!loaded) return res.status(403).json({ message: 'Please verify your access code first.' });
    const { doc } = loaded;

    await createExaminerTaxDocument(doc.examinerEmail, {
      buffer: file.buffer,
      mimetype: file.mimetype,
      originalname: fixMulterFilenameEncoding(file.originalname),
    });
    return res.status(200).json({ success: true });
  } catch (error: any) {
    if (error.message?.includes('already been submitted')) {
      return res.status(409).json({ message: error.message });
    }
    console.error('submitExaminerTaxDocument error:', error);
    return res.status(502).json({ message: 'Failed to upload the document.' });
  }
};

/**
 * POST /api/examiner-access/:token/onboarding/evaluation-document (multipart, field "file")
 * Per-defense (per token, not per identity) — only allowed when this token
 * has no online opinion recorded yet (the online form and this upload are
 * alternatives, not both required — see the confirmed feature spec).
 */
export const submitExaminerEvaluationDocument = async (req: Request, res: Response) => {
  const { token } = req.params;
  const file = (req as Request & { file?: Express.Multer.File }).file;
  if (!token || typeof token !== 'string') return res.status(400).json({ message: 'Missing token.' });
  if (!file) return res.status(400).json({ message: 'No file uploaded.' });

  try {
    const loaded = await loadFreshToken(token);
    if (!loaded) return res.status(403).json({ message: 'Please verify your access code first.' });
    const { ref, doc } = loaded;
    if (doc.opinion) {
      return res.status(409).json({ message: 'An online evaluation has already been submitted for this defense.' });
    }

    const { publicId, format, originalFileName } = await uploadExaminerEvaluationDocument(token, {
      buffer: file.buffer,
      mimetype: file.mimetype,
      originalname: fixMulterFilenameEncoding(file.originalname),
    });
    await ref.update({
      evaluationDocumentRef: publicId,
      ...(format ? { evaluationDocumentFormat: format } : {}),
      evaluationDocumentFileName: originalFileName,
      evaluationDocumentSubmittedAt: new Date().toISOString(),
    });
    return res.status(200).json({ success: true });
  } catch (error: any) {
    console.error('submitExaminerEvaluationDocument error:', error);
    return res.status(502).json({ message: 'Failed to upload the document.' });
  }
};
