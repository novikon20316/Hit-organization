import { Router } from 'express';
import { reportClientError, resolveErrorReportHandler, getErrorReportDetailHandler, aiAnalyzeErrorReportHandler } from '../controllers/systemErrorController.js';
import { verifyToken } from '../middleware/auth.js';
import { errorReportLimiter } from '../middleware/rateLimit.js';

const router = Router();

// PUBLIC — no verifyToken. See systemErrorController.ts's reportClientError
// for why (a crash can happen before login or because of a broken token).
router.post('/system/report-error', errorReportLimiter, reportClientError);
router.patch('/admin/system/error-reports/:id/resolve', verifyToken, resolveErrorReportHandler);
router.get('/admin/system/error-reports/:id', verifyToken, getErrorReportDetailHandler);
router.post('/admin/system/error-reports/:id/ai-analysis', verifyToken, aiAnalyzeErrorReportHandler);

export default router;
