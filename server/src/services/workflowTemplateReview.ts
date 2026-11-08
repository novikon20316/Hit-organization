// src/services/workflowTemplateReview.ts
//
// Read-only "review before approving" for a workflow template version (web
// app/workflow-templates, mobile WorkflowTemplateManager). Four parts:
//
//   1. diff     — what changes against the version that governs this
//                 faculty/process/major today (or the app default if none).
//   2. warnings — problems the format validation in
//                 workflowTemplateController.ts can't see: a chain or sign-off
//                 role nobody active holds in this scope (milestones would
//                 get stuck there), a missing committee, a fixed date already
//                 past, a milestone with nothing to submit, and what "apply
//                 now" does to in-progress projects.
//   3. walkthrough — each milestone in order: when it's due, and who would be
//                 asked to act at each chain step, resolved against today's
//                 staff exactly as live milestones resolve them
//                 (scopeAuthorization.ts's resolveStaffForScope).
//   4. impact   — only for applyMode 'now': per in-progress project, what
//                 approving would change — the same plan
//                 applyTemplateRetroactively executes.
//
// Nothing here writes. Staff appear by display name only (no email/phone),
// and the controller restricts this to roles that can propose or approve
// templates for the template's own scope.

import { db } from '../config/firebase.js';
import {
  DEFAULT_MILESTONES,
  DEFAULT_FINAL_REPORT_SIGNATURE_ROLES,
  findApprovedTemplateId,
  resolveMilestoneRouting,
  resolveMilestoneDueDate,
  type ChainRole,
  type MilestoneRoutingSpec,
  type ProcessType,
  type WorkflowMilestoneSpec,
  type WorkflowTemplateDoc,
} from './workflowTemplates.js';
import { resolveStaffForScope, type ResourceScope } from './scopeAuthorization.js';
import { previewRetroactiveChanges, type RetroactiveProjectImpact } from './workflowTemplateRetroactiveApply.js';
import { committeeDocId } from '../controllers/committeeController.js';
import { majorsForFaculty } from '../config/majors.js';

type Bilingual = { he: string; en: string };

export interface FieldChange {
  field: string;
  label: Bilingual;
  before: string;
  after: string;
}

export interface MilestoneDiff {
  type: string;
  nameHe: string;
  nameEn: string;
  change: 'added' | 'removed' | 'changed' | 'unchanged';
  fields: FieldChange[];
}

export interface ReviewWarning {
  severity: 'error' | 'warning' | 'info';
  milestoneType: string | null;
  he: string;
  en: string;
}

export interface WalkthroughStage {
  role: ChainRole;
  action: 'grade' | 'approve' | 'notify';
  /** 'project' = resolved per project (supervisor / assigned examiners /
   *  the student's committee), so there are no names to show up front. */
  who: { kind: 'project' } | { kind: 'staff'; count: number; names: string[] } | { kind: 'committee'; name: string | null; memberCount: number | null };
  rejectTo: string;
}

export interface WalkthroughMilestone {
  type: string;
  nameHe: string;
  nameEn: string;
  order: number;
  due: { kind: 'offset'; days: number } | { kind: 'fixed'; date: string } | { kind: 'synced'; withType: string };
  /** Due date for a student starting today — the same resolution enrollment uses. */
  sampleDueDate: string;
  stages: WalkthroughStage[];
  percentOfFinalGrade: number | null;
}

export interface TemplateReview {
  template: { id: string; version: number; status: string; applyMode: string; processType: ProcessType; facultyId: string; major: string | null };
  baseline: { id: string | null; version: number | null; major: string | null; isDefault: boolean };
  milestones: MilestoneDiff[];
  settings: FieldChange[];
  warnings: ReviewWarning[];
  walkthrough: WalkthroughMilestone[];
  impact: RetroactiveProjectImpact[] | null;
}

const ROLE_LABEL: Record<ChainRole, Bilingual> = {
  supervisor: { he: 'מנחה', en: 'Supervisor' },
  examiner: { he: 'בוחנים', en: 'Examiners' },
  coordinator: { he: 'רכז/ת', en: 'Coordinator' },
  faculty_admin: { he: 'ראש מנהל פקולטה', en: 'Faculty admin' },
  administrative_secretary: { he: 'רכזת אדמיניסטרטיבית', en: 'Administrative coordinator' },
  grad_school_head: { he: 'ראש בית ספר למוסמכים', en: 'Grad school head' },
  school_head: { he: 'ראש בית ספר', en: 'School head' },
  program_head: { he: 'ראש תוכנית', en: 'Program head' },
  division_head: { he: 'ראש תחום', en: 'Head of division' },
  dean: { he: 'דיקן', en: 'Dean' },
  committee: { he: 'ועדה', en: 'Committee' },
};

const ACTION_LABEL: Record<string, Bilingual> = {
  grade: { he: 'ציון', en: 'grades' },
  approve: { he: 'אישור', en: 'approves' },
  notify: { he: 'עדכון', en: 'notified' },
};

/** Roles resolved per project/milestone rather than from staff lists. */
const PER_PROJECT_ROLES = new Set<ChainRole>(['supervisor', 'examiner', 'committee']);
const MAX_NAMES = 5;

function isMasters(processType: ProcessType): boolean {
  return processType === 'msc_thesis' || processType === 'msc_project';
}

/** Same mapping as workflowTemplateController.ts's templateResourceScope. */
function templateScope(t: { facultyId: string; major: string | null; processType: ProcessType }): ResourceScope {
  return {
    facultyId: t.facultyId,
    ...(t.major ? { major: t.major } : {}),
    degreeLevel: isMasters(t.processType) ? 'masters' : 'bachelors',
    ...(t.processType === 'msc_thesis' ? { processType: 'thesis' as const }
      : t.processType === 'msc_project' ? { processType: 'project' as const } : {}),
  };
}

function chainText(routing: MilestoneRoutingSpec): string {
  return routing.map((s) => `${ROLE_LABEL[s.role]?.en ?? s.role} (${ACTION_LABEL[s.action]?.en ?? s.action})`).join(' → ') || '—';
}

function dueText(m: WorkflowMilestoneSpec): string {
  if (m.syncDueDateWith) return `same as ${m.syncDueDateWith}`;
  if (m.dateMode === 'fixed' && m.fixedDate) return m.fixedDate.slice(0, 10);
  return `day ${m.dueDaysFromStart}`;
}

function rubricText(m: WorkflowMilestoneSpec): string {
  const parts = (m.gradingComponents ?? []).map((c) => `${c.labelEn ?? c.key} ${c.weight}%`);
  return parts.length ? parts.join(', ') : '—';
}

const yesNo = (v: unknown) => (v ? 'yes' : 'no');

/** The milestone fields an approver cares about, as comparable text. */
function milestoneFields(m: WorkflowMilestoneSpec, defaultRouting: MilestoneRoutingSpec | undefined): Array<{ field: string; label: Bilingual; value: string }> {
  return [
    { field: 'name', label: { he: 'שם', en: 'Name' }, value: `${m.nameHe} / ${m.nameEn}` },
    { field: 'order', label: { he: 'מיקום', en: 'Position' }, value: String(m.order) },
    { field: 'due', label: { he: 'מועד', en: 'Due' }, value: dueText(m) },
    { field: 'chain', label: { he: 'שרשרת אישורים', en: 'Approval chain' }, value: chainText(resolveMilestoneRouting(m, defaultRouting)) },
    { field: 'percent', label: { he: 'משקל בציון הסופי', en: 'Weight in final grade' }, value: m.percentOfFinalGrade != null ? `${m.percentOfFinalGrade}%` : '—' },
    { field: 'rubric', label: { he: 'מחוון', en: 'Rubric' }, value: rubricText(m) },
    { field: 'examiners', label: { he: 'דורש בוחנים', en: 'Requires examiners' }, value: yesNo(m.requiresExaminers) },
    { field: 'submission', label: { he: 'מה מגישים', en: 'Submission' }, value: m.submissionRequirement ?? '—' },
    { field: 'fileTypes', label: { he: 'סוגי קבצים', en: 'File types' }, value: (m.allowedFileTypes ?? []).join(', ') || '—' },
    { field: 'seminar', label: { he: 'סמינר', en: 'Seminar' }, value: yesNo(m.seminarScheduling) },
    { field: 'staffRecord', label: { he: 'רשומת מנחה', en: 'Staff record' }, value: m.staffRecordMode ?? 'none' },
    { field: 'finalGrade', label: { he: 'טופס ציון סופי', en: 'Final-grade form' }, value: yesNo(m.finalGradeComponents) },
    { field: 'opinionForm', label: { he: 'טופס חוות דעת בוחן', en: 'Examiner opinion form' }, value: yesNo(m.examinerOpinionForm) },
  ];
}

function diffMilestones(
  before: WorkflowMilestoneSpec[], beforeRouting: MilestoneRoutingSpec | undefined,
  after: WorkflowMilestoneSpec[], afterRouting: MilestoneRoutingSpec | undefined,
): MilestoneDiff[] {
  const beforeByType = new Map(before.map((m) => [m.type, m]));
  const afterTypes = new Set(after.map((m) => m.type));
  const result: MilestoneDiff[] = after.slice().sort((a, b) => a.order - b.order).map((m) => {
    const prev = beforeByType.get(m.type);
    if (!prev) return { type: m.type, nameHe: m.nameHe, nameEn: m.nameEn, change: 'added', fields: [] };
    const prevFields = new Map(milestoneFields(prev, beforeRouting).map((f) => [f.field, f.value]));
    const fields = milestoneFields(m, afterRouting)
      .filter((f) => prevFields.get(f.field) !== f.value)
      .map((f) => ({ field: f.field, label: f.label, before: prevFields.get(f.field) ?? '—', after: f.value }));
    return { type: m.type, nameHe: m.nameHe, nameEn: m.nameEn, change: fields.length ? 'changed' : 'unchanged', fields };
  });
  for (const prev of before) {
    if (!afterTypes.has(prev.type)) result.push({ type: prev.type, nameHe: prev.nameHe, nameEn: prev.nameEn, change: 'removed', fields: [] });
  }
  return result;
}

type SettingsSource = Partial<Pick<WorkflowTemplateDoc,
  'examinerSignoffRole' | 'finalGradeSignoffRole' | 'finalReportSignatureRoles' | 'firstStepMode' | 'supervisorSelectionRequiresApproval' | 'defaultRouting'>>;

function settingsFields(s: SettingsSource, processType: ProcessType): Array<{ field: string; label: Bilingual; value: string }> {
  const examinerSignoff = s.examinerSignoffRole ?? (processType === 'msc_thesis' ? 'grad_school_head' : 'none');
  return [
    { field: 'defaultRouting', label: { he: 'שרשרת ברירת מחדל', en: 'Default chain' }, value: s.defaultRouting ? chainText(s.defaultRouting) : 'Supervisor (grades) → Coordinator (approves)' },
    { field: 'examinerSignoffRole', label: { he: 'אישור הזמנת בוחנים', en: 'Examiner invitation sign-off' }, value: examinerSignoff === 'none' ? 'none' : ROLE_LABEL[examinerSignoff]?.en ?? examinerSignoff },
    { field: 'finalGradeSignoffRole', label: { he: 'אישור ציון סופי', en: 'Final grade sign-off' }, value: ROLE_LABEL[s.finalGradeSignoffRole ?? 'grad_school_head']?.en ?? String(s.finalGradeSignoffRole) },
    { field: 'finalReportSignatureRoles', label: { he: 'חתימות בדוח הסופי', en: 'Final report signatures' }, value: (s.finalReportSignatureRoles ?? DEFAULT_FINAL_REPORT_SIGNATURE_ROLES).map((r) => ROLE_LABEL[r]?.en ?? r).join(', ') },
    { field: 'firstStepMode', label: { he: 'צעד ראשון לסטודנט', en: "Student's first step" }, value: s.firstStepMode ?? 'browse_projects' },
    { field: 'supervisorSelectionRequiresApproval', label: { he: 'בחירת מנחה דורשת אישור', en: 'Supervisor choice needs approval' }, value: yesNo(s.supervisorSelectionRequiresApproval ?? true) },
  ];
}

interface StaffInfo { count: number; names: string[] }

/** Active holders of `role` within the template's scope, by display name. */
async function staffForRole(role: ChainRole, scope: ResourceScope, cache: Map<ChainRole, StaffInfo>): Promise<StaffInfo> {
  const cached = cache.get(role);
  if (cached) return cached;
  // includeSystemAdmin false: an admin can always act, but counting them
  // would hide exactly the "nobody in this faculty holds this role" gap.
  const uids = await resolveStaffForScope(role, scope, [], [], false);
  const snaps = uids.length ? await db.getAll(...uids.map((uid) => db.collection('users').doc(uid))) : [];
  const active = snaps.filter((s) => s.exists && s.data()?.isActive !== false);
  const info = {
    count: active.length,
    names: active.slice(0, MAX_NAMES).map((s) => String(s.data()?.displayName ?? s.data()?.displayNameHe ?? s.id)),
  };
  cache.set(role, info);
  return info;
}

export async function buildTemplateReview(template: WorkflowTemplateDoc): Promise<TemplateReview> {
  const processType = template.processType;
  const major = template.major ?? null;
  const scope = templateScope({ facultyId: template.facultyId, major, processType });
  const milestones = (template.milestones ?? []).slice().sort((a, b) => a.order - b.order);

  // ─── 1. Diff against what governs this subject today ──────────────────────
  const current = await findApprovedTemplateId(template.facultyId, processType, major);
  const baselineIsSelf = current?.id === template.id;
  const baselineDoc = current && !baselineIsSelf ? (await db.collection('workflowTemplates').doc(current.id).get()).data() : null;
  const baselineMilestones = current && !baselineIsSelf ? current.milestones : DEFAULT_MILESTONES;
  const baselineSettings: SettingsSource = current && !baselineIsSelf ? current : {};
  const baseline = {
    id: current && !baselineIsSelf ? current.id : null,
    version: (baselineDoc?.version as number | undefined) ?? null,
    major: (baselineDoc?.major as string | null | undefined) ?? null,
    isDefault: !current || baselineIsSelf,
  };

  const milestoneDiff = diffMilestones(baselineMilestones, baselineSettings.defaultRouting, milestones, template.defaultRouting);
  const beforeSettings = new Map(settingsFields(baselineSettings, processType).map((f) => [f.field, f.value]));
  const settings = settingsFields(template, processType)
    .filter((f) => beforeSettings.get(f.field) !== f.value)
    .map((f) => ({ field: f.field, label: f.label, before: beforeSettings.get(f.field) ?? '—', after: f.value }));

  // ─── 3. Walkthrough (also feeds the role warnings below) ──────────────────
  const staffCache = new Map<ChainRole, StaffInfo>();
  const committeeLookup = await committeeInfo(template.facultyId, major, processType);
  const today = new Date();
  const walkthrough: WalkthroughMilestone[] = [];
  for (const m of milestones) {
    const routing = resolveMilestoneRouting(m, template.defaultRouting);
    const stages: WalkthroughStage[] = [];
    for (const stage of routing) {
      let who: WalkthroughStage['who'];
      if (stage.role === 'committee') {
        who = { kind: 'committee', name: committeeLookup.name, memberCount: committeeLookup.memberCount };
      } else if (PER_PROJECT_ROLES.has(stage.role)) {
        who = { kind: 'project' };
      } else {
        who = { kind: 'staff', ...(await staffForRole(stage.role, scope, staffCache)) };
      }
      stages.push({ role: stage.role, action: stage.action, who, rejectTo: stage.rejectTo });
    }
    const due: WalkthroughMilestone['due'] = m.syncDueDateWith
      ? { kind: 'synced', withType: m.syncDueDateWith }
      : m.dateMode === 'fixed' && m.fixedDate ? { kind: 'fixed', date: m.fixedDate } : { kind: 'offset', days: m.dueDaysFromStart };
    walkthrough.push({
      type: m.type, nameHe: m.nameHe, nameEn: m.nameEn, order: m.order, due,
      sampleDueDate: resolveMilestoneDueDate(m, today, milestones).toISOString(),
      stages,
      percentOfFinalGrade: m.percentOfFinalGrade ?? null,
    });
  }

  // ─── 2. Warnings ──────────────────────────────────────────────────────────
  const warnings: ReviewWarning[] = [];
  const roleGap = async (role: ChainRole, milestoneType: string | null, where: Bilingual) => {
    if (PER_PROJECT_ROLES.has(role)) return;
    const info = await staffForRole(role, scope, staffCache);
    if (info.count > 0) return;
    warnings.push({
      severity: 'error',
      milestoneType,
      he: `אף משתמש פעיל לא מחזיק בתפקיד "${ROLE_LABEL[role]?.he ?? role}" בפקולטה/בחוג הזה — ${where.he} ייתקע בשלב הזה (הרשאות פרטניות ומנהל המערכת לא נספרו).`,
      en: `No active user holds the "${ROLE_LABEL[role]?.en ?? role}" role for this faculty/major — ${where.en} would get stuck at this step (individual permission grants and the system admin aren't counted).`,
    });
  };

  const seenStageGaps = new Set<string>();
  for (const w of walkthrough) {
    for (const s of w.stages) {
      if (seenStageGaps.has(`${w.type}:${s.role}`)) continue;
      seenStageGaps.add(`${w.type}:${s.role}`);
      await roleGap(s.role, w.type, { he: `"${w.nameHe}"`, en: `"${w.nameEn}"` });
    }
  }
  const signoffRoles: Array<[ChainRole | undefined, Bilingual]> = [
    [template.examinerSignoffRole && template.examinerSignoffRole !== 'none' ? template.examinerSignoffRole : (template.examinerSignoffRole === undefined && processType === 'msc_thesis' ? 'grad_school_head' : undefined), { he: 'אישור הזמנת הבוחנים', en: 'examiner invitations' }],
    [template.finalGradeSignoffRole ?? 'grad_school_head', { he: 'אישור הציון הסופי', en: 'final grade sign-off' }],
  ];
  for (const [role, where] of signoffRoles) if (role) await roleGap(role, null, where);
  for (const m of milestones) {
    for (const role of [...(m.finalGradeComponents?.formSignoffRoles ?? []), ...(m.examinerOpinionForm?.formSignoffRoles ?? [])]) {
      await roleGap(role, m.type, { he: `החתימה על הטופס ב"${m.nameHe}"`, en: `form sign-off on "${m.nameEn}"` });
    }
  }

  if (walkthrough.some((w) => w.stages.some((s) => s.role === 'committee'))) {
    if (committeeLookup.missingMajors.length > 0) {
      warnings.push({
        severity: 'error',
        milestoneType: null,
        he: `לחוגים הבאים אין ועדה מוגדרת, ושלב הוועדה ייתקע אצלם: ${committeeLookup.missingMajors.join(', ')}.`,
        en: `These majors have no committee set up, so the committee step would get stuck for them: ${committeeLookup.missingMajors.join(', ')}.`,
      });
    }
  }

  const todayIso = today.toISOString().slice(0, 10);
  for (const m of milestones) {
    if (m.dateMode === 'fixed' && m.fixedDate && m.fixedDate.slice(0, 10) < todayIso) {
      warnings.push({ severity: 'warning', milestoneType: m.type, he: `המועד הקבוע של "${m.nameHe}" (${m.fixedDate.slice(0, 10)}) כבר עבר.`, en: `"${m.nameEn}" has a fixed due date (${m.fixedDate.slice(0, 10)}) that has already passed.` });
    }
    if (m.submissionRequirement === 'none') {
      warnings.push({ severity: 'warning', milestoneType: m.type, he: `ב"${m.nameHe}" הסטודנט לא מגיש קובץ ולא הערה — לא יהיה מה לבדוק.`, en: `"${m.nameEn}" asks the student for neither a file nor a comment — there would be nothing to review.` });
    }
    if (m.syncDueDateWith && !milestones.some((x) => x.type === m.syncDueDateWith)) {
      warnings.push({ severity: 'warning', milestoneType: m.type, he: `המועד של "${m.nameHe}" מסונכרן לאבן דרך שלא קיימת בגרסה הזו.`, en: `"${m.nameEn}" syncs its due date to a milestone that isn't in this version.` });
    }
  }
  const percentTotal = milestones.reduce((sum, m) => sum + (m.percentOfFinalGrade ?? 0), 0);
  if (milestones.some((m) => m.percentOfFinalGrade != null) && Math.abs(percentTotal - 100) > 0.01) {
    warnings.push({ severity: 'error', milestoneType: null, he: `משקלי אבני הדרך בציון הסופי מסתכמים ל-${percentTotal}% ולא ל-100%.`, en: `Milestone weights in the final grade add up to ${percentTotal}%, not 100%.` });
  }

  // ─── 4. Impact on in-progress projects (apply "now" only) ─────────────────
  let impact: RetroactiveProjectImpact[] | null = null;
  if (template.applyMode === 'now' && template.status === 'pending_approval') {
    impact = await previewRetroactiveChanges(template.facultyId, processType, major, milestones);
    const removed = milestoneDiff.filter((d) => d.change === 'removed');
    if (impact.length > 0) {
      warnings.push({
        severity: 'info',
        milestoneType: null,
        he: `"החל עכשיו" יעדכן ${impact.length} פרויקטים בתהליך. מועדי אבני דרך שעוד לא הוגשו יחושבו מחדש מיום האישור, לא מיום תחילת הפרויקט של הסטודנט.`,
        en: `"Apply now" updates ${impact.length} in-progress projects. Due dates of milestones not yet submitted are recalculated from the approval day, not from the student's own start date.`,
      });
    }
    if (removed.length > 0 && impact.length > 0) {
      warnings.push({
        severity: 'info',
        milestoneType: null,
        he: `אבני דרך שהוסרו (${removed.map((r) => r.nameHe).join(', ')}) יישארו בפרויקטים שכבר בתהליך.`,
        en: `Removed milestones (${removed.map((r) => r.nameEn).join(', ')}) stay on projects already in progress.`,
      });
    }
  }

  const order = { error: 0, warning: 1, info: 2 } as const;
  warnings.sort((a, b) => order[a.severity] - order[b.severity]);

  return {
    template: { id: template.id, version: template.version, status: template.status, applyMode: template.applyMode, processType, facultyId: template.facultyId, major },
    baseline,
    milestones: milestoneDiff,
    settings,
    warnings,
    walkthrough,
    impact,
  };
}

/** The committee a 'committee' stage would route to, and which majors (for
 *  a faculty-wide template) have none — same doc id the live lookup
 *  (committeeController.ts's resolveCommitteeForProject) reads. */
async function committeeInfo(facultyId: string, major: string | null, processType: ProcessType): Promise<{ name: string | null; memberCount: number | null; missingMajors: string[] }> {
  const degreeLevel = isMasters(processType) ? 'masters' : 'bachelors';
  const type = processType === 'msc_thesis' ? 'thesis' : 'final_project';
  const majors = major ? [major] : majorsForFaculty(facultyId);
  if (majors.length === 0) return { name: null, memberCount: null, missingMajors: [] };
  const snaps = await db.getAll(...majors.map((m) => db.collection('committees').doc(committeeDocId(facultyId, m, degreeLevel, type))));
  const missingMajors = majors.filter((_, i) => !snaps[i]!.exists);
  if (major && snaps[0]!.exists) {
    const data = snaps[0]!.data()!;
    const members = new Set<string>([...(data.memberIds ?? []), ...(data.chairmanId ? [data.chairmanId] : [])]);
    return { name: (data.name as string | undefined) ?? null, memberCount: members.size, missingMajors };
  }
  return { name: null, memberCount: null, missingMajors };
}
