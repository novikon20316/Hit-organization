// src/services/twoFactorSessions.ts
//
// Server-side proof that the CURRENT sign-in session passed the 2FA code.
//
// Before this, 2FA was enforced only by the web/mobile login screens (they
// route to the code screen when totp_enabled), and the server merely stamped
// users/{uid}.totp_last_verified per USER. Anyone with just the password could
// sign in to Firebase directly and call the API without ever entering a code.
//
// A session is identified by its Firebase ID token's `auth_time` (the moment
// of that sign-in; it stays the same across token refreshes). When a code is
// verified (authController.login2FA / verify2FA), that auth_time is recorded
// in users/{uid}/private/twoFactorSessions — server-only, like the TOTP
// secret. middleware/auth.ts's verifyToken then requires, for every account
// with 2FA on, that the request's session is in that list.
//
// Sessions that began before this check went live are grandfathered: they
// pass if the user verified a code after signing in (the old per-user stamp).
// That keeps already-signed-in users from being kicked out by the deploy.

import { db } from '../config/firebase.js';

/** Sessions that started before this instant are judged by the legacy
 *  per-user stamp (see header). Set just after the deploy that introduced
 *  this check. */
const PER_SESSION_CHECK_STARTS_AT_MS = Date.parse('2026-10-18T19:00:00Z');
const MAX_SESSIONS_KEPT = 20;
const CACHE_MAX = 5000;

// Positive results only — a session, once verified, stays verified, so a hit
// here never needs re-checking; a miss always re-reads Firestore.
const verifiedCache = new Set<string>();

function ref(uid: string) {
  return db.collection('users').doc(uid).collection('private').doc('twoFactorSessions');
}

/** Record that the session signed in at `authTime` (seconds) passed 2FA. */
export async function markSessionVerified(uid: string, authTime: number): Promise<void> {
  const snap = await ref(uid).get();
  const existing: number[] = Array.isArray(snap.data()?.verifiedAuthTimes) ? snap.data()!.verifiedAuthTimes : [];
  const next = [...existing.filter((t) => t !== authTime), authTime].slice(-MAX_SESSIONS_KEPT);
  await ref(uid).set({ verifiedAuthTimes: next, updatedAt: new Date().toISOString() });
  remember(uid, authTime);
}

function remember(uid: string, authTime: number) {
  if (verifiedCache.size >= CACHE_MAX) verifiedCache.clear();
  verifiedCache.add(`${uid}:${authTime}`);
}

/** Has this session (uid + sign-in time) passed the 2FA code? */
export async function isSessionVerified(uid: string, authTime: number, userData: Record<string, any>): Promise<boolean> {
  if (verifiedCache.has(`${uid}:${authTime}`)) return true;

  const listed: number[] = (await ref(uid).get()).data()?.verifiedAuthTimes ?? [];
  if (listed.includes(authTime)) {
    remember(uid, authTime);
    return true;
  }

  // Legacy: a session from before the per-session check, whose user verified
  // a code after that sign-in.
  if (authTime * 1000 < PER_SESSION_CHECK_STARTS_AT_MS) {
    const lastVerified = userData.totp_last_verified?.toMillis?.() ?? 0;
    if (lastVerified >= authTime * 1000) {
      remember(uid, authTime);
      return true;
    }
  }
  return false;
}
