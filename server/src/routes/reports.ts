import { Router } from 'express';
import { getReport, exportReport } from '../controllers/reportsController.js';
import { verifyToken } from '../middleware/auth.js';

const router = Router();

router.get('/:reportType', verifyToken, getReport);
router.get('/:reportType/export', verifyToken, exportReport);

export default router;
