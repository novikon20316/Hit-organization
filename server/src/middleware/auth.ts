// src/middleware/auth.ts
// Single unified middleware — replaces both auth.ts and authMiddleware.ts
// Import ONLY from this file across the entire server

import { Request, Response, NextFunction } from 'express';
import { auth, db } from '../config/firebase.js';
import type { ScopeRule, CoordinatorScope } from '../config/permissionScopes.js';

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
  };
}

/**
 * verifyToken — enriches req.user with role + facultyId from Firestore.
 * Use this on ALL routes so controllers can trust req.user.role.
 */
export const verifyToken = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or malformed authorization token.' });
  }

  const rawToken = authHeader.split('Bearer ')[1];
  if (!rawToken) {
    return res.status(401).json({ error: 'Empty Bearer token.' });
  }

  try {
    const decodedToken = await auth.verifyIdToken(rawToken);
    const uid = decodedToken.uid;

    const userDoc = await db.collection('users').doc(uid).get();
    if (!userDoc.exists) {
      console.error(`❌ User ${uid} not found in Firestore.`);
      return res.status(404).json({ error: 'User not found in Firestore.' });
    }


    const userData = userDoc.data();
    if (!userData?.isActive) {
      return res.status(403).json({ error: 'Account has been disabled.' });
    }

    const requestPath = req.originalUrl.split('?')[0] ?? req.originalUrl;
    if (userData?.mustChangePassword && !PASSWORD_CHANGE_ALLOWED_PATHS.has(requestPath)) {
      return res.status(403).json({ error: 'PASSWORD_CHANGE_REQUIRED' });
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
    };

    return next();
  } catch (error: any) {
    console.error('Token verification error:', error);
    return res.status(403).json({ error: 'Invalid or expired authentication token.' });
  }
};

// Alias so routes that imported authenticateUser still work
// during migration — remove once all routes use verifyToken
export const authenticateUser = verifyToken;

export const verifyTokenOnly = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or malformed authorization token.' });
  }

  const rawToken = authHeader.split('Bearer ')[1];
  if (!rawToken) {
    return res.status(401).json({ error: 'Empty Bearer token.' });
  }

  try {
    const decodedToken = await auth.verifyIdToken(rawToken);
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
    };
    return next();
  } catch (error: any) {
    console.error('Token verification error:', error);
    return res.status(403).json({ error: 'Invalid or expired authentication token.' });
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
