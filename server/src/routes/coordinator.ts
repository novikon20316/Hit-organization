import { Router } from 'express';
import { 
  assignExaminers,
  getCoordinatorDashboard,
  coordinatorApproveMilestone,
  coordinatorRejectMilestone,
  assignDefense,
} from '../controllers/coordinatorController.js';
import {verifyToken } from '../middleware/auth.js';

const router = Router();

router.get('/dashboard', verifyToken, getCoordinatorDashboard)
router.post('/projects/:projectId/assign-examiners', verifyToken, assignExaminers)
router.post('/:milestoneId/approve', verifyToken, coordinatorApproveMilestone)
router.post('/:milestoneId/reject', verifyToken, coordinatorRejectMilestone)
router.post('/projects/:projectId/assign-defense', verifyToken, assignDefense)
router.post('/projects/:projectId/progress', verifyToken, assignDefense) // TODO: wire to correct controller


export default router;