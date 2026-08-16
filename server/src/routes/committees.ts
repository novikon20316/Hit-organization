import { Router } from 'express';
import {
  listCommittees,
  getMyCommittees,
  listEligibleCommitteeMembers,
  createCommittee,
  updateCommittee,
} from '../controllers/committeeController.js';
import { getMyPendingCommitteeReviews } from '../controllers/committeeReviewController.js';
import { verifyToken } from '../middleware/auth.js';

const router = Router();

// Mounted ahead of the generic '/:id' shape below — fixed paths, never
// mistaken for a committee id.
router.get('/mine', verifyToken, getMyCommittees);
router.get('/mine/pending-reviews', verifyToken, getMyPendingCommitteeReviews);
router.get('/eligible-members', verifyToken, listEligibleCommitteeMembers);
router.get('/', verifyToken, listCommittees);
router.post('/', verifyToken, createCommittee);
router.put('/:id', verifyToken, updateCommittee);

export default router;
