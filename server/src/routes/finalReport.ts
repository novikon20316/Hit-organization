// src/routes/finalReport.ts
//
// PUBLIC router — deliberately NOT gated by verifyToken. The view-only final
// report link carries its own token; see services/finalReport.ts. POST with
// the token in the body (not GET /:token) so it never appears in a URL or in
// request logs.
import { Router } from 'express';
import { getFinalReport } from '../controllers/finalReportController.js';
import { finalReportLimiter } from '../middleware/rateLimit.js';

const router = Router();

router.use(finalReportLimiter);
router.post('/', getFinalReport);

export default router;
