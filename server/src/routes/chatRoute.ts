import { Router } from 'express';
import { markChatNotificationsAsRead,
    getChatCandidates,
    findOrCreateDirectChat,
    sendBroadcastNotification,
    getChatDashboard,
    getChatMeta,
    deleteChat,
    getChatMessages 
 } from '../controllers/chatController.js';
import { verifyToken } from '../middleware/auth.js';

const router = Router();

// Secure authorization gates
router.get('/:chatId/messages', verifyToken, getChatMessages )
router.get('/:chatId/meta',  verifyToken, getChatMeta)
router.get('/candidates',    verifyToken, getChatCandidates);
router.get('/dashboard',     verifyToken, getChatDashboard);
router.post('/',             verifyToken, findOrCreateDirectChat);
router.post('/broadcast',    verifyToken, sendBroadcastNotification);
router.post('/:chatId/read', verifyToken, markChatNotificationsAsRead);
router.delete('/:chatId',    verifyToken, deleteChat)
export default router;