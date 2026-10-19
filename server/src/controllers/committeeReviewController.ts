// src/controllers/committeeReviewController.ts
//
// Runtime engine for a 'committee'-role chain stage (see
// workflowTemplates.ts's ChainRole doc comment). Deliberately NOT part of
// the generic single-actor chain engine (coordinatorController.ts's
// approveChainMilestone/rejectChainMilestone, gated off from 'committee' by
// milestoneRouting.ts's authorizeStageActor) — a committee stage is a
// multi-actor flow: every member independently votes approve/reject with a
// comment, and only the committee's chairman can actually advance/reject
// the milestone — and only once every OTHER member has cast their vote (see
// submitCommitteeDecision's missingVoterIds check), so a member's vote is
// never just decorative. Every vote plus the chairman's final decision is
// permanently archived in
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
import { applyCommitteeSubstitutions, mergedCommitteeSubstitutions, resolveCommitteeForMilestone, findSupervisorConflicts, type CommitteeDoc } from './committeeController.js';
import { resolveStaffForScope } from '../services/scopeAuthorization.js';
import { isCsPilotMajor } from '../config/csPilot.js';
import { isDecisionRelayEnabled, resolveDecisionRecipientCandidates, createRelayTask, type DecisionRecipientCandidate } from '../services/decisionRelay.js';
import type { ResourceScope } from '../services/scopeAuthorization.js';
import { L } from '../utils/localize.js';

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
  // ChainStage) always wins over the per-student-major dynamic lookup —
  // that's the whole point of pinning one at template-authoring time. Both
  // the project's and this milestone's own substitutions are applied.
  const committee = await resolveCommitteeForMilestone(milestoneData, projectData);
  const milestoneRef = db.collection('milestones').doc(milestoneId);

  if (!committee) {
    await milestoneRef.update({ currentCommitteeId: null, committeeVotes: [], committeeConflictHold: admin.firestore.FieldValue.delete() });
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

  // CS pilot (see config/csPilot.ts) — conflict-of-interest hold. If the
  // project's own supervisor still sits on the effective committee, the
  // committee must not receive this submission yet: currentCommitteeId stays
  // null (so no member can see/vote/decide — see loadMilestoneAndCommittee
  // and getMyPendingCommitteeReviews), and the administrative coordinator is
  // told to substitute someone in for this milestone. substituteCommitteeMember
  // calls back into this function once she does, which then lands below.
  const conflicts = isCsPilotMajor(projectData.major) ? findSupervisorConflicts(committee, projectData) : [];
  if (conflicts.length > 0) {
    // Already held and re-checked after one of several swaps (e.g. both
    // supervisors sit on the committee) — she was already told.
    const alreadyHeld = !!milestoneData.committeeConflictHold;
    await milestoneRef.update({
      currentCommitteeId: null,
      committeeVotes: [],
      committeeConflictHold: {
        committeeId: committee.id,
        conflictedUserIds: conflicts.map((c) => c.userId),
        heldAt: admin.firestore.Timestamp.now(),
      },
    });
    const resource: ResourceScope = {
      facultyId: projectData.facultyId ?? '',
      major: projectData.major || undefined,
      degreeLevel: projectData.degreeType || undefined,
      processType: projectData.projectType || undefined,
    };
    let secretaryIds = alreadyHeld ? [] : await resolveStaffForScope('administrative_secretary', resource, [], [], false);
    // Nobody holds this scope — same "never strand it silently" fallback as
    // the no-committee branch above, so the missing administrative
    // coordinator assignment gets noticed and fixed.
    if (!alreadyHeld && secretaryIds.length === 0) {
      console.warn(`onEnterCommitteeStage: no administrative_secretary in scope for held milestone ${milestoneId} — alerting system_admin`);
      const adminSnap = await db.collection('users').where('roles', 'array-contains', 'system_admin').get();
      secretaryIds = adminSnap.docs.map((d) => d.id);
    }
    await Promise.all(secretaryIds.map(async (secretaryId) => {
      try {
        await notifyUser({
          recipientId: secretaryId,
          type: 'general',
          inAppType: 'committee_conflict_hold',
          titleHe: 'ניגוד עניינים — יש להחליף חבר ועדה',
          titleEn: 'Conflict of interest — replace a committee member',
          bodyHe: `המנחה של "${projectData.titleHe ?? ''}" חבר/ה בוועדה. "${milestoneData.nameHe ?? milestoneData.type}" לא יועבר לוועדה עד שתבחר/י מחליף/ה.`,
          bodyEn: `The supervisor of "${projectData.titleEn ?? projectData.titleHe ?? ''}" sits on the committee. "${milestoneData.nameEn ?? milestoneData.type}" won't reach the committee until you choose a replacement.`,
          relatedProjectId: projectId,
          relatedMilestoneId: milestoneId,
          channels: { email: true, sms: false },
          targetScreen: 'admin_coordinator_committee_conflicts',
        });
      } catch (err) {
        console.error(`onEnterCommitteeStage: conflict-hold notify failed for ${secretaryId}:`, err);
      }
    }));
    return;
  }

  await milestoneRef.update({
    currentCommitteeId: committee.id,
    committeeVotes: [],
    committeeConflictHold: admin.firestore.FieldValue.delete(),
  });

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
  const rawCommittee = { id: committeeSnap.id, ...committeeSnap.data() } as CommitteeDoc;

  // Apply this PROJECT's own recusal substitutions (see "Replace Committee
  // Member" — administrative_secretary's conflict-of-interest tab) before
  // this committee is used for any authorization/voting/decision below —
  // the shared committee doc itself is untouched, so a member substituted
  // out here still has full standing on every other project.
  // The milestone's own (per-milestone, CS pilot) substitutions are layered
  // on top of the project-level ones — see mergedCommitteeSubstitutions.
  let committee = applyCommitteeSubstitutions(rawCommittee, mergedCommitteeSubstitutions(null, milestone));
  if (milestone.projectId) {
    const projectSnap = await db.collection('projects').doc(milestone.projectId).get();
    committee = applyCommitteeSubstitutions(rawCommittee, mergedCommitteeSubstitutions(projectSnap.data(), milestone));
  }

  return { milestone, stage, committee };
}

/** Loads the project a milestone belongs to, for decision-relay purposes
 *  (major-gating + resolving candidate recipients). Returns null when the
 *  milestone has no project (shouldn't happen for a committee-routed
 *  milestone, but never worth throwing over). */
async function loadProjectForMilestone(milestone: FirebaseFirestore.DocumentData): Promise<FirebaseFirestore.DocumentData | null> {
  if (!milestone.projectId) return null;
  const snap = await db.collection('projects').doc(milestone.projectId).get();
  return snap.exists ? snap.data()! : null;
}

/** GET /api/milestones/:id/committee-decision-recipients — chairman-only,
 *  mirrors loadMilestoneAndCommittee's own auth. Powers the web "send the
 *  decision back to" picker — enabled is false (and candidates empty) for
 *  any project outside isDecisionRelayEnabled's major allowlist, in which
 *  case the client renders nothing and today's student-only behavior is
 *  unchanged. */
export const getCommitteeDecisionRecipients = async (req: AuthenticatedRequest, res: Response) => {
  const uid = req.user?.uid;
  const { id: milestoneId } = req.params as { id: string };
  if (!uid) return res.status(401).json({ message: L(req, 'Unauthorized.', 'אין הרשאה.') });

  const resolved = await loadMilestoneAndCommittee(milestoneId);
  if ('error' in resolved) return res.status(resolved.error.status).json({ message: resolved.error.message });
  const { milestone, committee } = resolved;
  if (committee.chairmanId !== uid) {
    return res.status(403).json({ message: L(req, 'Only this committee\'s chairman may view decision recipients.', 'רק יו"ר הוועדה רשאי לצפות בנמענים האפשריים להחלטה.') });
  }

  const project = await loadProjectForMilestone(milestone);
  if (!project || !(await isDecisionRelayEnabled(project.major))) {
    return res.status(200).json({ enabled: false, candidates: [] });
  }

  const resource: ResourceScope = { facultyId: project.facultyId ?? '', major: project.major || undefined, degreeLevel: project.degreeType || undefined, processType: project.projectType || undefined };
  const candidates = await resolveDecisionRecipientCandidates(project, resource);
  return res.status(200).json({ enabled: true, candidates });
};

/** GET /api/milestones/:id/committee-review — the submission (files/note)
 *  plus every vote cast so far, for a committee member or chairman to
 *  review. Any other committee member or the chairman may view this — a
 *  vote isn't secret from the rest of the committee, only the chairman's
 *  eventual decision is a separate, later act. */
export const getCommitteeReview = async (req: AuthenticatedRequest, res: Response) => {
  const uid = req.user?.uid;
  const { id: milestoneId } = req.params as { id: string };
  if (!uid) return res.status(401).json({ message: L(req, 'Unauthorized.', 'אין הרשאה.') });

  const resolved = await loadMilestoneAndCommittee(milestoneId);
  if ('error' in resolved) return res.status(resolved.error.status).json({ message: resolved.error.message });
  const { milestone, committee } = resolved;

  const isSystemAdmin = req.user?.role === 'system_admin' || (req.user?.roles ?? []).includes('system_admin');
  if (!committee.memberIds.includes(uid) && !isSystemAdmin) {
    return res.status(403).json({ message: L(req, 'You are not a member of this committee.', 'אינך חבר/ה בוועדה זו.') });
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
    // A chairman vote cast before chairmen stopped voting as members is
    // dropped rather than shown as a second opinion of theirs.
    votes: ((milestone.committeeVotes ?? []) as CommitteeVote[]).filter((v) => v.memberId !== committee.chairmanId),
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
  if (!uid) return res.status(401).json({ message: L(req, 'Unauthorized.', 'אין הרשאה.') });
  if (vote !== 'approve' && vote !== 'reject') {
    return res.status(400).json({ message: L(req, 'vote must be "approve" or "reject".', 'ההצבעה חייבת להיות "approve" או "reject".') });
  }
  if (vote === 'reject' && !(typeof comment === 'string' && comment.trim())) {
    return res.status(400).json({ message: L(req, 'A comment explaining the rejection is required.', 'יש לצרף הערה המנמקת את הדחייה.') });
  }

  const resolved = await loadMilestoneAndCommittee(milestoneId);
  if ('error' in resolved) return res.status(resolved.error.status).json({ message: resolved.error.message });
  const { committee } = resolved;
  if (!committee.memberIds.includes(uid)) return res.status(403).json({ message: L(req, 'You are not a member of this committee.', 'אינך חבר/ה בוועדה זו.') });
  // The chairman's say is the binding final decision (submitCommitteeDecision)
  // — a separate member vote on top of it was redundant, so it's not offered.
  if (committee.chairmanId === uid) {
    return res.status(400).json({ message: L(req, 'As chairman, you record your position through the final decision, not a member vote.', 'כיו"ר, עמדתך נקבעת בהחלטה הסופית ולא בהצבעת חבר ועדה.') });
  }

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
    return res.status(500).json({ message: L(req, 'Failed to record your vote.', 'שמירת ההצבעה שלך נכשלה.') });
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
  const { decision, comment, recipientId } = req.body ?? {};
  if (!uid) return res.status(401).json({ message: L(req, 'Unauthorized.', 'אין הרשאה.') });
  if (decision !== 'approve' && decision !== 'reject') {
    return res.status(400).json({ message: L(req, 'decision must be "approve" or "reject".', 'ההחלטה חייבת להיות "approve" או "reject".') });
  }
  if (decision === 'reject' && !(typeof comment === 'string' && comment.trim())) {
    return res.status(400).json({ message: L(req, 'A comment explaining the rejection is required.', 'יש לצרף הערה המנמקת את הדחייה.') });
  }

  const resolved = await loadMilestoneAndCommittee(milestoneId);
  if ('error' in resolved) return res.status(resolved.error.status).json({ message: resolved.error.message });
  const { milestone, stage, committee } = resolved;
  if (committee.chairmanId !== uid) {
    return res.status(403).json({ message: L(req, 'Only this committee\'s chairman may finalize a decision.', 'רק יו"ר הוועדה רשאי לקבוע את ההחלטה הסופית.') });
  }

  // CS-enabled-only: the chairman may hand this decision to someone other
  // than the student — see decisionRelay.ts. A missing/'student' recipientId
  // keeps today's behavior unchanged for every other department. The chosen
  // recipient only actually takes effect below if this decision turns out to
  // be terminal (final approval, or a reject that targets 'student') — an
  // internal reroute to another chain stage ignores it entirely, same as it
  // ignores the comment for anything but a notify-worthy outcome.
  const project = await loadProjectForMilestone(milestone);
  let effectiveRecipient: DecisionRecipientCandidate | null = null;
  if (project && typeof recipientId === 'string' && recipientId && recipientId !== 'student' && (await isDecisionRelayEnabled(project.major))) {
    const resource: ResourceScope = { facultyId: project.facultyId ?? '', major: project.major || undefined, degreeLevel: project.degreeType || undefined, processType: project.projectType || undefined };
    const candidates = await resolveDecisionRecipientCandidates(project, resource);
    const match = candidates.find((c) => c.id === recipientId);
    if (!match) {
      return res.status(400).json({ message: L(req, 'That recipient is not a valid candidate for this project.', 'הנמען שנבחר אינו מועמד תקין לפרויקט זה.') });
    }
    effectiveRecipient = match;
  }

  // A binding decision requires every OTHER member to have weighed in first —
  // otherwise their vote is purely decorative and the chairman could just
  // ignore the committee entirely. The chairman's own vote (if they cast
  // one via submitCommitteeVote) isn't required here since this decision
  // call IS their say on the matter.
  const requiredVoterIds = committee.memberIds.filter((id) => id !== committee.chairmanId);
  const castVoterIds = new Set((milestone.committeeVotes ?? []).map((v: CommitteeVote) => v.memberId));
  const missingVoterIds = requiredVoterIds.filter((id) => !castVoterIds.has(id));
  if (missingVoterIds.length > 0) {
    return res.status(400).json({ message: L(req, 'Every other committee member must cast their vote before you can finalize a decision.', 'על כל שאר חברי הוועדה להצביע לפני שניתן לקבוע את ההחלטה הסופית.') });
  }

  const routing: ChainStage[] = milestone.routing;
  const milestoneRef = db.collection('milestones').doc(milestoneId);
  const historyEntry = {
    committeeId: committee.id,
    stageId: stage.id,
    memberVotes: ((milestone.committeeVotes ?? []) as CommitteeVote[]).filter((v) => v.memberId !== uid),
    chairmanId: uid,
    chairmanDecision: decision,
    chairmanComment: typeof comment === 'string' ? comment.trim() : '',
    decidedAt: new Date().toISOString(),
    // Only meaningful if this decision turns out terminal (see below) —
    // harmless/unused metadata otherwise. 'student' is the default.
    routedToUserId: effectiveRecipient?.id ?? 'student',
    routedToRole: effectiveRecipient?.role ?? 'student',
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

    // The outcome is told to someone only when this was a genuine student-
    // facing rejection or the milestone's final approval — an internal
    // staff reroute (rejectTo pointing at another stage) stays silent,
    // matching rejectChainMilestone's own convention. Normally that someone
    // is the student directly; when the chairman routed it to a non-student
    // recipient instead (CS-enabled only — see decisionRelay.ts), that
    // recipient gets a tracked relay task instead of the student being
    // notified directly, and becomes responsible for passing the result on.
    const studentIds: string[] = milestone.studentIds ?? [];
    if (finalized || (decision === 'reject' && stage.rejectTo === 'student')) {
      if (effectiveRecipient) {
        const chairmanSnap = await db.collection('users').doc(uid).get();
        await createRelayTask({
          recipientId: effectiveRecipient.id,
          recipientRole: effectiveRecipient.role,
          projectId: milestone.projectId ?? '',
          milestoneId,
          studentIds,
          decision,
          comment: typeof comment === 'string' ? comment.trim() : '',
          milestoneNameHe: milestone.nameHe ?? milestone.type,
          milestoneNameEn: milestone.nameEn ?? milestone.type,
          projectTitleHe: project?.titleHe ?? '',
          projectTitleEn: project?.titleEn ?? '',
          decidedByName: chairmanSnap.data()?.displayName ?? uid,
        });
      } else {
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
    return res.status(500).json({ message: L(req, 'Failed to record the committee decision.', 'שמירת החלטת הוועדה נכשלה.') });
  }
};

/** GET /api/committees/mine/pending-reviews — every milestone currently
 *  sitting at a committee stage for a committee the caller belongs to.
 *  Powers the "your committee reviews" dashboard list — a fallback to
 *  notifications, not a replacement (a missed/failed notification
 *  shouldn't mean a submission is undiscoverable). */
export const getMyPendingCommitteeReviews = async (req: AuthenticatedRequest, res: Response) => {
  const uid = req.user?.uid;
  if (!uid) return res.status(401).json({ message: L(req, 'Unauthorized.', 'אין הרשאה.') });
  try {
    const committeesSnap = await db.collection('committees').where('memberIds', 'array-contains', uid).get();
    const committeeIds = committeesSnap.docs.map((d) => d.id);

    // Two candidate sources: milestones at a committee the caller formally
    // belongs to, plus milestones where they were substituted in (see
    // substituteCommitteeMember's committeeSubstituteIds index). Firestore
    // 'in' caps at 30 values — a real account is realistically a member of a
    // small handful of committees, nowhere near that.
    const [byCommitteeSnap, bySubstitutionSnap] = await Promise.all([
      committeeIds.length > 0
        ? db.collection('milestones').where('currentCommitteeId', 'in', committeeIds.slice(0, 30)).get()
        : Promise.resolve(null),
      db.collection('milestones').where('committeeSubstituteIds', 'array-contains', uid).get(),
    ]);
    const candidateDocs = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
    byCommitteeSnap?.docs.forEach((d) => candidateDocs.set(d.id, d));
    bySubstitutionSnap.docs.forEach((d) => { if (d.data().currentCommitteeId) candidateDocs.set(d.id, d); });

    const committeeCache = new Map<string, CommitteeDoc | null>();
    committeesSnap.docs.forEach((c) => committeeCache.set(c.id, { id: c.id, ...c.data() } as CommitteeDoc));
    const loadCommittee = async (id: string): Promise<CommitteeDoc | null> => {
      if (!committeeCache.has(id)) {
        const snap = await db.collection('committees').doc(id).get();
        committeeCache.set(id, snap.exists ? ({ id: snap.id, ...snap.data() } as CommitteeDoc) : null);
      }
      return committeeCache.get(id) ?? null;
    };

    const reviews = (await Promise.all([...candidateDocs.values()].map(async (doc) => {
      const m = doc.data();
      const rawCommittee = await loadCommittee(m.currentCommitteeId);
      if (!rawCommittee) return null;
      const projectSnap = m.projectId ? await db.collection('projects').doc(m.projectId).get() : null;
      const project = projectSnap?.data();
      // Effective membership, substitutions applied — a supervisor recused
      // from this milestone no longer sees it; their stand-in does.
      const committee = applyCommitteeSubstitutions(rawCommittee, mergedCommitteeSubstitutions(project, m));
      if (!committee.memberIds.includes(uid)) return null;
      const memberVotes = ((m.committeeVotes ?? []) as CommitteeVote[]).filter((v) => v.memberId !== committee.chairmanId);
      const isChairman = committee.chairmanId === uid;
      // A member who already voted has nothing left to do here — it's no
      // longer "pending" for them, so it leaves their list. The chairman
      // never votes, and keeps it until their final decision clears
      // currentCommitteeId.
      if (!isChairman && memberVotes.some((v) => v.memberId === uid)) return null;
      return {
        milestoneId: doc.id,
        type: m.type,
        projectId: m.projectId ?? null,
        projectTitleHe: project?.titleHe ?? '',
        projectTitleEn: project?.titleEn ?? '',
        committeeId: m.currentCommitteeId,
        isChairman,
        alreadyVoted: memberVotes.some((v) => v.memberId === uid),
        voteCount: memberVotes.length,
        // Voters only — the chairman decides rather than votes.
        memberCount: committee.memberIds.filter((id) => id !== committee.chairmanId).length,
      };
    }))).filter((r): r is NonNullable<typeof r> => r !== null);

    return res.status(200).json({ reviews });
  } catch (error: any) {
    console.error('getMyPendingCommitteeReviews error:', error);
    return res.status(500).json({ message: L(req, 'Failed to load your pending committee reviews.', 'טעינת בדיקות הוועדה הממתינות שלך נכשלה.') });
  }
};
