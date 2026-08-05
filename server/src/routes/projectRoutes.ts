import { Router } from 'express';
import { verifyToken } from '../middleware/auth.js';
import {
  getStudentProject,
  submitStudentMilestone,
  submitMilestoneGrade,
  submitIndividualGrade,
  submitSupervisorEvaluation,
  submitExaminerEvaluation,
  getProjects,
  getActiveProjects
} from '../controllers/projectController.js';
const router = Router();

router.get('/', verifyToken, getProjects)
router.post('/milestones/:milestoneId/grade', verifyToken, submitMilestoneGrade);
router.post('/milestones/:milestoneId/individual-grade', verifyToken, submitIndividualGrade);
// Three-rubric final-grade workflow (defense milestones with a template-
// configured finalGradeComponents — see workflowTemplates.ts).
router.post('/milestones/:milestoneId/supervisor-evaluation', verifyToken, submitSupervisorEvaluation);
router.post('/milestones/:milestoneId/examiner-evaluation', verifyToken, submitExaminerEvaluation);
router.get('/ActiveProjects', verifyToken, getActiveProjects);
// Student Interfaces
router.get('/student/projects/:id', verifyToken, getStudentProject);
router.post('/student/projects/:id/milestones/:milestoneId/submit', verifyToken, submitStudentMilestone);

export default router;