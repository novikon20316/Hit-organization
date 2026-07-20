// src/services/revisionDecisions.ts
//
// P1 backlog item #13 — once external/internal examiner opinions are in on a
// pre-defense thesis submission, nothing in this app ever acted on them
// (examinerTokens.status flips to 'submitted' and just sits there — see
// services/examinerAccess.ts's header comment: accept/decline/submit are
// client-only Firestore writes with no server-side consumer). This models
// the missing decision step explicitly: advisor/coordinator picks one of
// four outcomes once opinions are in, with the choice + note preserved in an
// append-only history (shares the "never overwrite a decision" principle
// services/milestoneRevisions.ts already established for resubmissions).

import admin from 'firebase-admin';
import { db } from '../config/firebase.js';
import { logAuditEvent } from './auditLog.js';

export type RevisionDecisionType = 'proceed_to_defense' | 'require_corrections' | 're_judge' | 'add_examiner';

const VALID_DECISIONS: RevisionDecisionType[] = ['proceed_to_defense', 'require_corrections', 're_judge', 'add_examiner'];

export function isValidRevisionDecision(value: unknown): value is RevisionDecisionType {
  return typeof value === 'string' && VALID_DECISIONS.includes(value as RevisionDecisionType);
}

export interface RevisionDecisionEntry {
  decision: RevisionDecisionType;
  note: string | null;
  decidedBy: string;
  decidedByRole: string;
  decidedAt: admin.firestore.Timestamp;
}

async function notify(
  recipientId: string,
  titleHe: string, titleEn: string, bodyHe: string, bodyEn: string,
  projectId: string | null, milestoneId: string,
): Promise<void> {
  try {
    await db.collection('notifications').add({
      recipientId, type: 'general', titleHe, titleEn, bodyHe, bodyEn,
      isRead: false,
      relatedProjectId: projectId,
      relatedMilestoneId: milestoneId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.error(`revisionDecisions.notify failed for ${recipientId}:`, err);
  }
}

export async function recordRevisionDecision(
  milestoneId: string,
  decision: RevisionDecisionType,
  note: string | undefined,
  decidedBy: string,
  decidedByRole: string,
): Promise<{ status: string }> {
  const milestoneRef = db.collection('milestones').doc(milestoneId);
  const milestoneSnap = await milestoneRef.get();
  if (!milestoneSnap.exists) throw new Error('Milestone not found.');
  const milestone = milestoneSnap.data()!;

  const entry: RevisionDecisionEntry = {
    decision,
    note: note?.trim() || null,
    decidedBy,
    decidedByRole,
    decidedAt: admin.firestore.Timestamp.now(),
  };

  const studentIds: string[] = milestone.studentIds ?? [];
  const supervisorId: string | null = milestone.supervisorId ?? null;
  const projectId: string | null = milestone.projectId ?? null;
  const label = milestone.nameEn ?? milestone.type;

  let nextStatus = milestone.status;
  const updatePayload: Record<string, unknown> = {
    revisionDecisions: admin.firestore.FieldValue.arrayUnion(entry),
  };

  if (decision === 'proceed_to_defense') {
    nextStatus = 'coordinator_approved';
    updatePayload.status = nextStatus;
    updatePayload.coordinatorApprovedAt = admin.firestore.FieldValue.serverTimestamp();
    updatePayload.coordinatorId = decidedBy;
  } else if (decision === 'require_corrections') {
    // Same fields coordinatorRejectMilestone writes — buildRevisionArchiveUpdate
    // (milestoneRevisions.ts) picks these up transparently on the next resubmit.
    nextStatus = 'rejected';
    updatePayload.status = nextStatus;
    updatePayload.coordinatorRejectedAt = admin.firestore.FieldValue.serverTimestamp();
    updatePayload.coordinatorId = decidedBy;
    updatePayload.rejectionReason = entry.note ?? 'Corrections required following examiner opinions.';
  } else if (decision === 're_judge') {
    // Re-open every examiner's review on this milestone so they can submit a
    // fresh opinion — external tokens' submitted opinion is left in place
    // (submitExaminerOpinion overwrites it on resubmission); this only
    // reopens the *status* gate.
    const tokensSnap = await db.collection('examinerTokens')
      .where('milestoneId', '==', milestoneId)
      .where('status', '==', 'submitted')
      .get();
    await Promise.all(tokensSnap.docs.map((doc) => doc.ref.update({ status: 'accepted', reopenedAt: admin.firestore.FieldValue.serverTimestamp() })));
  }
  // 'add_examiner' makes no status change — the coordinator uses the
  // existing assign-examiners flow; this decision is a documented signal only.

  await milestoneRef.update(updatePayload);

  await logAuditEvent({
    userId: decidedBy,
    userRole: decidedByRole,
    action: 'revision_decision_recorded',
    entityType: 'milestone',
    entityId: milestoneId,
    oldValue: { status: milestone.status },
    newValue: { decision, status: nextStatus },
    explanation: entry.note ?? undefined,
  });

  const decisionLabelHe: Record<RevisionDecisionType, string> = {
    proceed_to_defense: 'המשך להגנה',
    require_corrections: 'נדרשים תיקונים',
    re_judge: 'שיפוט חוזר',
    add_examiner: 'הוספת בוחן',
  };
  const decisionLabelEn: Record<RevisionDecisionType, string> = {
    proceed_to_defense: 'Proceed to defense',
    require_corrections: 'Corrections required',
    re_judge: 'Re-judge',
    add_examiner: 'Add an examiner',
  };

  await Promise.all([
    ...studentIds.map((sid) => notify(
      sid,
      `החלטה על "${label}"`, `Decision on "${label}"`,
      `ההחלטה בעקבות חוות דעת הבוחנים: ${decisionLabelHe[decision]}.${entry.note ? ` הערה: ${entry.note}` : ''}`,
      `The decision following examiner opinions: ${decisionLabelEn[decision]}.${entry.note ? ` Note: ${entry.note}` : ''}`,
      projectId, milestoneId,
    )),
    supervisorId ? notify(
      supervisorId,
      `החלטה על "${label}"`, `Decision on "${label}"`,
      `ההחלטה בעקבות חוות דעת הבוחנים: ${decisionLabelHe[decision]}.${entry.note ? ` הערה: ${entry.note}` : ''}`,
      `The decision following examiner opinions: ${decisionLabelEn[decision]}.${entry.note ? ` Note: ${entry.note}` : ''}`,
      projectId, milestoneId,
    ) : Promise.resolve(),
  ]);

  return { status: nextStatus };
}
