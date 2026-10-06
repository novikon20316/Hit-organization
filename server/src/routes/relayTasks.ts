import { Router } from 'express';
import { verifyToken } from '../middleware/auth.js';
import { getMyRelayTasks, resolveRelayTask } from '../controllers/relayTaskController.js';

const router = Router();

// GET /api/relay-tasks/mine — the caller's own open relay tasks
router.get('/mine', verifyToken, getMyRelayTasks);
// POST /api/relay-tasks/:id/resolve — caller confirms they've relayed the decision to the student
router.post('/:id/resolve', verifyToken, resolveRelayTask);

export default router;
