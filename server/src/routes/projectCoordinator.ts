import { Router } from 'express';
import { getProjectCoordinatorDashboard, getStudentsReport, getPendingGradeOverrides } from '../controllers/projectCoordinatorController.js';
import { assignDefense } from '../controllers/coordinatorController.js';
import { verifyToken } from '../middleware/auth.js';

const router = Router();

router.get('/:uid/dashboard', verifyToken, getProjectCoordinatorDashboard);
router.get('/students-report', verifyToken, getStudentsReport);
router.get('/grade-overrides', verifyToken, getPendingGradeOverrides);
router.post('/projects/:projectId/assign-defense', verifyToken, assignDefense);

export default router;
