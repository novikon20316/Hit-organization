import { Router } from 'express';
import { markChatNotificationsAsRead,
    getChatCandidates,
    findOrCreateDirectChat,
    sendBroadcastNotification,
    getChatDashboard,
    getChatMeta,
    deleteChat,
 } from '../controllers/chatController.js';
import { authenticateUser } from '../middleware/auth.js';

const router = Router();

// Secure authorization gates
router.get('/:chatId/meta', authenticateUser, getChatMeta)
router.get('/candidates',    authenticateUser, getChatCandidates);
router.get('/dashboard',     authenticateUser, getChatDashboard);
router.post('/',             authenticateUser, findOrCreateDirectChat);
router.post('/broadcast',    authenticateUser, sendBroadcastNotification);
router.post('/:chatId/read', authenticateUser, markChatNotificationsAsRead);
router.delete('/:chatId',    authenticateUser, deleteChat)
export default router;