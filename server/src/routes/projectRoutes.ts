import { Router } from 'express';
import { verifyToken } from '../middleware/auth.js';
import {
  getStudentProject,
  submitStudentMilestone,
  submitMilestoneGrade,
  submitIndividualGrade,
  getProjects,
  getActiveProjects
} from '../controllers/projectController.js';
const router = Router();

router.get('/', verifyToken, getProjects)
router.post('/milestones/:milestoneId/grade', verifyToken, submitMilestoneGrade);
router.post('/milestones/:milestoneId/individual-grade', verifyToken, submitIndividualGrade);
router.get('/ActiveProjects', verifyToken, getActiveProjects);
// Student Interfaces
router.get('/student/projects/:id', verifyToken, getStudentProject);
router.post('/student/projects/:id/milestones/:milestoneId/submit', verifyToken, submitStudentMilestone);

export default router;