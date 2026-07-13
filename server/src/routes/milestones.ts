import { Router, Response } from 'express';
import { db } from '../config/firebase.js';
import { AuthenticatedRequest, verifyToken } from '../middleware/auth.js';
import {
  getMilestonesByQuery,
  submitMilestone,
  initializeRoadMap,
  uploadMiddleware,
  updateMilestoneByCoordinator,
  bulkUpdateMilestoneDueDates,
} from '../controllers/milestoneController.js'
const router = Router();



router.post('/initialize-roadmap', verifyToken, initializeRoadMap)
// GET /api/milestones  — fetch milestones by query params
router.get('/', verifyToken, getMilestonesByQuery);
// GET /api/milestones/:projectId/milestones — fetch milestones for a project (admin view)
router.get('/:projectId/milestones', verifyToken, getMilestonesByQuery);
// POST /api/milestones/:milestoneId/submit — student submits a milestone
router.post('/:milestoneId/submit', verifyToken, uploadMiddleware, submitMilestone)
// PUT /api/milestones/bulk-due-date — coordinator/faculty_admin/administrative_secretary/system_admin
// shifts a due date across every milestone matching a set of projects (+ optional type)
router.put('/bulk-due-date', verifyToken, bulkUpdateMilestoneDueDates)
// PUT /api/milestones/:id — coordinator/faculty_admin/administrative_secretary/system_admin adjusts a milestone's due date
router.put('/:id', verifyToken, updateMilestoneByCoordinator)


export default router;