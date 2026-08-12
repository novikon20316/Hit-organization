import { Router } from 'express';
import {
  getProjectCoordinatorDashboard, getStudentsReport, getPendingGradeOverrides,
  getCoordinatorStatistics, exportCoordinatorStatistics, updateSupervisorPaymentRates,
} from '../controllers/projectCoordinatorController.js';
import { assignDefense } from '../controllers/coordinatorController.js';
import { verifyToken } from '../middleware/auth.js';

const router = Router();

router.get('/:uid/dashboard', verifyToken, getProjectCoordinatorDashboard);
router.get('/students-report', verifyToken, getStudentsReport);
router.get('/grade-overrides', verifyToken, getPendingGradeOverrides);
router.get('/statistics', verifyToken, getCoordinatorStatistics);
router.get('/statistics/export', verifyToken, exportCoordinatorStatistics);
router.put('/supervisor-payment-rates', verifyToken, updateSupervisorPaymentRates);
router.post('/projects/:projectId/assign-defense', verifyToken, assignDefense);

export default router;
