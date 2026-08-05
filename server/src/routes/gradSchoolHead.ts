import { Router } from 'express';
import {
  getGradSchoolHeadDashboard,
  approveFinalGrade,
  revertFinalGradeApproval,
  rejectFinalGrade,
  decideGradeOverride,
  approveExaminerRecommendationFinal,
  rejectExaminerRecommendationFinal,
} from '../controllers/gradSchoolHeadController.js';
import { verifyToken } from '../middleware/auth.js';

const router = Router();

router.get('/:uid/dashboard', verifyToken, getGradSchoolHeadDashboard);
router.post('/milestones/:id/approve-grade', verifyToken, approveFinalGrade);
router.post('/milestones/:id/unlock-grade', verifyToken, revertFinalGradeApproval);
router.post('/milestones/:id/reject-grade', verifyToken, rejectFinalGrade);
// Three-rubric final-grade workflow (defense milestones with a template-
// configured finalGradeComponents) — see supervisorController.ts's
// decideFinalGrade for the supervisor-side half of this flow.
router.post('/milestones/:id/grade-override-decision', verifyToken, decideGradeOverride);
router.post('/examiner-recommendations/:id/approve', verifyToken, approveExaminerRecommendationFinal);
router.post('/examiner-recommendations/:id/reject', verifyToken, rejectExaminerRecommendationFinal);

export default router;
