import { Router } from 'express';
import {
  getProjectCoordinatorDashboard, getStudentsReport, sendStudentsMessage, getStudentDetail, getPendingGradeOverrides,
  getCoordinatorStatistics, exportCoordinatorStatistics, updateSupervisorPaymentRates,
} from '../controllers/projectCoordinatorController.js';
import { setStudentThesisEligibility, setStudentThesisAverage, setStudentSpecialization, setStudentCompletedCourses } from '../controllers/studentTrackController.js';
import { assignDefense, getDefenseZoomStartUrl, getDefenseConfig } from '../controllers/coordinatorController.js';
import { studentsMessageLimiter } from '../middleware/rateLimit.js';
import { revokeStudentFinalReportLinks } from '../controllers/finalReportController.js';
import { verifyToken } from '../middleware/auth.js';

const router = Router();

router.get('/:uid/dashboard', verifyToken, getProjectCoordinatorDashboard);
router.get('/students-report', verifyToken, getStudentsReport);
// POST /api/project-coordinator/students/message   { studentIds, title, message }
router.post('/students/message', verifyToken, studentsMessageLimiter, sendStudentsMessage);
router.get('/students/:studentId/detail', verifyToken, getStudentDetail);
// POST /api/project-coordinator/students/:studentId/final-report/revoke
router.post('/students/:studentId/final-report/revoke', verifyToken, revokeStudentFinalReportLinks);
// POST /api/project-coordinator/students/:studentId/thesis-eligibility   { eligible, reason? }
router.post('/students/:studentId/thesis-eligibility', verifyToken, setStudentThesisEligibility);
// POST /api/project-coordinator/students/:studentId/thesis-average   { average }
router.post('/students/:studentId/thesis-average', verifyToken, setStudentThesisAverage);
// POST /api/project-coordinator/students/:studentId/specialization   { specialization: string | null }
router.post('/students/:studentId/specialization', verifyToken, setStudentSpecialization);
// PUT /api/project-coordinator/students/:studentId/completed-courses   { completedCourses: { subject, grade }[] }
router.put('/students/:studentId/completed-courses', verifyToken, setStudentCompletedCourses);
router.get('/grade-overrides', verifyToken, getPendingGradeOverrides);
router.get('/statistics', verifyToken, getCoordinatorStatistics);
router.get('/statistics/export', verifyToken, exportCoordinatorStatistics);
router.put('/supervisor-payment-rates', verifyToken, updateSupervisorPaymentRates);
router.post('/projects/:projectId/assign-defense', verifyToken, assignDefense);
router.get('/milestones/:milestoneId/zoom-start-url', verifyToken, getDefenseZoomStartUrl);
router.get('/defense-config', verifyToken, getDefenseConfig);

export default router;
