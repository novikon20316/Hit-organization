import { Router, Response } from 'express';
import { db } from '../config/firebase.js';
import { AuthenticatedRequest, verifyToken } from '../middleware/auth.js';
import {
  getMilestonesByQuery,
  submitMilestone,
  initializeRoadMap,
  uploadMiddleware,
} from '../controllers/milestoneController.js'
const router = Router();



router.post('/initialize-roadmap', verifyToken, initializeRoadMap)
// GET /api/milestones  — fetch milestones by query params
router.get('/', verifyToken, getMilestonesByQuery);
// GET /api/milestones/:projectId/milestones — fetch milestones for a project (admin view)
router.get('/:projectId/milestones', verifyToken, getMilestonesByQuery);
// POST /api/milestones/submit — student submits a milestone (no ID in path)
router.post('/:milestoneId/submit', verifyToken, uploadMiddleware, submitMilestone)
// POST /api/milestones/:id/submit — student submits a specific milestone by ID
router.post('/:id/submit', verifyToken, submitMilestone)
// PUT /api/milestones/:id — update a milestone
router.put('/:id', verifyToken, submitMilestone) // TODO: wire to correct update controller


export default router;