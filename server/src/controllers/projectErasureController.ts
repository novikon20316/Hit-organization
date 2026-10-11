// src/controllers/projectErasureController.ts
//
// HTTP surface for the project erasure/archive protocol — see
// services/projectErasure.ts. Scoped narrower than the exceptional-actions
// approver set: only 'coordinator' and 'system_admin' may approve/erase/
// restore/view the archive, per the actual ask (not faculty_admin/
// program_head, which decide *other* things elsewhere).
//
// Faculty scoping intentionally mirrors getCoordinatorDashboard's own
// simple `facultyId ==` query (coordinatorController.ts) rather than the
// more elaborate effectiveFacultyIds/coordinatorScopes machinery used for
// delegate roles elsewhere — coordinators don't hold an extra-faculties
// array today, so there's nothing more to scope by.

import { Response } from 'express';
import { AuthenticatedRequest, hasAnyRole } from '../middleware/auth.js';
import { L } from '../utils/localize.js';
import {
  requestProjectErasure,
  listPendingErasureRequests,
  decideErasureRequest,
  eraseProjectDirectly,
  restoreProject,
  listArchivedProjects,
} from '../services/projectErasure.js';
import { reassignProjectSupervisor } from '../services/projectReassignment.js';

function isApprover(req: AuthenticatedRequest): boolean {
  return hasAnyRole(req.user, ['coordinator', 'system_admin']);
}

function callerEffectiveFacultyIds(req: AuthenticatedRequest): string[] | 'all' {
  if (hasAnyRole(req.user, ['system_admin'])) return 'all';
  return [req.user?.facultyId ?? ''];
}

// ─── POST /api/projects/:id/request-erasure ──────────────────────────────────
export const requestProjectErasureHandler = async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ message: L(req, 'Unauthorized.', 'המשתמש אינו מאומת.') });
  const { id: projectId } = req.params;
  const { reason } = req.body ?? {};
  if (!projectId || typeof projectId !== 'string') return res.status(400).json({ message: L(req, 'Invalid projectId.', 'מזהה פרויקט לא תקין.') });
  if (!reason || typeof reason !== 'string' || !reason.trim()) {
    return res.status(400).json({ message: L(req, 'A reason is required to request project erasure.', 'יש לציין סיבה לבקשת מחיקת הפרויקט.') });
  }

  try {
    const request = await requestProjectErasure({
      projectId,
      reason,
      requestedBy: req.user.uid,
      requestedByRole: req.user.role,
    });
    return res.status(200).json({ success: true, request });
  } catch (error: any) {
    return res.status(400).json({ message: error.message || L(req, 'Failed to request project erasure.', 'בקשת מחיקת הפרויקט נכשלה.') });
  }
};

// ─── GET /api/projects/erasure-requests/pending ──────────────────────────────
export const getPendingErasureRequests = async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ message: L(req, 'Unauthorized.', 'המשתמש אינו מאומת.') });
  if (!isApprover(req)) return res.status(403).json({ message: L(req, 'Access denied: coordinator or system_admin only.', 'הגישה נדחתה: רכז פקולטה או מנהל מערכת בלבד.') });

  try {
    const requests = await listPendingErasureRequests(callerEffectiveFacultyIds(req));
    return res.status(200).json({ requests });
  } catch (error: any) {
    return res.status(500).json({ message: L(req, 'Failed to load pending erasure requests.', 'טעינת בקשות המחיקה הממתינות נכשלה.') });
  }
};

// ─── POST /api/projects/erasure-requests/:id/decide ──────────────────────────
export const decideErasureRequestHandler = async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ message: L(req, 'Unauthorized.', 'המשתמש אינו מאומת.') });
  if (!isApprover(req)) return res.status(403).json({ message: L(req, 'Access denied: coordinator or system_admin only.', 'הגישה נדחתה: רכז פקולטה או מנהל מערכת בלבד.') });

  const { id } = req.params;
  const { decision, reason } = req.body ?? {};
  if (!id || typeof id !== 'string') return res.status(400).json({ message: L(req, 'Missing request id.', 'חסר מזהה בקשה.') });
  if (decision !== 'approved' && decision !== 'rejected') {
    return res.status(400).json({ message: L(req, 'decision must be "approved" or "rejected".', 'הערך של decision חייב להיות "approved" או "rejected".') });
  }

  try {
    const request = await decideErasureRequest(id, decision, req.user.uid, req.user.role, reason, callerEffectiveFacultyIds(req));
    return res.status(200).json({ success: true, request });
  } catch (error: any) {
    return res.status(400).json({ message: error.message || L(req, 'Failed to decide on this request.', 'קביעת ההחלטה בבקשה נכשלה.') });
  }
};

// ─── POST /api/projects/:id/erase ────────────────────────────────────────────
// system_admin's direct path — no supervisor request needed.
export const eraseProjectHandler = async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ message: L(req, 'Unauthorized.', 'המשתמש אינו מאומת.') });
  if (!hasAnyRole(req.user, ['system_admin'])) return res.status(403).json({ message: L(req, 'Access denied: system_admin only.', 'הגישה נדחתה: מנהל מערכת בלבד.') });

  const { id: projectId } = req.params;
  const { reason } = req.body ?? {};
  if (!projectId || typeof projectId !== 'string') return res.status(400).json({ message: L(req, 'Invalid projectId.', 'מזהה פרויקט לא תקין.') });

  try {
    await eraseProjectDirectly({ projectId, erasedBy: req.user.uid, erasedByRole: req.user.role, reason });
    return res.status(200).json({ success: true, message: L(req, 'Project archived.', 'הפרויקט הועבר לארכיון.') });
  } catch (error: any) {
    return res.status(400).json({ message: error.message || L(req, 'Failed to erase project.', 'מחיקת הפרויקט נכשלה.') });
  }
};

// ─── POST /api/projects/:id/reassign-supervisor ──────────────────────────────
// system_admin only — hands a project's primary or secondary supervisor
// role to someone else. See services/projectReassignment.ts. Built for the
// "reassign before delete" flow (accountDeletion.ts's checkDeletionEligibility
// blocks deleting a supervisor with active projects) but usable standalone.
export const reassignProjectSupervisorHandler = async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ message: L(req, 'Unauthorized.', 'המשתמש אינו מאומת.') });
  if (!hasAnyRole(req.user, ['system_admin'])) return res.status(403).json({ message: L(req, 'Access denied: system_admin only.', 'הגישה נדחתה: מנהל מערכת בלבד.') });

  const { id: projectId } = req.params;
  const { role, newSupervisorId } = req.body ?? {};
  if (!projectId || typeof projectId !== 'string') return res.status(400).json({ message: L(req, 'Invalid projectId.', 'מזהה פרויקט לא תקין.') });
  if (role !== 'primary' && role !== 'secondary') {
    return res.status(400).json({ message: L(req, 'role must be "primary" or "secondary".', 'הערך של role חייב להיות "primary" או "secondary".') });
  }
  if (newSupervisorId !== null && typeof newSupervisorId !== 'string') {
    return res.status(400).json({ message: L(req, 'newSupervisorId must be a string or null.', 'הערך של newSupervisorId חייב להיות מחרוזת או null.') });
  }

  try {
    await reassignProjectSupervisor({
      projectId,
      role,
      newSupervisorId,
      actingAdminUid: req.user.uid,
      actingAdminRole: req.user.role,
    });
    return res.status(200).json({ success: true, message: L(req, 'Supervisor reassigned.', 'המנחה הוחלף בהצלחה.') });
  } catch (error: any) {
    return res.status(400).json({ message: error.message || L(req, 'Failed to reassign supervisor.', 'החלפת המנחה נכשלה.') });
  }
};

// ─── POST /api/projects/:id/restore ──────────────────────────────────────────
export const restoreProjectHandler = async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ message: L(req, 'Unauthorized.', 'המשתמש אינו מאומת.') });
  if (!isApprover(req)) return res.status(403).json({ message: L(req, 'Access denied: coordinator or system_admin only.', 'הגישה נדחתה: רכז פקולטה או מנהל מערכת בלבד.') });

  const { id: projectId } = req.params;
  if (!projectId || typeof projectId !== 'string') return res.status(400).json({ message: L(req, 'Invalid projectId.', 'מזהה פרויקט לא תקין.') });

  try {
    await restoreProject({
      projectId,
      restoredBy: req.user.uid,
      restoredByRole: req.user.role,
      restorerEffectiveFacultyIds: callerEffectiveFacultyIds(req),
    });
    return res.status(200).json({ success: true, message: 'Project restored.' });
  } catch (error: any) {
    return res.status(400).json({ message: error.message || L(req, 'Failed to restore project.', 'שחזור הפרויקט נכשל.') });
  }
};

// ─── GET /api/projects/archived ──────────────────────────────────────────────
export const getArchivedProjects = async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ message: L(req, 'Unauthorized.', 'המשתמש אינו מאומת.') });
  if (!isApprover(req)) return res.status(403).json({ message: L(req, 'Access denied: coordinator or system_admin only.', 'הגישה נדחתה: רכז פקולטה או מנהל מערכת בלבד.') });

  try {
    const projects = await listArchivedProjects(callerEffectiveFacultyIds(req));
    return res.status(200).json({ projects });
  } catch (error: any) {
    return res.status(500).json({ message: L(req, 'Failed to load archived projects.', 'טעינת הפרויקטים המאוחסנים בארכיון נכשלה.') });
  }
};
