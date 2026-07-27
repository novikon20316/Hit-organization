import { Router } from 'express';
import { getMyGrants } from '../controllers/permissionsController.js';
import { verifyToken } from '../middleware/auth.js';

const router = Router();

router.get('/my-grants', verifyToken, getMyGrants);

export default router;
