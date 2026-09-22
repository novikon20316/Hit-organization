import { Router } from 'express';
import {
  applyApplication,
  withdrawApplication,
  pendingApplication,
  getLastUploadedFiles,
  confirmApplicationStart,
  confirmMeetingSlot
} from '../controllers/applicationController.js';
import {verifyToken } from '../middleware/auth.js';

const router = Router();

router.post('/apply', verifyToken, applyApplication)
router.get('/pending', verifyToken, pendingApplication)
router.get('/last-uploaded-files', verifyToken, getLastUploadedFiles)
router.post('/:id/withdraw', verifyToken, withdrawApplication)
router.post('/:id/confirm-start', verifyToken, confirmApplicationStart)
router.post('/:id/confirm-meeting', verifyToken, confirmMeetingSlot)

export default router;