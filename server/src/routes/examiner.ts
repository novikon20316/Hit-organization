import { Router } from 'express';
import {
  getExaminerDashboard,
  getList,
  submitDefenseDates,
} from '../controllers/examinerController.js';
import {verifyToken } from '../middleware/auth.js';
import { internalDraft } from '../controllers/formDraftController.js';

const router = Router();


router.get('/dashboard', verifyToken, getExaminerDashboard)
router.get('/get-list', verifyToken, getList)


// Grading goes through POST /api/projects/milestones/:milestoneId/grade
// (submitMilestoneGrade) — the same endpoint the supervisor UI uses.
router.post('/milestones/:milestoneId/defense-dates', verifyToken, submitDefenseDates)

// Unsent form drafts, private to this examiner — see services/formDrafts.ts.
router.get('/drafts/:milestoneId/:formKey', verifyToken, internalDraft.get)
router.put('/drafts/:milestoneId/:formKey', verifyToken, internalDraft.put)
router.delete('/drafts/:milestoneId/:formKey', verifyToken, internalDraft.delete)


export default router;