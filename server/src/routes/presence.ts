// src/routes/presence.ts

import { Router } from 'express';
import { verifyToken } from '../middleware/auth.js';
import { heartbeat } from '../controllers/presenceController.js';

const router = Router();

router.post('/heartbeat', verifyToken, heartbeat);

export default router;
