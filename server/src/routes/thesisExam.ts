// src/routes/thesisExam.ts — CS M.Sc. thesis exam (services/thesisExam.ts).
// Outside examiners use the token routes in routes/examinerAccess.ts.
import { Router } from 'express';
import { verifyToken } from '../middleware/auth.js';
import {
  getMyThesisExams,
  getThesisExamOverview,
  getExaminerCandidates,
  nominateExaminers,
  decideExaminerNomination,
  submitMyAvailability,
  enterLateDates,
  decideExamDate,
  setExamDateByCoordinator,
  getExamForm,
  submitMyExamForm,
  submitMySupervisorExamGrade,
} from '../controllers/thesisExamController.js';

const router = Router();

router.get('/mine', verifyToken, getMyThesisExams);
router.get('/:milestoneId/overview', verifyToken, getThesisExamOverview);
router.get('/:milestoneId/examiner-candidates', verifyToken, getExaminerCandidates);
router.post('/:milestoneId/nominate', verifyToken, nominateExaminers);
router.post('/:milestoneId/nomination-decision', verifyToken, decideExaminerNomination);
router.post('/:milestoneId/availability', verifyToken, submitMyAvailability);
router.post('/:milestoneId/late-entry', verifyToken, enterLateDates);
router.post('/:milestoneId/date-decision', verifyToken, decideExamDate);
router.post('/:milestoneId/coordinator-date', verifyToken, setExamDateByCoordinator);
router.get('/:milestoneId/form', verifyToken, getExamForm);
router.post('/:milestoneId/form', verifyToken, submitMyExamForm);
router.post('/:milestoneId/supervisor-grade', verifyToken, submitMySupervisorExamGrade);

export default router;
