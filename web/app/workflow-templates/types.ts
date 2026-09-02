// app/workflow-templates/types.ts
// Real, faculty-configurable milestone templates — see
// server/src/services/workflowTemplates.ts and
// server/src/controllers/workflowTemplateController.ts. Distinct from
// app/faculty_admin/templates, which manages an unrelated concept (a
// project-proposal catalog supervisors submit to faculty admins).
//
// Three process types (msc_thesis / msc_project / bsc_project) each have
// their own milestone list. Proposing a new version requires approval before
// it takes effect: master's processes need the grad school head; bachelor's
// is approved by the faculty itself (faculty_admin/coordinator) — the
// canApproveRole/isMastersProcess helpers below are ported verbatim from
// workflowTemplateController.ts's canApprove()/isMastersProcess().

import { HIT_FACULTIES } from '@/lib/faculties';
import { hasActionGrant, type ScopeRule } from '@/lib/permissions';

export type ProcessType = 'msc_thesis' | 'msc_project' | 'bsc_project';
export type TemplateStatus = 'pending_approval' | 'approved' | 'rejected' | 'superseded';

// Mirrors GradingComponentSpec in server/src/services/workflowTemplates.ts.
export interface GradingComponentSpec {
  key: string;
  labelHe: string;
  labelEn: string;
  maxScore: number;
  weight: number;
  hasComment: boolean;
  visibleToStudent: boolean;
  /** Cosmetic category heading shown above this component when it differs
   *  from the previous one's group — purely a rendering grouping. */
  groupHe?: string;
  groupEn?: string;
  /** True means this component is scored/stored like any other but its
   *  score is NOT summed into the rubric's total (e.g. a poster score
   *  recorded independently alongside a presentation rubric). */
  excludeFromTotal?: boolean;
}

// Mirrors ChainRole/RejectionTarget/ChainStage/MilestoneRoutingSpec in
// server/src/services/workflowTemplates.ts.
export type ChainRole = 'supervisor' | 'examiner' | 'coordinator' | 'faculty_admin' | 'administrative_secretary' | 'grad_school_head' | 'program_head' | 'committee';
export type RejectionTarget = 'student' | string;

export interface ChainStage {
  id: string;
  role: ChainRole;
  action: 'grade' | 'approve';
  rejectTo: RejectionTarget;
  /** Only meaningful when role === 'committee'. The specific committee this
   *  stage always routes to, chosen explicitly at template-authoring time —
   *  overrides the per-student-major dynamic lookup entirely when set.
   *  Omitted keeps the dynamic resolution (still correct when the
   *  template's own major is a specific slug, since there's only ever one
   *  candidate committee for that faculty+major+type anyway). */
  committeeId?: string;
}

export type MilestoneRoutingSpec = ChainStage[];

// Mirrors SubmissionRequirement in server/src/services/workflowTemplates.ts.
// 'none' is allowed but discouraged — see MilestoneRowModal.tsx's warning.
export type SubmissionRequirement = 'file' | 'comment' | 'both' | 'none';

export const SUBMISSION_REQUIREMENTS: { key: SubmissionRequirement; he: string; en: string }[] = [
  { key: 'file', he: 'קובץ', en: 'File' },
  { key: 'comment', he: 'הערה', en: 'Comment' },
  { key: 'both', he: 'קובץ והערה', en: 'File and comment' },
  { key: 'none', he: 'ללא (לא מומלץ)', en: 'Neither (not recommended)' },
];

// Mirrors MilestoneFileType/MILESTONE_FILE_TYPES in
// server/src/services/workflowTemplates.ts. Only meaningful when
// submissionRequirement is 'file'/'both' — see MilestoneRowModal.tsx.
export type MilestoneFileType = 'pdf' | 'word' | 'powerpoint' | 'image' | 'zip';

export const MILESTONE_FILE_TYPES: { key: MilestoneFileType; he: string; en: string }[] = [
  { key: 'pdf', he: 'PDF', en: 'PDF' },
  { key: 'word', he: 'Word (‎.doc/.docx)', en: 'Word (.doc/.docx)' },
  { key: 'powerpoint', he: 'PowerPoint (‎.ppt/.pptx)', en: 'PowerPoint (.ppt/.pptx)' },
  { key: 'image', he: 'תמונה (PNG/JPG)', en: 'Image (PNG/JPG)' },
  { key: 'zip', he: 'ZIP', en: 'ZIP Archive' },
];

// The strictest safe default for a newly-created milestone — see
// server/src/services/workflowTemplates.ts's DEFAULT_ALLOWED_FILE_TYPES.
export const DEFAULT_ALLOWED_FILE_TYPES: MilestoneFileType[] = ['pdf'];

// Mirrors FormFieldSpec/FinalGradeRubric in server/src/services/workflowTemplates.ts.
export interface FormFieldSpec {
  key: string;
  labelHe: string;
  labelEn: string;
  type: 'text' | 'textarea' | 'date' | 'number' | 'table' | 'yesno';
  required: boolean;
  tableColumns?: Array<{ key: string; labelHe: string; labelEn: string; type: 'text' | 'number' | 'date' }>;
  /** Only meaningful when type === 'yesno' — which answer makes this field's
   *  paired comment mandatory. Omitted means the comment is always optional. */
  commentRequiredOn?: 'yes' | 'no';
}

export interface FinalGradeRubric {
  components: GradingComponentSpec[];
  weight: number;
}

export interface FinalGradeComponents {
  supervisorEvaluation: FinalGradeRubric;
  examinerProjectEvaluation: FinalGradeRubric;
  examinerDefenseEvaluation: FinalGradeRubric;
}

// Valid roles for a chain STAGE — includes 'examiner', which resolves to a
// milestone's own assigned examiner panel (not a broadly-held staff role,
// see server/src/services/scopeAuthorization.ts's resolveStaffForScope).
// Lets a milestone type (e.g. a Poster session) be graded examiner-only,
// with no supervisor stage at all.
export const CHAIN_ROLES: { key: ChainRole; he: string; en: string }[] = [
  { key: 'supervisor', he: 'מנחה', en: 'Supervisor' },
  { key: 'examiner', he: 'בוחן', en: 'Examiner' },
  { key: 'coordinator', he: 'רכז', en: 'Coordinator' },
  { key: 'faculty_admin', he: 'מנהל פקולטה', en: 'Faculty Admin' },
  { key: 'administrative_secretary', he: 'רכזת אדמיניסטרטיבית', en: 'Administrative Coordinator' },
  { key: 'grad_school_head', he: 'ראש בית ספר ללימודי מוסמכים', en: 'Grad School Head' },
  { key: 'program_head', he: 'ראש תוכנית', en: 'Program Head' },
  // Routes to the department's thesis/final_project committee (see
  // server/src/controllers/committeeController.ts) — 'thesis' if the
  // project's own projectType is 'thesis', else 'final_project'. Unlike
  // every other role here, every committee member votes independently and
  // only the chairman can actually advance/reject the stage.
  { key: 'committee', he: 'ועדה', en: 'Committee' },
];

// examinerSignoffRole/finalGradeSignoffRole are a single overall approver
// resolved without any per-milestone examinerIds in scope — 'examiner' would
// always resolve to nobody there, so it's excluded from this narrower list
// (matches the server-side SIGNOFF_ROLES split in workflowTemplateController.ts).
// 'committee' excluded for the same reason plus its own — it's a
// multi-actor vote-then-chairman-decides flow, not a single approver.
export const SIGNOFF_ROLES = CHAIN_ROLES.filter((r) => r.key !== 'examiner' && r.key !== 'committee');

export function chainRoleLabel(role: ChainRole, lang: 'he' | 'en'): string {
  return CHAIN_ROLES.find((r) => r.key === role)?.[lang] ?? role;
}

// Matches today's actual hardcoded runtime behavior — the fallback whenever a
// template has neither its own defaultRouting nor a milestone-level override.
export const DEFAULT_ROUTING: MilestoneRoutingSpec = [
  { id: 'supervisor', role: 'supervisor', action: 'grade', rejectTo: 'student' },
  { id: 'coordinator', role: 'coordinator', action: 'approve', rejectTo: 'student' },
];

export interface MilestoneSpec {
  type: string;
  nameHe: string;
  nameEn: string;
  order: number;
  /** 'fixed' means `fixedDate` is used instead of `dueDaysFromStart` — the
   *  same absolute calendar date for every student under this template,
   *  regardless of when they individually enrolled. Omitted (or 'offset')
   *  is the original behavior. A template can mix both across milestones.
   *  Mirrors server/src/services/workflowTemplates.ts. */
  dateMode?: 'offset' | 'fixed';
  /** Ignored when dateMode === 'fixed'. */
  dueDaysFromStart: number;
  /** ISO date (YYYY-MM-DD). Only meaningful when dateMode === 'fixed'. */
  fixedDate?: string;
  /** The `type` of another milestone in the SAME template whose due date
   *  this milestone always mirrors instead of computing its own (e.g. a
   *  presentation + poster pair that must always be due the same day
   *  because staff evaluates them together). This milestone's own dateMode
   *  fields above stay as a fallback. Mirrors
   *  server/src/services/workflowTemplates.ts. */
  syncDueDateWith?: string;
  requiresExaminers: boolean;
  /** How many examiner slots a defense panel needs for this milestone. Only
   *  meaningful when requiresExaminers is true. Omitted means the legacy
   *  default of 2. See AssignExaminersModal.tsx and
   *  server/src/services/defenseScheduling.ts. */
  examinerCount?: number;
  /** True means this milestone has NO supervisor grading stage at all — it
   *  finalizes once every assigned examiner has independently submitted
   *  their score (or form answers). Only meaningful when requiresExaminers
   *  is true. Mirrors server/src/services/workflowTemplates.ts. */
  examinerOnlyGrading?: boolean;
  /** Optional — omitted/empty means the grading form falls back to its
   *  hardcoded default rubric. */
  gradingComponents?: GradingComponentSpec[];
  /** A set of fields every ASSIGNED EXAMINER fills independently — a non-
   *  scored sibling of gradingComponents (yes/no screening questions, free
   *  text, numbers, dates...). Only meaningful when requiresExaminers is
   *  true. Authored via MilestoneRowModal.tsx's examiner-form section.
   *  Mirrors server/src/services/workflowTemplates.ts. */
  examinerFormFields?: FormFieldSpec[];
  /** Per-milestone override of the template's defaultRouting. Omitted means
   *  this milestone inherits defaultRouting (or DEFAULT_ROUTING). */
  routing?: MilestoneRoutingSpec;
  /** Lets staff (the supervisor) attach an official record alongside the
   *  student's own submission, on any milestone type, either by uploading a
   *  file or filling staffFormFields online. Omitted/'none' keeps today's
   *  behavior. */
  staffRecordMode?: 'none' | 'upload_or_form';
  staffFormFields?: FormFieldSpec[];
  /** Only meaningful for the 'defense' milestone type — replaces the single
   *  shared gradingComponents rubric with three independent ones (supervisor /
   *  examiner-on-the-project / examiner-on-the-defense), combined via their
   *  own weights (summing to 100) into the milestone's final grade. */
  finalGradeComponents?: FinalGradeComponents;
  /** How much this milestone counts toward the project's OVERALL final
   *  grade (0-100), validated to sum to 100 across every milestone in the
   *  template before it can be proposed (see new/page.tsx's ProposeVersionForm
   *  handleSubmit). Distinct from gradingComponents[].weight, which is a
   *  rubric WITHIN one milestone. Omitted (pre-existing templates) means
   *  "defense = 100, everything else = 0" — today's implicit behavior —
   *  see server/src/services/gradeEngine.ts's computeProjectFinalGrade. */
  percentOfFinalGrade?: number;
  /** What the student must attach when submitting this milestone — see the
   *  SubmissionRequirement type doc above. Omitted (pre-existing templates)
   *  means no requirement recorded, same as 'none' at submission time. */
  submissionRequirement?: SubmissionRequirement;
  /** Which file types a student may attach, when submissionRequirement is
   *  'file'/'both'. Omitted means unrestricted (every milestone created
   *  before this feature existed, or one that never calls for a file).
   *  Mirrors server/src/services/workflowTemplates.ts. */
  allowedFileTypes?: MilestoneFileType[];
}

export type ApplyMode = 'now' | 'from_now_on';

export interface WorkflowTemplateDoc {
  id: string;
  facultyId: string;
  processType: ProcessType;
  /** A major slug, or `null` for "all majors in this faculty" (the
   *  fallback tier — also what every pre-existing template effectively
   *  means). */
  major: string | null;
  version: number;
  status: TemplateStatus;
  milestones: MilestoneSpec[];
  createdBy: string;
  createdByMajor?: string | null;
  createdAt: string;
  proposedNote: string | null;
  applyMode: ApplyMode;
  /** Template-level default chain — any milestone without its own `routing`
   *  inherits this. Omitted means DEFAULT_ROUTING (today's hardcoded chain). */
  defaultRouting?: MilestoneRoutingSpec;
  /** Who must sign off on examiner invitations before they go out, once a
   *  coordinator has approved the recommended list — distinct from milestone
   *  routing, this governs the separate examinerRecommendations flow.
   *  Omitted → legacy default (grad_school_head for msc_thesis, none for
   *  everything else). 'none' → no second tier, for any process type. A
   *  ChainRole → that role signs off, for any process type. */
  examinerSignoffRole?: ChainRole | 'none';
  /** Who signs off on a defense milestone's already-computed final grade,
   *  before it transfers to Michlol — distinct from milestone routing and
   *  from examinerSignoffRole. No 'none' option: this step is always
   *  required. Omitted → legacy default (grad_school_head, for any process
   *  type). */
  finalGradeSignoffRole?: ChainRole;
  /** What a student with no active project sees first for this subject —
   *  omitted means 'browse_projects' (today's only behavior). See
   *  server's workflowTemplates.ts's resolveFirstStepMode. */
  firstStepMode?: 'browse_projects' | 'choose_supervisor';
  /** Only meaningful when firstStepMode === 'choose_supervisor'. Omitted
   *  means true (the safer default — requires approval). */
  supervisorSelectionRequiresApproval?: boolean;
  approvedBy?: string;
  approvedAt?: string;
  retroactiveAppliedAt?: string;
  retroactiveAffectedCount?: number;
  rejectedBy?: string;
  rejectedAt?: string;
  rejectionReason?: string;
}

export const PROCESS_TYPES: { key: ProcessType; he: string; en: string }[] = [
  { key: 'msc_thesis', he: 'תזה לתואר שני', en: "Master's Thesis" },
  { key: 'msc_project', he: 'פרויקט גמר לתואר שני', en: "Master's Project" },
  { key: 'bsc_project', he: 'פרויקט לתואר ראשון', en: "Bachelor's Project" },
];

// Ported verbatim from workflowTemplateController.ts — PROPOSER_ROLES is not
// consumed on the web side today (proposing is gated by the page's own
// useRequireRole list, which is a superset), but kept here for parity with
// mobile and in case a narrower "can propose" check is needed later.
export const PROPOSER_ROLES = ['coordinator', 'faculty_admin', 'program_head', 'administrative_secretary', 'grad_school_head', 'system_admin'];
// administrative_secretary is a proposer only — she must never be able to
// approve, reject, or delete a template herself (maker/checker separation;
// mirrors server/src/controllers/workflowTemplateController.ts).
export const GRAD_SCHOOL_APPROVER_ROLES = ['grad_school_head', 'system_admin'];
export const FACULTY_APPROVER_ROLES = ['faculty_admin', 'coordinator', 'system_admin'];

export function isMastersProcess(pt: ProcessType): boolean {
  return pt === 'msc_thesis' || pt === 'msc_project';
}

export function canApproveRole(pt: ProcessType, role: string | null | undefined): boolean {
  if (!role) return false;
  return isMastersProcess(pt) ? GRAD_SCHOOL_APPROVER_ROLES.includes(role) : FACULTY_APPROVER_ROLES.includes(role);
}

/** Same decision as canApproveRole, but also honors a scoped 'approve_templates'
 *  detailed-permission grant (system_admin's Bulk/Edit-User Permissions
 *  editor) — lets a staff member outside the normal approver roles act on
 *  templates within their granted facultyId/major/degreeLevel/processType.
 *  Mirrors server/src/controllers/workflowTemplateController.ts's
 *  canApprove() + hasActionGrant() OR-gate. */
export function canApproveTemplate(
  tpl: Pick<WorkflowTemplateDoc, 'processType' | 'facultyId' | 'major'>,
  userData: { role?: string; roles?: string[]; permissionRules?: ScopeRule[] } | null | undefined
): boolean {
  if (canApproveRole(tpl.processType, userData?.role)) return true;
  return hasActionGrant(userData, 'approve_templates', {
    facultyId: tpl.facultyId,
    major: tpl.major ?? undefined,
    degreeLevel: isMastersProcess(tpl.processType) ? 'masters' : 'bachelors',
    processType: tpl.processType === 'msc_thesis' ? 'thesis' : tpl.processType === 'msc_project' ? 'project' : undefined,
  });
}

export function processTypeLabel(pt: ProcessType, lang: 'he' | 'en'): string {
  return PROCESS_TYPES.find((p) => p.key === pt)?.[lang] ?? pt;
}

/** Major options for a faculty, filtered to the degree level implied by the
 *  selected process type (bsc_project → bachelors, msc_* → masters) — a
 *  major with no program at that level simply isn't offered for that tab. */
export function majorOptionsFor(facultyId: string, processType: ProcessType, lang: 'he' | 'en'): { slug: string; label: string }[] {
  const level = isMastersProcess(processType) ? 'masters' : 'bachelors';
  const faculty = HIT_FACULTIES.find((f) => f.key === facultyId);
  if (!faculty) return [];
  const seen = new Set<string>();
  return faculty.programs
    .filter((p) => p.level === level && !seen.has(p.slug) && seen.add(p.slug))
    .map((p) => ({ slug: p.slug, label: p.label[lang] }));
}

export function makeId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function emptyMilestone(order: number): MilestoneSpec {
  return { type: `custom_${makeId()}`, nameHe: '', nameEn: '', order, dueDaysFromStart: 90, requiresExaminers: false, submissionRequirement: 'both' };
}
