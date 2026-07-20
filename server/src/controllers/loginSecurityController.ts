// src/controllers/loginSecurityController.ts
//
// Public (no verifyToken) endpoints. A failed login has no token to attach —
// identity/authorization here comes entirely from independently re-verifying
// the password (report) or from the one-time incident code itself (get/confirm),
// same trust model as examinerAccessController.ts.
import { Request, Response } from 'express';
import { reportFailedLogin, getIncidentSummary, resolveIncident } from '../services/loginSecurity.js';

// This is the one public, unauthenticated endpoint in the app that takes raw
// email/password in the body, so it's the natural place for defense-in-depth
// input hardening — even though the actual verification call
// (verifyPasswordViaIdentityToolkit in services/loginSecurity.ts) sends both
// as a JSON body to Google's API, never string-concatenated, so classic
// injection isn't exploitable here today regardless.
//
// The email regex excludes `'`/`"` on top of the usual whitespace/@
// exclusion — no real email address contains either, so this blocks
// quote-based injection-probing payloads outright. `password` is NOT
// charset-restricted: legitimate passwords can and do contain `'`, `"`, `-`,
// `@`, etc., and restricting them would reject real passwords without adding
// real protection (the password is never interpolated into a query — see
// above). Length caps on both just bound worst-case payload size.
const EMAIL_FORMAT_REGEX = /^[^\s@'"]+@[^\s@'"]+\.[^\s@'"]+$/;
const MAX_EMAIL_LENGTH = 254; // RFC 5321 §4.5.3.1.3
const MAX_PASSWORD_LENGTH = 128;
// eslint-disable-next-line no-control-regex -- deliberately matching control chars/null bytes
const CONTROL_CHAR_REGEX = /[\x00-\x1f\x7f]/;

function isWellFormedCredential(email: unknown, password: unknown): email is string {
  return (
    typeof email === 'string' &&
    typeof password === 'string' &&
    !!password &&
    email.length <= MAX_EMAIL_LENGTH &&
    password.length <= MAX_PASSWORD_LENGTH &&
    EMAIL_FORMAT_REGEX.test(email.trim()) &&
    !CONTROL_CHAR_REGEX.test(email) &&
    !CONTROL_CHAR_REGEX.test(password)
  );
}

/**
 * POST /api/auth/report-failed-login
 * Body: { email, password }
 * Called by the mobile client right after it catches a client-side
 * auth/wrong-password (or auth/invalid-credential) error. The password is
 * used once, in-memory, purely to independently re-verify the failure against
 * Google's own Identity Toolkit — never logged, never persisted.
 */
export const reportFailedLoginAttempt = async (req: Request, res: Response) => {
  const { email, password } = req.body ?? {};
  if (!isWellFormedCredential(email, password)) {
    return res.status(400).json({ message: 'email and password are required.' });
  }

  try {
    const result = await reportFailedLogin(email.trim(), password, req.ip ?? '');
    return res.status(200).json(result);
  } catch (error: any) {
    console.error('reportFailedLoginAttempt error:', error);
    return res.status(500).json({ message: 'Failed to process login report.' });
  }
};

/**
 * GET /api/auth/login-security/:code
 * Incident summary for the confirm/deny screen.
 */
export const getLoginSecurityIncident = async (req: Request, res: Response) => {
  const { code } = req.params;
  if (!code || typeof code !== 'string') return res.status(400).json({ message: 'Invalid code.' });

  try {
    const summary = await getIncidentSummary(code);
    if (!summary) return res.status(404).json({ message: 'Incident not found.' });
    return res.status(200).json(summary);
  } catch (error: any) {
    console.error('getLoginSecurityIncident error:', error);
    return res.status(500).json({ message: 'Failed to load incident.' });
  }
};

/**
 * POST /api/auth/login-security/:code/confirm
 * Body: { decision: 'owner' | 'attacker' }
 */
export const confirmLoginSecurityIncident = async (req: Request, res: Response) => {
  const { code } = req.params;
  const { decision } = req.body ?? {};
  if (!code || typeof code !== 'string') return res.status(400).json({ message: 'Invalid code.' });
  if (decision !== 'owner' && decision !== 'attacker') {
    return res.status(400).json({ message: "decision must be 'owner' or 'attacker'." });
  }

  try {
    const result = await resolveIncident(code, decision);
    if (!result.ok) {
      const status = result.reason === 'not_found' ? 404 : 410; // 410 Gone for expired/already-resolved
      return res.status(status).json({ message: result.reason });
    }
    return res.status(200).json({ success: true });
  } catch (error: any) {
    console.error('confirmLoginSecurityIncident error:', error);
    return res.status(500).json({ message: 'Failed to resolve incident.' });
  }
};
