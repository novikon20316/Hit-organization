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
import { examinerAccessLimiter } from '../middleware/rateLimit.js';

const router = Router();

router.use(examinerAccessLimiter);

router.post('/:token/request-otp', requestOtp);
router.post('/:token/verify-otp', verifyOtp);
router.get('/defense/:grantCode', getDefenseAccessStatus);
router.get('/:token/defense-dates', getDefenseDateStatus);
router.post('/:token/defense-dates', submitExternalDefenseDates);
router.post('/:token/examiner-evaluation', submitExternalExaminerEvaluation);

export default router;
