// src/routes/assistant.ts
import { Router } from 'express';
import { verifyToken } from '../middleware/auth.js';
import { assistantLimiter } from '../middleware/rateLimit.js';
import { askAssistantHandler } from '../controllers/assistantController.js';

const router = Router();

// POST /api/assistant/ask — help-assistant answer from the caller's role manual
router.post('/ask', verifyToken, assistantLimiter, askAssistantHandler);

export default router;
