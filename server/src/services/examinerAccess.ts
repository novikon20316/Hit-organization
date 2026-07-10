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
import { db } from '../config/firebase.js';
import { sendNotificationEmail } from './emailService.js';

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
): Promise<{ token: string; link: string }> {
  const code = await generateUniqueCode('examinerTokens');

  const reviewDays = params.reviewDays ?? 30;
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + reviewDays);

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
  });

  const baseUrl = process.env.EXAMINER_ACCESS_BASE_URL || ''; // TODO: set once the app has a public web/deep-link URL
  const link = `${baseUrl}/examiner-access?token=${encodeURIComponent(code)}`;

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
  }

  return { token: code, link };
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
      const { token } = await createExternalExaminerAccess({
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
      externalNotified.push({ name: examiner.name, email: examiner.email, token });
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
