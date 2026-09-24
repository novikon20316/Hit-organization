import { Router } from 'express';
import { reportClientError, resolveErrorReportHandler } from '../controllers/systemErrorController.js';
import { verifyToken } from '../middleware/auth.js';
import { errorReportLimiter } from '../middleware/rateLimit.js';

const router = Router();

// PUBLIC — no verifyToken. See systemErrorController.ts's reportClientError
// for why (a crash can happen before login or because of a broken token).
router.post('/system/report-error', errorReportLimiter, reportClientError);
router.patch('/admin/system/error-reports/:id/resolve', verifyToken, resolveErrorReportHandler);

export default router;
