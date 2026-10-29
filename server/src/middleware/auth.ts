// src/middleware/auth.ts
// Single unified middleware — replaces both auth.ts and authMiddleware.ts
// Import ONLY from this file across the entire server

import { Request, Response, NextFunction } from 'express';
import { auth, db } from '../config/firebase.js';
import type { ScopeRule, CoordinatorScope } from '../config/permissionScopes.js';
import { resolvePlatform, readMaintenanceStatus } from '../services/maintenanceStatus.js';
import { isTwoFactorSetupRequired } from '../services/twoFactorEnforcement.js';
import { isSessionVerified } from '../services/twoFactorSessions.js';
import { L } from '../utils/localize.js';

// Routes an account with a forced temp-password change must still be able to
// reach — everything else 403s until they change it. This is the real gate:
// the client redirects to /change-password on its own, but that's only a
// UX nicety (bypassable via the browser back button, a direct URL, or just
// calling the API) — the account is not actually locked down until this
// check exists here too.
const PASSWORD_CHANGE_ALLOWED_PATHS = new Set([
  '/api/users/change-password',
  '/api/users/logout',
  // Called once right after every sign-in, including one that's about to be
  // redirected straight to /change-password — the "Live Transportation" audit
  // table should still see that login happened. Writes only the caller's own
  // login/logout audit event, nothing else, so it's safe under this gate.
  '/api/users/log-login',
  // Both clients' own auth-routing gate (web's AuthContext/useRequireRole,
  // mobile's app/_layout.tsx onAuthStateChanged handler) fetches this to
  // learn mustChangePassword in the first place and decide to redirect —
  // blocking it here too would 403 that very check, and mobile's handler
  // treats any 401/403 as a dead session and force-signs-out, which would
  // make the change-password screen permanently unreachable. Returns only
  // the caller's own document, so exposing it under this gate is safe.
  '/api/users/me',
]);

// Maintenance used to be checked ONLY client-side, once, at login/2FA time
// (useMaintenanceCheck) — a session already open when maintenance turned on,
// or anyone calling the API directly, kept reading/writing data for the
// entire maintenance window regardless. Same allowlist rationale as above:
// a blocked client still needs these to even discover it's blocked, or to
// sign out. system_admin bypasses entirely, same as the client-side check.
const MAINTENANCE_ALLOWED_PATHS = new Set([
  ...PASSWORD_CHANGE_ALLOWED_PATHS,
  '/api/system/maintenance-status',
]);
const MAINTENANCE_BYPASS_ROLES = new Set(['system_admin']);

// Same allowlist reasoning as PASSWORD_CHANGE_ALLOWED_PATHS above, plus the
// 2FA setup/verify/recovery endpoints themselves — a user hard-blocked by
// the 2FA-enforcement deadline (see services/twoFactorEnforcement.ts) must
// still be able to reach the QR-setup flow that gets them unblocked, or
// discover the block/sign out in the first place. Deliberately has NO role
// exemption (unlike maintenance) — the setup flow itself is how any role,
// including system_admin, catches up.
// What a session that has NOT yet entered its 2FA code may call (accounts
// with 2FA on — see services/twoFactorSessions.ts): the code screen itself,
// recovery, logout, and reading its own profile (also readable directly from
// Firestore with just the password, and the apps need it to route to the
// code screen). Deliberately NOT change-password: with only the password,
// that would hand over the account.
const TWO_FACTOR_SESSION_ALLOWED_PATHS = new Set([
  '/api/users/logout',
  '/api/users/log-login',
  '/api/users/me',
  '/api/users/profile',
  '/api/system/maintenance-status',
  '/api/auth/2fa/setup',
  '/api/auth/2fa/verify',
  '/api/auth/2fa/validate',
  '/api/auth/2fa/recovery/request',
  '/api/auth/2fa/recovery/verify',
]);

const TWO_FACTOR_ALLOWED_PATHS = new Set([
  ...PASSWORD_CHANGE_ALLOWED_PATHS,
  '/api/auth/2fa/setup',
  '/api/auth/2fa/verify',
  '/api/auth/2fa/validate',
  '/api/auth/2fa/recovery/request',
  '/api/auth/2fa/recovery/verify',
]);

// Firestore's gRPC client throws this (code 8) when a project's read/write
// quota is exhausted — a project-wide outage, not anything wrong with the
// caller's token. Both verifyToken's Firestore lookup and any other
// Firestore-touching route can hit it; callers should tell it apart from a
// genuine bad-token 403 instead of surfacing a confusing "invalid token".
const isQuotaExceededError = (error: any): boolean =>
  error?.code === 8 || /RESOURCE_EXHAUSTED/i.test(error?.message ?? error?.details ?? '');

export interface AuthenticatedRequest extends Request {
  user?: {
    uid:       string;
    email?:    string | undefined;
    displayName: string;
    role:      string;
    facultyId: string;
    roles: string[];
    // Unix seconds — when this ID token's underlying sign-in happened. Used
    // by account-deletion's "require a recent reauthentication" check; no
    // other route relies on this.
    authTime: number;
    // From the ID token's own email_verified claim (set by Firebase Auth
    // itself, not Firestore) — used by syncData to refuse to create the
    // Firestore profile until the user has confirmed their email.
    emailVerified: boolean;
    // Granular per-user permission grants and a coordinator's own operational
    // scope — see config/permissionScopes.ts and services/scopeAuthorization.ts.
    // Always an array (never undefined) so callers can check .length/.some()
    // without a null-check; empty means no grants beyond the account's role.
    permissionRules: ScopeRule[];
    coordinatorScopes: CoordinatorScope[];
    // Extra faculties this user is offered/scoped as their role in, beyond
    // their own facultyId — additive for a normal single-faculty account,
    // restrictive for a facultyId==='all' account. Independent per role so
    // e.g. a program_head can be a full program_head in one faculty and only
    // an additional faculty_admin faculty in another. See
    // services/scopeAuthorization.ts's effectiveFacultyIds/facultyIdMatches
    // and adminController.ts's updateUserRoleAdmin for where these are
    // validated/persisted. Always an array (never undefined), same
    // convention as permissionRules/coordinatorScopes above.
    facultyAdminFacultyIds: string[];
    programHeadFacultyIds: string[];
    gradSchoolHeadFacultyIds: string[];
    internalExaminerFacultyIds: string[];
  };
}

// ─── Session revocation on password change ──────────────────────────────────
// A password change (self-service /api/users/change-password, an admin
// temp-password reset, or the email reset link) makes Firebase bump the
// account's tokensValidAfterTime and revoke its refresh tokens — but an
// already-issued ID token stays cryptographically valid for up to an hour,
// and verifyIdToken() without checkRevoked accepts it. So a session stolen
// before the change (e.g. a web tab, which reuses its cached ID token) kept
// working for up to an hour after the owner changed their password.
// Confirmed against live data (2026-10-15): on every password account
// tokensValidAfterTime == passwordUpdatedAt, so email verification and
// normal sign-ins never move it. Same auth_time comparison firebase-admin's
// own checkRevoked uses, but cached per uid so it costs one Auth lookup per
// user per minute instead of one per request.
const VALID_AFTER_CACHE_TTL_MS = 60 * 1000;
const validAfterCache = new Map<string, { validAfterMs: number | null; fetchedAt: number }>();

async function tokensValidAfterMs(uid: string): Promise<number | null> {
  const cached = validAfterCache.get(uid);
  if (cached && Date.now() - cached.fetchedAt < VALID_AFTER_CACHE_TTL_MS) return cached.validAfterMs;
  const record = await auth.getUser(uid);
  const parsed = record.tokensValidAfterTime ? Date.parse(record.tokensValidAfterTime) : NaN;
  const validAfterMs = Number.isFinite(parsed) ? parsed : null;
  validAfterCache.set(uid, { validAfterMs, fetchedAt: Date.now() });
  return validAfterMs;
}

/** Call right after changing a user's password on this instance, so the
 *  change takes effect here immediately instead of after the cache TTL. */
export function forgetTokensValidAfter(uid: string): void {
  validAfterCache.delete(uid);
}

/**
 * verifyToken — enriches req.user with role + facultyId from Firestore.
 * Use this on ALL routes so controllers can trust req.user.role.
 */
// "Sign in as another user" (impersonation) was removed for good on
// 2026-10-29. Sessions it created carry an `impersonatedBy` claim and could
// otherwise stay signed in on a browser indefinitely — refuse them outright.
function isImpersonatedSession(decoded: Record<string, unknown>): boolean {
  return decoded.impersonatedBy !== undefined;
}

export const verifyToken = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: L(req, 'Missing or malformed authorization token.', 'אסימון ההזדהות חסר או שגוי.') });
  }

  const rawToken = authHeader.split('Bearer ')[1];
  if (!rawToken) {
    return res.status(401).json({ error: L(req, 'Empty Bearer token.', 'אסימון ההזדהות ריק.') });
  }

  let decodedToken;
  try {
    decodedToken = await auth.verifyIdToken(rawToken);
  } catch (error: any) {
    console.error('Token verification error:', error);
    return res.status(403).json({ error: L(req, 'Invalid or expired authentication token.', 'אסימון ההזדהות אינו תקין או שפג תוקפו.') });
  }
  if (isImpersonatedSession(decodedToken)) {
    return res.status(401).json({ error: L(req, 'This session is no longer valid. Please sign in again.', 'החיבור הזה אינו תקף יותר. יש להתחבר מחדש.') });
  }

  const uid = decodedToken.uid;

  // Sessions signed in before the account's last password change are
  // rejected — see tokensValidAfterMs below.
  try {
    const validAfterMs = await tokensValidAfterMs(uid);
    if (validAfterMs !== null && decodedToken.auth_time * 1000 < validAfterMs) {
      return res.status(401).json({ error: 'SESSION_REVOKED', message: L(req, 'Your password was changed. Please sign in again.', 'הסיסמה שונתה. יש להתחבר מחדש.') });
    }
  } catch (err) {
    // Fail open: an Auth lookup hiccup must not lock every user out. The
    // refresh token is already revoked by Firebase, so the exposure is at
    // most this one ID token's remaining lifetime.
    console.error(`verifyToken: tokensValidAfter lookup failed for ${uid}:`, err);
  }

  try {
    const userDoc = await db.collection('users').doc(uid).get();
    if (!userDoc.exists) {
      console.error(`❌ User ${uid} not found in Firestore.`);
      return res.status(404).json({ error: L(req, 'User not found in Firestore.', 'המשתמש לא נמצא.') });
    }


    const userData = userDoc.data();
    if (!userData?.isActive) {
      return res.status(403).json({ error: L(req, 'Account has been disabled.', 'החשבון הושבת.') });
    }

    const requestPath = req.originalUrl.split('?')[0] ?? req.originalUrl;

    if (!MAINTENANCE_ALLOWED_PATHS.has(requestPath) && !MAINTENANCE_BYPASS_ROLES.has(userData?.role)) {
      const platform = resolvePlatform(req.headers['x-client-platform']);
      const maintenance = await readMaintenanceStatus(platform);
      if (maintenance.isActive) {
        return res.status(503).json({
          error: 'MAINTENANCE_ACTIVE',
          title: maintenance.title,
          endsAt: maintenance.endsAt,
        });
      }
    }

    if (userData?.mustChangePassword && !PASSWORD_CHANGE_ALLOWED_PATHS.has(requestPath)) {
      return res.status(403).json({ error: 'PASSWORD_CHANGE_REQUIRED' });
    }

    if (!TWO_FACTOR_ALLOWED_PATHS.has(requestPath)) {
      const twoFactorRequired = await isTwoFactorSetupRequired(
        userData?.totp_enabled ?? false,
        userData?.twoFactorExempt === true,
        userData?.role,
        userData?.roles ?? [],
        userData,
      );
      if (twoFactorRequired) {
        return res.status(403).json({ error: 'TWO_FACTOR_REQUIRED' });
      }
    }

    // 2FA on → this sign-in session must have passed the code, checked here
    // on the server rather than trusted to the login screen.
    if (userData?.totp_enabled && !TWO_FACTOR_SESSION_ALLOWED_PATHS.has(requestPath)) {
      if (!(await isSessionVerified(uid, decodedToken.auth_time, userData))) {
        return res.status(403).json({ error: 'TWO_FACTOR_VERIFICATION_REQUIRED' });
      }
    }

    req.user = {
      uid,
      email:     decodedToken.email,
      displayName: userData.displayName ?? '',
      role:      userData.role      ?? 'student',
      facultyId: userData.facultyId ?? 'sciences',
      roles:     userData.roles     ?? ['student'],
      authTime:  decodedToken.auth_time,
      emailVerified: decodedToken.email_verified ?? false,
      permissionRules:   userData.permissionRules   ?? [],
      coordinatorScopes: userData.coordinatorScopes ?? [],
      facultyAdminFacultyIds:     userData.facultyAdminFacultyIds     ?? [],
      programHeadFacultyIds:      userData.programHeadFacultyIds      ?? [],
      gradSchoolHeadFacultyIds:   userData.gradSchoolHeadFacultyIds   ?? [],
      internalExaminerFacultyIds: userData.internalExaminerFacultyIds ?? [],
    };

    return next();
  } catch (error: any) {
    if (isQuotaExceededError(error)) {
      console.error('Firestore quota exceeded while resolving user for verifyToken:', error);
      return res.status(503).json({ error: 'SERVICE_QUOTA_EXCEEDED', message: L(req, 'The database is temporarily unavailable due to a quota limit. Please try again later.', 'מסד הנתונים אינו זמין כעת עקב מגבלת מכסה. יש לנסות שוב מאוחר יותר.') });
    }
    console.error('User lookup error in verifyToken:', error);
    return res.status(500).json({ error: L(req, 'Failed to resolve authenticated user.', 'פענוח פרטי המשתמש המחובר נכשל.') });
  }
};

// Alias so routes that imported authenticateUser still work
// during migration — remove once all routes use verifyToken
export const authenticateUser = verifyToken;

/** All roles this user holds — primary `role` plus `roles[]`, deduped.
 *  Mirrors web/lib/roles.ts's getUserRoles: a multi-role account (e.g. a
 *  supervisor in one faculty who's also a coordinator in another) has a
 *  single primary `role` field plus any additional roles in `roles[]`, and
 *  controllers must recognize both — not just the primary one. */
export function getUserRoles(user: AuthenticatedRequest['user']): string[] {
  if (!user) return [];
  const set = new Set<string>();
  if (user.role) set.add(user.role);
  (user.roles ?? []).forEach((r) => set.add(r));
  return Array.from(set);
}

/** Does this user hold any of the given roles, checking both their primary
 *  `role` and their `roles[]` array? Use this (not `req.user.role ===` /
 *  `.includes(req.user.role)` alone) for every role-gate — a check against
 *  `req.user.role` alone silently 403s a legitimate multi-role user whose
 *  primary role isn't the one being checked for. */
export function hasAnyRole(user: AuthenticatedRequest['user'], allowedRoles: string[]): boolean {
  return getUserRoles(user).some((r) => allowedRoles.includes(r));
}

/** First of `allowedRoles` this user holds (primary `role` checked first,
 *  then `roles[]` in order) — for role-keyed lookups (e.g. a per-role
 *  facultyIds extras field) where the caller needs to know *which* matched
 *  role to use, not just whether one matched. */
export function matchedRole(user: AuthenticatedRequest['user'], allowedRoles: string[]): string | undefined {
  return getUserRoles(user).find((r) => allowedRoles.includes(r));
}

export const verifyTokenOnly = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: L(req, 'Missing or malformed authorization token.', 'אסימון ההזדהות חסר או שגוי.') });
  }

  const rawToken = authHeader.split('Bearer ')[1];
  if (!rawToken) {
    return res.status(401).json({ error: L(req, 'Empty Bearer token.', 'אסימון ההזדהות ריק.') });
  }

  try {
    const decodedToken = await auth.verifyIdToken(rawToken);
    if (isImpersonatedSession(decodedToken)) {
      return res.status(401).json({ error: L(req, 'This session is no longer valid. Please sign in again.', 'החיבור הזה אינו תקף יותר. יש להתחבר מחדש.') });
    }
    req.user = {
      uid:       decodedToken.uid,
      email:     decodedToken.email,
      displayName: '',
      role:      'student',       // default, sync will set the real value
      facultyId: 'sciences',
      roles:     ['student'],
      authTime:  decodedToken.auth_time,
      emailVerified: decodedToken.email_verified ?? false,
      permissionRules:   [],
      coordinatorScopes: [],
      facultyAdminFacultyIds:     [],
      programHeadFacultyIds:      [],
      gradSchoolHeadFacultyIds:   [],
      internalExaminerFacultyIds: [],
    };
    return next();
  } catch (error: any) {
    console.error('Token verification error:', error);
    return res.status(403).json({ error: L(req, 'Invalid or expired authentication token.', 'אסימון ההזדהות אינו תקין או שפג תוקפו.') });
  }
};

export const softError = (
  res: Response,
  message: string,
  debugInfo?: any        // logged server-side only, never sent to client
): Response => {
  if (debugInfo !== undefined) {
    console.error(`[softError] ${message}`, debugInfo);
  } else {
    console.error(`[softError] ${message}`);
  }
 
  return res.status(200).json({
    success: false,
    message,
  });
};
