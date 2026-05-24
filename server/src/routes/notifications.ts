import { Router, Response } from 'express';
import {
  getNotificationInboxSummary,
  triggerNotificationDispatch,
  getUserNotificationFeed,
  markAllNotificationsAsRead,
  markNotificationRead,
  getNotificationBadgeCount,
} from '../controllers/notificationController.js'
import { verifyToken } from '../middleware/auth.js';

const router = Router();

router.patch('/:notificationId/read', verifyToken, markNotificationRead)
// Dashboard polling counts
router.get('/inbox', verifyToken, getNotificationInboxSummary);
router.get('/badge-count', verifyToken, getNotificationBadgeCount)
router.get('/feed', verifyToken, getUserNotificationFeed);

// Push engine triggers
router.post('/trigger', verifyToken, triggerNotificationDispatch);

// 💡 The missing link! Maps the route to your batch controller function
router.post('/mark-all-read', verifyToken, markAllNotificationsAsRead);

export default router;