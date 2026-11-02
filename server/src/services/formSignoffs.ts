// src/services/formSignoffs.ts
//
// Staff signatures on a finished evaluation form, between the graders and
// the final approver. Which roles sign is per-template and depends on the
// track — Electrical: nobody extra on the B.Sc. form, the coordinator on the
// M.Sc. project form, the supervisor and the head of school on the M.Sc.
// thesis form (finalGradeComponents.formSignoffRoles /
// examinerOpinionForm.formSignoffRoles, snapshotted on each milestone).
//
// Roles sign in order. A form only reaches the final approver's queue
// (finalGradeSignoffRole — the administrative coordinator) once every one of
// them has signed. Each signature is stored under
// milestone.formSignatures[role] and also stamps `${role}SignedAt` /
// `${role}SignedByName`, which is what the final report's signature lines
// already read (see finalReport.ts).

import { db } from '../config/firebase.js';
import { notifyUser } from './notify.js';
import { targetScreenFor } from './notificationTargets.js';
import { resolveStaffForScope, type ResourceScope } from './scopeAuthorization.js';
import { verifyEvaluationSignature, type EvaluationSignature, type SignedPayload } from './evaluationSignature.js';
import { deriveProcessType, resolveFinalGradeSignoffRole, type ChainRole } from './workflowTemplates.js';

type MilestoneData = FirebaseFirestore.DocumentData;

const ROLE_LABELS: Partial<Record<ChainRole, { he: string; en: string }>> = {
  supervisor: { he: 'מנחה', en: 'Supervisor' },
  coordinator: { he: 'רכז/ת פרויקטים', en: 'Projects coordinator' },
  school_head: { he: 'ראש בית הספר', en: 'Head of school' },
  program_head: { he: 'ראש תוכנית', en: 'Program head' },
  division_head: { he: 'ראש תחום', en: 'Head of division' },
  dean: { he: 'דיקן', en: 'Dean' },
  grad_school_head: { he: 'ראש בית הספר ללימודי מוסמכים', en: 'Graduate school head' },
  faculty_admin: { he: 'מנהל/ת פקולטה', en: 'Faculty admin' },
};

export function formSignoffLabel(role: ChainRole): { he: string; en: string } {
  return ROLE_LABELS[role] ?? { he: role, en: role };
}

export function formSignoffRolesOf(m: MilestoneData): ChainRole[] {
  return m.finalGradeComponents?.formSignoffRoles ?? m.examinerOpinionForm?.formSignoffRoles ?? [];
}

/** The next role that still has to sign, whether or not it's their turn yet. */
export function nextFormSignoffRole(m: MilestoneData): ChainRole | null {
  return formSignoffRolesOf(m).find((role) => !m.formSignatures?.[role]) ?? null;
}

export function formSignoffsComplete(m: MilestoneData): boolean {
  return nextFormSignoffRole(m) === null;
}

/** The form's content is settled and it's waiting on staff signatures: the
 *  supervisor confirmed the grades (evaluation form), or every examiner
 *  approved the thesis (opinion form). */
export function formAwaitingSignoffs(m: MilestoneData): boolean {
  if (m.gradeApproved || formSignoffsComplete(m)) return false;
  return m.examinerOpinionForm ? m.opinionOutcome?.result === 'continue' : m.gradeOverride?.status === 'pending';
}

/** What a staff signature covers — the grades the supervisor confirmed, or
 *  the review round the examiners approved. */
export function signedFormPayload(m: MilestoneData): SignedPayload {
  if (m.examinerOpinionForm) return { outcome: m.opinionOutcome?.result ?? null, round: m.examinerOpinionRound ?? 1 };
  return Object.fromEntries(Object.entries((m.gradeOverride?.proposedGrades ?? {}) as Record<string, number>).map(([sid, g]) => [sid, { grade: g }]));
}

export function milestoneScope(m: MilestoneData, project: MilestoneData): ResourceScope {
  return { facultyId: project.facultyId ?? m.facultyId ?? '', major: project.major || undefined, degreeLevel: project.degreeType || undefined, processType: project.projectType || undefined };
}

function milestoneSupervisorIds(m: MilestoneData): string[] {
  return [m.supervisorId, m.secondarySupervisorId].filter(Boolean);
}

/** Who may sign as `role` here. Never system_admin — a signature names a
 *  person on the form, so it can't be given on someone's behalf. */
export function formSigners(role: ChainRole, m: MilestoneData, project: MilestoneData): Promise<string[]> {
  return resolveStaffForScope(role, milestoneScope(m, project), milestoneSupervisorIds(m), [], false);
}

export interface FormSignoffLine {
  role: ChainRole;
  labelHe: string;
  labelEn: string;
  signature: (Omit<EvaluationSignature, 'digest'> & { valid: boolean }) | null;
  canSign: boolean;
}

/** The form's staff signature lines as one viewer sees them. */
export async function formSignoffLines(milestoneId: string, m: MilestoneData, project: MilestoneData, viewerUid: string): Promise<FormSignoffLine[]> {
  const roles = formSignoffRolesOf(m);
  if (roles.length === 0) return [];
  const next = nextFormSignoffRole(m);
  const payload = signedFormPayload(m);
  return Promise.all(roles.map(async (role) => {
    const stored: EvaluationSignature | undefined = m.formSignatures?.[role];
    const label = formSignoffLabel(role);
    const canSign = role === next && formAwaitingSignoffs(m) && (await formSigners(role, m, project)).includes(viewerUid);
    let signature: FormSignoffLine['signature'] = null;
    if (stored) {
      const { digest: _digest, ...shown } = stored;
      signature = { ...shown, valid: await verifyEvaluationSignature(milestoneId, stored, payload) };
    }
    return { role, labelHe: label.he, labelEn: label.en, signature, canSign };
  }));
}

/** Tells whoever signs next that the form is waiting for them. */
export async function notifyFormSignoffDue(milestoneId: string, m: MilestoneData, project: MilestoneData, role: ChainRole): Promise<void> {
  const uids = await formSigners(role, m, project);
  const title = project.titleHe || project.titleEn || '';
  const targetScreen = targetScreenFor(role, 'signoff');
  await Promise.all(uids.map((uid) => notifyUser({
    recipientId: uid,
    type: 'milestone_submitted',
    inAppType: 'form_signature_required',
    titleHe: `✍️ טופס הערכה ממתין לחתימתך — ${title}`,
    titleEn: `✍️ Evaluation form awaiting your signature — ${title}`,
    bodyHe: 'טופס ההערכה הושלם וממתין לחתימתך לפני האישור הסופי.',
    bodyEn: 'The evaluation form is complete and awaits your signature before final approval.',
    relatedProjectId: m.projectId ?? null,
    relatedMilestoneId: milestoneId,
    ...(targetScreen ? { targetScreen } : {}),
  }).catch((err) => console.error('notifyFormSignoffDue: notify failed:', err))));
}

/** Every staff signature is in — tells the final approver the form is theirs. */
export async function notifyFinalApprovalDue(milestoneId: string, m: MilestoneData, project: MilestoneData): Promise<void> {
  const scope = milestoneScope(m, project);
  const processType = deriveProcessType(project.degreeType, project.projectType);
  const role = await resolveFinalGradeSignoffRole(scope.facultyId, processType, project.major ?? null);
  const uids = await resolveStaffForScope(role, scope, milestoneSupervisorIds(m), [], false);
  const title = project.titleHe || project.titleEn || '';
  const targetScreen = targetScreenFor(role, 'signoff');
  await Promise.all(uids.map((uid) => notifyUser({
    recipientId: uid,
    type: 'milestone_submitted',
    inAppType: 'grade_override_pending',
    titleHe: `✅ טופס הערכה ממתין לאישור סופי — ${title}`,
    titleEn: `✅ Evaluation form awaiting final approval — ${title}`,
    bodyHe: 'כל החתימות על הטופס הושלמו — ממתין לאישורך הסופי.',
    bodyEn: 'All signatures on the form are in — awaiting your final approval.',
    relatedProjectId: m.projectId ?? null,
    relatedMilestoneId: milestoneId,
    ...(targetScreen ? { targetScreen } : {}),
  }).catch((err) => console.error('notifyFinalApprovalDue: notify failed:', err))));
}

export async function loadProject(m: MilestoneData): Promise<MilestoneData> {
  const snap = await db.collection('projects').doc(m.projectId ?? '').get();
  return snap.data() ?? {};
}
