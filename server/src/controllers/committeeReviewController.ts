// src/controllers/committeeReviewController.ts
//
// Runtime engine for a 'committee'-role chain stage (see
// workflowTemplates.ts's ChainRole doc comment). Deliberately NOT part of
// the generic single-actor chain engine (coordinatorController.ts's
// approveChainMilestone/rejectChainMilestone, gated off from 'committee' by
// milestoneRouting.ts's authorizeStageActor) — a committee stage is a
// multi-actor flow: every member independently votes approve/reject with a
// comment, and only the committee's chairman can actually advance/reject
// the milestone, after seeing every vote cast so far. Every vote plus the
// chairman's final decision is permanently archived in
// committeeReviewHistory on the milestone doc — the "footage of the
// project's advancement" requested alongside this feature.

import { Response } from 'express';
import admin from 'firebase-admin';
import { db } from '../config/firebase.js';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { notifyUser } from '../services/notify.js';
import { logAuditEvent } from '../services/auditLog.js';
import { statusForStage } from '../services/milestoneRouting.js';
import type { ChainStage } from '../services/workflowTemplates.js';
import { resolveCommitteeForProject, type CommitteeDoc } from './committeeController.js';

interface CommitteeVote {
  memberId: string;
  vote: 'approve' | 'reject';
  comment: string;
  votedAt: string;
}

/** Called right after a milestone's stage transitions to one whose role is
 *  'committee' — from the student submission path (milestoneController.ts's
 *  submitMilestone) and from the generic chain-advance path
 *  (coordinatorController.ts's approveChainMilestone). Resolves the
 *  project's committee, snapshots its id onto the milestone doc (so "which
 *  milestones await MY committee" is a plain query, not a per-milestone
 *  resolve), clears any stale vote list from a previous round at this same
 *  stage, and notifies every member with the submission's files/comment.
 *
 *  If no committee has been configured yet for this project's
 *  (facultyId, major, type) — a workflow template can route to 'committee'
 *  before anyone's actually staffed one — the milestone would otherwise be
 *  silently stranded at this stage forever with nobody able to act on it
 *  (authorizeStageActor refuses everyone for a 'committee' stage by
 *  design). Rather than fail that silently, every system_admin is notified
 *  so the gap gets noticed and fixed. */
export async function onEnterCommitteeStage(
  milestoneId: string,
  milestoneData: FirebaseFirestore.DocumentData,
): Promise<void> {
  const projectId = milestoneData.projectId;
  if (!projectId) return;
  const projectSnap = await db.collection('projects').doc(projectId).get();
  if (!projectSnap.exists) return;
  const projectData = projectSnap.data()!;

  // A stage authored with an explicit committeeId (see workflowTemplates.ts's
  // ChainStage) always wins over the per-student-major dynamic lookup below —
  // that's the whole point of pinning one at template-authoring time.
  const routing: ChainStage[] = milestoneData.routing ?? [];
  const currentStageIndex: number = milestoneData.currentStageIndex ?? 0;
  const stage = routing[currentStageIndex];
  let committee: CommitteeDoc | null = null;
  if (stage?.role === 'committee' && stage.committeeId) {
    const pinnedSnap = await db.collection('committees').doc(stage.committeeId).get();
    committee = pinnedSnap.exists ? ({ id: pinnedSnap.id, ...pinnedSnap.data() } as CommitteeDoc) : null;
  } else {
    committee = await resolveCommitteeForProject(projectData);
  }
  const milestoneRef = db.collection('milestones').doc(milestoneId);

  if (!committee) {
    await milestoneRef.update({ currentCommitteeId: null, committeeVotes: [] });
    const adminSnap = await db.collection('users').where('roles', 'array-contains', 'system_admin').get();
    await Promise.all(adminSnap.docs.map(async (doc) => {
      try {
        await notifyUser({
          recipientId: doc.id,
          type: 'general',
          inAppType: 'committee_not_configured',
          titleHe: 'אין ועדה מוגדרת — אבן דרך תקועה',
          titleEn: 'No committee configured — a milestone is stuck',
          bodyHe: `אבן הדרך "${milestoneData.nameHe ?? milestoneData.type}" מנותבת לוועדה, אך טרם הוגדרה ועדה עבור הפקולטה/מגמה של הפרויקט הזה.`,
          bodyEn: `Milestone "${milestoneData.nameEn ?? milestoneData.type}" is routed to a committee, but no committee has been configured for this project's faculty/major yet.`,
          relatedProjectId: projectId,
          relatedMilestoneId: milestoneId,
          channels: { email: false, sms: false },
          // Committee setup itself lives at /committees, not admin/panel.
          targetScreen: 'committees',
        });
      } catch (err) {
        console.error(`onEnterCommitteeStage: system_admin alert failed for ${doc.id}:`, err);
      }
    }));
    return;
  }

  await milestoneRef.update({ currentCommitteeId: committee.id, committeeVotes: [] });

  const studentNames: string[] = (projectData.enrolledStudentIds ?? []).length
    ? await Promise.all((projectData.enrolledStudentIds as string[]).map(async (sid: string) => {
        const s = await db.collection('users').doc(sid).get();
        return s.data()?.displayName ?? sid;
      }))
    : [];

  await Promise.all(committee.memberIds.map(async (memberId) => {
    try {
      await notifyUser({
        recipientId: memberId,
        type: 'general',
        inAppType: 'committee_review_requested',
        titleHe: 'הגשה חדשה ממתינה לוועדה 📤',
        titleEn: 'New submission awaiting committee review 📤',
        bodyHe: `${studentNames.join(', ') || 'סטודנט'} הגיש/ה את "${milestoneData.nameHe ?? milestoneData.type}" לבדיקת הוועדה.`,
        bodyEn: `${studentNames.join(', ') || 'A student'} submitted "${milestoneData.nameEn ?? milestoneData.type}" for committee review.`,
        relatedProjectId: projectId,
        relatedMilestoneId: milestoneId,
        targetScreen: 'committees',
      });
    } catch (err) {
      console.error(`onEnterCommitteeStage: member notify failed for ${memberId} on milestone ${milestoneId}:`, err);
    }
  }));
}

async function loadMilestoneAndCommittee(milestoneId: string): Promise<
  | { error: { status: number; message: string } }
  | { milestone: FirebaseFirestore.DocumentData; stage: ChainStage; committee: CommitteeDoc }
> {
  const snap = await db.collection('milestones').doc(milestoneId).get();
  if (!snap.exists) return { error: { status: 404, message: 'Milestone not found.' } };
  const milestone = snap.data()!;
  const routing: ChainStage[] = milestone.routing ?? [];
  const currentStageIndex: number = milestone.currentStageIndex ?? 0;
  const stage = routing[currentStageIndex];
  if (!stage || stage.role !== 'committee') {
    return { error: { status: 400, message: 'This milestone is not currently awaiting committee review.' } };
  }
  if (!milestone.currentCommitteeId) {
    return { error: { status: 400, message: 'No committee is configured for this project yet.' } };
  }
  const committeeSnap = await db.collection('committees').doc(milestone.currentCommitteeId).get();
  if (!committeeSnap.exists) return { error: { status: 400, message: 'The assigned committee no longer exists.' } };
  const committee = { id: committeeSnap.id, ...committeeSnap.data() } as CommitteeDoc;
  return { milestone, stage, committee };
}

/** GET /api/milestones/:id/committee-review — the submission (files/note)
 *  plus every vote cast so far, for a committee member or chairman to
 *  review. Any other committee member or the chairman may view this — a
 *  vote isn't secret from the rest of the committee, only the chairman's
 *  eventual decision is a separate, later act. */
export const getCommitteeReview = async (req: AuthenticatedRequest, res: Response) => {
  const uid = req.user?.uid;
  const { id: milestoneId } = req.params as { id: string };
  if (!uid) return res.status(401).json({ message: 'Unauthorized.' });

  const resolved = await loadMilestoneAndCommittee(milestoneId);
  if ('error' in resolved) return res.status(resolved.error.status).json({ message: resolved.error.message });
  const { milestone, committee } = resolved;

  const isSystemAdmin = req.user?.role === 'system_admin' || (req.user?.roles ?? []).includes('system_admin');
  if (!committee.memberIds.includes(uid) && !isSystemAdmin) {
    return res.status(403).json({ message: 'You are not a member of this committee.' });
  }

  const memberSnaps = await Promise.all(committee.memberIds.map((id) => db.collection('users').doc(id).get()));
  const memberNames: Record<string, string> = {};
  memberSnaps.forEach((s) => { if (s.exists) memberNames[s.id] = s.data()?.displayName ?? s.id; });

  return res.status(200).json({
    milestoneId,
    type: milestone.type,
    submissionNote: milestone.submissionNote ?? '',
    fileUrls: milestone.fileUrls ?? [],
    committee: { id: committee.id, chairmanId: committee.chairmanId, memberIds: committee.memberIds, memberNames },
    isChairman: committee.chairmanId === uid,
    votes: (milestone.committeeVotes ?? []) as CommitteeVote[],
  });
};

/** POST /api/milestones/:id/committee-vote — a member's own independent
 *  opinion. Does NOT advance the stage — see submitCommitteeDecision for
 *  that, which only the chairman may call. Upserts (a member can change
 *  their mind before the chairman decides). */
export const submitCommitteeVote = async (req: AuthenticatedRequest, res: Response) => {
  const uid = req.user?.uid;
  const { id: milestoneId } = req.params as { id: string };
  const { vote, comment } = req.body ?? {};
  if (!uid) return res.status(401).json({ message: 'Unauthorized.' });
  if (vote !== 'approve' && vote !== 'reject') {
    return res.status(400).json({ message: 'vote must be "approve" or "reject".' });
  }
  if (vote === 'reject' && !(typeof comment === 'string' && comment.trim())) {
    return res.status(400).json({ message: 'A comment explaining the rejection is required.' });
  }

  const resolved = await loadMilestoneAndCommittee(milestoneId);
  if ('error' in resolved) return res.status(resolved.error.status).json({ message: resolved.error.message });
  const { committee } = resolved;
  if (!committee.memberIds.includes(uid)) return res.status(403).json({ message: 'You are not a member of this committee.' });

  try {
    const milestoneRef = db.collection('milestones').doc(milestoneId);
    await db.runTransaction(async (transaction) => {
      const snap = await transaction.get(milestoneRef);
      const data = snap.data()!;
      const existing: CommitteeVote[] = data.committeeVotes ?? [];
      const entry: CommitteeVote = { memberId: uid, vote, comment: typeof comment === 'string' ? comment.trim() : '', votedAt: new Date().toISOString() };
      const nextVotes = [...existing.filter((v) => v.memberId !== uid), entry];
      transaction.update(milestoneRef, { committeeVotes: nextVotes });
    });

    // Chairman is notified once opinions start coming in, so they know to
    // check in — not required before deciding, just a helpful nudge.
    if (committee.chairmanId && committee.chairmanId !== uid) {
      try {
        await notifyUser({
          recipientId: committee.chairmanId,
          type: 'general',
          inAppType: 'committee_vote_cast',
          titleHe: 'חבר ועדה הצביע',
          titleEn: 'A committee member voted',
          bodyHe: 'חבר/ת ועדה מסר/ה חוות דעת על הגשה הממתינה להחלטתך.',
          bodyEn: 'A committee member has submitted their opinion on a submission awaiting your decision.',
          relatedProjectId: resolved.milestone.projectId ?? null,
          relatedMilestoneId: milestoneId,
          channels: { email: false, sms: false },
          targetScreen: 'committees',
        });
      } catch (err) {
        console.error(`submitCommitteeVote: chairman notify failed for ${committee.chairmanId}:`, err);
      }
    }

    return res.status(200).json({ success: true });
  } catch (error: any) {
    console.error('submitCommitteeVote error:', error);
    return res.status(500).json({ message: 'Failed to record your vote.' });
  }
};

/** POST /api/milestones/:id/committee-decision — the chairman's one final,
 *  binding call. Mirrors coordinatorController.ts's approveChainMilestone/
 *  rejectChainMilestone stage-transition mechanics exactly (same status/
 *  currentStageIndex semantics, same rejectTo === 'student' vs internal-
 *  reroute split), so every existing dashboard reading those fields keeps
 *  working regardless of a committee having been involved. The one
 *  addition: a permanent committeeReviewHistory entry — every member's vote
 *  at decision time, plus the chairman's own decision/comment — appended
 *  via arrayUnion so it survives the committeeVotes reset below. */
export const submitCommitteeDecision = async (req: AuthenticatedRequest, res: Response) => {
  const uid = req.user?.uid;
  const { id: milestoneId } = req.params as { id: string };
  const { decision, comment } = req.body ?? {};
  if (!uid) return res.status(401).json({ message: 'Unauthorized.' });
  if (decision !== 'approve' && decision !== 'reject') {
    return res.status(400).json({ message: 'decision must be "approve" or "reject".' });
  }
  if (decision === 'reject' && !(typeof comment === 'string' && comment.trim())) {
    return res.status(400).json({ message: 'A comment explaining the rejection is required.' });
  }

  const resolved = await loadMilestoneAndCommittee(milestoneId);
  if ('error' in resolved) return res.status(resolved.error.status).json({ message: resolved.error.message });
  const { milestone, stage, committee } = resolved;
  if (committee.chairmanId !== uid) {
    return res.status(403).json({ message: 'Only this committee\'s chairman may finalize a decision.' });
  }

  const routing: ChainStage[] = milestone.routing;
  const milestoneRef = db.collection('milestones').doc(milestoneId);
  const historyEntry = {
    committeeId: committee.id,
    stageId: stage.id,
    memberVotes: milestone.committeeVotes ?? [],
    chairmanId: uid,
    chairmanDecision: decision,
    chairmanComment: typeof comment === 'string' ? comment.trim() : '',
    decidedAt: new Date().toISOString(),
  };

  let finalized = false;
  let nextStageForNotify: ChainStage | null = null;

  try {
    await db.runTransaction(async (transaction) => {
      const freshSnap = await transaction.get(milestoneRef);
      if (!freshSnap.exists) throw new Error('Milestone not found.');
      const fresh = freshSnap.data()!;
      const freshRouting: ChainStage[] = fresh.routing ?? [];
      const freshIndex: number = fresh.currentStageIndex ?? 0;
      const currentStage = freshRouting[freshIndex];
      if (!currentStage || currentStage.id !== stage.id) {
        throw new Error('This milestone has moved on from committee review — refresh and try again.');
      }

      const baseUpdate: Record<string, any> = {
        stageEnteredAt: admin.firestore.FieldValue.serverTimestamp(),
        committeeVotes: [],
        currentCommitteeId: null,
        committeeReviewHistory: admin.firestore.FieldValue.arrayUnion(historyEntry),
      };

      if (decision === 'approve') {
        const nextStage = freshRouting[freshIndex + 1];
        if (nextStage) {
          transaction.update(milestoneRef, { ...baseUpdate, currentStageIndex: freshIndex + 1, status: statusForStage(nextStage) });
          nextStageForNotify = nextStage;
        } else {
          transaction.update(milestoneRef, {
            ...baseUpdate,
            status: 'coordinator_approved',
            coordinatorApprovedAt: admin.firestore.FieldValue.serverTimestamp(),
            coordinatorId: uid,
            ...(typeof comment === 'string' && comment.trim() ? { coordinatorComment: comment.trim() } : {}),
          });
          finalized = true;
        }
      } else {
        const rejectsToStudent = stage.rejectTo === 'student';
        if (rejectsToStudent) {
          transaction.update(milestoneRef, {
            ...baseUpdate,
            status: 'rejected',
            currentStageIndex: 0,
            coordinatorRejectedAt: admin.firestore.FieldValue.serverTimestamp(),
            coordinatorId: uid,
            rejectionReason: comment.trim(),
          });
        } else {
          const targetIndex = freshRouting.findIndex((s) => s.id === stage.rejectTo);
          const targetStage = freshRouting[targetIndex]!;
          transaction.update(milestoneRef, { ...baseUpdate, status: statusForStage(targetStage), currentStageIndex: targetIndex });
          nextStageForNotify = targetStage;
        }
      }
    });

    await logAuditEvent({
      userId: uid,
      userRole: req.user?.role ?? 'committee_chairman',
      action: decision === 'approve' ? 'milestone_approved' : 'milestone_rejected',
      entityType: 'milestone',
      entityId: milestoneId,
      oldValue: { status: milestone.status ?? null },
      newValue: { stageId: stage.id, committeeId: committee.id, finalized },
      explanation: typeof comment === 'string' ? comment : undefined,
    });

    // Student is told the outcome only when this was a genuine student-
    // facing rejection or the milestone's final approval — an internal
    // staff reroute (rejectTo pointing at another stage) stays silent,
    // matching rejectChainMilestone's own convention.
    const studentIds: string[] = milestone.studentIds ?? [];
    if (finalized || (decision === 'reject' && stage.rejectTo === 'student')) {
      await Promise.all(studentIds.map(async (studentId) => {
        try {
          await notifyUser({
            recipientId: studentId,
            type: 'general',
            inAppType: finalized ? 'milestone_coordinator_approved' : 'milestone_coordinator_rejected',
            titleHe: finalized ? 'אבן דרך אושרה על ידי הוועדה' : 'אבן דרך נדחתה על ידי הוועדה',
            titleEn: finalized ? 'Milestone approved by the committee' : 'Milestone rejected by the committee',
            bodyHe: finalized
              ? `הוועדה אישרה את "${milestone.nameHe ?? milestone.type}".`
              : `הוועדה דחתה את "${milestone.nameHe ?? milestone.type}". סיבה: ${comment}`,
            bodyEn: finalized
              ? `The committee approved "${milestone.nameEn ?? milestone.type}".`
              : `The committee rejected "${milestone.nameEn ?? milestone.type}". Reason: ${comment}`,
            relatedProjectId: milestone.projectId ?? null,
            relatedMilestoneId: milestoneId,
          });
        } catch (err) {
          console.error(`submitCommitteeDecision: student notify failed for ${studentId}:`, err);
        }
      }));
    }

    if (nextStageForNotify) {
      if ((nextStageForNotify as ChainStage).role === 'committee') {
        const freshMilestone = (await milestoneRef.get()).data()!;
        await onEnterCommitteeStage(milestoneId, freshMilestone);
      }
      // Non-committee next stages already get their own notification via
      // the existing generic chain-advance flow's own conventions — nothing
      // extra to trigger here for those.
    }

    return res.status(200).json({ success: true, message: finalized ? 'Milestone approved.' : decision === 'approve' ? 'Advanced to the next stage.' : 'Milestone rejected.' });
  } catch (error: any) {
    console.error('submitCommitteeDecision error:', error);
    return res.status(500).json({ message: error.message || 'Failed to record the committee decision.' });
  }
};

/** GET /api/committees/mine/pending-reviews — every milestone currently
 *  sitting at a committee stage for a committee the caller belongs to.
 *  Powers the "your committee reviews" dashboard list — a fallback to
 *  notifications, not a replacement (a missed/failed notification
 *  shouldn't mean a submission is undiscoverable). */
export const getMyPendingCommitteeReviews = async (req: AuthenticatedRequest, res: Response) => {
  const uid = req.user?.uid;
  if (!uid) return res.status(401).json({ message: 'Unauthorized.' });
  try {
    const committeesSnap = await db.collection('committees').where('memberIds', 'array-contains', uid).get();
    const committeeIds = committeesSnap.docs.map((d) => d.id);
    if (committeeIds.length === 0) return res.status(200).json({ reviews: [] });

    // Firestore 'in' caps at 30 values — a real account is realistically a
    // member of a small handful of committees (2 types x a couple of
    // departments), nowhere near that.
    const milestonesSnap = await db.collection('milestones').where('currentCommitteeId', 'in', committeeIds).get();
    const reviews = await Promise.all(milestonesSnap.docs.map(async (doc) => {
      const m = doc.data();
      const committee = committeesSnap.docs.find((c) => c.id === m.currentCommitteeId)?.data() as CommitteeDoc | undefined;
      const projectSnap = m.projectId ? await db.collection('projects').doc(m.projectId).get() : null;
      const project = projectSnap?.data();
      return {
        milestoneId: doc.id,
        type: m.type,
        projectId: m.projectId ?? null,
        projectTitleHe: project?.titleHe ?? '',
        projectTitleEn: project?.titleEn ?? '',
        committeeId: m.currentCommitteeId,
        isChairman: committee?.chairmanId === uid,
        alreadyVoted: (m.committeeVotes ?? []).some((v: CommitteeVote) => v.memberId === uid),
        voteCount: (m.committeeVotes ?? []).length,
        memberCount: committee?.memberIds?.length ?? 0,
      };
    }));

    return res.status(200).json({ reviews });
  } catch (error: any) {
    console.error('getMyPendingCommitteeReviews error:', error);
    return res.status(500).json({ message: 'Failed to load your pending committee reviews.' });
  }
};
