import { Router } from 'express';
import { verifyToken } from '../middleware/auth.js';
import { getStuckLimits, getStuckMilestones, remindStuckMilestone, setStuckLimits } from '../controllers/stuckMilestonesController.js';

const router = Router();

// GET /api/stuck-milestones — stuck milestones in the caller's scope
router.get('/', verifyToken, getStuckMilestones);
// GET/PUT /api/stuck-milestones/limits — per-milestone day limits (system_admin)
router.get('/limits', verifyToken, getStuckLimits);
router.put('/limits', verifyToken, setStuckLimits);
// POST /api/stuck-milestones/:milestoneId/remind — nudge whoever it's waiting on
router.post('/:milestoneId/remind', verifyToken, remindStuckMilestone);

export default router;
