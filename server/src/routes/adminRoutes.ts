import { Router } from 'express';
import {
  getAdminDashboardData,
  updateUserPermissions,
  enrollStudentToProject,
  toggleUserActive,
  listManagedStaff,
} from '../controllers/facultyAdminController.js';
import {
  getAdminDashboardSummary,
  getAdminProjectMilestones,
  getSupervisorsList,
  createAdminProject,
  createAdminUser,
  enrollStudentAdmin,
  updateUserRoleAdmin,
  toggleUserStatusAdmin,
  deleteAdminProject,
  disableUser2FA,
  listDefenseAccessGrants,
  extendDefenseAccessGrant,
  eraseUserBySystemAdmin,
  updateStudentAcademicYear,
  searchStudents,
} from '../controllers/adminController.js'
import { authenticateUser } from '../middleware/auth.js';
import {verifyToken } from '../middleware/auth.js';
import { assignDefense } from '../controllers/coordinatorController.js';
import { uploadInfoFile, uploadInfoFileMiddleware, deleteInfoFile } from '../controllers/infoFilesController.js';
import { createFacultyContent, deleteFacultyContent } from '../controllers/facultyContentController.js';
import {
  exportUsersAdmin,
  importUsersAdmin,
  importStaffAdmin,
  uploadExcelFileMiddleware,
} from '../controllers/userImportExportController.js';
import {
  importStudentRosterAdmin,
  listStudentRosterAdmin,
  updateStudentRosterAdmin,
  deleteStudentRosterAdmin,
} from '../controllers/studentRosterController.js';
import {
  getAcademicCalendarConfig,
  updateAcademicCalendarConfig,
} from '../controllers/academicCalendarController.js';
import {
  updateStudentStatusOptions,
  setStudentStatus,
} from '../controllers/studentStatusController.js';

const router = Router();

// PATCH routes
router.patch('/users/:userId', authenticateUser, updateUserPermissions);

// GET routes
router.get('/dashboard', authenticateUser, getAdminDashboardData);
router.get('/supervisors', verifyToken, getSupervisorsList);
// Filtered by ?projectId= and system_admin-gated — matches what the client
// (admin/panel.tsx) actually sends. A second, unfiltered registration used to
// shadow this one; it silently ignored the projectId filter for every caller.
router.get('/milestones', verifyToken, getAdminProjectMilestones)
router.get('/dashboard-summary', verifyToken, getAdminDashboardSummary);
router.get('/users/export', verifyToken, exportUsersAdmin);
router.get('/defense-access-grants', verifyToken, listDefenseAccessGrants);
router.get('/academic-calendar', verifyToken, getAcademicCalendarConfig);
// system_admin or administrative_secretary — gated inside the controller.
router.get('/students/search', verifyToken, searchStudents);
router.get('/student-roster', verifyToken, listStudentRosterAdmin);
// faculty_admin/program_head (own faculty) or grad_school_head
// (cross-faculty) — gated inside the controller, same pattern as the rest
// of this file.
router.get('/staff', verifyToken, listManagedStaff);

// POST routes
router.post('/projects', verifyToken, createAdminProject);
router.post('/users/create', verifyToken, createAdminUser);
router.post('/projects/:id/enroll-student', verifyToken, enrollStudentAdmin);
router.post('/users/:id/role-update', verifyToken, updateUserRoleAdmin);
router.post('/users/:id/toggle-status', verifyToken, toggleUserStatusAdmin);
router.post('/users/:userId/toggle-active', verifyToken, toggleUserActive);
router.post('/projects/:projectId/enroll', authenticateUser, enrollStudentToProject);
router.post('/users/:id/disable-2fa', verifyToken, disableUser2FA);
router.post('/defense-access-grants/:grantCode/extend', verifyToken, extendDefenseAccessGrant);
router.post('/projects/:projectId/assign-defense', verifyToken, assignDefense);
router.post('/info-files', verifyToken, uploadInfoFileMiddleware, uploadInfoFile);
router.post('/faculty-content', verifyToken, createFacultyContent);
router.post('/users/import', verifyToken, uploadExcelFileMiddleware, importUsersAdmin);
router.post('/staff/import', verifyToken, uploadExcelFileMiddleware, importStaffAdmin);
router.post('/student-roster/import', verifyToken, uploadExcelFileMiddleware, importStudentRosterAdmin);
router.post('/users/:id/erase', verifyToken, eraseUserBySystemAdmin);
// system_admin (any student) or faculty_admin (own faculty only) — gated
// inside the controller, not here, matching createAdminProject's pattern.
router.post('/users/:id/status', verifyToken, setStudentStatus);

// PUT routes
router.put('/academic-calendar', verifyToken, updateAcademicCalendarConfig);
router.put('/student-statuses', verifyToken, updateStudentStatusOptions);
// system_admin or administrative_secretary — gated inside the controller.
router.put('/users/:id/academic-year', verifyToken, updateStudentAcademicYear);

// PATCH routes
router.patch('/student-roster/:docId', verifyToken, updateStudentRosterAdmin);

// DELETE routes
router.delete('/info-files/:id', verifyToken, deleteInfoFile);
router.delete('/faculty-content/:id', verifyToken, deleteFacultyContent);
router.delete('/projects/:id', verifyToken, deleteAdminProject);
router.delete('/student-roster/:docId', verifyToken, deleteStudentRosterAdmin);
export default router;