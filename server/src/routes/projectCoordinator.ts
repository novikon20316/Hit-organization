import { Router } from 'express';
import { getProjectCoordinatorDashboard } from '../controllers/projectCoordinatorController.js';
import { assignDefense } from '../controllers/coordinatorController.js';
import { verifyToken } from '../middleware/auth.js';

const router = Router();

router.get('/:uid/dashboard', verifyToken, getProjectCoordinatorDashboard);
router.post('/projects/:projectId/assign-defense', verifyToken, assignDefense);

export default router;
