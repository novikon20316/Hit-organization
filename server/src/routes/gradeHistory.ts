import { Router } from 'express';
import { verifyToken } from '../middleware/auth.js';
import { getProjectGradeHistory } from '../controllers/gradeHistoryController.js';

const router = Router();

// GET /api/grades/history/:projectId
router.get('/history/:projectId', verifyToken, getProjectGradeHistory);

export default router;
