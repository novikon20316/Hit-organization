// src/controllers/loginSecurityController.ts
//
// Public (no verifyToken) endpoints. A failed login has no token to attach —
// identity/authorization here comes entirely from independently re-verifying
// the password (report) or from the one-time incident code itself (get/confirm),
// same trust model as examinerAccessController.ts.
import { Request, Response } from 'express';
import { reportFailedLogin, getIncidentSummary, resolveIncident } from '../services/loginSecurity.js';

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
  if (!email || typeof email !== 'string' || !password || typeof password !== 'string') {
    return res.status(400).json({ message: 'email and password are required.' });
  }

  try {
    const result = await reportFailedLogin(email, password, req.ip ?? '');
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
