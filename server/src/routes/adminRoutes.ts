import { Router } from 'express';
import { 
  getAdminDashboardData, 
  updateUserPermissions, 
  adminCreateProject, 
  enrollStudentToProject,
} from '../controllers/facultyAdminController.js';
import {
  getAdminDashboardSummary,
  getAdminProjectMilestones,
  getSupervisorsList,
  getAdminMilestones,
  createAdminProject,
  createAdminUser,
  enrollStudentAdmin,
  updateUserRoleAdmin,
  toggleUserStatusAdmin,
  toggleSystemMaintenance,
  deleteAdminProject
} from '../controllers/adminController.js'
import { authenticateUser } from '../middleware/auth.js';
import {verifyToken } from '../middleware/auth.js';

const router = Router();

// PATCH routes
router.patch('/users/:userId', authenticateUser, updateUserPermissions);

// GET routes
router.get('/dashboard', authenticateUser, getAdminDashboardData);
router.get('/dashboard', verifyToken, getAdminDashboardSummary);
router.get('/supervisors', verifyToken, getSupervisorsList);
router.get('/milestones', verifyToken, getAdminMilestones);
router.get('/milestones', verifyToken, getAdminProjectMilestones)
router.get('/dashboard-summary', verifyToken, getAdminDashboardSummary);

// POST routes
router.post('/projects', verifyToken, createAdminProject);
router.post('/users/create', verifyToken, createAdminUser);
router.post('/projects/:id/enroll-student', verifyToken, enrollStudentAdmin);
router.post('/users/:id/role-update', verifyToken, updateUserRoleAdmin);
router.post('/users/:id/toggle-status', verifyToken, toggleUserStatusAdmin);
router.post('/system/maintenance', verifyToken, toggleSystemMaintenance);
router.post('/projects', authenticateUser, adminCreateProject);
router.post('/projects/:projectId/enroll', authenticateUser, enrollStudentToProject);


// DELETE routes
router.delete('/projects/:id', verifyToken, deleteAdminProject);
export default router;