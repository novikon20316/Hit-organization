import { Router } from 'express';
import { getProgramHeadDashboard } from '../controllers/programHeadController.js';
import { verifyToken } from '../middleware/auth.js';

const router = Router();

router.get('/:uid/dashboard', verifyToken, getProgramHeadDashboard);

export default router;
