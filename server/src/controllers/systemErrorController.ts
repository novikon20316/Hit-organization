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
  getErrorReportDetail,
  type ErrorReportContext,
  isValidErrorReportKind,
  isValidErrorReportPlatform,
} from '../services/errorReports.js';
import { L } from '../utils/localize.js';
import { runErrorAiAnalysis, type ClientFrameInput } from '../services/errorAiAnalysis.js';

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

function finiteInt(value: unknown, max: number): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  return Math.min(Math.round(value), max);
}

// Every field optional and individually capped — this endpoint is public, so
// the context object is untrusted input that only ever lands in a
// system_admin-only doc as plain display text.
function sanitizeContext(raw: unknown, headerUserAgent: unknown): ErrorReportContext {
  const c = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const method = truncate(c.method, 10);
  return {
    page: truncate(c.page, MAX_ROUTE_LEN),
    method: method && /^[A-Za-z]+$/.test(method) ? method.toUpperCase() : null,
    httpStatus: finiteInt(c.httpStatus, 999),
    durationMs: finiteInt(c.durationMs, 10 * 60 * 1000),
    timeoutMs: finiteInt(c.timeoutMs, 10 * 60 * 1000),
    appVersion: truncate(c.appVersion, 60),
    os: truncate(c.os, 60),
    userAgent: truncate(c.userAgent, 300) ?? truncate(headerUserAgent, 300),
  };
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
      return res.status(400).json({ ok: false, error: L(req, 'Invalid kind/platform.', 'kind/platform לא תקינים.') });
    }
    const cleanMessage = truncate(message, MAX_MESSAGE_LEN);
    if (!cleanMessage) {
      return res.status(400).json({ ok: false, error: L(req, 'message is required.', 'שדה message נדרש.') });
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
      context: sanitizeContext(req.body?.context, req.headers['user-agent']),
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
    return res.status(403).json({ message: L(req, 'Access denied: system_admin only.', 'הגישה נדחתה: מנהל מערכת בלבד.') });
  }
  const uid = req.user?.uid;
  if (!uid) return res.status(401).json({ message: L(req, 'Unauthorized', 'לא מורשה') });

  const { id } = req.params as { id: string };
  if (!id) return res.status(400).json({ message: L(req, 'id is required', 'שדה id נדרש') });

  try {
    const note = truncate(req.body?.note, 1000);
    const result = await resolveErrorReport(id, uid, note);
    if (!result.ok) return res.status(404).json({ message: L(req, 'Not found', 'לא נמצא') });
    return res.json({ ok: true });
  } catch (err) {
    console.error('PATCH /api/admin/system/error-reports/:id/resolve error:', err);
    return res.status(500).json({ message: L(req, 'Internal server error', 'שגיאת שרת פנימית') });
  }
};

// ─── GET /api/admin/system/error-reports/:id ──────────────────────────────
// Requires system_admin. Full detail for the System Health "click a bug"
// window: occurrences with context, affected users resolved to name/role,
// previous resolution notes, and Cloud Logging links for the time window.
export const getErrorReportDetailHandler = async (req: AuthenticatedRequest, res: Response) => {
  if (!hasAnyRole(req.user, ['system_admin'])) {
    return res.status(403).json({ message: L(req, 'Access denied: system_admin only.', 'הגישה נדחתה: מנהל מערכת בלבד.') });
  }
  const { id } = req.params as { id: string };
  if (!id) return res.status(400).json({ message: L(req, 'id is required', 'שדה id נדרש') });

  try {
    const detail = await getErrorReportDetail(id);
    if (!detail) return res.status(404).json({ message: L(req, 'Not found', 'לא נמצא') });
    return res.json(detail);
  } catch (err) {
    console.error('GET /api/admin/system/error-reports/:id error:', err);
    return res.status(500).json({ message: L(req, 'Internal server error', 'שגיאת שרת פנימית') });
  }
};

// ─── POST /api/admin/system/error-reports/:id/ai-analysis ─────────────────
// Requires system_admin. Runs (or returns the cached) AI root-cause analysis
// for one error — see services/errorAiAnalysis.ts. Body: { force?: boolean,
// clientFrames?: [...] } — clientFrames are the web crash frames the web app
// already resolved through its private source maps.
export const aiAnalyzeErrorReportHandler = async (req: AuthenticatedRequest, res: Response) => {
  if (!hasAnyRole(req.user, ['system_admin'])) {
    return res.status(403).json({ message: L(req, 'Access denied: system_admin only.', 'הגישה נדחתה: מנהל מערכת בלבד.') });
  }
  const uid = req.user?.uid;
  if (!uid) return res.status(401).json({ message: L(req, 'Unauthorized', 'לא מורשה') });
  const { id } = req.params as { id: string };
  if (!id) return res.status(400).json({ message: L(req, 'id is required', 'שדה id נדרש') });

  const rawFrames: unknown[] = Array.isArray(req.body?.clientFrames) ? req.body.clientFrames.slice(0, 5) : [];
  const clientFrames: ClientFrameInput[] = rawFrames.map((f) => {
    const o = (f && typeof f === 'object' ? f : {}) as Record<string, unknown>;
    const snippet = Array.isArray(o.snippet) ? o.snippet.slice(0, 20) : [];
    return {
      file: truncate(o.file, 300),
      line: finiteInt(o.line, 1_000_000),
      functionName: truncate(o.functionName, 200),
      snippet: snippet
        .map((l) => (l && typeof l === 'object' ? (l as Record<string, unknown>) : {}))
        .map((l) => ({ n: finiteInt(l.n, 1_000_000) ?? 0, text: typeof l.text === 'string' ? l.text.slice(0, 400) : '' })),
    };
  });

  try {
    const result = await runErrorAiAnalysis(id, {
      lang: req.lang === 'en' ? 'en' : 'he',
      clientFrames,
      force: req.body?.force === true,
      requestedBy: uid,
    });
    if (!result.ok) {
      if (result.reason === 'not_found') return res.status(404).json({ message: L(req, 'Not found', 'לא נמצא') });
      const msg =
        result.reason === 'refused'
          ? L(req, 'The AI declined to analyze this error.', 'ה-AI סירב לנתח את התקלה הזו.')
          : result.reason === 'truncated'
            ? L(req, 'The AI answer was cut off. Try again.', 'תשובת ה-AI נקטעה. נסה שוב.')
            : L(req, 'AI analysis is unavailable right now (no API key or the service failed).', 'ניתוח AI לא זמין כרגע (אין מפתח API או שהשירות נכשל).');
      return res.status(503).json({ message: msg, reason: result.reason });
    }
    return res.json(result);
  } catch (err) {
    console.error('POST /api/admin/system/error-reports/:id/ai-analysis error:', err);
    return res.status(500).json({ message: L(req, 'Internal server error', 'שגיאת שרת פנימית') });
  }
};
