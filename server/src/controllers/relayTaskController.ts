// src/controllers/relayTaskController.ts
//
// Tracked follow-up for a committee decision the chairman routed to someone
// other than the student (see services/decisionRelay.ts) — that person is
// responsible for relaying the outcome to the student themselves, and this
// keeps the obligation visible on their dashboard until they explicitly
// mark it done, rather than trusting a one-shot notification alone.
//
// An administrative coordinator recipient gets more than "pass it on": if
// she spots a mistake she may instead send the milestone back to the
// committee (to decide again) or to the supervisor (to re-check it) — see
// resolveRelayTask's `action`.

import { Response } from 'express';
import admin from 'firebase-admin';
import { db } from '../config/firebase.js';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { L } from '../utils/localize.js';
import { notifyUser } from '../services/notify.js';
import { logAuditEvent } from '../services/auditLog.js';
import { statusForStage } from '../services/milestoneRouting.js';
import { targetScreenFor } from '../services/notificationTargets.js';
import { resolveStaffForScope, type ResourceScope } from '../services/scopeAuthorization.js';
import type { ChainStage } from '../services/workflowTemplates.js';
import { onEnterCommitteeStage } from './committeeReviewController.js';
import { applyCommitteeSubstitutions, mergedCommitteeSubstitutions, type CommitteeDoc } from './committeeController.js';

type RelayAction = 'student' | 'committee' | 'supervisor';

/** Only an administrative-coordinator recipient may send the decision back
 *  instead of passing it on — every other recipient keeps the plain
 *  "I've informed the student" button. */
function canReturnDecision(task: FirebaseFirestore.DocumentData): boolean {
  return task.recipientRole === 'administrative_secretary';
}

/** The committee stage that made this task's decision. Tasks created before
 *  committeeStageId was stored fall back to the milestone's latest
 *  committeeReviewHistory entry (the decision that opened the task). */
function committeeStageIdFor(task: FirebaseFirestore.DocumentData, milestone: FirebaseFirestore.DocumentData): string | null {
  if (typeof task.committeeStageId === 'string' && task.committeeStageId) return task.committeeStageId;
  const history: Array<{ stageId?: string }> = milestone.committeeReviewHistory ?? [];
  return history[history.length - 1]?.stageId ?? null;
}

/** The milestone is still exactly where the chairman's decision left it —
 *  otherwise (e.g. the student already resubmitted after a rejection)
 *  routing it backwards would clobber newer progress. */
function milestoneStillAtDecision(task: FirebaseFirestore.DocumentData, milestone: FirebaseFirestore.DocumentData, committeeStageId: string | null): boolean {
  if (task.decision === 'approve') {
    const routing: ChainStage[] = milestone.routing ?? [];
    return milestone.status === 'coordinator_approved' && routing[milestone.currentStageIndex ?? 0]?.id === committeeStageId;
  }
  return milestone.status === 'rejected';
}

/** GET /api/relay-tasks/mine — every open (unresolved) relay task assigned
 *  to the caller, oldest first. canReturnToCommittee/canReturnToSupervisor
 *  tell the client which extra options to offer (both false for anyone
 *  who isn't the administrative coordinator recipient). */
export const getMyRelayTasks = async (req: AuthenticatedRequest, res: Response) => {
  const uid = req.user?.uid;
  if (!uid) return res.status(401).json({ message: L(req, 'Unauthorized.', 'אין הרשאה.') });
  try {
    const snap = await db.collection('relayTasks')
      .where('recipientId', '==', uid)
      .where('resolvedAt', '==', null)
      .orderBy('createdAt', 'asc')
      .get();
    const tasks = await Promise.all(snap.docs.map(async (doc) => {
      const data = doc.data();
      let canReturnToCommittee = false;
      let canReturnToSupervisor = false;
      if (canReturnDecision(data) && data.milestoneId) {
        const mSnap = await db.collection('milestones').doc(data.milestoneId).get();
        const m = mSnap.data();
        if (m) {
          const stageId = committeeStageIdFor(data, m);
          const routing: ChainStage[] = m.routing ?? [];
          if (milestoneStillAtDecision(data, m, stageId)) {
            canReturnToCommittee = !!stageId && routing.some((s) => s.id === stageId);
            canReturnToSupervisor = routing.some((s) => s.role === 'supervisor');
          }
        }
      }
      return { id: doc.id, ...data, canReturnToCommittee, canReturnToSupervisor };
    }));
    return res.status(200).json({ tasks });
  } catch (error: any) {
    console.error('getMyRelayTasks error:', error);
    return res.status(500).json({ message: L(req, 'Failed to load your relay tasks.', 'טעינת המשימות שלך להעברת מידע נכשלה.') });
  }
};

/** POST /api/relay-tasks/:id/resolve — closes the recipient's task. Only the
 *  assigned recipient may resolve their own task.
 *    action 'student' (default) — the outcome is passed on to the student,
 *      who is also notified of it directly.
 *    action 'committee' | 'supervisor' — administrative coordinator only, with
 *      a mandatory comment: undoes the decision's effect on the milestone and
 *      routes it back to that committee stage / the chain's supervisor stage. */
export const resolveRelayTask = async (req: AuthenticatedRequest, res: Response) => {
  const uid = req.user?.uid;
  const { id } = req.params as { id: string };
  const { action: rawAction, comment: rawComment } = req.body ?? {};
  const action: RelayAction = rawAction === 'committee' || rawAction === 'supervisor' ? rawAction : 'student';
  const comment = typeof rawComment === 'string' ? rawComment.trim() : '';
  if (!uid) return res.status(401).json({ message: L(req, 'Unauthorized.', 'אין הרשאה.') });
  if (rawAction !== undefined && !['student', 'committee', 'supervisor'].includes(rawAction)) {
    return res.status(400).json({ message: L(req, 'Invalid action.', 'פעולה לא תקינה.') });
  }
  if (action !== 'student' && !comment) {
    return res.status(400).json({ message: L(req, 'Please explain why you are sending this back.', 'יש לנמק מדוע ההחלטה מוחזרת.') });
  }
  try {
    const ref = db.collection('relayTasks').doc(id);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ message: L(req, 'Relay task not found.', 'משימת ההעברה לא נמצאה.') });
    const data = snap.data()!;
    if (data.recipientId !== uid) {
      return res.status(403).json({ message: L(req, 'Only the assigned recipient may resolve this task.', 'רק הנמען שאליו הוקצתה המשימה יכול לסגור אותה.') });
    }
    if (data.resolvedAt) return res.status(200).json({ success: true });

    const resolution = {
      resolvedAt: admin.firestore.FieldValue.serverTimestamp(),
      resolution: action,
      resolutionComment: comment,
    };

    if (action === 'student') {
      await ref.update(resolution);
      // The student gets the same notice they'd have received had the
      // chairman sent the decision to them directly (see
      // committeeReviewController.ts's submitCommitteeDecision).
      const approved = data.decision === 'approve';
      const studentIds: string[] = data.studentIds ?? [];
      await Promise.all(studentIds.map(async (studentId) => {
        try {
          await notifyUser({
            recipientId: studentId,
            type: 'general',
            inAppType: approved ? 'milestone_coordinator_approved' : 'milestone_coordinator_rejected',
            titleHe: approved ? 'אבן דרך אושרה על ידי הוועדה' : 'אבן דרך נדחתה על ידי הוועדה',
            titleEn: approved ? 'Milestone approved by the committee' : 'Milestone rejected by the committee',
            bodyHe: approved
              ? `הוועדה אישרה את "${data.milestoneNameHe ?? ''}".`
              : `הוועדה דחתה את "${data.milestoneNameHe ?? ''}". סיבה: ${data.comment ?? ''}`,
            bodyEn: approved
              ? `The committee approved "${data.milestoneNameEn ?? ''}".`
              : `The committee rejected "${data.milestoneNameEn ?? ''}". Reason: ${data.comment ?? ''}`,
            relatedProjectId: data.projectId ?? null,
            relatedMilestoneId: data.milestoneId ?? null,
          });
        } catch (err) {
          console.error(`resolveRelayTask: student notify failed for ${studentId}:`, err);
        }
      }));
      return res.status(200).json({ success: true });
    }

    if (!canReturnDecision(data)) {
      return res.status(403).json({ message: L(req, 'Only the administrative coordinator may send a decision back.', 'רק הרכזת המנהלית רשאית להחזיר החלטה.') });
    }

    const milestoneRef = db.collection('milestones').doc(data.milestoneId);
    let target: ChainStage | null = null;
    await db.runTransaction(async (transaction) => {
      const [taskSnap, mSnap] = await Promise.all([transaction.get(ref), transaction.get(milestoneRef)]);
      if (taskSnap.data()?.resolvedAt) throw Object.assign(new Error('already_resolved'), { status: 409 });
      const m = mSnap.data();
      if (!m) throw Object.assign(new Error('milestone_missing'), { status: 404 });
      const routing: ChainStage[] = m.routing ?? [];
      const stageId = committeeStageIdFor(data, m);
      if (!milestoneStillAtDecision(data, m, stageId)) throw Object.assign(new Error('moved_on'), { status: 409 });
      const targetIndex = action === 'committee'
        ? routing.findIndex((s) => s.id === stageId)
        : routing.findIndex((s) => s.role === 'supervisor');
      if (targetIndex < 0) throw Object.assign(new Error('no_target'), { status: 400 });
      target = routing[targetIndex]!;
      transaction.update(milestoneRef, {
        status: statusForStage(target),
        currentStageIndex: targetIndex,
        stageEnteredAt: admin.firestore.FieldValue.serverTimestamp(),
        coordinatorApprovedAt: admin.firestore.FieldValue.delete(),
        coordinatorRejectedAt: admin.firestore.FieldValue.delete(),
        rejectionReason: admin.firestore.FieldValue.delete(),
        // Same reasoning as rejectChainMilestone — a re-run from the
        // supervisor stage must not count stale dual-sign stamps.
        ...(action === 'supervisor' ? { supervisorApprovals: {} } : {}),
      });
      transaction.update(ref, resolution);
    });

    await logAuditEvent({
      userId: uid,
      userRole: 'administrative_secretary',
      action: 'relay_decision_returned',
      entityType: 'milestone',
      entityId: data.milestoneId,
      oldValue: { decision: data.decision },
      newValue: { returnedTo: action, stageId: (target as ChainStage | null)?.id ?? null },
      explanation: comment,
    });

    const milestoneNameHe = data.milestoneNameHe ?? '';
    const milestoneNameEn = data.milestoneNameEn ?? '';
    const project = data.projectId ? (await db.collection('projects').doc(data.projectId).get()).data() : undefined;

    if (action === 'committee') {
      // Re-opens the committee round exactly like any other entry into the
      // stage (fresh votes, conflict-of-interest hold, member notifications).
      const fresh = (await milestoneRef.get()).data()!;
      await onEnterCommitteeStage(data.milestoneId, fresh);
      // The members' generic "new submission" notice doesn't say why — the
      // chairman also gets the administrative coordinator's reason.
      const after = (await milestoneRef.get()).data()!;
      if (after.currentCommitteeId) {
        const cSnap = await db.collection('committees').doc(after.currentCommitteeId).get();
        if (cSnap.exists) {
          const committee = applyCommitteeSubstitutions({ id: cSnap.id, ...cSnap.data() } as CommitteeDoc, mergedCommitteeSubstitutions(project, after));
          if (committee.chairmanId) {
            try {
              await notifyUser({
                recipientId: committee.chairmanId,
                type: 'general',
                inAppType: 'committee_review_requested',
                titleHe: 'החלטת הוועדה הוחזרה לדיון חוזר',
                titleEn: 'A committee decision was sent back for reconsideration',
                bodyHe: `הרכזת המנהלית החזירה את ההחלטה על "${milestoneNameHe}" לוועדה. סיבה: ${comment}`,
                bodyEn: `The administrative coordinator sent the decision on "${milestoneNameEn}" back to the committee. Reason: ${comment}`,
                pushBodyHe: `ההחלטה על "${milestoneNameHe}" הוחזרה לוועדה. פתח/י את האפליקציה לפרטים.`,
                pushBodyEn: `The decision on "${milestoneNameEn}" was sent back to the committee. Open the app for details.`,
                relatedProjectId: data.projectId ?? null,
                relatedMilestoneId: data.milestoneId,
                channels: { email: true, sms: false, whatsapp: false },
                targetScreen: 'committees',
              });
            } catch (err) {
              console.error(`resolveRelayTask: chairman notify failed for ${committee.chairmanId}:`, err);
            }
          }
        }
      }
    } else {
      const resource: ResourceScope = {
        facultyId: project?.facultyId ?? '',
        major: project?.major || undefined,
        degreeLevel: project?.degreeType || undefined,
        processType: project?.projectType || undefined,
      };
      const projectSupervisorIds = [project?.supervisorId, project?.secondarySupervisorId].filter((s): s is string => !!s);
      const supervisorUids = await resolveStaffForScope('supervisor', resource, projectSupervisorIds, [], false);
      const targetScreen = targetScreenFor('supervisor', 'milestone_action');
      await Promise.all(supervisorUids.map(async (supervisorId) => {
        try {
          await notifyUser({
            recipientId: supervisorId,
            type: 'general',
            titleHe: 'אבן דרך הוחזרה אליך לבדיקה חוזרת',
            titleEn: 'A milestone was sent back to you to re-check',
            bodyHe: `הרכזת המנהלית החזירה את "${milestoneNameHe}" לבדיקתך החוזרת לאחר החלטת הוועדה. סיבה: ${comment}`,
            bodyEn: `The administrative coordinator sent "${milestoneNameEn}" back to you to re-check after the committee's decision. Reason: ${comment}`,
            pushBodyHe: `אבן הדרך "${milestoneNameHe}" הוחזרה לבדיקתך. פתח/י את האפליקציה לפרטים.`,
            pushBodyEn: `Milestone "${milestoneNameEn}" was sent back to you for review. Open the app for details.`,
            relatedProjectId: data.projectId ?? null,
            relatedMilestoneId: data.milestoneId,
            channels: { email: true, sms: false, whatsapp: false },
            ...(targetScreen ? { targetScreen } : { taskKind: 'milestone_action' }),
          });
        } catch (err) {
          console.error(`resolveRelayTask: supervisor notify failed for ${supervisorId}:`, err);
        }
      }));
    }

    return res.status(200).json({ success: true });
  } catch (error: any) {
    if (error?.status === 409 && error.message === 'moved_on') {
      return res.status(409).json({ message: L(req, 'This milestone has already moved on since the decision — it can no longer be sent back.', 'אבן הדרך כבר התקדמה מאז ההחלטה — לא ניתן עוד להחזיר אותה.') });
    }
    if (error?.status === 409) return res.status(200).json({ success: true });
    if (error?.status === 400) {
      return res.status(400).json({ message: L(req, 'This milestone has no such stage to send it back to.', 'אין לאבן דרך זו שלב שאליו ניתן להחזיר אותה.') });
    }
    if (error?.status === 404) return res.status(404).json({ message: L(req, 'Milestone not found.', 'אבן הדרך לא נמצאה.') });
    console.error('resolveRelayTask error:', error);
    return res.status(500).json({ message: L(req, 'Failed to resolve the relay task.', 'סגירת משימת ההעברה נכשלה.') });
  }
};
