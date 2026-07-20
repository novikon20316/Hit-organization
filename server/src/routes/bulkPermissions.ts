import { Router } from 'express';
import { applyPermissionsToRole, getUsersByRole } from '../controllers/bulkPermissionsController.js';
import { verifyToken } from '../middleware/auth.js';

const router = Router();

router.get('/users-by-role', verifyToken, getUsersByRole);
router.post('/apply-to-role', verifyToken, applyPermissionsToRole);

export default router;
