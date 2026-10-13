// src/routes/finalReport.ts
//
// PUBLIC router — deliberately NOT gated by verifyToken. The view-only final
// report link carries its own token; see services/finalReport.ts.
import { Router } from 'express';
import { getFinalReport } from '../controllers/finalReportController.js';
import { finalReportLimiter } from '../middleware/rateLimit.js';

const router = Router();

router.use(finalReportLimiter);
router.get('/:token', getFinalReport);

export default router;
