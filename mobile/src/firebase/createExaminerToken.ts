// src/firebase/createExaminerToken.ts
// Called by coordinator / faculty_admin / program_head when assigning an external examiner.
// Creates an examinerTokens/{uuid} document in Firestore and returns the shareable link.
//
// Usage:
//   const { token, link } = await createExaminerToken({ ... });
//   // then send `link` to the examiner via email / WhatsApp

import {
  doc, setDoc, serverTimestamp, Timestamp,
} from 'firebase/firestore';
import * as Crypto from 'expo-crypto';
import { db } from './firebase';
import type { ExaminerTokenDoc, ExaminerTokenStatus } from '../../firebase/roles';

// This token is a real bearer credential — it grants an unauthenticated
// external examiner access to a student's thesis and the ability to submit
// a grading opinion, for up to `reviewDays` (default 30 days). It must be
// unguessable, so it's generated via expo-crypto's secure RNG, not Math.random()
// (which is not cryptographically secure and must never back a security token).
function uuidv4(): string {
  return Crypto.randomUUID();
}

// ─── Input shape ──────────────────────────────────────────────────────────────
export interface CreateExaminerTokenInput {
  // Project / thesis info
  milestoneId:        string;
  projectId:          string;
  studentId:          string;
  studentName:        string;
  thesisTitle:        string;
  thesisUrl:          string;   // Firebase Storage download URL
  // Examiner identity
  examinerName:       string;
  examinerEmail:      string;
  examinerInstitution:string;
  examinerLanguage:   'he' | 'en';
  // Options
  reviewDays?:        number;   // default 30
  opinionVisible?:    boolean;  // default true
  opinionAnonymous?:  boolean;  // default false
  // Who created this token (for audit trail)
  createdByUid:       string;
  createdByName:      string;
}

// ─── Output ───────────────────────────────────────────────────────────────────
export interface CreateExaminerTokenResult {
  token:  string;   // UUID — also the Firestore doc ID
  link:   string;   // deep-link to share with the examiner
}

// ─── Base URL — change to your production URL or use env var ─────────────────
const BASE_URL =
  process.env.EXPO_PUBLIC_APP_URL ?? 'https://your-app.example.com';

// ─── Main function ────────────────────────────────────────────────────────────
export async function createExaminerToken(
  input: CreateExaminerTokenInput,
): Promise<CreateExaminerTokenResult> {
  const {
    milestoneId, projectId, studentId, studentName, thesisTitle, thesisUrl,
    examinerName, examinerEmail, examinerInstitution, examinerLanguage,
    reviewDays = 30,
    opinionVisible  = true,
    opinionAnonymous = false,
    createdByUid, createdByName,
  } = input;

  const token = uuidv4();

  // expiresAt = now + reviewDays
  const expiresDate = new Date();
  expiresDate.setDate(expiresDate.getDate() + reviewDays);

  const tokenDoc: Omit<ExaminerTokenDoc, 'createdAt' | 'expiresAt' | 'accessLog'> & {
    createdAt:   ReturnType<typeof serverTimestamp>;
    expiresAt:   Timestamp;
    accessLog:   ExaminerTokenDoc['accessLog'];
    createdByUid:  string;
    createdByName: string;
  } = {
    token,
    milestoneId,
    projectId,
    studentId,
    studentName,
    thesisTitle,
    thesisUrl,
    examinerName,
    examinerEmail,
    examinerInstitution,
    examinerLanguage,
    status:          'pending' as ExaminerTokenStatus,
    createdAt:       serverTimestamp(),
    expiresAt:       Timestamp.fromDate(expiresDate),
    opinionVisible,
    opinionAnonymous,
    accessLog:       [],
    createdByUid,
    createdByName,
  };

  await setDoc(doc(db, 'examinerTokens', token), tokenDoc);

  const link = `${BASE_URL}/examiner-access?token=${token}`;

  // Never log `token`/`link` — this is a 30-day bearer credential granting
  // an unauthenticated external examiner access to a student's thesis.
  console.log(`✅ Examiner token created for milestone ${milestoneId}`);

  return { token, link };
}