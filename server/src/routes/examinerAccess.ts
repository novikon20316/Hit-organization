// src/routes/examinerAccess.ts
//
// PUBLIC router — deliberately NOT gated by verifyToken. External examiners
// have no Firebase Auth account; identity is derived server-side from the
// token/grant code itself (see examinerAccessController.ts).
import { Router } from 'express';
import {
  getDefenseDateStatus,
  submitExternalDefenseDates,
  getDefenseAccessStatus,
  requestOtp,
  verifyOtp,
  submitExternalExaminerEvaluation,
} from '../controllers/examinerAccessController.js';
import {
  getOnboardingStatus,
  submitExaminerIdentity,
  submitExaminerBankDetails,
  submitExaminerTaxDocument,
  submitExaminerEvaluationDocument,
  onboardingUploadMiddleware,
  handleOnboardingUploadError,
} from '../controllers/examinerOnboardingController.js';
import { examinerAccessLimiter } from '../middleware/rateLimit.js';

const router = Router();

router.use(examinerAccessLimiter);

router.post('/:token/request-otp', requestOtp);
router.post('/:token/verify-otp', verifyOtp);
router.get('/defense/:grantCode', getDefenseAccessStatus);
router.get('/:token/defense-dates', getDefenseDateStatus);
router.post('/:token/defense-dates', submitExternalDefenseDates);
router.post('/:token/examiner-evaluation', submitExternalExaminerEvaluation);

// One-time (per examiner identity) onboarding — see examinerOnboardingController.ts.
router.get('/:token/onboarding-status', getOnboardingStatus);
router.post('/:token/onboarding/identity', submitExaminerIdentity);
router.post('/:token/onboarding/bank-details', submitExaminerBankDetails);
router.post('/:token/onboarding/tax-document', onboardingUploadMiddleware, handleOnboardingUploadError, submitExaminerTaxDocument);
router.post('/:token/onboarding/evaluation-document', onboardingUploadMiddleware, handleOnboardingUploadError, submitExaminerEvaluationDocument);

export default router;
