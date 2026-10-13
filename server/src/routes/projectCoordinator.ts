import { Router } from 'express';
import {
  getProjectCoordinatorDashboard, getStudentsReport, sendStudentsMessage, getStudentDetail, getPendingGradeOverrides,
  getCoordinatorStatistics, exportCoordinatorStatistics, updateSupervisorPaymentRates,
} from '../controllers/projectCoordinatorController.js';
import { setStudentThesisEligibility, setStudentThesisAverage, setStudentSpecialization } from '../controllers/studentTrackController.js';
import { assignDefense } from '../controllers/coordinatorController.js';
import { studentsMessageLimiter } from '../middleware/rateLimit.js';
import { verifyToken } from '../middleware/auth.js';

const router = Router();

router.get('/:uid/dashboard', verifyToken, getProjectCoordinatorDashboard);
router.get('/students-report', verifyToken, getStudentsReport);
// POST /api/project-coordinator/students/message   { studentIds, title, message }
router.post('/students/message', verifyToken, studentsMessageLimiter, sendStudentsMessage);
router.get('/students/:studentId/detail', verifyToken, getStudentDetail);
// POST /api/project-coordinator/students/:studentId/thesis-eligibility   { eligible, reason? }
router.post('/students/:studentId/thesis-eligibility', verifyToken, setStudentThesisEligibility);
// POST /api/project-coordinator/students/:studentId/thesis-average   { average }
router.post('/students/:studentId/thesis-average', verifyToken, setStudentThesisAverage);
// POST /api/project-coordinator/students/:studentId/specialization   { specialization: string | null }
router.post('/students/:studentId/specialization', verifyToken, setStudentSpecialization);
router.get('/grade-overrides', verifyToken, getPendingGradeOverrides);
router.get('/statistics', verifyToken, getCoordinatorStatistics);
router.get('/statistics/export', verifyToken, exportCoordinatorStatistics);
router.put('/supervisor-payment-rates', verifyToken, updateSupervisorPaymentRates);
router.post('/projects/:projectId/assign-defense', verifyToken, assignDefense);

export default router;
