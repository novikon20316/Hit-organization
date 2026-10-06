// src/firebase/examinerTokens.ts
// All Firestore read/write operations for the external examiner token flow.
// External examiners have NO Firebase Auth account.
// They arrive via a deep-link:  /examiner-access?token=<uuid>
// The token UUID is stored as the Firestore document ID in examinerTokens/{token}.

import {
  doc, getDoc, updateDoc, arrayUnion,
  serverTimestamp, Timestamp, runTransaction,
} from 'firebase/firestore';
import { db } from './firebase';
import type { ExaminerTokenDoc, ExaminerTokenStatus } from '../../firebase/roles';

// ─── Re-export the type so screens import from one place ─────────────────────
export type { ExaminerTokenDoc };

// ─── Read ─────────────────────────────────────────────────────────────────────

/**
 * Fetch an examiner token document by its UUID.
 * Returns null if the document does not exist.
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
  if (
    isTokenExpired(tokenDoc) &&
    (tokenDoc.status === 'pending' || tokenDoc.status === 'accepted')
  ) {
    return 'expired';
  }
  return tokenDoc.status;
}

// ─── Write ────────────────────────────────────────────────────────────────────

/** Log an access action to the token's accessLog array.
 *  CRITICAL FIX: serverTimestamp() is a sentinel Firestore can only resolve
 *  on a direct field write (update()/set()) — nested inside an arrayUnion()
 *  element it throws "Function arrayUnion() called with invalid data",
 *  which previously made this (and every other write below) fail on every
 *  single call. Timestamp.now() is a real, immediately-known value, so it's
 *  fine inside an array element; only client-clock accuracy is traded away,
 *  which doesn't matter for an access-log entry. */
async function appendAccessLog(
  token: string,
  action: ExaminerTokenDoc['accessLog'][number]['action'],
) {
  await updateDoc(doc(db, 'examinerTokens', token), {
    accessLog: arrayUnion({ action, timestamp: Timestamp.now() }),
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
  const ref = doc(db, 'examinerTokens', token);
  // Transaction, not a plain updateDoc(): the examiner-access screen only
  // re-checks status once, at page load — Accept/Decline render off that
  // stale snapshot, not a fresh read right before the tap. The same link
  // opened in two tabs (or a fast double-tap before actionBusy disables the
  // buttons) could otherwise both pass the 'pending' UI gate and reach here;
  // firestore.rules still allows the write either way (status in
  // ['pending','accepted']), so a Decline racing in after an Accept would
  // silently clobber the acceptance. Re-checking here ensures only the
  // first decision actually commits.
  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);
    if (snap.data()?.status !== 'pending') {
      throw new Error('This invitation has already been decided.');
    }
    transaction.update(ref, {
      status:     'accepted' satisfies ExaminerTokenStatus,
      acceptedAt: serverTimestamp(),
      accessLog:  arrayUnion({ action: 'accepted', timestamp: Timestamp.now() }),
    });
  });
}

/**
 * Examiner declines the review assignment.
 * Sets status → 'declined', records declinedAt, reason, and access log entry.
 */
export async function declineExaminerToken(
  token: string,
  reason: string,
): Promise<void> {
  const ref = doc(db, 'examinerTokens', token);
  // Transaction — same race as acceptExaminerToken above, mirrored: without
  // this, an Accept racing in after a Decline (or vice versa) could
  // silently clobber the other's already-committed decision.
  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);
    if (snap.data()?.status !== 'pending') {
      throw new Error('This invitation has already been decided.');
    }
    transaction.update(ref, {
      status:        'declined' satisfies ExaminerTokenStatus,
      declinedAt:    serverTimestamp(),
      declineReason: reason,
      accessLog:     arrayUnion({ action: 'declined', timestamp: Timestamp.now() }),
    });
  });
}

/**
 * Examiner submits their opinion / review form.
 * Sets status → 'submitted', stores the opinion payload, and logs the action.
 *
 * @param opinion  Free-form record — shape is defined by your form builder.
 *                 Example: { overall: 88, comments: '...', criteria: { ... } }
 */
export async function submitExaminerOpinion(
  token: string,
  opinion: Record<string, unknown>,
): Promise<void> {
  const ref = doc(db, 'examinerTokens', token);
  // Transaction — a duplicate/racing submit (double-tap, two tabs) could
  // otherwise overwrite an opinion that already committed, instead of
  // failing cleanly.
  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);
    if (snap.data()?.status !== 'accepted') {
      throw new Error('This opinion has already been submitted, or the invitation is no longer active.');
    }
    transaction.update(ref, {
      status:      'submitted' satisfies ExaminerTokenStatus,
      submittedAt: serverTimestamp(),
      opinion,
      accessLog:   arrayUnion({ action: 'submitted_opinion', timestamp: Timestamp.now() }),
    });
  });
}

// ─── Staff operations (called from coordinator / faculty admin screens) ────────

/**
 * Expire / revoke a token manually (staff action).
 * The document is updated in-place; tokens are never deleted.
 */
export async function revokeExaminerToken(token: string): Promise<void> {
  await updateDoc(doc(db, 'examinerTokens', token), {
    status: 'expired' satisfies ExaminerTokenStatus,
    // Defense-in-depth alongside the firestore.rules fix requiring
    // status in ['pending','accepted'] for any anonymous write — belt-and-
    // suspenders in case anything else ever reads this flag without also
    // checking status.
    otpVerified: false,
  });
}