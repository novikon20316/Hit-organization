// src/controllers/exceptionalActionController.ts
//
// HTTP surface for the P1 #12 approval gate — program_head/faculty_admin/
// grad_school_head/system_admin review requests that milestoneController.ts
// creates on behalf of coordinator/administrative_secretary actors instead
// of letting them apply directly. See services/exceptionalActions.ts.

import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { listPendingExceptionalActions, decideExceptionalAction } from '../services/exceptionalActions.js';

const APPROVER_ROLES = ['program_head', 'faculty_admin', 'grad_school_head', 'system_admin'];

function hasApproverAccess(req: AuthenticatedRequest): boolean {
  return !!req.user?.role && APPROVER_ROLES.includes(req.user.role);
}

export const getPendingExceptionalActions = async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ message: 'Unauthorized.' });
  if (!hasApproverAccess(req)) return res.status(403).json({ message: 'Forbidden.' });

  try {
    // grad_school_head/system_admin's facultyId is 'all' — sees every faculty's queue.
    const requests = await listPendingExceptionalActions(req.user.facultyId);
    return res.status(200).json({ requests });
  } catch (error: any) {
    return res.status(500).json({ message: error.message || 'Failed to load pending exceptional actions.' });
  }
};

export const decideExceptionalActionRequest = async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { decision, reason } = req.body;
  if (!req.user) return res.status(401).json({ message: 'Unauthorized.' });
  if (!hasApproverAccess(req)) return res.status(403).json({ message: 'Forbidden.' });
  if (!id || typeof id !== 'string') return res.status(400).json({ message: 'Missing request id.' });
  if (decision !== 'approved' && decision !== 'rejected') {
    return res.status(400).json({ message: 'decision must be "approved" or "rejected".' });
  }

  try {
    const request = await decideExceptionalAction(id, decision, req.user.uid, req.user.role, reason);
    return res.status(200).json({ success: true, request });
  } catch (error: any) {
    return res.status(400).json({ message: error.message || 'Failed to decide on this request.' });
  }
};
