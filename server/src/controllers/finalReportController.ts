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
  revokeAndReissueFinalReportLinks,
} from '../services/finalReport.js';
import { hasAnyRole } from '../middleware/auth.js';
import { db } from '../config/firebase.js';
import { withinCoordinatorScope } from '../services/scopeAuthorization.js';
import { isValidDocId } from '../services/idValidation.js';
import { logAuditEvent } from '../services/auditLog.js';

// The administrative coordinator (who approves final grades by default) and
// system_admin. Keep in sync with projectCoordinatorController.ts.
const FINAL_REPORT_REVOKE_ROLES = ['administrative_secretary', 'system_admin'];

/** POST /api/final-report   { token } */
export const getFinalReport = async (req: Request, res: Response) => {
  // Personal data — never cached by the browser/proxies, never indexed.
  res.set('Cache-Control', 'no-store');
  res.set('X-Robots-Tag', 'noindex, nofollow');

  const token: unknown = req.body?.token;
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

/**
 * POST /api/project-coordinator/students/:studentId/final-report/revoke
 * Revokes every live final report link of this student (e.g. one emailed to
 * a wrong address) and sends a fresh one — see
 * services/finalReport.ts's revokeAndReissueFinalReportLinks.
 */
export const revokeStudentFinalReportLinks = async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ message: L(req, 'Unauthorized.', 'אין הרשאה.') });
  if (!hasAnyRole(req.user, FINAL_REPORT_REVOKE_ROLES)) {
    return res.status(403).json({ message: L(req, 'Forbidden.', 'הפעולה אסורה.') });
  }
  const { studentId } = req.params;
  if (!isValidDocId(studentId)) {
    return res.status(400).json({ message: L(req, 'Invalid studentId.', 'מזהה הסטודנט אינו תקין.') });
  }
  try {
    const studentSnap = await db.collection('users').doc(studentId).get();
    const student = studentSnap.data();
    if (!student || student.role !== 'student') {
      return res.status(404).json({ message: L(req, 'Student not found.', 'הסטודנט לא נמצא.') });
    }
    if (!withinCoordinatorScope(req.user, { facultyId: student.facultyId ?? '', major: student.major || undefined })) {
      return res.status(403).json({ message: L(req, 'This student is outside your assigned scope.', 'סטודנט זה אינו בתחום האחריות שהוקצה לך.') });
    }
    const result = await revokeAndReissueFinalReportLinks(studentId, req.user.uid);
    await logAuditEvent({
      userId: req.user.uid,
      userRole: req.user.role,
      action: 'final_report_link_revoked',
      entityType: 'user',
      entityId: studentId,
      newValue: result,
      explanation: `Revoked ${result.revoked} final report link(s) and sent ${result.reissued} new one(s).`,
      userDisplayName: req.user.displayName,
    });
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    console.error('revokeStudentFinalReportLinks error:', error);
    return res.status(500).json({ message: L(req, 'Failed to revoke the report link.', 'ביטול קישור הדוח נכשל.') });
  }
};
