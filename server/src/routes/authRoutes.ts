import express from 'express';
import { setup2FA, verify2FA, login2FA } from '../controllers/authController.js';
import { verifyToken } from '../middleware/auth.js';

const router = express.Router();

router.post('/2fa/setup', verifyToken, setup2FA);
router.post('/2fa/verify', verifyToken, verify2FA);
router.post('/2fa/validate', verifyToken, login2FA); // called during login step 2

export default router;