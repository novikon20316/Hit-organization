import { Router } from 'express';
import { verifyToken } from '../middleware/auth.js';
import { getPendingExceptionalActions, decideExceptionalActionRequest } from '../controllers/exceptionalActionController.js';

const router = Router();

// GET  /api/exceptional-actions/pending
router.get('/pending', verifyToken, getPendingExceptionalActions);
// POST /api/exceptional-actions/:id/decide   { decision: 'approved'|'rejected', reason? }
router.post('/:id/decide', verifyToken, decideExceptionalActionRequest);

export default router;
