// lib/createExaminerToken.ts
// Ported from mobile/src/firebase/createExaminerToken.ts — called when a
// coordinator / faculty_admin / program_head / administrative_secretary
// manually assigns an external examiner. Writes an examinerTokens/{uuid}
// doc directly to Firestore (same as mobile) and returns a shareable link.
//
// This token is a real bearer credential — it grants an unauthenticated
// external examiner access to a student's thesis and lets them submit a
// grading opinion, for up to `reviewDays` (default 30). It must be
// unguessable, so it's generated via the browser's Web Crypto API
// (crypto.randomUUID()), which is cryptographically secure — never
// Math.random(). crypto.randomUUID() requires a secure context (HTTPS or
// localhost), which every real deployment target here already is.

import { doc, setDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db } from './firebase';

export interface CreateExaminerTokenInput {
  milestoneId: string;
  projectId: string;
  studentId: string;
  studentName: string;
  thesisTitle: string;
  thesisUrl: string;
  examinerName: string;
  examinerEmail: string;
  examinerInstitution: string;
  examinerLanguage: 'he' | 'en';
  reviewDays?: number;
  opinionVisible?: boolean;
  opinionAnonymous?: boolean;
  createdByUid: string;
  createdByName: string;
}

export interface CreateExaminerTokenResult {
  token: string;
  link: string;
}

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? (typeof window !== 'undefined' ? window.location.origin : 'https://your-app.example.com');

export async function createExaminerToken(input: CreateExaminerTokenInput): Promise<CreateExaminerTokenResult> {
  const {
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
    reviewDays = 30,
    opinionVisible = true,
    opinionAnonymous = false,
    createdByUid,
    createdByName,
  } = input;

  const token = crypto.randomUUID();

  const expiresDate = new Date();
  expiresDate.setDate(expiresDate.getDate() + reviewDays);

  await setDoc(doc(db, 'examinerTokens', token), {
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
    status: 'pending',
    createdAt: serverTimestamp(),
    expiresAt: Timestamp.fromDate(expiresDate),
    opinionVisible,
    opinionAnonymous,
    accessLog: [],
    createdByUid,
    createdByName,
  });

  const link = `${BASE_URL}/examiner-access?token=${token}`;

  // Never log `token`/`link` — see the module comment on why.
  console.log(`Examiner token created for milestone ${milestoneId}`);

  return { token, link };
}
