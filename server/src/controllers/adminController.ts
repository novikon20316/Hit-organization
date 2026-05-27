// src/controllers/adminController.ts

import { Response } from 'express';
import admin from 'firebase-admin';
import { AuthenticatedRequest } from '../middleware/auth.js';

const db = admin.firestore();

/**
 * GET /api/admin/dashboard-summary
 * Returns all users, projects, milestones and unread count for system_admin panel.
 * Only accessible by system_admin role.
 */
export const getAdminDashboardSummary = async (req: AuthenticatedRequest, res: Response) => {
  const uid  = req.user?.uid;
  const role = req.user?.role;

  if (role !== 'system_admin') {
    return res.status(403).json({ message: 'Access denied: system_admin only.' });
  }

  try {
    // Fetch everything in parallel
    const [usersSnap, projectsSnap, milestonesSnap, notifSnap] = await Promise.all([
      db.collection('users').get(),
      db.collection('projects').get(),
      db.collection('milestones').get(),
      db.collection('notifications')
        .where('recipientId', '==', uid)
        .where('isRead', '==', false)
        .get(),
    ]);

    const users = usersSnap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    }));

    const projects = projectsSnap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    }));

    const milestones = milestonesSnap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    }));

    return res.status(200).json({
      users,
      projects,
      milestones,
      unreadCount: notifSnap.size,
    });
  } catch (error: any) {
    console.error('getAdminDashboardSummary error:', error);
    return res.status(500).json({ message: 'Failed to load admin dashboard data.' });
  }
};

/**
 * GET /api/admin/milestones
 * Returns milestones filtered by a specific projectId for the system_admin panel.
 */
export const getAdminProjectMilestones = async (req: AuthenticatedRequest, res: Response) => {
  const role = req.user?.role;

  if (role !== 'system_admin') {
    return res.status(403).json({ message: 'Access denied: system_admin only.' });
  }

  try {
    const { projectId } = req.query;

    if (!projectId) {
      return res.status(400).json({ message: 'Missing required projectId query parameter.' });
    }

    console.log(`📡 Admin fetching milestones for project: ${projectId}`);

    // Query Firestore explicitly for documents matching this project
    const milestonesSnap = await db.collection('milestones')
      .where('projectId', '==', projectId)
      .get();

    const milestones = milestonesSnap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    }));

    return res.status(200).json(milestones);
  } catch (error: any) {
    console.error('getAdminProjectMilestones error:', error);
    return res.status(500).json({ message: 'Failed to load project milestones.' });
  }
};

/**
 * 2. GET /api/admin/supervisors
 * Fetches all users currently registered with the 'supervisor' role.
 */
export const getSupervisorsList = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const snap = await db.collection('users').where('role', '==', 'supervisor').get();
    const supervisors = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    return res.status(200).json(supervisors);
  } catch (error: any) {
    console.error('getSupervisorsList Error:', error);
    return res.status(500).json({ message: 'Failed to fetch supervisors.' });
  }
};

/**
 * 3. GET /api/admin/milestones
 * Fetches the global configuration of all milestones.
 */
export const getAdminMilestones = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const snap = await db.collection('milestones').get();
    const milestones = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    return res.status(200).json(milestones);
  } catch (error: any) {
    console.error('getAdminMilestones Error:', error);
    return res.status(500).json({ message: 'Failed to fetch milestones.' });
  }
};

// ==========================================
// POST FUNCTIONS (6)
// ==========================================

/**
 * 4. POST /api/admin/projects
 * Force-creates a new project from the admin panel.
 */
export const createAdminProject = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const projectData = req.body;
    const newProjectRef = db.collection('projects').doc();

    await newProjectRef.set({
      ...projectData,
      projectId: newProjectRef.id,
      status: projectData.status || 'active',
      gradingCriteria: projectData.gradingCriteria ?? [
        { key: 'clarity',     label: 'Research Clarity', maxScore: 20 },
        { key: 'methodology', label: 'Methodology',       maxScore: 25 },
        { key: 'feasibility', label: 'Feasibility',       maxScore: 20 },
        { key: 'innovation',  label: 'Innovation',        maxScore: 15 },
        { key: 'writing',     label: 'Writing Quality',   maxScore: 20 },
      ],
      createdAt: new Date().toISOString()
    });

    return res.status(201).json({ success: true, id: newProjectRef.id, message: 'Project created.' });
  } catch (error: any) {
    console.error('createAdminProject Error:', error);
    return res.status(500).json({ message: 'Failed to create project.' });
  }
};

/**
 * 5. POST /api/admin/users/create
 * Registers a new user directly into the system database.
 */
export const createAdminUser = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userData = req.body;
    const newUserRef = db.collection('users').doc(); // Alternatively, use their UID if linked to Firebase Auth

    await newUserRef.set({
      ...userData,
      isActive: true,
      createdAt: new Date().toISOString()
    });

    return res.status(201).json({ success: true, id: newUserRef.id, message: 'User created.' });
  } catch (error: any) {
    console.error('createAdminUser Error:', error);
    return res.status(500).json({ message: 'Failed to create user.' });
  }
};

/**
 * 6. POST /api/admin/projects/:id/enroll-student
 * Manually forces a student enrollment into a specific project.
 */
export const enrollStudentAdmin = async (req: AuthenticatedRequest, res: Response) => {
  const { id: projectId } = req.params;
  const { studentId } = req.body;

  if (!studentId) return res.status(400).json({ message: 'Missing studentId in request body.' });
  if(!projectId || typeof projectId !== 'string'){
    return res.status(500).json({
        success:false,
        message:"projectId is not good"
    })
  }
  try {
    const projectRef = db.collection('projects').doc(projectId);
    const snap = await projectRef.get();

    if (!snap.exists) return res.status(404).json({ message: 'Project not found.' });

    await projectRef.update({
      studentId: studentId,
      status: 'enrolled',
      updatedAt: new Date().toISOString()
    });

    return res.status(200).json({ success: true, message: 'Student officially enrolled.' });
  } catch (error: any) {
    console.error('enrollStudentAdmin Error:', error);
    return res.status(500).json({ message: 'Failed to enroll student.' });
  }
};

/**
 * 7. POST /api/admin/users/:id/role-update
 * Changes a user's operational privileges (e.g., 'student' -> 'supervisor').
 */
export const updateUserRoleAdmin = async (req: AuthenticatedRequest, res: Response) => {
  const { id: userId } = req.params;
  const { role } = req.body;

  if (!role) return res.status(400).json({ message: 'Missing role parameter.' });
  if(!userId || typeof userId !== 'string'){
    return res.status(500).json({
        success:false,
        message:"projectId is not good"
    })
  }
  try {
    await db.collection('users').doc(userId).update({ 
      role: role,
      updatedAt: new Date().toISOString()
    });

    return res.status(200).json({ success: true, message: `User role updated to ${role}.` });
  } catch (error: any) {
    console.error('updateUserRoleAdmin Error:', error);
    return res.status(500).json({ message: 'Failed to update user role.' });
  }
};

/**
 * 8. POST /api/admin/users/:id/toggle-status
 * Suspends or activates a user account.
 */
export const toggleUserStatusAdmin = async (req: AuthenticatedRequest, res: Response) => {
  const { id: userId } = req.params;
  const { isActive } = req.body;

  if (typeof isActive !== 'boolean') {
    return res.status(400).json({ message: 'isActive must be a boolean value.' });
  }
  if(!userId || typeof userId !== 'string'){
    return res.status(500).json({
        success:false,
        message:"projectId is not good"
    })
  }
  try {
    await db.collection('users').doc(userId).update({ 
      isActive: isActive,
      updatedAt: new Date().toISOString()
    });

    return res.status(200).json({ success: true, message: `User status updated to ${isActive ? 'Active' : 'Suspended'}.` });
  } catch (error: any) {
    console.error('toggleUserStatusAdmin Error:', error);
    return res.status(500).json({ message: 'Failed to toggle user status.' });
  }
};

/**
 * 9. POST /api/admin/system/maintenance
 * Toggles a global maintenance lock flag on the database system configs.
 */
export const toggleSystemMaintenance = async (req: AuthenticatedRequest, res: Response) => {
  const { maintenanceActive } = req.body;

  try {
    // Assuming you have a 'system' collection and a 'settings' document
    await db.collection('system').doc('settings').set({ 
      maintenanceMode: maintenanceActive,
      lastToggledAt: new Date().toISOString()
    }, { merge: true });

    return res.status(200).json({ success: true, message: `Maintenance mode is now ${maintenanceActive}.` });
  } catch (error: any) {
    console.error('toggleSystemMaintenance Error:', error);
    return res.status(500).json({ message: 'Failed to toggle maintenance mode.' });
  }
};

// ==========================================
// DELETE FUNCTIONS (1)
// ==========================================

/**
 * 10. DELETE /api/admin/projects/:id
 * Permanently removes a project from the system.
 */
export const deleteAdminProject = async (req: AuthenticatedRequest, res: Response) => {
  const { id: projectId } = req.params;
  if(!projectId || typeof projectId !== 'string'){
        return res.status(500).json({
            success:false,
            message:"projectId is not good"
        })
    }
  try {
    const projectRef = db.collection('projects').doc(projectId);
    const snap = await projectRef.get();

    if (!snap.exists) return res.status(404).json({ message: 'Project not found.' });

    await projectRef.delete();

    return res.status(200).json({ success: true, message: 'Project permanently deleted.' });
  } catch (error: any) {
    console.error('deleteAdminProject Error:', error);
    return res.status(500).json({ message: 'Failed to delete project.' });
  }
};