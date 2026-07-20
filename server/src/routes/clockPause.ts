import { Router } from 'express';
import { verifyToken } from '../middleware/auth.js';
import { getClockPauseState, pauseClock, resumeClock } from '../controllers/clockPauseController.js';

const router = Router();

// GET  /api/projects/:projectId/clock-pause
router.get('/:projectId/clock-pause', verifyToken, getClockPauseState);
// POST /api/projects/:projectId/clock-pause      { reason, note? }
router.post('/:projectId/clock-pause', verifyToken, pauseClock);
// POST /api/projects/:projectId/clock-resume
router.post('/:projectId/clock-resume', verifyToken, resumeClock);

export default router;
