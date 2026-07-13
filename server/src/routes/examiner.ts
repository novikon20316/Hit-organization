import { Router } from 'express';
import {
  getExaminerDashboard,
  getList,
  submitDefenseDates,
} from '../controllers/examinerController.js';
import {verifyToken } from '../middleware/auth.js';

const router = Router();


router.get('/dashboard', verifyToken, getExaminerDashboard)
router.get('/get-list', verifyToken, getList)


// Grading goes through POST /api/projects/milestones/:milestoneId/grade
// (submitMilestoneGrade) — the same endpoint the supervisor UI uses.
router.post('/milestones/:milestoneId/defense-dates', verifyToken, submitDefenseDates)


export default router;