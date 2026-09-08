// src/controllers/parallelSignoffController.ts
//
// The two one-shot actions unlocked by WorkflowMilestoneSpec.preGradeSignoffs
// (see workflowTemplates.ts's doc comment and services/parallelSignoffs.ts's
// onMilestoneNeedsParallelSignoffs, which notifies these actors the instant
// the student submits). Deliberately separate from
// committeeReviewController.ts / the generic chain engine
// (coordinatorController.ts's approveChainMilestone) — neither of those reads
// or writes `routing`/`currentStageIndex` at all; this is a parallel
// side-channel, not a chain stage.

import { Response } from 'express';
import admin from 'firebase-admin';
import { db } from '../config/firebase.js';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { notifyUser } from '../services/notify.js';
import { logAuditEvent } from '../services/auditLog.js';
import { resolveCommitteeForProject } from './committeeController.js';

/** POST /api/milestones/:id/committee-chair-decision
 *  Body: { decision: 'continue' | 'not_continue', reason: string }
 *  One-shot — 409 if already recorded for this submission round (a fresh
 *  student resubmission clears it, see milestoneController.ts's
 *  submitMilestone). Only the resolved committee's chairman may call this;
 *  ordinary members have no vote here (contrast with the sequential chain's
 *  submitCommitteeVote) — the paper form's item 7 is the chairman's own
 *  decision alone. */
export const submitCommitteeChairDecision = async (req: AuthenticatedRequest, res: Response) => {
  const uid = req.user?.uid;
  const { id: milestoneId } = req.params as { id: string };
  const { decision, reason } = req.body ?? {};
  if (!uid) return res.status(401).json({ message: 'Unauthorized.' });
  if (decision !== 'continue' && decision !== 'not_continue') {
    return res.status(400).json({ message: 'decision must be "continue" or "not_continue".' });
  }
  if (!(typeof reason === 'string' && reason.trim())) {
    return res.status(400).json({ message: 'A reason is required.' });
  }

  try {
    const milestoneRef = db.collection('milestones').doc(milestoneId);
    const milestoneSnap = await milestoneRef.get();
    if (!milestoneSnap.exists) return res.status(404).json({ message: 'Milestone not found.' });
    const milestone = milestoneSnap.data()!;

    if (!milestone.preGradeSignoffs?.committee) {
      return res.status(400).json({ message: 'This milestone does not require a committee chair decision.' });
    }
    if (milestone.committeeChairDecision) {
      return res.status(409).json({ message: 'A decision has already been recorded for this submission.' });
    }

    const projectSnap = milestone.projectId ? await db.collection('projects').doc(milestone.projectId).get() : null;
    const project = projectSnap?.exists ? projectSnap.data()! : null;
    const committee = project ? await resolveCommitteeForProject(project) : null;
    if (!committee) return res.status(400).json({ message: 'No committee is configured for this project yet.' });
    if (committee.chairmanId !== uid) {
      return res.status(403).json({ message: "Only this committee's chairman may record this decision." });
    }

    const decidedAt = admin.firestore.FieldValue.serverTimestamp();
    await milestoneRef.update({
      committeeChairDecision: { decision, reason: reason.trim(), decidedBy: uid, decidedAt },
      updatedAt: decidedAt,
    });

    await logAuditEvent({
      userId: uid,
      userRole: req.user?.role ?? 'committee_chairman',
      action: 'committee_chair_decision_recorded',
      entityType: 'milestone',
      entityId: milestoneId,
      newValue: { decision, reason: reason.trim() },
    });

    // Let the supervisor know their end of the form just moved forward.
    if (milestone.supervisorId) {
      try {
        await notifyUser({
          recipientId: milestone.supervisorId,
          type: 'general',
          inAppType: 'committee_chair_decision_recorded',
          titleHe: 'יו"ר הוועדה מסר החלטה',
          titleEn: 'The committee chair recorded a decision',
          bodyHe: `יו"ר הוועדה מסר החלטה עבור "${milestone.nameHe ?? milestone.type}".`,
          bodyEn: `The committee chair recorded a decision for "${milestone.nameEn ?? milestone.type}".`,
          relatedProjectId: milestone.projectId ?? null,
          relatedMilestoneId: milestoneId,
          channels: { email: false, sms: false },
        });
      } catch (err) {
        console.error(`submitCommitteeChairDecision: supervisor notify failed for ${milestone.supervisorId}:`, err);
      }
    }

    return res.status(200).json({ success: true });
  } catch (error: any) {
    console.error('submitCommitteeChairDecision error:', error);
    return res.status(500).json({ message: 'Failed to record the committee chair decision.' });
  }
};

/** POST /api/milestones/:id/examiner-one-signoff — no body beyond the
 *  milestone id; this is a plain approval (the paper form's item 9 has no
 *  reject alternative). Caller must be this milestone's own examinerIds[0]
 *  ("examiner #1") — examinerIds gets populated here the same way it does for
 *  any other requiresExaminers milestone, via coordinatorController.ts's
 *  assignExaminers fan-out (see workflowTemplates.ts's preGradeSignoffs doc
 *  comment for why no new propagation code was needed for this). */
export const submitExaminerOneSignoff = async (req: AuthenticatedRequest, res: Response) => {
  const uid = req.user?.uid;
  const { id: milestoneId } = req.params as { id: string };
  if (!uid) return res.status(401).json({ message: 'Unauthorized.' });

  try {
    const milestoneRef = db.collection('milestones').doc(milestoneId);
    const milestoneSnap = await milestoneRef.get();
    if (!milestoneSnap.exists) return res.status(404).json({ message: 'Milestone not found.' });
    const milestone = milestoneSnap.data()!;

    if (!milestone.preGradeSignoffs?.examinerOne) {
      return res.status(400).json({ message: 'This milestone does not require an examiner #1 sign-off.' });
    }
    if (milestone.examinerOneSignoff) {
      return res.status(409).json({ message: 'This has already been signed off for this submission.' });
    }
    const examinerOneId: string | undefined = (milestone.examinerIds ?? [])[0];
    if (!examinerOneId) {
      return res.status(400).json({ message: 'No examiner has been assigned to this project yet.' });
    }
    if (examinerOneId !== uid) {
      return res.status(403).json({ message: 'Only this project\'s examiner #1 may record this sign-off.' });
    }

    const approvedAt = admin.firestore.FieldValue.serverTimestamp();
    await milestoneRef.update({
      examinerOneSignoff: { approvedBy: uid, approvedAt },
      updatedAt: approvedAt,
    });

    await logAuditEvent({
      userId: uid,
      userRole: req.user?.role ?? 'examiner',
      action: 'examiner_one_signoff_recorded',
      entityType: 'milestone',
      entityId: milestoneId,
      newValue: { approvedBy: uid },
    });

    if (milestone.supervisorId) {
      try {
        await notifyUser({
          recipientId: milestone.supervisorId,
          type: 'general',
          inAppType: 'examiner_one_signoff_recorded',
          titleHe: 'הבוחן הראשי חתם',
          titleEn: 'Examiner #1 signed off',
          bodyHe: `הבוחן הראשי אישר את "${milestone.nameHe ?? milestone.type}".`,
          bodyEn: `Examiner #1 approved "${milestone.nameEn ?? milestone.type}".`,
          relatedProjectId: milestone.projectId ?? null,
          relatedMilestoneId: milestoneId,
          channels: { email: false, sms: false },
        });
      } catch (err) {
        console.error(`submitExaminerOneSignoff: supervisor notify failed for ${milestone.supervisorId}:`, err);
      }
    }

    return res.status(200).json({ success: true });
  } catch (error: any) {
    console.error('submitExaminerOneSignoff error:', error);
    return res.status(500).json({ message: 'Failed to record the examiner sign-off.' });
  }
};

/** GET /api/committees/mine/pending-chair-decisions — every milestone
 *  currently awaiting THIS user's committee-chair decision (#7 of the
 *  interim-report form, or any other faculty's milestone that configures
 *  preGradeSignoffs.committee) — a parallel sibling of
 *  committeeReviewController.ts's getMyPendingCommitteeReviews, which only
 *  covers the sequential chain's committee stage. Mirrors that function's
 *  own two-step approach: find committees this user chairs, then query
 *  milestones snapshotted against one of them (parallelCommitteeId, set by
 *  services/parallelSignoffs.ts's onMilestoneNeedsParallelSignoffs — a
 *  distinct field from the sequential chain's currentCommitteeId, so the two
 *  mechanisms never collide on the same milestone). */
export const getMyPendingChairDecisions = async (req: AuthenticatedRequest, res: Response) => {
  const uid = req.user?.uid;
  if (!uid) return res.status(401).json({ message: 'Unauthorized.' });
  try {
    const chairedSnap = await db.collection('committees').where('chairmanId', '==', uid).get();
    const chairedIds = chairedSnap.docs.map((d) => d.id);
    if (chairedIds.length === 0) return res.status(200).json({ reviews: [] });

    // Firestore 'in' caps at 30 — a real chairman realistically chairs a
    // small handful of committees, nowhere near that (same reasoning as
    // getMyPendingCommitteeReviews). committeeChairDecision is filtered in
    // memory below rather than as a second .where() — combining an 'in'
    // filter with an equality filter on a brand-new field here would need a
    // composite index Firestore doesn't have, which throws and turns into a
    // 500 (same class of bug already fixed elsewhere in this codebase — see
    // workflowTemplates.ts's listWorkflowTemplates comment).
    const milestonesSnap = await db.collection('milestones')
      .where('parallelCommitteeId', 'in', chairedIds)
      .get();

    const reviews = await Promise.all(milestonesSnap.docs.filter((doc) => !doc.data().committeeChairDecision).map(async (doc) => {
      const m = doc.data();
      const projectSnap = m.projectId ? await db.collection('projects').doc(m.projectId).get() : null;
      const project = projectSnap?.exists ? projectSnap.data() : undefined;
      return {
        milestoneId: doc.id,
        type: m.type,
        nameHe: m.nameHe ?? m.type,
        nameEn: m.nameEn ?? m.type,
        projectId: m.projectId ?? null,
        projectTitleHe: project?.titleHe ?? '',
        projectTitleEn: project?.titleEn ?? '',
        studentNames: m.studentNames ?? [],
        submittedAt: m.submittedAt?.toDate?.()?.toISOString?.() ?? null,
      };
    }));

    return res.status(200).json({ reviews });
  } catch (error: any) {
    console.error('getMyPendingChairDecisions error:', error);
    return res.status(500).json({ message: 'Failed to load your pending decisions.' });
  }
};

/** GET /api/milestones/:id/parallel-signoffs — read-only status for the
 *  supervisor's own live view (and for anyone else authorized to see this
 *  milestone) of the two independent signoffs. Kept intentionally minimal:
 *  callers with broader milestone-read access should just read the milestone
 *  doc's own fields directly (see supervisorController.ts's
 *  getSupervisorProjectDetail) rather than a second round-trip through here;
 *  this endpoint exists for the committee/examiner-facing "is there anything
 *  for me to do" list screens, which don't otherwise fetch milestone docs. */
export const getParallelSignoffStatus = async (req: AuthenticatedRequest, res: Response) => {
  const { id: milestoneId } = req.params as { id: string };
  try {
    const snap = await db.collection('milestones').doc(milestoneId).get();
    if (!snap.exists) return res.status(404).json({ message: 'Milestone not found.' });
    const m = snap.data()!;
    return res.status(200).json({
      preGradeSignoffs: m.preGradeSignoffs ?? null,
      committeeChairDecision: m.committeeChairDecision ?? null,
      examinerOneSignoff: m.examinerOneSignoff ?? null,
      examinerOneId: (m.examinerIds ?? [])[0] ?? null,
    });
  } catch (error: any) {
    console.error('getParallelSignoffStatus error:', error);
    return res.status(500).json({ message: 'Failed to load sign-off status.' });
  }
};
