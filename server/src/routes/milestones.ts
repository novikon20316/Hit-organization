import { Router, Response } from 'express';
import { db } from '../config/firebase.js';
import { AuthenticatedRequest, verifyToken } from '../middleware/auth.js';
import {
  getMilestonesByQuery,
  submitMilestone,
  uploadMiddleware,
  updateMilestoneByCoordinator,
  bulkUpdateMilestoneDueDates,
} from '../controllers/milestoneController.js'
import { submitRevisionDecision, getExaminerOpinions } from '../controllers/revisionDecisionController.js';
const router = Router();

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
// GET /api/milestones/:milestoneId/examiner-opinions — read-only, feeds the decision UI
router.get('/:milestoneId/examiner-opinions', verifyToken, getExaminerOpinions)
// POST /api/milestones/:milestoneId/revision-decision — advisor/coordinator decides
// proceed_to_defense/require_corrections/re_judge/add_examiner after examiner opinions are in
router.post('/:milestoneId/revision-decision', verifyToken, submitRevisionDecision)


export default router;