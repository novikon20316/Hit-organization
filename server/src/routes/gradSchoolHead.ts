import { Router } from 'express';
import {
  getGradSchoolHeadDashboard,
  approveFinalGrade,
  revertFinalGradeApproval,
  approveExaminerRecommendationFinal,
  rejectExaminerRecommendationFinal,
} from '../controllers/gradSchoolHeadController.js';
import { verifyToken } from '../middleware/auth.js';

const router = Router();

router.get('/:uid/dashboard', verifyToken, getGradSchoolHeadDashboard);
router.post('/milestones/:id/approve-grade', verifyToken, approveFinalGrade);
router.post('/milestones/:id/unlock-grade', verifyToken, revertFinalGradeApproval);
router.post('/examiner-recommendations/:id/approve', verifyToken, approveExaminerRecommendationFinal);
router.post('/examiner-recommendations/:id/reject', verifyToken, rejectExaminerRecommendationFinal);

export default router;
