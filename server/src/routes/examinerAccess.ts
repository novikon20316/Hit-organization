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
} from '../controllers/examinerAccessController.js';
import { examinerAccessLimiter } from '../middleware/rateLimit.js';

const router = Router();

router.use(examinerAccessLimiter);

router.get('/defense/:grantCode', getDefenseAccessStatus);
router.get('/:token/defense-dates', getDefenseDateStatus);
router.post('/:token/defense-dates', submitExternalDefenseDates);

export default router;
