import { Router } from 'express';
import { verifyToken } from '../middleware/auth.js';
import { changeTrack } from '../controllers/trackChangeController.js';

const router = Router();

// POST /api/projects/:projectId/track-change   { newTrack: 'thesis'|'project', reason? }
router.post('/:projectId/track-change', verifyToken, changeTrack);

export default router;
