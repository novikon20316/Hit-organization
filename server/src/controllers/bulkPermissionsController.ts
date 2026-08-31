// src/controllers/bulkPermissionsController.ts
//
// Grants a permission scope to EVERY user of a given role in one action,
// instead of the existing per-user checkbox flow in
// adminController.ts's updateUserRoleAdmin / web's PermissionsEditorModal.tsx
// (that one-at-a-time editor is unchanged — this is a separate, additive
// flow for "give every supervisor the ability to X" style requests).
//
// Reuses the exact same ScopeRule shape/validation those already write, so
// a bulk-granted rule looks identical to (and is editable/removable via) the
// existing per-user permission editor afterwards.

import { Response } from 'express';
import crypto from 'crypto';
import admin from 'firebase-admin';
import { db } from '../config/firebase.js';
import { AuthenticatedRequest, matchedRole } from '../middleware/auth.js';
import { VALID_ROLES } from '../services/userImportExport.js';
import { validateScopeDescriptor, VIEW_TYPES, ACTION_TYPES, DELEGATE_RESTRICTED_ACTIONS, type ViewType, type ActionType, type ScopeRule } from '../config/permissionScopes.js';
import { logAuditEvent } from '../services/auditLog.js';

// system_admin: fully unscoped (any role, any faculty). faculty_admin: scoped
// to their own faculty only, enforced server-side below regardless of what
// the request body claims. grad_school_head: cross-faculty by design (same
// convention as gradSchoolHeadController.ts's facultyId 'all') — their
// "affiliation" is the whole graduate school, not one faculty.
const BULK_PERMISSION_ROLES = ['system_admin', 'faculty_admin', 'grad_school_head'];

async function findUsersByRole(role: string): Promise<Map<string, FirebaseFirestore.DocumentData>> {
  const [byRole, byRolesArray] = await Promise.all([
    db.collection('users').where('role', '==', role).get(),
    db.collection('users').where('roles', 'array-contains', role).get(),
  ]);
  const usersById = new Map<string, FirebaseFirestore.DocumentData>();
  [...byRole.docs, ...byRolesArray.docs].forEach((d) => usersById.set(d.id, d.data()));
  return usersById;
}

/**
 * GET /api/admin/permissions/users-by-role?role=X
 * Lets the bulk-grant UI show a live "this will affect N users" preview
 * before committing.
 */
export const getUsersByRole = async (req: AuthenticatedRequest, res: Response) => {
  const callerRole = matchedRole(req.user, BULK_PERMISSION_ROLES);
  if (!callerRole) {
    return res.status(403).json({ message: 'You do not have permission to view this.' });
  }
  const role = req.query.role as string | undefined;
  if (!role || !VALID_ROLES.includes(role)) {
    return res.status(400).json({ message: `Invalid role: ${role}` });
  }

  try {
    const usersById = await findUsersByRole(role);
    const scopedFacultyId = callerRole === 'faculty_admin' ? req.user!.facultyId : undefined;

    const users = [...usersById.entries()]
      .filter(([, data]) => !scopedFacultyId || data.facultyId === scopedFacultyId)
      .map(([id, data]) => ({ id, displayName: data.displayName ?? 'Unknown', facultyId: data.facultyId ?? null }));

    return res.status(200).json({ users });
  } catch (error: any) {
    console.error('getUsersByRole error:', error);
    return res.status(500).json({ message: 'Failed to fetch users.' });
  }
};

/**
 * POST /api/admin/permissions/apply-to-role
 * Body: { targetRole: string, facultyId?, major?, degreeLevel?, processType?, view: ViewType[], actions: ActionType[] }
 */
export const applyPermissionsToRole = async (req: AuthenticatedRequest, res: Response) => {
  const callerUid = req.user?.uid;
  if (!callerUid) return res.status(401).json({ message: 'Unauthorized.' });
  const callerRole = matchedRole(req.user, BULK_PERMISSION_ROLES);
  if (!callerRole) {
    return res.status(403).json({ message: 'You do not have permission to bulk-apply permissions.' });
  }

  const { targetRole, view, actions } = req.body;
  let { facultyId, major, degreeLevel, processType } = req.body;

  if (!targetRole || !VALID_ROLES.includes(targetRole)) {
    return res.status(400).json({ message: `Invalid targetRole: ${targetRole}` });
  }
  if (!Array.isArray(view) || view.length === 0 || !view.every((v: unknown) => VIEW_TYPES.includes(v as ViewType))) {
    return res.status(400).json({ message: 'view must be a non-empty array of valid view types.' });
  }
  if (!Array.isArray(actions) || actions.length === 0 || !actions.every((a: unknown) => ACTION_TYPES.includes(a as ActionType))) {
    return res.status(400).json({ message: 'actions must be a non-empty array of valid action types.' });
  }

  // CRITICAL FIX: adminController.ts's updateUserRoleAdmin already blocks a
  // delegate (faculty_admin/program_head/grad_school_head) from ever
  // granting delete_users/all_actions — this endpoint writes the exact same
  // permissionRules structure but never had the same check. A faculty_admin
  // could call this with targetRole: 'faculty_admin', actions: ['all_actions']
  // and grant every faculty_admin in their faculty (including themselves)
  // system_admin-equivalent power; a grad_school_head (cross-faculty by
  // design) could do the same institution-wide with facultyId: 'all'.
  if (callerRole !== 'system_admin' && actions.some((a: ActionType) => DELEGATE_RESTRICTED_ACTIONS.includes(a))) {
    return res.status(403).json({ message: 'Only system_admin may grant delete_users or all_actions.' });
  }

  // A faculty_admin's bulk grant can never escape their own faculty, no
  // matter what the request body claims — this is the whole point of §5.
  if (callerRole === 'faculty_admin') {
    facultyId = req.user!.facultyId;
  }
  facultyId = facultyId || 'all';

  const scopeError = validateScopeDescriptor({ facultyId, major, degreeLevel, processType });
  if (scopeError) return res.status(400).json({ message: scopeError });

  try {
    const usersById = await findUsersByRole(targetRole);
    const targets = [...usersById.keys()].filter((uid) =>
      facultyId === 'all' || usersById.get(uid)?.facultyId === facultyId
    );

    if (targets.length === 0) {
      return res.status(200).json({ success: true, affectedCount: 0, message: 'No matching users found.' });
    }

    // One shared rule id across every affected user — makes this bulk grant
    // identifiable as a single unit (e.g. "this rule came from the same bulk
    // action") even though each user's permissionRules array is independent.
    const rule: ScopeRule = {
      id: crypto.randomUUID(),
      facultyId,
      ...(major ? { major } : {}),
      ...(degreeLevel ? { degreeLevel } : {}),
      ...(processType ? { processType } : {}),
      view,
      actions,
    };

    // Firestore batches cap at 500 writes — chunk into multiple batches, same
    // convention as milestoneController.ts's bulkUpdateMilestoneDueDates.
    const BATCH_LIMIT = 450;
    let batch = db.batch();
    let opsInBatch = 0;
    const commits: Promise<unknown>[] = [];
    for (const uid of targets) {
      batch.update(db.collection('users').doc(uid), {
        permissionRules: admin.firestore.FieldValue.arrayUnion(rule),
        updatedAt: new Date().toISOString(),
      });
      opsInBatch++;
      if (opsInBatch >= BATCH_LIMIT) {
        commits.push(batch.commit());
        batch = db.batch();
        opsInBatch = 0;
      }
    }
    if (opsInBatch > 0) commits.push(batch.commit());
    await Promise.all(commits);

    await logAuditEvent({
      userId: callerUid,
      userRole: callerRole,
      action: 'bulk_permissions_granted',
      entityType: 'role',
      entityId: targetRole,
      newValue: {
        targetRole, facultyId, major: major ?? null, degreeLevel: degreeLevel ?? null,
        processType: processType ?? null, view, actions, affectedCount: targets.length,
      },
    });

    return res.status(200).json({ success: true, affectedCount: targets.length });
  } catch (error: any) {
    console.error('applyPermissionsToRole error:', error);
    return res.status(500).json({ message: error.message || 'Failed to bulk-apply permissions.' });
  }
};
