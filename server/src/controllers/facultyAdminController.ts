import { Response } from 'express';
import admin from 'firebase-admin';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { enrollStudentInProject } from '../services/projectEnrollment.js';
import { VALID_ROLES } from '../services/userImportExport.js';
import { hasActionGrant, withinCoordinatorScope } from '../services/scopeAuthorization.js';

const FACULTY_ADMIN_ROLES = ['faculty_admin', 'system_admin'];

// Roles that already sit above faculty_admin in the privilege hierarchy — a
// faculty_admin (via role or a delegated 'edit_users' grant) may never grant
// or modify one of these, only system_admin can.
const ADMIN_TIER_ROLES = ['system_admin', 'faculty_admin', 'program_head', 'grad_school_head'];

const db = admin.firestore();

export const getAdminDashboardData = async (req: AuthenticatedRequest, res: Response) => {
  const uid = req.user?.uid;
  if (!uid) return res.status(401).json({ message: 'Unauthorized.' });

  try {
    const adminSnap = await db.collection('users').doc(uid).get();
    if (!adminSnap.exists || adminSnap.data()?.role !== 'faculty_admin') {
      return res.status(403).json({ message: 'Access denied: Administration rights required' });
    }

    const adminFacultyId = adminSnap.data()?.facultyId;

    const notifSnap = await db.collection('notifications')
      .where('recipientId', '==', uid)
      .where('isRead', '==', false)
      .get();

    const [usersSnap, projectsSnap] = await Promise.all([
      db.collection('users').where('facultyId', '==', adminFacultyId).get(),
      db.collection('projects').where('facultyId', '==', adminFacultyId).get()
    ]);

    const users: any[] = [];
    const supervisors: any[] = [];
    const availableStudents: any[] = [];

    usersSnap.forEach((doc) => {
      const uData = doc.data();
      const mappedUser = { id: doc.id, ...uData };
      users.push(mappedUser);

      if (uData.role === 'supervisor') supervisors.push(mappedUser);
      if (uData.role === 'student' && !uData.hasActiveProject) availableStudents.push(mappedUser);
    });

    const projects: any[] = [];
    for (const pDoc of projectsSnap.docs) {
      const pData = pDoc.data();
      let supervisorName = 'Unassigned';
      if (pData.supervisorId) {
        const sMatch = users.find(u => u.id === pData.supervisorId);
        supervisorName = sMatch ? sMatch.displayName : 'External/Unknown';
      }
      projects.push({ id: pDoc.id, ...pData, supervisorName });
    }

    return res.status(200).json({
      facultyId: adminFacultyId,
      unreadCount: notifSnap.size,
      users,
      projects,
      supervisors,
      availableStudents
    });

  } catch (error) {
    console.error('Admin aggregation failed:', error);
    return res.status(500).json({ message: 'Internal operational compilation failure.' });
  }
};

export const updateUserPermissions = async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user?.role || !FACULTY_ADMIN_ROLES.includes(req.user.role)) {
    return res.status(403).json({ message: 'Access denied: faculty_admin or system_admin only.' });
  }

  const { userId } = req.params;
  const { role, facultyId } = req.body;

  if (typeof userId !== 'string' || !userId || !role || !facultyId) {
    return res.status(400).json({ message: 'Malformed update request items' });
  }
  if (!VALID_ROLES.includes(role)) {
    return res.status(400).json({ message: `Invalid role: ${role}` });
  }

  const isSystemAdmin = req.user.role === 'system_admin';
  if (!isSystemAdmin && ADMIN_TIER_ROLES.includes(role)) {
    return res.status(403).json({ message: 'faculty_admin cannot grant an admin-tier role.' });
  }

  try {
    const targetSnap = await db.collection('users').doc(userId).get();
    if (!targetSnap.exists) return res.status(404).json({ message: 'User not found.' });
    const target = targetSnap.data()!;

    // Previously unscoped entirely — a faculty_admin could edit any user in
    // any faculty and reassign them anywhere. Confine to their own faculty
    // (matching toggleUserActive's existing precedent) unless a delegated
    // edit_users grant covers both the user's current AND requested scope.
    if (!isSystemAdmin) {
      if (ADMIN_TIER_ROLES.includes(target.role)) {
        return res.status(403).json({ message: 'Cannot modify an admin-tier account.' });
      }
      const currentScope = { facultyId: target.facultyId, major: target.major };
      const newScope = { facultyId, major: target.major };
      const withinOwnFaculty = target.facultyId === req.user.facultyId && facultyId === req.user.facultyId;
      const delegateGranted = hasActionGrant(req.user, 'edit_users', currentScope) && hasActionGrant(req.user, 'edit_users', newScope);
      if (!withinOwnFaculty && !delegateGranted) {
        return res.status(403).json({ message: 'Cannot modify a user outside your assigned scope.' });
      }
    }

    await db.collection('users').doc(userId).update({
      role,
      facultyId,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    return res.status(200).json({ success: true });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to complete configuration edits' });
  }
};

export const enrollStudentToProject = async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user?.role || !FACULTY_ADMIN_ROLES.includes(req.user.role)) {
    return res.status(403).json({ message: 'Access denied: faculty_admin or system_admin only.' });
  }

  const { projectId } = req.params;
  const { studentId } = req.body;

  if (typeof projectId !== 'string' || !projectId || !studentId) {
    return res.status(400).json({ message: 'Invalid target identifier arguments' });
  }

  try {
    const projectRef = db.collection('projects').doc(projectId);
    const [pSnap, sSnap] = await Promise.all([
      projectRef.get(),
      db.collection('users').doc(studentId).get(),
    ]);

    if (!pSnap.exists) throw new Error('Project references do not exist');
    if (!sSnap.exists || sSnap.data()?.hasActiveProject) {
      throw new Error('Target student already assigned or missing record');
    }

    const pData = pSnap.data()!;

    // Previously unscoped — a faculty_admin from any faculty could enroll a
    // student into a project belonging to a different faculty.
    const enrollScope = { facultyId: pData.facultyId, major: pData.major, degreeLevel: pData.degreeType, processType: pData.projectType };
    if (!withinCoordinatorScope(req.user, enrollScope) && !hasActionGrant(req.user, 'assign_supervisor_examiner', enrollScope)) {
      return res.status(403).json({ message: 'This project is outside your assigned scope.' });
    }

    await enrollStudentInProject(projectId, studentId, pData.supervisorId, pData.facultyId);

    return res.status(200).json({ success: true });
  } catch (error: any) {
    console.error(error);
    return res.status(500).json({ message: error.message || 'Enrollment pipeline execution failure.' });
  }
};

/**
 * POST /api/admin/users/:userId/toggle-active
 * FIX: this endpoint was called from faculty_admin/dashboard.tsx but had no
 *      matching controller function anywhere. Added here.
 *      Note: adminController.ts has a similar toggleUserStatusAdmin on the
 *      path /api/admin/users/:id/toggle-status (used by the system_admin panel).
 *      This one is scoped to faculty_admin and uses the same field (isActive)
 *      so the Firestore data shape stays consistent.
 */
export const toggleUserActive = async (req: AuthenticatedRequest, res: Response) => {
  const role  = req.user?.role;
  const roles = req.user?.roles ?? [];
  const isAuthorized = role === 'faculty_admin' || role === 'system_admin' ||
    roles.includes('faculty_admin') || roles.includes('system_admin');
  if (!isAuthorized) {
    return res.status(403).json({ message: 'Access denied: faculty_admin or system_admin only.' });
  }

  const { userId } = req.params;
  const { isActive } = req.body;

  if (typeof userId !== 'string' || !userId) {
    return res.status(400).json({ message: 'Invalid or missing userId.' });
  }

  if (typeof isActive !== 'boolean') {
    return res.status(400).json({ message: 'isActive must be a boolean value.' });
  }

  try {
    const userRef = db.collection('users').doc(userId);
    const userSnap = await userRef.get();

    if (!userSnap.exists) {
      return res.status(404).json({ message: 'User not found.' });
    }

    // Faculty admins may only toggle users within their own faculty.
    if (role === 'faculty_admin' && userSnap.data()?.facultyId !== req.user?.facultyId) {
      return res.status(403).json({ message: 'Cannot modify a user outside your faculty.' });
    }

    await userRef.update({
      isActive,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return res.status(200).json({
      success: true,
      message: `User ${isActive ? 'activated' : 'deactivated'} successfully.`
    });
  } catch (error: any) {
    console.error('toggleUserActive error:', error);
    return res.status(500).json({ message: 'Failed to toggle user active status.' });
  }
};