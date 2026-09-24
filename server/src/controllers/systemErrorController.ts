// src/controllers/systemErrorController.ts
// See services/errorReports.ts for the aggregation/alerting logic this
// wraps. Both endpoints here are intentionally thin — validation + optional
// best-effort auth, then delegate.

import { Response } from 'express';
import { AuthenticatedRequest, hasAnyRole } from '../middleware/auth.js';
import { auth } from '../config/firebase.js';
import {
  recordClientError,
  resolveErrorReport,
  isValidErrorReportKind,
  isValidErrorReportPlatform,
} from '../services/errorReports.js';

// Caps well above anything a real error message/stack needs, while keeping
// a malformed/malicious payload from writing an oversized Firestore doc.
const MAX_MESSAGE_LEN = 2000;
const MAX_STACK_LEN = 4000;
const MAX_ROUTE_LEN = 300;

function truncate(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

// ─── POST /api/system/report-error ─────────────────────────────────────────
// PUBLIC — no verifyToken. A crash can happen before login, or be caused BY
// a broken auth token, so this can't require one. Best-effort decodes a
// Bearer token if the caller happens to have one, purely to attribute the
// report to a user — never rejects the report over a missing/invalid token.
// Always responds 200 regardless of outcome: a client already mid-crash
// should never have to handle a SECOND failure just from reporting the first.
export const reportClientError = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { kind, platform, message, stack, route } = req.body ?? {};

    if (!isValidErrorReportKind(kind) || !isValidErrorReportPlatform(platform)) {
      return res.status(400).json({ ok: false, error: 'Invalid kind/platform.' });
    }
    const cleanMessage = truncate(message, MAX_MESSAGE_LEN);
    if (!cleanMessage) {
      return res.status(400).json({ ok: false, error: 'message is required.' });
    }

    let userId: string | null = null;
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      try {
        const decoded = await auth.verifyIdToken(authHeader.slice('Bearer '.length));
        userId = decoded.uid;
      } catch {
        // Not signed in, or a broken/expired token — exactly the kind of
        // thing this endpoint exists to hear about anyway. Report stays
        // anonymous rather than rejected.
      }
    }

    await recordClientError({
      kind,
      platform,
      message: cleanMessage,
      stack: truncate(stack, MAX_STACK_LEN),
      route: truncate(route, MAX_ROUTE_LEN),
      userId,
      userRole: null,
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('POST /api/system/report-error error:', err);
    // Still 200 — see header comment.
    return res.status(200).json({ ok: true });
  }
};

// ─── PATCH /api/admin/system/error-reports/:id/resolve ────────────────────
// Requires system_admin. Marks an aggregate as resolved so it drops off the
// "System Health" widget's active list — recordClientError re-opens (and
// re-alerts on) the same fingerprint if it recurs.
export const resolveErrorReportHandler = async (req: AuthenticatedRequest, res: Response) => {
  if (!hasAnyRole(req.user, ['system_admin'])) {
    return res.status(403).json({ message: 'Access denied: system_admin only.' });
  }
  const uid = req.user?.uid;
  if (!uid) return res.status(401).json({ message: 'Unauthorized' });

  const { id } = req.params as { id: string };
  if (!id) return res.status(400).json({ message: 'id is required' });

  try {
    const result = await resolveErrorReport(id, uid);
    if (!result.ok) return res.status(404).json({ message: 'Not found' });
    return res.json({ ok: true });
  } catch (err) {
    console.error('PATCH /api/admin/system/error-reports/:id/resolve error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};
