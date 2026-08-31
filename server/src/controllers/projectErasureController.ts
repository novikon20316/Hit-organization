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
import {
  requestProjectErasure,
  listPendingErasureRequests,
  decideErasureRequest,
  eraseProjectDirectly,
  restoreProject,
  listArchivedProjects,
} from '../services/projectErasure.js';

function isApprover(req: AuthenticatedRequest): boolean {
  return hasAnyRole(req.user, ['coordinator', 'system_admin']);
}

function callerEffectiveFacultyIds(req: AuthenticatedRequest): string[] | 'all' {
  if (hasAnyRole(req.user, ['system_admin'])) return 'all';
  return [req.user?.facultyId ?? ''];
}

// ─── POST /api/projects/:id/request-erasure ──────────────────────────────────
export const requestProjectErasureHandler = async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ message: 'Unauthorized.' });
  const { id: projectId } = req.params;
  const { reason } = req.body ?? {};
  if (!projectId || typeof projectId !== 'string') return res.status(400).json({ message: 'Invalid projectId.' });
  if (!reason || typeof reason !== 'string' || !reason.trim()) {
    return res.status(400).json({ message: 'A reason is required to request project erasure.' });
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
    return res.status(400).json({ message: error.message || 'Failed to request project erasure.' });
  }
};

// ─── GET /api/projects/erasure-requests/pending ──────────────────────────────
export const getPendingErasureRequests = async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ message: 'Unauthorized.' });
  if (!isApprover(req)) return res.status(403).json({ message: 'Access denied: coordinator or system_admin only.' });

  try {
    const requests = await listPendingErasureRequests(callerEffectiveFacultyIds(req));
    return res.status(200).json({ requests });
  } catch (error: any) {
    return res.status(500).json({ message: error.message || 'Failed to load pending erasure requests.' });
  }
};

// ─── POST /api/projects/erasure-requests/:id/decide ──────────────────────────
export const decideErasureRequestHandler = async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ message: 'Unauthorized.' });
  if (!isApprover(req)) return res.status(403).json({ message: 'Access denied: coordinator or system_admin only.' });

  const { id } = req.params;
  const { decision, reason } = req.body ?? {};
  if (!id || typeof id !== 'string') return res.status(400).json({ message: 'Missing request id.' });
  if (decision !== 'approved' && decision !== 'rejected') {
    return res.status(400).json({ message: 'decision must be "approved" or "rejected".' });
  }

  try {
    const request = await decideErasureRequest(id, decision, req.user.uid, req.user.role, reason, callerEffectiveFacultyIds(req));
    return res.status(200).json({ success: true, request });
  } catch (error: any) {
    return res.status(400).json({ message: error.message || 'Failed to decide on this request.' });
  }
};

// ─── POST /api/projects/:id/erase ────────────────────────────────────────────
// system_admin's direct path — no supervisor request needed.
export const eraseProjectHandler = async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ message: 'Unauthorized.' });
  if (!hasAnyRole(req.user, ['system_admin'])) return res.status(403).json({ message: 'Access denied: system_admin only.' });

  const { id: projectId } = req.params;
  const { reason } = req.body ?? {};
  if (!projectId || typeof projectId !== 'string') return res.status(400).json({ message: 'Invalid projectId.' });

  try {
    await eraseProjectDirectly({ projectId, erasedBy: req.user.uid, erasedByRole: req.user.role, reason });
    return res.status(200).json({ success: true, message: 'Project archived.' });
  } catch (error: any) {
    return res.status(400).json({ message: error.message || 'Failed to erase project.' });
  }
};

// ─── POST /api/projects/:id/restore ──────────────────────────────────────────
export const restoreProjectHandler = async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ message: 'Unauthorized.' });
  if (!isApprover(req)) return res.status(403).json({ message: 'Access denied: coordinator or system_admin only.' });

  const { id: projectId } = req.params;
  if (!projectId || typeof projectId !== 'string') return res.status(400).json({ message: 'Invalid projectId.' });

  try {
    await restoreProject({
      projectId,
      restoredBy: req.user.uid,
      restoredByRole: req.user.role,
      restorerEffectiveFacultyIds: callerEffectiveFacultyIds(req),
    });
    return res.status(200).json({ success: true, message: 'Project restored.' });
  } catch (error: any) {
    return res.status(400).json({ message: error.message || 'Failed to restore project.' });
  }
};

// ─── GET /api/projects/archived ──────────────────────────────────────────────
export const getArchivedProjects = async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ message: 'Unauthorized.' });
  if (!isApprover(req)) return res.status(403).json({ message: 'Access denied: coordinator or system_admin only.' });

  try {
    const projects = await listArchivedProjects(callerEffectiveFacultyIds(req));
    return res.status(200).json({ projects });
  } catch (error: any) {
    return res.status(500).json({ message: error.message || 'Failed to load archived projects.' });
  }
};
