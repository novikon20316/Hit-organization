// src/controllers/revisionDecisionController.ts
//
// HTTP surface for the post-opinion revision-round decision (P1 #13) — see
// services/revisionDecisions.ts for the actual state transitions.

import { Response } from 'express';
import { db } from '../config/firebase.js';
import { AuthenticatedRequest, hasAnyRole } from '../middleware/auth.js';
import { recordRevisionDecision, isValidRevisionDecision } from '../services/revisionDecisions.js';
import { hasActionGrant, withinCoordinatorScope, resolveMilestoneScope } from '../services/scopeAuthorization.js';

const COORDINATOR_TIER_ROLES = ['coordinator', 'faculty_admin', 'administrative_secretary', 'system_admin'];

/**
 * GET /api/milestones/:milestoneId/examiner-opinions
 * Read-only — external-examiner opinions (examinerTokens) tied to this
 * milestone, for the decision UI to display before the advisor/coordinator
 * picks an outcome. Same access as the decision endpoint below.
 */
export const getExaminerOpinions = async (req: AuthenticatedRequest, res: Response) => {
  const { milestoneId } = req.params;
  if (!req.user) return res.status(401).json({ message: 'Unauthorized.' });
  if (!milestoneId || typeof milestoneId !== 'string') return res.status(400).json({ message: 'Missing milestoneId.' });

  try {
    const milestoneSnap = await db.collection('milestones').doc(milestoneId).get();
    if (!milestoneSnap.exists) return res.status(404).json({ message: 'Milestone not found.' });
    const milestone = milestoneSnap.data()!;

    const isOwnAdvisee = milestone.supervisorId === req.user.uid;
    if (!isOwnAdvisee && !hasAnyRole(req.user, COORDINATOR_TIER_ROLES)) {
      return res.status(403).json({ message: 'Forbidden.' });
    }

    const tokensSnap = await db.collection('examinerTokens').where('milestoneId', '==', milestoneId).get();
    const opinions = tokensSnap.docs.map((doc) => {
      const t = doc.data();
      return {
        tokenId: doc.id,
        examinerName: t.examinerName ?? '',
        status: t.status,
        opinion: t.opinion ?? null,
        submittedAt: t.submittedAt ?? null,
      };
    });

    return res.status(200).json({
      opinions,
      allSubmitted: opinions.length > 0 && opinions.every((o) => o.status === 'submitted'),
      revisionDecisions: milestone.revisionDecisions ?? [],
    });
  } catch (error: any) {
    console.error('getExaminerOpinions error:', error);
    return res.status(500).json({ message: 'Failed to load examiner opinions.' });
  }
};

/**
 * POST /api/milestones/:milestoneId/revision-decision
 * Body: { decision: 'proceed_to_defense' | 'require_corrections' | 're_judge' | 'add_examiner', note?: string }
 * Allowed for the milestone's own supervisor (advisor), or any coordinator-
 * tier role within scope.
 */
export const submitRevisionDecision = async (req: AuthenticatedRequest, res: Response) => {
  const { milestoneId } = req.params;
  const { decision, note } = req.body;
  if (!req.user) return res.status(401).json({ message: 'Unauthorized.' });
  if (!milestoneId || typeof milestoneId !== 'string') return res.status(400).json({ message: 'Missing milestoneId.' });
  if (!isValidRevisionDecision(decision)) {
    return res.status(400).json({ message: 'decision must be one of proceed_to_defense, require_corrections, re_judge, add_examiner.' });
  }

  try {
    const milestoneSnap = await db.collection('milestones').doc(milestoneId).get();
    if (!milestoneSnap.exists) return res.status(404).json({ message: 'Milestone not found.' });
    const milestone = milestoneSnap.data()!;

    const isOwnAdvisee = milestone.supervisorId === req.user.uid;
    const isCoordinatorTier = hasAnyRole(req.user, COORDINATOR_TIER_ROLES);

    if (!isOwnAdvisee) {
      if (!isCoordinatorTier) {
        return res.status(403).json({ message: 'Only the advisor or a coordinator-tier role may record this decision.' });
      }
      const scope = await resolveMilestoneScope(milestoneId);
      if (!scope) return res.status(404).json({ message: 'Milestone not found.' });
      if (!withinCoordinatorScope(req.user, scope) && !hasActionGrant(req.user, 'approve_milestones', scope)) {
        return res.status(403).json({ message: 'This milestone is outside your assigned scope.' });
      }
    }

    if (decision === 'require_corrections' && (!note || typeof note !== 'string' || !note.trim())) {
      return res.status(400).json({ message: 'A note explaining the required corrections is recommended — please add one.' });
    }

    const result = await recordRevisionDecision(milestoneId, decision, typeof note === 'string' ? note : undefined, req.user.uid, req.user.role);
    return res.status(200).json({ success: true, ...result });
  } catch (error: any) {
    console.error('submitRevisionDecision error:', error);
    return res.status(500).json({ message: error.message || 'Failed to record the revision decision.' });
  }
};
