import { Router } from 'express';
import { markChatNotificationsAsRead,
    getChatCandidates,
    findOrCreateDirectChat,
    sendBroadcastNotification,
    getChatDashboard,
    getChatMeta,
    deleteChat,
    getChatMessages,
    sendDirectMessage,
    reportChat,
    blockChatPartner,
    uploadChatImage,
    uploadChatImageMiddleware,
    handleChatImageUploadError,
 } from '../controllers/chatController.js';
import { verifyToken } from '../middleware/auth.js';

const router = Router();

// Secure authorization gates
router.get('/:chatId/messages',  verifyToken, getChatMessages )
router.post('/:chatId/messages', verifyToken, sendDirectMessage)
router.post('/upload-image', verifyToken, uploadChatImageMiddleware, handleChatImageUploadError, uploadChatImage)
router.get('/:chatId/meta',  verifyToken, getChatMeta)
router.get('/candidates',    verifyToken, getChatCandidates);
router.get('/dashboard',     verifyToken, getChatDashboard);
router.post('/',             verifyToken, findOrCreateDirectChat);
router.post('/broadcast',    verifyToken, sendBroadcastNotification);
router.post('/:chatId/read', verifyToken, markChatNotificationsAsRead);
router.post('/:chatId/report', verifyToken, reportChat);
router.post('/:chatId/block',  verifyToken, blockChatPartner);
router.delete('/:chatId',    verifyToken, deleteChat)
export default router;