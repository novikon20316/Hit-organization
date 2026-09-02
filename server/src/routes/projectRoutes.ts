import { Router } from 'express';
import { verifyToken } from '../middleware/auth.js';
import { uploadMiddleware } from '../controllers/milestoneController.js';
import {
  getStudentProject,
  submitStudentMilestone,
  submitMilestoneGrade,
  submitIndividualGrade,
  submitSupervisorEvaluation,
  submitExaminerEvaluation,
  submitExaminerFormAnswers,
  getProjects,
  getActiveProjects
} from '../controllers/projectController.js';
const router = Router();

router.get('/', verifyToken, getProjects)
router.post('/milestones/:milestoneId/grade', verifyToken, submitMilestoneGrade);
router.post('/milestones/:milestoneId/individual-grade', verifyToken, submitIndividualGrade);
// Three-rubric final-grade workflow (defense milestones with a template-
// configured finalGradeComponents — see workflowTemplates.ts). uploadMiddleware
// is a no-op for a plain JSON body (no file attached) — see submitStaffRecord's
// identical precedent — so this doesn't change behavior for callers that never
// attach a file.
router.post('/milestones/:milestoneId/supervisor-evaluation', verifyToken, uploadMiddleware, submitSupervisorEvaluation);
router.post('/milestones/:milestoneId/examiner-evaluation', verifyToken, uploadMiddleware, submitExaminerEvaluation);
// Non-scored examiner Q&A (see workflowTemplates.ts's examinerFormFields) —
// e.g. the Industrial Engineering & Management "Presentation 1" yes/no form.
router.post('/milestones/:milestoneId/examiner-form', verifyToken, submitExaminerFormAnswers);
router.get('/ActiveProjects', verifyToken, getActiveProjects);
// Student Interfaces
router.get('/student/projects/:id', verifyToken, getStudentProject);
router.post('/student/projects/:id/milestones/:milestoneId/submit', verifyToken, submitStudentMilestone);

export default router;