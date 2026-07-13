import { Router } from 'express';
import { getGradSchoolHeadDashboard, approveFinalGrade } from '../controllers/gradSchoolHeadController.js';
import { verifyToken } from '../middleware/auth.js';

const router = Router();

router.get('/:uid/dashboard', verifyToken, getGradSchoolHeadDashboard);
router.post('/milestones/:id/approve-grade', verifyToken, approveFinalGrade);

export default router;
