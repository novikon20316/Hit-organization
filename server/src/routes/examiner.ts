import { Router } from 'express';
import {
  getExaminerDashboard,
  updateGrading,
  getList,
  submitDefenseDates,
} from '../controllers/examinerController.js';
import {verifyToken } from '../middleware/auth.js';

const router = Router();


router.get('/dashboard', verifyToken, getExaminerDashboard)
router.get('/get-list', verifyToken, getList)


router.post('/milestones/:id/grade', verifyToken, updateGrading)
router.post('/milestones/:milestoneId/defense-dates', verifyToken, submitDefenseDates)


export default router;