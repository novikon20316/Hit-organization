// src/routes/loginSecurity.ts
//
// PUBLIC router — deliberately NOT gated by verifyToken. A failed login has
// no token to attach; identity/authorization comes from independently
// re-verifying the password (report) or from the one-time incident code
// itself (get/confirm) — see loginSecurityController.ts.
import { Router } from 'express';
import {
  reportFailedLoginAttempt,
  getLoginSecurityIncident,
  confirmLoginSecurityIncident,
} from '../controllers/loginSecurityController.js';
import { loginSecurityLimiter } from '../middleware/rateLimit.js';

const router = Router();

router.use(loginSecurityLimiter);

router.post('/report-failed-login', reportFailedLoginAttempt);
router.get('/login-security/:code', getLoginSecurityIncident);
router.post('/login-security/:code/confirm', confirmLoginSecurityIncident);

export default router;
