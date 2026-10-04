import express from 'express';
import {
  setup2FA, verify2FA, login2FA,
  requestTotpRecoveryCode, verifyTotpRecoveryCode,
  requestBiometricSetupCode, verifyBiometricSetupCode, reportBiometricExhaustedAttempt,
} from '../controllers/authController.js';
import { verifyToken } from '../middleware/auth.js';
import { totpLimiter } from '../middleware/rateLimit.js';

const router = express.Router();

router.post('/2fa/setup', verifyToken, setup2FA);
router.post('/2fa/verify', verifyToken, verify2FA);
router.post('/2fa/validate', verifyToken, totpLimiter, login2FA); // called during login step 2
router.post('/2fa/recovery/request', verifyToken, totpLimiter, requestTotpRecoveryCode); // lost-authenticator: step 1, email a code
router.post('/2fa/recovery/verify',  verifyToken, totpLimiter, verifyTotpRecoveryCode);  // lost-authenticator: step 2, issue new QR

// Biometric (Face ID / fingerprint) login setup — same guessable-6-digit-
// code throttling as the 2FA codes above.
router.post('/biometric/request-code', verifyToken, totpLimiter, requestBiometricSetupCode);
router.post('/biometric/verify-code',  verifyToken, totpLimiter, verifyBiometricSetupCode);
router.post('/biometric/report-exhausted', verifyToken, totpLimiter, reportBiometricExhaustedAttempt);

export default router;