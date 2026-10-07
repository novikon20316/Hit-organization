import { Router } from 'express';
import {
  assignExaminers,
  getCoordinatorDashboard,
  coordinatorApproveMilestone,
  coordinatorRejectMilestone,
  assignDefense,
  resolveDefenseDateConflict,
  getCoordinatorExaminerRecommendations,
  approveExaminerRecommendation,
  rejectExaminerRecommendation,
} from '../controllers/coordinatorController.js';
import { uploadMiddleware, handleUploadError } from '../controllers/milestoneController.js';
import {verifyToken } from '../middleware/auth.js';
import {
  exportUsersCoordinator,
  importStaffCoordinator,
  uploadExcelFileMiddleware,
} from '../controllers/userImportExportController.js';
import { importStudentRosterCoordinator } from '../controllers/studentRosterController.js';

const router = Router();

router.get('/dashboard', verifyToken, getCoordinatorDashboard)
router.get('/users/export', verifyToken, exportUsersCoordinator)
router.post('/projects/:projectId/assign-examiners', verifyToken, assignExaminers)
router.get('/examiner-recommendations', verifyToken, getCoordinatorExaminerRecommendations)
router.post('/examiner-recommendations/:id/approve', verifyToken, approveExaminerRecommendation)
router.post('/examiner-recommendations/:id/reject', verifyToken, rejectExaminerRecommendation)
// uploadMiddleware is a no-op for a plain JSON body (no file attached) — see
// its own doc comment in milestoneController.ts. Lets a chain stage's actor
// (e.g. a supervisor's approve-stage in GradeMilestoneModal.tsx) optionally
// attach a file alongside their approve/reject decision.
router.post('/:milestoneId/approve', verifyToken, uploadMiddleware, handleUploadError, coordinatorApproveMilestone)
router.post('/:milestoneId/reject', verifyToken, uploadMiddleware, handleUploadError, coordinatorRejectMilestone)
router.post('/projects/:projectId/assign-defense', verifyToken, assignDefense)
router.post('/milestones/:milestoneId/resolve-date-conflict', verifyToken, resolveDefenseDateConflict)
router.post('/staff/import', verifyToken, uploadExcelFileMiddleware, importStaffCoordinator);
router.post('/student-roster/import', verifyToken, uploadExcelFileMiddleware, importStudentRosterCoordinator);

export default router;