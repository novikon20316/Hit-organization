import { Router } from 'express';
import { 
  getExaminerDashboard,
  updateGrading
} from '../controllers/examinerController.js';
import {verifyToken } from '../middleware/auth.js';

const router = Router();


router.get('/dashboard', verifyToken, getExaminerDashboard)
router.post('/milestones/:id/grade', verifyToken, updateGrading)


export default router;