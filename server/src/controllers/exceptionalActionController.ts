// src/controllers/exceptionalActionController.ts
//
// HTTP surface for the P1 #12 approval gate — program_head/faculty_admin/
// grad_school_head/system_admin review requests that milestoneController.ts
// creates on behalf of coordinator/administrative coordinator actors instead
// of letting them apply directly. See services/exceptionalActions.ts.

import { Response } from 'express';
import { AuthenticatedRequest, hasAnyRole, matchedRole } from '../middleware/auth.js';
import { listPendingExceptionalActions, decideExceptionalAction } from '../services/exceptionalActions.js';
import { effectiveFacultyIds, type RoleFacultyField } from '../services/scopeAuthorization.js';

const APPROVER_ROLES = ['program_head', 'faculty_admin', 'grad_school_head', 'system_admin'];

const APPROVER_FACULTY_FIELD: Record<string, RoleFacultyField> = {
  faculty_admin: 'facultyAdminFacultyIds',
  program_head: 'programHeadFacultyIds',
  grad_school_head: 'gradSchoolHeadFacultyIds',
};

function hasApproverAccess(req: AuthenticatedRequest): boolean {
  return hasAnyRole(req.user, APPROVER_ROLES);
}

/** This approver's own faculty plus any extras granted for their specific
 *  role — 'all' for system_admin (always) or a faculty_admin/program_head/
 *  grad_school_head explicitly kept/set cross-faculty. grad_school_head used
 *  to be unconditionally cross-faculty by role alone; it's now scoped the
 *  same way as the other two delegate roles. */
function approverEffectiveFacultyIds(req: AuthenticatedRequest): string[] | 'all' {
  const role = matchedRole(req.user, APPROVER_ROLES) ?? '';
  if (role === 'system_admin') return 'all';
  const field = APPROVER_FACULTY_FIELD[role];
  // Every role admitted by hasApproverAccess has an entry above (or is
  // system_admin, handled first) — this is an unreachable fail-closed
  // default, not a live path.
  if (!field || !req.user) return [];
  return effectiveFacultyIds(req.user, field);
}

export const getPendingExceptionalActions = async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ message: 'Unauthorized.' });
  if (!hasApproverAccess(req)) return res.status(403).json({ message: 'Forbidden.' });

  try {
    const requests = await listPendingExceptionalActions(approverEffectiveFacultyIds(req));
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
    const request = await decideExceptionalAction(id, decision, req.user.uid, req.user.role, reason, approverEffectiveFacultyIds(req));
    return res.status(200).json({ success: true, request });
  } catch (error: any) {
    return res.status(400).json({ message: error.message || 'Failed to decide on this request.' });
  }
};
