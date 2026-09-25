import { Router } from 'express';
import { getSchoolHeadDashboard } from '../controllers/schoolHeadController.js';
// The actual approve/reject/unlock actions already resolve their required
// signoff role generically (resolveStaffForScope/hasActionGrant — see
// scopeAuthorization.ts), so they're reused as-is from
// gradSchoolHeadController.ts rather than duplicated here. A school_head who
// is the configured finalGradeSignoffRole/examinerSignoffRole for a workflow
// template is authorized by these same functions.
import {
  approveFinalGrade,
  revertFinalGradeApproval,
  rejectFinalGrade,
  decideGradeOverride,
  approveExaminerRecommendationFinal,
  rejectExaminerRecommendationFinal,
} from '../controllers/gradSchoolHeadController.js';
import { verifyToken } from '../middleware/auth.js';

const router = Router();

router.get('/:uid/dashboard', verifyToken, getSchoolHeadDashboard);
router.post('/milestones/:id/approve-grade', verifyToken, approveFinalGrade);
router.post('/milestones/:id/unlock-grade', verifyToken, revertFinalGradeApproval);
router.post('/milestones/:id/reject-grade', verifyToken, rejectFinalGrade);
router.post('/milestones/:id/grade-override-decision', verifyToken, decideGradeOverride);
router.post('/examiner-recommendations/:id/approve', verifyToken, approveExaminerRecommendationFinal);
router.post('/examiner-recommendations/:id/reject', verifyToken, rejectExaminerRecommendationFinal);

export default router;
