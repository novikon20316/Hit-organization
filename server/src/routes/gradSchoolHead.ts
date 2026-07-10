import { Router } from 'express';
import { getGradSchoolHeadDashboard } from '../controllers/gradSchoolHeadController.js';
import { verifyToken } from '../middleware/auth.js';

const router = Router();

router.get('/:uid/dashboard', verifyToken, getGradSchoolHeadDashboard);

export default router;
