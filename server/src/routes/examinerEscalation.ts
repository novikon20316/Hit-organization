import { Router } from 'express';
import { verifyToken } from '../middleware/auth.js';
import { getExaminerEscalations, remindExaminer, promoteNext } from '../controllers/examinerEscalationController.js';

const router = Router();

router.get('/', verifyToken, getExaminerEscalations);
router.post('/:tokenId/remind', verifyToken, remindExaminer);
router.post('/:tokenId/promote-next', verifyToken, promoteNext);

export default router;
