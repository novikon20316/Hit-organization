import { Request, Response } from 'express';
import admin from 'firebase-admin';

const db = admin.firestore();

const buildProjectMilestones = (projectId: string, facultyId: string, supervisorId: string, studentIds: string[]) => {
  const types = ['research_proposal', 'progress_report', 'final_report', 'defense'];
  return types.map((type) => ({
    projectId,
    facultyId,
    supervisorId,
    studentIds,
    type,
    status: 'pending',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    examinerIds: [],
    supervisorScore: null,
    examiner1Score: null,
    examiner2Score: null
  }));
};

export const getAdminDashboardData = async (req: Request, res: Response) => {
  const uid = (req as any).user?.uid;

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

export const updateUserPermissions = async (req: Request, res: Response) => {
  const { userId } = req.params;
  const { role, facultyId } = req.body;

  if (typeof userId !== 'string' || !userId || !role || !facultyId) {
    return res.status(400).json({ message: 'Malformed update request items' });
  }

  try {
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

export const adminCreateProject = async (req: Request, res: Response) => {
  const uid = (req as any).user?.uid;
  const fields = req.body;

  try {
    const adminSnap = await db.collection('users').doc(uid).get();
    const facultyId = adminSnap.data()?.facultyId;

    const projectRef = db.collection('projects').doc();
    await projectRef.set({
      titleHe: fields.titleHe,
      titleEn: fields.titleEn,
      descriptionHe: fields.descriptionHe || '',
      descriptionEn: fields.descriptionEn || '',
      skills: fields.skills || '',
      degree: fields.degree,
      type: fields.type,
      supervisorId: fields.supervisorId,
      facultyId,
      status: 'approved',
      studentIds: [],
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return res.status(201).json({ success: true, projectId: projectRef.id });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to insert project definition' });
  }
};

export const enrollStudentToProject = async (req: Request, res: Response) => {
  const { projectId } = req.params;
  const { studentId } = req.body;

  if (typeof projectId !== 'string' || !projectId || !studentId) {
    return res.status(400).json({ message: 'Invalid target identifier arguments' });
  }

  try {
    await db.runTransaction(async (transaction) => {
      const projectRef = db.collection('projects').doc(projectId);
      const studentRef = db.collection('users').doc(studentId);

      const [pSnap, sSnap] = await Promise.all([
        transaction.get(projectRef),
        transaction.get(studentRef)
      ]);

      if (!pSnap.exists) throw new Error('Project references do not exist');
      if (!sSnap.exists || sSnap.data()?.hasActiveProject) {
        throw new Error('Target student already assigned or missing record');
      }

      const currentStudents = pSnap.data()?.studentIds || [];

      transaction.update(projectRef, {
        studentIds: [...currentStudents, studentId],
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      transaction.update(studentRef, {
        hasActiveProject: true,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      const milestoneRecords = buildProjectMilestones(
        projectId,
        pSnap.data()?.facultyId,
        pSnap.data()?.supervisorId,
        [...currentStudents, studentId]
      );

      milestoneRecords.forEach((mDoc) => {
        const newMilestoneRef = db.collection('milestones').doc();
        transaction.set(newMilestoneRef, mDoc);
      });
    });

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
export const toggleUserActive = async (req: Request, res: Response) => {
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