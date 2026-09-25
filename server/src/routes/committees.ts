import { Router } from 'express';
import {
  listCommittees,
  getMyCommittees,
  listEligibleCommitteeMembers,
  createCommittee,
  updateCommittee,
  getCommitteeConflicts,
  substituteCommitteeMember,
} from '../controllers/committeeController.js';
import { getMyPendingCommitteeReviews } from '../controllers/committeeReviewController.js';
import { getMyPendingChairDecisions } from '../controllers/parallelSignoffController.js';
import { verifyToken } from '../middleware/auth.js';

const router = Router();

// Mounted ahead of the generic '/:id' shape below — fixed paths, never
// mistaken for a committee id.
router.get('/mine', verifyToken, getMyCommittees);
router.get('/mine/pending-reviews', verifyToken, getMyPendingCommitteeReviews);
// See workflowTemplates.ts's preGradeSignoffs — the parallel sibling of
// pending-reviews above, for milestones outside the sequential chain.
router.get('/mine/pending-chair-decisions', verifyToken, getMyPendingChairDecisions);
router.get('/eligible-members', verifyToken, listEligibleCommitteeMembers);
// "Replace Committee Member" — administrative_secretary's conflict-of-
// interest tab. Fixed paths, mounted ahead of the generic '/:id' below.
router.get('/conflicts', verifyToken, getCommitteeConflicts);
router.post('/projects/:projectId/substitute-member', verifyToken, substituteCommitteeMember);
router.get('/', verifyToken, listCommittees);
router.post('/', verifyToken, createCommittee);
router.put('/:id', verifyToken, updateCommittee);

export default router;
