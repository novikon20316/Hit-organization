// src/services/examinerAccess.ts
//
// External examiners never get a Firebase Auth account (no email/password).
// Instead they get a one-time link containing a short random code — the same
// `examinerTokens/{code}` Firestore document the mobile examiner-access.tsx
// screen already reads/writes directly (accept/decline/download/submit are
// left as client-side Firestore writes there). This service owns *creating*
// that document (moved server-side so we can actually send the email) and the
// shared "assign N examiners, some internal some external" logic used by
// both the coordinator's manual assign-examiners flow and the
// recommendation-approval flow.

import crypto from 'crypto';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import admin from 'firebase-admin';
import { db } from '../config/firebase.js';
import { sendNotificationEmail } from './emailService.js';
import { academicYearToHebrew } from './hebrewYear.js';

dayjs.extend(utc);
dayjs.extend(timezone);
const TZ = 'Asia/Jerusalem';

// Excludes visually-ambiguous characters (0/O, 1/l/I) and URL-unsafe specials
// (&, =, /, ?, #, space) — the code is embedded in a query string.
const CODE_CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@$%*_-';
const CODE_LENGTH = 6;

function generateOneTimeCode(): string {
  const bytes = crypto.randomBytes(CODE_LENGTH);
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_CHARSET[bytes[i]! % CODE_CHARSET.length];
  }
  return code;
}

/** Generates a code guaranteed not to collide with an existing doc in `collection`. */
async function generateUniqueCode(collection: string): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateOneTimeCode();
    const existing = await db.collection(collection).doc(code).get();
    if (!existing.exists) return code;
  }
  throw new Error('Failed to generate a unique access code — please retry.');
}

export interface CreateExternalExaminerAccessParams {
  examinerName: string;
  examinerEmail: string;
  examinerInstitution: string;
  examinerLanguage: 'he' | 'en';
  milestoneId: string;
  projectId: string;
  studentName: string;
  thesisTitle: string;
  thesisUrl: string;
  reviewDays?: number;
}

/**
 * Creates the examinerTokens/{code} document (via firebase-admin, not the
 * client SDK) and emails the one-time access link. The code itself is the
 * Firestore doc ID, same as the pre-existing (client-only, UUID-based)
 * mobile/src/firebase/createExaminerToken.ts — just shorter and server-owned
 * so the email can actually be sent.
 */
export async function createExternalExaminerAccess(
  params: CreateExternalExaminerAccessParams
): Promise<{ token: string; link: string; emailSent: boolean }> {
  const code = await generateUniqueCode('examinerTokens');

  const reviewDays = params.reviewDays ?? 30;
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + reviewDays);

  // External examiners have no Firebase Auth account, so they can never read
  // the `milestones` collection directly (locked down to authenticated staff
  // — see firestore.rules) — the milestone's configured grading rubric (see
  // workflowTemplates.ts's GradingComponentSpec) has to be denormalized onto
  // this doc at creation time instead, same as thesisTitle/studentName/
  // thesisUrl below. Omitted (undefined/empty) means the opinion form falls
  // back to its hardcoded default rubric.
  let gradingComponents: unknown[] | undefined;
  // Data-Science-only paper-form fields (Project_examiner.docx, digitized —
  // see web/app/examiner-access's data_science-specific evaluation form).
  // finalGradeComponents carries the SAME two-rubric (project/defense) shape
  // internal examiners get via getExaminerDashboard — denormalized here for
  // the same reason gradingComponents is above. Harmless to compute/store for
  // every faculty; the client decides whether to render the document UI.
  let finalGradeComponents: unknown | undefined;
  let facultyId: string | null = null;
  let academicYear: string | null = null;
  let academicYearHebrew: string | null = null;
  let projectStartDate: string | null = null;
  let major: string | null = null;
  let defenseDate: string | null = null;
  if (params.milestoneId) {
    const milestoneSnap = await db.collection('milestones').doc(params.milestoneId).get();
    const milestoneData = milestoneSnap.data();
    const components = milestoneData?.gradingComponents;
    if (Array.isArray(components) && components.length > 0) gradingComponents = components;
    if (milestoneData?.finalGradeComponents) finalGradeComponents = milestoneData.finalGradeComponents;
    facultyId = milestoneData?.facultyId ?? null;
    defenseDate = milestoneData?.dueDate?.toDate?.().toISOString?.() ?? null;
  }
  if (params.projectId) {
    const projectSnap = await db.collection('projects').doc(params.projectId).get();
    const projectData = projectSnap.data();
    academicYear = projectData?.academicYear ?? null;
    academicYearHebrew = academicYearToHebrew(academicYear);
    projectStartDate = projectData?.projectStartDate?.toDate?.().toISOString?.() ?? null;
    major = projectData?.major ?? null;
  }

  await db.collection('examinerTokens').doc(code).set({
    token: code,
    milestoneId: params.milestoneId,
    projectId: params.projectId,
    studentName: params.studentName,
    thesisTitle: params.thesisTitle,
    thesisUrl: params.thesisUrl,
    examinerName: params.examinerName,
    examinerEmail: params.examinerEmail,
    examinerInstitution: params.examinerInstitution,
    examinerLanguage: params.examinerLanguage,
    status: 'pending',
    createdAt: new Date().toISOString(),
    expiresAt: expiresAt.toISOString(),
    opinionVisible: true,
    opinionAnonymous: false,
    accessLog: [],
    // Second factor — not verified until the examiner completes the
    // request-otp/verify-otp round trip. See firestore.rules' `allow get`.
    otpVerified: false,
    ...(gradingComponents ? { gradingComponents } : {}),
    ...(finalGradeComponents ? { finalGradeComponents, facultyId, academicYear, academicYearHebrew, projectStartDate, major, defenseDate } : {}),
  });

  const baseUrl = process.env.EXAMINER_ACCESS_BASE_URL || ''; // TODO: set once the app has a public web/deep-link URL
  const link = `${baseUrl}/examiner-access?token=${encodeURIComponent(code)}`;

  // This link is the ONLY channel an external examiner has (no app account,
  // no in-app bell) — a dropped send here previously still reported success
  // up to assignExaminersAndNotify, since only the doc write was checked.
  // Surface it so the caller can bucket into externalFailed instead.
  let emailSent = true;
  try {
    await sendNotificationEmail({
      toEmail: params.examinerEmail,
      type: 'examiner_access_link',
      lang: params.examinerLanguage,
      data: {
        name: params.examinerName,
        thesisTitle: params.thesisTitle,
        studentName: params.studentName,
        link,
      },
    });
  } catch (emailError) {
    console.error(`Examiner access email failed for ${params.examinerEmail}:`, emailError);
    emailSent = false;
  }

  return { token: code, link, emailSent };
}

// ─────────────────────────────────────────────────────────────────────────────
// Second factor — a one-time numeric code emailed to the examiner, required
// before the examinerTokens/{token} document becomes readable at all (see
// firestore.rules' `allow get` condition: `resource.data.otpVerified == true`).
// Link-possession alone was previously the sole credential; this adds
// "prove you control examinerEmail" on top, without requiring a Firebase
// Auth account (external examiners still have none).
// ─────────────────────────────────────────────────────────────────────────────

const OTP_LENGTH = 6;
const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const OTP_MAX_ATTEMPTS = 5;

function generateNumericOtp(): string {
  const bytes = crypto.randomBytes(OTP_LENGTH);
  let code = '';
  for (let i = 0; i < OTP_LENGTH; i++) {
    code += (bytes[i]! % 10).toString();
  }
  return code;
}

function hashOtp(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex');
}

/**
 * Generates a fresh OTP, stores its hash + expiry on the token doc (admin
 * SDK — bypasses the same rules this is meant to gate), and emails it.
 * Safe to call repeatedly ("resend") — each call replaces the prior code.
 */
export async function requestExaminerOtp(token: string): Promise<{ sent: boolean }> {
  const tokenRef = db.collection('examinerTokens').doc(token);
  const tokenSnap = await tokenRef.get();
  if (!tokenSnap.exists) {
    throw new Error('Invalid or unknown token.');
  }
  const tokenDoc = tokenSnap.data()!;

  const code = generateNumericOtp();
  await tokenRef.update({
    otpHash: hashOtp(code),
    otpExpiresAt: new Date(Date.now() + OTP_TTL_MS).toISOString(),
    otpAttempts: 0,
  });

  try {
    await sendNotificationEmail({
      toEmail: tokenDoc.examinerEmail,
      type: 'examiner_otp_code',
      lang: tokenDoc.examinerLanguage ?? 'he',
      data: { name: tokenDoc.examinerName ?? '', code },
    });
    return { sent: true };
  } catch (emailError) {
    console.error(`Examiner OTP email failed for ${tokenDoc.examinerEmail}:`, emailError);
    return { sent: false };
  }
}

export interface VerifyExaminerOtpResult {
  verified: boolean;
  reason?: string;
}

/**
 * Verifies a submitted code against the stored hash. On success, flips
 * `otpVerified: true` (admin SDK) — the field the Firestore rule checks —
 * and clears the OTP fields so a stale hash can't be reused. Attempts are
 * capped per-token (not per-IP) so this can't be brute-forced by rotating
 * source IPs the way a pure rate-limiter could be.
 */
export async function verifyExaminerOtp(token: string, code: string): Promise<VerifyExaminerOtpResult> {
  const tokenRef = db.collection('examinerTokens').doc(token);
  const tokenSnap = await tokenRef.get();
  if (!tokenSnap.exists) {
    return { verified: false, reason: 'Invalid or unknown token.' };
  }
  const tokenDoc = tokenSnap.data()!;

  if (tokenDoc.otpVerified === true) {
    return { verified: true };
  }
  if (!tokenDoc.otpHash || !tokenDoc.otpExpiresAt) {
    return { verified: false, reason: 'No code has been requested yet.' };
  }
  if ((tokenDoc.otpAttempts ?? 0) >= OTP_MAX_ATTEMPTS) {
    return { verified: false, reason: 'Too many attempts. Request a new code.' };
  }
  if (new Date(tokenDoc.otpExpiresAt).getTime() < Date.now()) {
    return { verified: false, reason: 'Code expired. Request a new one.' };
  }

  if (hashOtp(code) !== tokenDoc.otpHash) {
    await tokenRef.update({ otpAttempts: admin.firestore.FieldValue.increment(1) });
    return { verified: false, reason: 'Incorrect code.' };
  }

  await tokenRef.update({
    otpVerified: true,
    otpHash: admin.firestore.FieldValue.delete(),
    otpExpiresAt: admin.firestore.FieldValue.delete(),
    otpAttempts: admin.firestore.FieldValue.delete(),
  });
  return { verified: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared "assign these examiners" logic — used by both the coordinator's
// manual assign-examiners endpoint and the recommendation-approval endpoint.
// ─────────────────────────────────────────────────────────────────────────────

export type ExaminerAssignmentInput =
  | { type: 'internal'; uid: string }
  | { type: 'external'; name: string; email: string; institution?: string };

export interface ExaminerAssignmentContext {
  projectId: string;
  thesisTitle: string;
  studentName: string;
  milestoneId?: string | undefined;
  thesisUrl?: string | undefined;
  lang?: 'he' | 'en' | undefined;
}

export interface ExaminerAssignmentResult {
  internalUids: string[];
  externalNotified: Array<{ name: string; email: string; token: string }>;
  externalFailed: Array<{ name: string; email: string; reason: string }>;
}

/**
 * Splits the given examiners into internal (already have a uid — they'll see
 * the assignment in their own dashboard automatically, no email needed) vs
 * external (no app account — gets a one-time access link by email instead).
 */
export async function assignExaminersAndNotify(
  examiners: ExaminerAssignmentInput[],
  context: ExaminerAssignmentContext
): Promise<ExaminerAssignmentResult> {
  const internalUids: string[] = [];
  const externalNotified: ExaminerAssignmentResult['externalNotified'] = [];
  const externalFailed: ExaminerAssignmentResult['externalFailed'] = [];

  for (const examiner of examiners) {
    if (examiner.type === 'internal') {
      internalUids.push(examiner.uid);
      continue;
    }

    try {
      const { token, emailSent } = await createExternalExaminerAccess({
        examinerName: examiner.name,
        examinerEmail: examiner.email,
        examinerInstitution: examiner.institution ?? '',
        examinerLanguage: context.lang ?? 'he',
        milestoneId: context.milestoneId ?? '',
        projectId: context.projectId,
        studentName: context.studentName,
        thesisTitle: context.thesisTitle,
        thesisUrl: context.thesisUrl ?? '',
      });
      if (emailSent) {
        externalNotified.push({ name: examiner.name, email: examiner.email, token });
      } else {
        // Token/grant doc exists (so the link would still work if manually
        // resent), but the examiner was never actually emailed it.
        externalFailed.push({ name: examiner.name, email: examiner.email, reason: 'Failed to send access-link email.' });
      }
    } catch (error: any) {
      externalFailed.push({ name: examiner.name, email: examiner.email, reason: error.message || 'Unknown error' });
    }
  }

  return { internalUids, externalNotified, externalFailed };
}

// ─────────────────────────────────────────────────────────────────────────────
// Defense-day access grant — a SEPARATE, later-issued credential from the
// review-token above. It gates access to just the defense day itself
// (00:00-23:59:59 Asia/Jerusalem on the confirmed defense date), not the
// ~30-day thesis-review window. Kept in its own collection rather than as
// fields on the same examinerTokens doc so the two independent lifecycles
// (and their own `status`/`expiresAt`) can never collide or be confused by
// a reader of one flow accidentally touching the other's fields.
// ─────────────────────────────────────────────────────────────────────────────

export interface CreateDefenseAccessGrantParams {
  originExaminerTokenCode: string;
  projectId: string;
  milestoneId: string;
  examinerName: string;
  examinerEmail: string;
  examinerLanguage: 'he' | 'en';
  defenseDateISO: string; // 'YYYY-MM-DD'
}

export async function createDefenseAccessGrant(
  params: CreateDefenseAccessGrantParams,
): Promise<{ code: string; link: string }> {
  const code = await generateUniqueCode('defenseAccessGrants');

  const activatesAt = dayjs.tz(params.defenseDateISO, TZ).startOf('day');
  const expiresAt = dayjs.tz(params.defenseDateISO, TZ).endOf('day');

  await db.collection('defenseAccessGrants').doc(code).set({
    code,
    originExaminerTokenCode: params.originExaminerTokenCode,
    projectId: params.projectId,
    milestoneId: params.milestoneId,
    examinerName: params.examinerName,
    examinerEmail: params.examinerEmail,
    examinerLanguage: params.examinerLanguage,
    defenseDateISO: params.defenseDateISO,
    activatesAt: activatesAt.toDate().toISOString(),
    expiresAt: expiresAt.toDate().toISOString(),
    status: activatesAt.isAfter(dayjs()) ? 'not_yet_active' : 'active',
    createdAt: new Date().toISOString(),
    adminExtension: null,
    accessLog: [],
  });

  const baseUrl = process.env.EXAMINER_ACCESS_BASE_URL || ''; // TODO: set once the app has a public web/deep-link URL
  const link = `${baseUrl}/defense-access?grant=${encodeURIComponent(code)}`;

  try {
    await sendNotificationEmail({
      toEmail: params.examinerEmail,
      type: 'defense_day_access_link',
      lang: params.examinerLanguage,
      data: {
        name: params.examinerName,
        date: dayjs.tz(params.defenseDateISO, TZ).format('DD/MM/YYYY'),
        link,
      },
    });
  } catch (emailError) {
    console.error(`Defense-day access email failed for ${params.examinerEmail}:`, emailError);
  }

  return { code, link };
}
