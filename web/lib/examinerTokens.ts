// lib/examinerTokens.ts
// Ported from mobile/src/firebase/examinerTokens.ts — direct Firestore
// read/write operations for the external examiner token flow. External
// examiners have NO Firebase Auth account. They arrive via a deep-link:
//   /examiner-access?token=<uuid>
// The token UUID is stored as the Firestore document ID in examinerTokens/{token}.
//
// See mobile/firestore.rules' `examinerTokens` match block: a `getDoc` before
// the second-factor email code (OTP) has been verified throws a Firestore
// `permission-denied` error — that's how the "OTP required" phase is
// detected (see app/examiner-access/page.tsx's loadToken), not a separate
// status check.

import { doc, getDoc, updateDoc, arrayUnion, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db } from './firebase';

// ─── Types — no ExaminerTokenDoc equivalent exists in lib/roles.ts, so it's
// defined locally here (mirrors mobile/firebase/roles.ts's ExaminerTokenDoc). ─
export type ExaminerTokenStatus =
  | 'pending' // sent, not yet opened
  | 'accepted' // examiner accepted the assignment
  | 'declined' // examiner declined
  | 'submitted' // opinion submitted
  | 'expired' // past deadline or manually revoked
  | 'superseded'; // replaced by a promoted next examiner after decline/timeout — see server/src/services/examinerEscalation.ts

export interface ExaminerTokenDoc {
  token: string; // UUID, used as Firestore doc ID
  milestoneId: string; // which milestone/judgment this covers
  projectId: string;
  studentId: string;
  studentName: string;
  thesisTitle: string;
  thesisUrl: string; // Firebase Storage download URL for the thesis file
  // Examiner identity (no Firebase UID)
  examinerName: string;
  examinerEmail: string;
  examinerInstitution: string;
  examinerLanguage: 'he' | 'en';
  // Token lifecycle
  status: ExaminerTokenStatus;
  createdAt: Timestamp | null;
  expiresAt: Timestamp | null; // default: createdAt + 30 days
  acceptedAt?: Timestamp | null;
  declinedAt?: Timestamp | null;
  submittedAt?: Timestamp | null;
  declineReason?: string;
  // Second factor — see firestore.rules' `allow get` condition
  otpVerified?: boolean;
  // Access log
  accessLog: Array<{
    action: 'opened' | 'downloaded_thesis' | 'accepted' | 'declined' | 'submitted_opinion';
    timestamp: Timestamp | null;
  }>;
  // Opinion data (filled when status === 'submitted')
  opinion?: Record<string, unknown>;
  opinionVisible: boolean; // whether student can see the opinion
  opinionAnonymous: boolean; // whether student can see the name
}

// ─── Read ─────────────────────────────────────────────────────────────────────

/**
 * Fetch an examiner token document by its UUID.
 * Returns null if the document does not exist.
 * Throws (with `.code === 'permission-denied'`) if the second-factor email
 * code hasn't been verified yet — callers should treat that as "OTP required",
 * not as an error.
 */
export async function getExaminerToken(token: string): Promise<ExaminerTokenDoc | null> {
  const snap = await getDoc(doc(db, 'examinerTokens', token));
  if (!snap.exists()) return null;
  return snap.data() as ExaminerTokenDoc;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns true if a token is past its expiresAt timestamp. */
export function isTokenExpired(tokenDoc: ExaminerTokenDoc): boolean {
  if (!tokenDoc.expiresAt) return false;
  const expires = tokenDoc.expiresAt.toDate();
  return new Date() > expires;
}

/** Returns how many days remain until expiry (negative = expired). */
export function daysUntilExpiry(tokenDoc: ExaminerTokenDoc): number {
  if (!tokenDoc.expiresAt) return 999;
  const expires = tokenDoc.expiresAt.toDate();
  return Math.ceil((expires.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

/**
 * Derive the effective token status:
 *   - If expired and still 'pending' or 'accepted' → return 'expired'
 *   - Otherwise return the stored status
 */
export function effectiveStatus(tokenDoc: ExaminerTokenDoc): ExaminerTokenStatus {
  if (isTokenExpired(tokenDoc) && (tokenDoc.status === 'pending' || tokenDoc.status === 'accepted')) {
    return 'expired';
  }
  return tokenDoc.status;
}

// ─── Write ────────────────────────────────────────────────────────────────────

/** Log an access action to the token's accessLog array. */
async function appendAccessLog(token: string, action: ExaminerTokenDoc['accessLog'][number]['action']) {
  await updateDoc(doc(db, 'examinerTokens', token), {
    accessLog: arrayUnion({ action, timestamp: serverTimestamp() }),
  });
}

/**
 * Record that the examiner opened the link.
 * Call this once when the examiner-access screen first loads a valid token.
 */
export async function recordTokenOpened(token: string): Promise<void> {
  await appendAccessLog(token, 'opened');
}

/**
 * Record that the examiner downloaded / viewed the thesis file.
 */
export async function recordThesisDownload(token: string): Promise<void> {
  await appendAccessLog(token, 'downloaded_thesis');
}

/**
 * Examiner accepts the review assignment.
 * Sets status → 'accepted' and records acceptedAt + access log entry.
 */
export async function acceptExaminerToken(token: string): Promise<void> {
  await updateDoc(doc(db, 'examinerTokens', token), {
    status: 'accepted' satisfies ExaminerTokenStatus,
    acceptedAt: serverTimestamp(),
    accessLog: arrayUnion({ action: 'accepted', timestamp: serverTimestamp() }),
  });
}

/**
 * Examiner declines the review assignment.
 * Sets status → 'declined', records declinedAt, reason, and access log entry.
 */
export async function declineExaminerToken(token: string, reason: string): Promise<void> {
  await updateDoc(doc(db, 'examinerTokens', token), {
    status: 'declined' satisfies ExaminerTokenStatus,
    declinedAt: serverTimestamp(),
    declineReason: reason,
    accessLog: arrayUnion({ action: 'declined', timestamp: serverTimestamp() }),
  });
}

/**
 * Examiner submits their opinion / review form.
 * Sets status → 'submitted', stores the opinion payload, and logs the action.
 */
export async function submitExaminerOpinion(token: string, opinion: Record<string, unknown>): Promise<void> {
  await updateDoc(doc(db, 'examinerTokens', token), {
    status: 'submitted' satisfies ExaminerTokenStatus,
    submittedAt: serverTimestamp(),
    opinion,
    accessLog: arrayUnion({ action: 'submitted_opinion', timestamp: serverTimestamp() }),
  });
}
