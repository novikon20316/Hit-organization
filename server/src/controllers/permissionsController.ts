// src/controllers/permissionsController.ts
//
// Self-service permission introspection — distinct from
// controllers/bulkPermissionsController.ts (which manages OTHER users'
// grants). This answers "what am I myself allowed to do," starting with
// "which faculties can I add_projects in" for the multi-faculty Add Project
// checkbox flow (see services/scopeAuthorization.ts's grantedFacultyIdsFor).

import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { grantedFacultyIdsFor } from '../services/scopeAuthorization.js';
import { ACTION_TYPES, type ActionType } from '../config/permissionScopes.js';

/**
 * GET /api/permissions/my-grants?action=add_projects
 * Returns the faculties the calling user may exercise `action` in.
 */
export const getMyGrants = async (req: AuthenticatedRequest, res: Response) => {
  const action = req.query.action;
  if (typeof action !== 'string' || !ACTION_TYPES.includes(action as ActionType)) {
    return res.status(400).json({ message: `Invalid or missing action query param.` });
  }

  const facultyIds = grantedFacultyIdsFor(req.user, action as ActionType);
  return res.status(200).json({ facultyIds });
};
