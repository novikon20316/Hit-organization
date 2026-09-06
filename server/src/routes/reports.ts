import { Router } from 'express';
import { getReport, exportReport, getReportProjects } from '../controllers/reportsController.js';
import { verifyToken } from '../middleware/auth.js';

const router = Router();

// Must come before the '/:reportType' route below — otherwise Express would
// match '/projects' as reportType="projects" instead of this dedicated route.
router.get('/projects', verifyToken, getReportProjects);
router.get('/:reportType', verifyToken, getReport);
router.get('/:reportType/export', verifyToken, exportReport);

export default router;
