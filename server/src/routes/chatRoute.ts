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
    unblockChatPartner,
    uploadChatImage,
    uploadChatImageMiddleware,
    handleChatImageUploadError,
 } from '../controllers/chatController.js';
import { chatImageUploadLimiter } from '../middleware/rateLimit.js';
import { verifyToken } from '../middleware/auth.js';
import { verifyFileSignatures } from '../services/fileSignature.js';

const router = Router();

// Secure authorization gates
router.get('/:chatId/messages',  verifyToken, getChatMessages )
router.post('/:chatId/messages', verifyToken, sendDirectMessage)
router.post('/upload-image', verifyToken, chatImageUploadLimiter, uploadChatImageMiddleware, handleChatImageUploadError, verifyFileSignatures, uploadChatImage)
router.get('/:chatId/meta',  verifyToken, getChatMeta)
router.get('/candidates',    verifyToken, getChatCandidates);
router.get('/dashboard',     verifyToken, getChatDashboard);
router.post('/',             verifyToken, findOrCreateDirectChat);
router.post('/broadcast',    verifyToken, sendBroadcastNotification);
router.post('/:chatId/read', verifyToken, markChatNotificationsAsRead);
router.post('/:chatId/report', verifyToken, reportChat);
router.post('/:chatId/block',  verifyToken, blockChatPartner);
router.post('/:chatId/unblock', verifyToken, unblockChatPartner);
router.delete('/:chatId',    verifyToken, deleteChat)
export default router;