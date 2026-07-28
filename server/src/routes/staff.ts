import { Router } from 'express';
import { verifyToken } from '../middleware/auth.js';
import {
  getDeadLines,
  getMyPendingSignoffs
} from '../controllers/staffController.js';
const router = Router();

router.get('/:id/deadlines', verifyToken, getDeadLines)
router.get('/pending-signoffs', verifyToken, getMyPendingSignoffs)

export default router;