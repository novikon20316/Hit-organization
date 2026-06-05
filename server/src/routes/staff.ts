import { Router } from 'express';
import { verifyToken } from '../middleware/auth.js';
import {
  getDeadLines
} from '../controllers/staffController.js';
const router = Router();

router.get('/deadlines', verifyToken, getDeadLines)

export default router;