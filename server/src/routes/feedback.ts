// src/routes/feedback.ts
import { Router } from 'express';
import { verifyToken } from '../middleware/auth.js';
import {
  submitFeedback,
  getMyFeedback,
  getAdminFeedback,
  resolveFeedback,
} from '../controllers/feedbackController.js';

const router = Router();

// GET /api/feedback/admin — system_admin only, must be registered before /:id-style routes
router.get('/admin', verifyToken, getAdminFeedback);
// PATCH /api/feedback/admin/:id/resolve — system_admin only
router.patch('/admin/:id/resolve', verifyToken, resolveFeedback);

// POST /api/feedback — submit a new feedback message (any role but system_admin)
router.post('/', verifyToken, submitFeedback);
// GET /api/feedback — the caller's own feedback history
router.get('/', verifyToken, getMyFeedback);

export default router;
