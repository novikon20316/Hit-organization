// src/controllers/finalReportController.ts
//
// See services/finalReport.ts. getFinalReport is PUBLIC (no verifyToken) —
// the token in the URL is the only credential, and it grants read access to
// one report and nothing else.
import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { L } from '../utils/localize.js';
import {
  getFinalReportByToken,
  isWellFormedFinalReportToken,
  listFinalReportLinksForStudent,
} from '../services/finalReport.js';

/** GET /api/final-report/:token */
export const getFinalReport = async (req: Request, res: Response) => {
  // Personal data — never cached by the browser/proxies, never indexed.
  res.set('Cache-Control', 'no-store');
  res.set('X-Robots-Tag', 'noindex, nofollow');

  const { token } = req.params;
  if (!isWellFormedFinalReportToken(token)) {
    return res.status(404).json({ reason: 'not_found', message: L(req, 'Report not found.', 'הדוח לא נמצא.') });
  }
  try {
    const result = await getFinalReportByToken(token);
    if (!result.ok) {
      const status = result.reason === 'expired' ? 410 : 404;
      return res.status(status).json({ reason: result.reason, message: L(req, 'This report link is invalid or no longer available.', 'קישור הדוח אינו תקין או שאינו זמין עוד.') });
    }
    return res.status(200).json(result.report);
  } catch (error) {
    console.error('getFinalReport error:', error);
    return res.status(500).json({ message: L(req, 'Failed to load the report.', 'טעינת הדוח נכשלה.') });
  }
};

/** GET /api/student/final-report-links — the signed-in student's own links. */
export const getMyFinalReportLinks = async (req: AuthenticatedRequest, res: Response) => {
  const uid = req.user?.uid;
  if (!uid) return res.status(401).json({ message: L(req, 'Unauthorized.', 'אין הרשאה.') });
  try {
    const links = await listFinalReportLinksForStudent(uid);
    return res.status(200).json({ links });
  } catch (error) {
    console.error('getMyFinalReportLinks error:', error);
    return res.status(500).json({ message: L(req, 'Failed to load final report links.', 'טעינת קישורי הדוח המסכם נכשלה.') });
  }
};
