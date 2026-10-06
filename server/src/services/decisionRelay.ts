// src/services/decisionRelay.ts
//
// Lets a committee chairman choose WHO a terminal committee decision
// (final approval, or a rejection that goes back to the student) is handed
// to, instead of it always landing on the student directly — see
// committeeReviewController.ts's submitCommitteeDecision, the only caller.
// Gated per-major so this can be rolled out to other departments later
// without any code change beyond DECISION_RELAY_ENABLED_MAJORS; today only
// Computer Science has asked for it.
//
// When the chairman picks someone other than the student, that person
// becomes responsible for relaying the outcome to the student themselves —
// tracked as an open `relayTasks` doc (not just a one-shot notification) so
// it stays visible on their dashboard until they explicitly mark it done
// (see relayTaskController.ts).

import admin from 'firebase-admin';
import { db } from '../config/firebase.js';
import { notifyUser } from './notify.js';
import { resolveStaffForScope, type ResourceScope } from './scopeAuthorization.js';
import { readDecisionRelayEnabledMajors } from './decisionRelayConfig.js';

// System_admin-editable (see decisionRelayConfig.ts + the admin panel's
// "Decision Relay" modal) — this file only ever reads the current list, it
// never decides it.
export async function isDecisionRelayEnabled(major: string | null | undefined): Promise<boolean> {
  if (!major) return false;
  const enabledMajors = await readDecisionRelayEnabledMajors();
  return enabledMajors.includes(major);
}

export interface DecisionRecipientCandidate {
  id: string;
  name: string;
  role: 'supervisor' | 'secondary_supervisor' | 'coordinator' | 'administrative_secretary' | 'program_head';
}

/** Every non-student person actually involved with this project who the
 *  chairman could hand the decision to — the project's own supervisor(s)
 *  plus whichever coordinator/administrative_secretary/program_head are in
 *  scope for it. Deliberately excludes students: "student" is always
 *  available as the implicit default, never a pickable candidate here. */
export async function resolveDecisionRecipientCandidates(
  project: { supervisorId?: string; secondarySupervisorId?: string },
  resource: ResourceScope,
): Promise<DecisionRecipientCandidate[]> {
  const supervisorIds = [project.supervisorId, project.secondarySupervisorId].filter((id): id is string => !!id);

  const entries: Array<{ id: string; role: DecisionRecipientCandidate['role'] }> = [];
  if (project.supervisorId) entries.push({ id: project.supervisorId, role: 'supervisor' });
  if (project.secondarySupervisorId) entries.push({ id: project.secondarySupervisorId, role: 'secondary_supervisor' });

  const roleFans: Array<'coordinator' | 'administrative_secretary' | 'program_head'> = ['coordinator', 'administrative_secretary', 'program_head'];
  const fanResults = await Promise.all(
    roleFans.map((role) => resolveStaffForScope(role, resource, supervisorIds, [], false)),
  );
  fanResults.forEach((uids, i) => {
    uids.forEach((id) => entries.push({ id, role: roleFans[i]! }));
  });

  const dedupedById = new Map<string, DecisionRecipientCandidate['role']>();
  entries.forEach(({ id, role }) => { if (!dedupedById.has(id)) dedupedById.set(id, role); });
  if (dedupedById.size === 0) return [];

  const snaps = await db.getAll(...[...dedupedById.keys()].map((id) => db.collection('users').doc(id)));
  return snaps
    .filter((s) => s.exists)
    .map((s) => ({ id: s.id, name: s.data()?.displayName ?? s.id, role: dedupedById.get(s.id)! }));
}

export interface CreateRelayTaskParams {
  recipientId: string;
  recipientRole: DecisionRecipientCandidate['role'];
  projectId: string;
  milestoneId: string;
  studentIds: string[];
  decision: 'approve' | 'reject';
  comment: string;
  milestoneNameHe: string;
  milestoneNameEn: string;
  projectTitleHe: string;
  projectTitleEn: string;
  decidedByName: string;
}

/** Opens the tracked relay task plus the recipient's own notification —
 *  called instead of notifying the student directly, when the chairman
 *  routed a terminal decision to a non-student recipient. */
export async function createRelayTask(params: CreateRelayTaskParams): Promise<void> {
  const {
    recipientId, recipientRole, projectId, milestoneId, studentIds, decision, comment,
    milestoneNameHe, milestoneNameEn, projectTitleHe, projectTitleEn, decidedByName,
  } = params;

  await db.collection('relayTasks').add({
    recipientId,
    recipientRole,
    projectId,
    milestoneId,
    studentIds,
    decision,
    comment,
    milestoneNameHe,
    milestoneNameEn,
    projectTitleHe,
    projectTitleEn,
    decidedByName,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    resolvedAt: null,
  });

  try {
    await notifyUser({
      recipientId,
      type: 'general',
      inAppType: 'decision_relay_requested',
      titleHe: decision === 'approve' ? 'עליך להעביר לסטודנט: אבן דרך אושרה' : 'עליך להעביר לסטודנט: אבן דרך נדחתה',
      titleEn: decision === 'approve' ? 'Please relay to the student: milestone approved' : 'Please relay to the student: milestone rejected',
      bodyHe: `הוועדה ${decision === 'approve' ? 'אישרה' : 'דחתה'} את "${milestoneNameHe}" בפרויקט "${projectTitleHe}". יו"ר הוועדה ביקש שאת/ה תעביר/י את התוצאה לסטודנט/ית.${comment ? ` הערה: ${comment}` : ''}`,
      bodyEn: `The committee ${decision === 'approve' ? 'approved' : 'rejected'} "${milestoneNameEn}" on project "${projectTitleEn}". The committee chairman asked you to relay this result to the student.${comment ? ` Note: ${comment}` : ''}`,
      relatedProjectId: projectId,
      relatedMilestoneId: milestoneId,
      targetScreen: 'relay_tasks',
      channels: { email: true, sms: false, whatsapp: false },
    });
  } catch (err) {
    console.error(`createRelayTask: notify failed for recipient ${recipientId} on milestone ${milestoneId}:`, err);
  }
}
