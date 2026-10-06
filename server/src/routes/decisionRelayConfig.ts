import { Router } from 'express';
import { verifyToken } from '../middleware/auth.js';
import { getDecisionRelayConfig, updateDecisionRelayConfig } from '../controllers/decisionRelayConfigController.js';

const router = Router();

router.get('/', verifyToken, getDecisionRelayConfig);
router.post('/', verifyToken, updateDecisionRelayConfig);

export default router;
