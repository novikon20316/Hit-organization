// src/services/workflowTemplates.ts
//
// A real, faculty-configurable milestone-template engine — replacing the
// hardcoded MILESTONE_TEMPLATES constant duplicated across
// projectEnrollment.ts and milestoneController.ts. Each faculty can define
// (and version) its own milestone list per process type; new enrollments
// pull from the faculty's currently-APPROVED template, falling back to the
// same defaults the app has always used when no template has been approved
// yet. Milestone generation only ever runs once, at enrollment — so a
// template change never retroactively affects students already in progress,
// matching the "no auto-apply to in-progress students" requirement.
//
// Approval chain: master's processes (msc_thesis, msc_project) require
// grad_school_head sign-off; bachelor's (bsc_project) is approved by the
// faculty itself (faculty_admin/coordinator) — see workflowTemplateController.ts
// for the role gating, this file is pure data/logic.

import { db } from '../config/firebase.js';

export type ProcessType = 'msc_thesis' | 'msc_project' | 'bsc_project';

// Canonical ordering for picking a "primary" scalar value out of a
// degreeTypes/projectTypes multi-select array (see createAdminProject/
// createSupervisorProject) — deterministic regardless of checkbox click
// order, so every existing scalar-field reader sees a stable value.
export const DEGREE_TYPE_ORDER = ['bachelors', 'masters'] as const;
export const PROJECT_TYPE_ORDER = ['project', 'thesis'] as const;

export function deriveProcessType(degreeType: string | null | undefined, projectType: string | null | undefined): ProcessType {
  if (degreeType === 'masters') {
    return projectType === 'thesis' ? 'msc_thesis' : 'msc_project';
  }
  return 'bsc_project';
}

// P1 backlog item #8 — grading rubric components, per-milestone and
// per-faculty/track, instead of the fixed clarity/feasibility/innovation/
// methodology/writing array hardcoded in projectController.ts's
// submitMilestoneGrade. Schema only for now: reading this into the actual
// grading endpoints is deferred (that controller is mid-refactor elsewhere),
// but the template editor UI (web/app/workflow-templates) already lets a
// faculty define these per milestone, so they're captured and versioned
// starting now rather than lost.
export interface GradingComponentSpec {
  key: string;
  labelHe: string;
  labelEn: string;
  maxScore: number;
  weight: number;
  hasComment: boolean;
  visibleToStudent: boolean;
  /** Cosmetic category heading shown above this component when it differs
   *  from the previous component's group (e.g. "מטרות פרויקט") — purely a
   *  rendering grouping, ignored by computeGradingComponentsScore. Omitted
   *  renders today's flat, ungrouped list. */
  groupHe?: string;
  groupEn?: string;
  /** True means this component is scored and stored like any other, but its
   *  score is NOT summed into the rubric's total (e.g. a poster score
   *  recorded alongside a presentation rubric, entered independently rather
   *  than contributing to the presentation's own point total). Omitted
   *  (false) keeps today's behavior of every component counting toward the
   *  total. See computeGradingComponentsScore in milestoneRouting.ts. */
  excludeFromTotal?: boolean;
}

/** A single field in a staff-fillable online form (see WorkflowMilestoneSpec's
 *  staffFormFields) — deliberately small (no nesting/conditional-fields), just
 *  enough to render a department's existing paper form as an equivalent set of
 *  inputs. 'table' is a repeatable-row field (e.g. a Gantt chart) where each
 *  row has the same columns, described by `tableColumns`. */
export interface FormFieldSpec {
  key: string;
  labelHe: string;
  labelEn: string;
  type: 'text' | 'textarea' | 'date' | 'number' | 'table' | 'yesno';
  required: boolean;
  /** Only meaningful when type === 'table' — the columns of each row. */
  tableColumns?: Array<{ key: string; labelHe: string; labelEn: string; type: 'text' | 'number' | 'date' }>;
  /** Only meaningful when type === 'yesno' — which answer makes this field's
   *  paired comment mandatory (the comment box is disabled/optional for the
   *  other answer). E.g. "is the topic suitable? yes/no" where only a "no"
   *  answer requires an explanation. Omitted means the comment is always
   *  optional. See ExaminerFormFieldsModal (web + mobile) for the renderer
   *  and submitExaminerFormAnswers for the server-side re-validation. */
  commentRequiredOn?: 'yes' | 'no';
  /** Marks this field as system-derived rather than freely typed — the
   *  renderer shows the resolved value read-only instead of an input, and
   *  submitMilestone/submitStaffRecord skip it when checking "did the actor
   *  fill in every required field" (a locked field is never actually typed
   *  by whoever is submitting). See resolveAutoFillValue's callers for how
   *  each variant is resolved server-side. */
  autoFill?: 'studentName' | 'studentIdNumber' | 'studentPhone' | 'studentEmail'
    | 'studentPhoto' | 'accumulatedCredits' | 'supervisorName' | 'submissionDate'
    | 'projectNameHe' | 'projectNameEn';
  /** Only meaningful alongside autoFill — true means the value can never be
   *  edited by the student, even as a fallback when the auto-filled source is
   *  empty (e.g. a not-yet-computed accumulatedCredits shows a "pending"
   *  state rather than becoming a free-text box). Omitted defaults to true
   *  for any field that has autoFill set — an autoFill field with no
   *  server-side value simply renders blank/pending, it never silently
   *  becomes editable. */
  locked?: boolean;
}

/** One of the three independently-scored rubrics that combine into a
 *  defense milestone's final grade (see WorkflowMilestoneSpec.finalGradeComponents) —
 *  same shape as a single grader's gradingComponents list, just one of three. */
export interface FinalGradeRubric {
  components: GradingComponentSpec[];
  /** This rubric's share of the final grade (0-100) — the three rubrics'
   *  weights on a template must sum to 100, validated at proposal time. */
  weight: number;
}

// P1 backlog item — configurable approval/rejection routing per milestone.
// Schema + template-editor UI + versioning/approval only for now: the actual
// submit/grade/approve/reject endpoints still run today's hardcoded
// supervisor-then-coordinator chain (see DEFAULT_ROUTING below) until a
// separate follow-up rewires them to read a milestone's resolved routing.
// 'examiner' resolves to a milestone's own assigned examiner panel
// (examinerIds), not a broadly-held staff role — see scopeAuthorization.ts's
// resolveStaffForScope, which special-cases it the same way it already does
// 'supervisor'. Lets a milestone type be graded examiner-only (no supervisor
// stage at all), e.g. a Poster-session milestone.
// 'committee' resolves to the department's thesis/final_project committee
// (see committeeController.ts's resolveCommitteeForProject) — 'thesis' if
// the project's own projectType is 'thesis', else 'final_project'. Unlike
// every other role here, it's NOT single-actor "first one wins": every
// committee member votes independently, and only the committee's chairman
// can actually advance/reject the stage — see the dedicated
// committee-vote/committee-decision endpoints in committeeReviewController.ts,
// not the generic approve/reject chain endpoints.
export type ChainRole = 'supervisor' | 'examiner' | 'coordinator' | 'faculty_admin' | 'administrative_secretary' | 'grad_school_head' | 'program_head' | 'committee';
// 'student', or another stage's `id` within the same chain (self-reference allowed).
export type RejectionTarget = 'student' | string;

export interface ChainStage {
  /** Stable id (client-generated), used for rejectTo references + reordering. */
  id: string;
  role: ChainRole;
  /** 'grade' submits a numeric score against the milestone's rubric; 'approve' is a pure sign-off. */
  action: 'grade' | 'approve';
  rejectTo: RejectionTarget;
  /** Only meaningful when role === 'committee'. The specific committee this
   *  stage always routes to, chosen explicitly by whoever authored the
   *  template — overrides the per-student-major dynamic lookup
   *  (committeeController.ts's resolveCommitteeForProject) entirely when
   *  set. Omitted keeps the dynamic resolution (the only option before this
   *  field existed, still correct for a template pinned to one specific
   *  major, where there's only ever one candidate committee anyway). See
   *  committeeReviewController.ts's onEnterCommitteeStage. */
  committeeId?: string;
}

export type MilestoneRoutingSpec = ChainStage[];

// What a student must attach when submitting this milestone. 'none' is
// allowed but discouraged (flagged as such in the template editor UI) — most
// milestones should require at least a file or a comment to review.
// Omitted on a milestone spec/doc means "no requirement recorded" (every
// milestone created before this feature existed) — submitMilestone/
// submitStudentMilestone treat that the same as 'none', so nothing already
// in flight is retroactively blocked.
export type SubmissionRequirement = 'file' | 'comment' | 'both' | 'none';

// The file categories a milestone's `allowedFileTypes` can restrict a
// student's upload to — only meaningful when submissionRequirement is
// 'file'/'both'. Each category maps to the actual MIME types/extensions
// milestoneController.ts's submitMilestone (and projectController.ts's
// submitStudentMilestone) check an uploaded file against; extensions are the
// fallback for a client that sends a generic/incorrect MIME type (common for
// mobile document pickers), same reasoning as MilestoneFilePanel.tsx's own
// guessMimeFromUrl on the read side.
export type MilestoneFileType = 'pdf' | 'word' | 'powerpoint' | 'image' | 'zip';

export const MILESTONE_FILE_TYPES: { key: MilestoneFileType; labelHe: string; labelEn: string; mimeTypes: string[]; extensions: string[] }[] = [
  { key: 'pdf', labelHe: 'PDF', labelEn: 'PDF', mimeTypes: ['application/pdf'], extensions: ['pdf'] },
  { key: 'word', labelHe: 'Word (‎.doc/.docx)', labelEn: 'Word (.doc/.docx)', mimeTypes: ['application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'], extensions: ['doc', 'docx'] },
  { key: 'powerpoint', labelHe: 'PowerPoint (‎.ppt/.pptx)', labelEn: 'PowerPoint (.ppt/.pptx)', mimeTypes: ['application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'], extensions: ['ppt', 'pptx'] },
  { key: 'image', labelHe: 'תמונה (PNG/JPG)', labelEn: 'Image (PNG/JPG)', mimeTypes: ['image/png', 'image/jpeg'], extensions: ['png', 'jpg', 'jpeg'] },
  { key: 'zip', labelHe: 'ZIP', labelEn: 'ZIP Archive', mimeTypes: ['application/zip'], extensions: ['zip'] },
];

// A newly-created milestone (no explicit staff choice yet) restricts to PDF
// only — the strictest, safest default. Only applied when submissionRequirement
// is 'file'/'both'; see workflowTemplateController.ts's validateMilestones.
export const DEFAULT_ALLOWED_FILE_TYPES: MilestoneFileType[] = ['pdf'];

/** Whether an uploaded file (its reported MIME type and original filename)
 *  matches one of a milestone's allowed file-type categories. A milestone
 *  with no allowedFileTypes recorded (every milestone created before this
 *  feature existed, or one whose submissionRequirement doesn't call for a
 *  file at all) is unrestricted — matches submissionRequirementMet's own
 *  "absent means nothing already in flight is retroactively blocked" rule. */
export function fileMatchesAllowedTypes(
  allowedFileTypes: MilestoneFileType[] | undefined,
  mimetype: string,
  filename: string
): boolean {
  if (!allowedFileTypes || allowedFileTypes.length === 0) return true;
  const ext = filename.includes('.') ? filename.split('.').pop()!.toLowerCase() : '';
  return allowedFileTypes.some((key) => {
    const meta = MILESTONE_FILE_TYPES.find((t) => t.key === key);
    return !!meta && (meta.mimeTypes.includes(mimetype) || meta.extensions.includes(ext));
  });
}

/** Shared by milestoneController.ts's submitMilestone (web/mobile student
 *  submission) and projectController.ts's submitStudentMilestone — whether a
 *  given file/comment combination satisfies a milestone's recorded
 *  requirement. An absent requirement (legacy milestone, created before this
 *  feature existed) is always satisfied — see the type doc above. */
export function submissionRequirementMet(
  requirement: SubmissionRequirement | undefined,
  hasFile: boolean,
  hasComment: boolean
): boolean {
  switch (requirement) {
    case 'file':    return hasFile;
    case 'comment': return hasComment;
    case 'both':    return hasFile && hasComment;
    case 'none':
    default:        return true;
  }
}

/** Resolves the absolute due date for one milestone spec, given the
 *  enrollment/creation base date — shared by projectEnrollment.ts,
 *  trackChange.ts, and workflowTemplateRetroactiveApply.ts so the
 *  fixed-vs-offset branch only lives in one place. A 'fixed' spec with no
 *  usable fixedDate falls back to the offset behavior rather than throwing,
 *  so a malformed/legacy doc never blocks enrollment. */
export function resolveMilestoneDueDate(
  spec: WorkflowMilestoneSpec,
  baseDate: Date,
  /** The full sibling milestone list of the same template — needed to
   *  resolve spec.syncDueDateWith. Omitted (every pre-existing call site
   *  before this feature) simply disables syncing, same as an unresolvable
   *  reference — never a hard error. */
  allSpecs?: WorkflowMilestoneSpec[],
  _visited: Set<string> = new Set(),
): Date {
  // syncDueDateWith ties this milestone's date to another one in the same
  // template (e.g. a presentation + poster pair that must always be due the
  // same day) — resolved recursively so a chain of synced milestones still
  // bottoms out at a real date. _visited guards against a reference cycle
  // (A syncs to B, B syncs to A): once a type has been visited, stop
  // following syncDueDateWith and fall through to this spec's own
  // dateMode/dueDaysFromStart/fixedDate instead of looping forever.
  if (spec.syncDueDateWith && allSpecs && !_visited.has(spec.type)) {
    const target = allSpecs.find((s) => s.type === spec.syncDueDateWith);
    if (target) {
      _visited.add(spec.type);
      return resolveMilestoneDueDate(target, baseDate, allSpecs, _visited);
    }
  }
  if (spec.dateMode === 'fixed' && spec.fixedDate) {
    const fixed = new Date(spec.fixedDate);
    if (!isNaN(fixed.getTime())) return fixed;
  }
  const dueDate = new Date(baseDate);
  dueDate.setDate(baseDate.getDate() + spec.dueDaysFromStart);
  return dueDate;
}

// Matches today's actual hardcoded behavior — the fallback whenever a
// template has neither its own defaultRouting nor a milestone-level override
// (i.e. every template that predates this feature), so nothing currently
// approved changes behavior until staff explicitly configure a chain.
export const DEFAULT_ROUTING: MilestoneRoutingSpec = [
  { id: 'supervisor', role: 'supervisor', action: 'grade', rejectTo: 'student' },
  { id: 'coordinator', role: 'coordinator', action: 'approve', rejectTo: 'student' },
];

/** The chain a given milestone spec should snapshot at creation time — its
 *  own override, else the template's default, else DEFAULT_ROUTING (for
 *  templates that predate this feature, or no-template legacy defaults). */
export function resolveMilestoneRouting(
  spec: WorkflowMilestoneSpec,
  templateDefaultRouting: MilestoneRoutingSpec | null | undefined
): MilestoneRoutingSpec {
  return spec.routing ?? templateDefaultRouting ?? DEFAULT_ROUTING;
}

// Legacy fallback — the milestone TYPE ordering every faculty used before a
// milestone doc carried its own `order` (see resolveMilestoneOrder below).
// Only ever consulted for a milestone doc that predates that field. A
// per-faculty/major template can define its own milestones in any order
// (including custom_xxxxx types this list has never heard of), so this must
// never be trusted as "the" ordering going forward — it's a one-time
// migration bridge, not a source of truth.
const LEGACY_MILESTONE_TYPE_ORDER = ['research_proposal', 'progress_report', 'final_report', 'defense', 'poster'];

/** The value to sort a milestone doc by, relative to its siblings on the same
 *  project/student. Prefers the doc's own `order` (snapshotted from the
 *  workflow template at enrollment — see projectEnrollment.ts), which is
 *  correct for ANY template shape, including custom milestone types and
 *  faculty-specific reordering. Falls back to LEGACY_MILESTONE_TYPE_ORDER
 *  only for a milestone doc created before `order` was stored at all — an
 *  unrecognized type there sorts LAST (not first), so a milestone this
 *  fallback has never heard of is never mistaken for "the next one due". */
export function resolveMilestoneOrder(m: { type?: unknown; order?: unknown }): number {
  if (typeof m.order === 'number') return m.order;
  const idx = typeof m.type === 'string' ? LEGACY_MILESTONE_TYPE_ORDER.indexOf(m.type) : -1;
  return idx === -1 ? Number.MAX_SAFE_INTEGER : idx;
}

export interface WorkflowMilestoneSpec {
  type: string;
  nameHe: string;
  nameEn: string;
  order: number;
  /** 'fixed' means the absolute calendar date in `fixedDate` is used instead
   *  of `dueDaysFromStart` — the same date for every student enrolled under
   *  this template, regardless of when they individually started (e.g. a
   *  program-wide deadline). Omitted (or 'offset') is the original behavior:
   *  `dueDaysFromStart` days after the student's own enrollment date. A
   *  template can mix both across its milestones. */
  dateMode?: 'offset' | 'fixed';
  /** Ignored when dateMode === 'fixed'. */
  dueDaysFromStart: number;
  /** ISO date string (e.g. '2026-11-15'). Only meaningful when
   *  dateMode === 'fixed'. */
  fixedDate?: string;
  /** The `type` of another milestone in the SAME template whose due date
   *  this milestone always mirrors, instead of computing its own from
   *  dateMode/dueDaysFromStart/fixedDate above — e.g. a presentation (15%
   *  of the final grade) and a poster (5%) that must always be submitted on
   *  the exact same date because staff evaluates them together. This
   *  milestone's own dateMode fields are kept as a fallback (used if the
   *  referenced type is ever removed from the template, or forms a cycle —
   *  see resolveMilestoneDueDate). Omitted (the default) keeps today's
   *  fully-independent-per-milestone behavior. */
  syncDueDateWith?: string;
  requiresExaminers: boolean;
  /** How many examiner slots a defense panel needs for this milestone.
   *  Only meaningful when requiresExaminers is true. Omitted means the
   *  legacy default of 2 (today's hardcoded business rule) — see
   *  coordinatorController.ts's assignExaminers and
   *  defenseScheduling.ts's openDefenseSchedulingIfPanelReady. */
  examinerCount?: number;
  /** True means this milestone has NO supervisor grading stage at all — it
   *  finalizes once every assigned examiner has independently submitted
   *  their score (or form answers), with no supervisor score ever required
   *  or factored in. See milestoneRouting.ts's isIdentityKeyedExaminerOnly
   *  and projectController.ts's submitMilestoneGrade. Only meaningful when
   *  requiresExaminers is true; omitted (false) keeps every existing
   *  milestone's supervisor(+examiner) grading behavior unchanged. */
  examinerOnlyGrading?: boolean;
  /** Optional — omitted/empty means this milestone still uses the hardcoded
   *  default rubric until the grading endpoints are wired to read this.
   *  Ignored on a 'defense' milestone that has finalGradeComponents set —
   *  that milestone type uses the three independent rubrics there instead. */
  gradingComponents?: GradingComponentSpec[];
  /** Per-milestone override of the template's defaultRouting. Omitted means
   *  this milestone inherits defaultRouting (or DEFAULT_ROUTING if the
   *  template has none) — staff only sets this when one milestone genuinely
   *  needs a different chain than the rest of the template. */
  routing?: MilestoneRoutingSpec;
  /** Lets staff (the supervisor) attach an official record alongside the
   *  student's own submission, on any milestone type — either by uploading
   *  a completed file or filling in staffFormFields online. Omitted/'none'
   *  keeps today's behavior (student submission only, no staff-side
   *  record). */
  staffRecordMode?: 'none' | 'upload_or_form';
  /** The online-form field list shown when staffRecordMode === 'upload_or_form'. */
  staffFormFields?: FormFieldSpec[];
  /** The STUDENT-facing online form for this milestone — when set (non-empty),
   *  the student's "Submit Milestone" action renders these fields (via
   *  submitMilestone's formData branch) instead of the generic file+note
   *  inputs. Distinct from staffFormFields (a supervisor-only supplementary
   *  record, submitted separately and never overwritten by this). Currently
   *  only populated for data_science's research_proposal milestone — see
   *  addResearchProposalStudentForm.ts. */
  studentFormFields?: FormFieldSpec[];
  /** A set of fields every ASSIGNED EXAMINER fills independently — a non-
   *  scored sibling of gradingComponents, for milestones that need a Q&A-
   *  style evaluation (yes/no screening questions, free text, numbers,
   *  dates...) rather than (or alongside) a numeric rubric. Only meaningful
   *  when requiresExaminers is true. Stored per-examiner in the milestone's
   *  examinerFormAnswers map (see submitExaminerFormAnswers); the milestone
   *  finalizes (status 'graded', no finalGrade) once every assigned
   *  examiner has answered. Authored via MilestoneRowModal.tsx's
   *  examiner-form section (unlike studentFormFields, which stays
   *  script-only). */
  examinerFormFields?: FormFieldSpec[];
  /** Only meaningful for the 'defense' milestone type. Replaces the single
   *  shared gradingComponents rubric with three independent ones — one each
   *  for the supervisor, the examiner's evaluation of the written project,
   *  and the examiner's evaluation of the oral defense — combined via their
   *  own weights (which must sum to 100) into the milestone's final grade.
   *  Omitted keeps today's single-rubric (or hardcoded-criteria) behavior. */
  finalGradeComponents?: {
    supervisorEvaluation: FinalGradeRubric;
    examinerProjectEvaluation: FinalGradeRubric;
    examinerDefenseEvaluation: FinalGradeRubric;
  };
  /** How much this milestone counts toward the project's OVERALL final
   *  grade (0-100), validated to sum to 100 across every milestone in the
   *  template — see workflowTemplateController.ts's validateMilestones.
   *  Distinct from gradingComponents[].weight, which is a rubric WITHIN one
   *  milestone. Omitted (pre-existing templates) means "defense = 100,
   *  everything else = 0" — today's implicit behavior — see
   *  gradeEngine.ts's computeProjectFinalGrade. */
  percentOfFinalGrade?: number;
  /** What the student must attach when submitting this milestone — see the
   *  SubmissionRequirement type doc above. Always written explicitly by
   *  workflowTemplateController.ts's validateMilestones (defaulting to
   *  'both' when omitted/invalid) for any milestone saved through that path;
   *  only truly absent on milestones from before this feature existed. */
  submissionRequirement?: SubmissionRequirement;
  /** Which file types a student may attach, when submissionRequirement is
   *  'file'/'both' — see the MilestoneFileType doc above. Omitted means
   *  unrestricted (every milestone created before this feature existed, or
   *  one whose submissionRequirement never called for a file at all). */
  allowedFileTypes?: MilestoneFileType[];
}

export type WorkflowTemplateStatus = 'pending_approval' | 'approved' | 'rejected' | 'superseded';
export type ApplyMode = 'now' | 'from_now_on';

export interface WorkflowTemplateDoc {
  id: string;
  facultyId: string;
  processType: ProcessType;
  /** The subject this template applies to — a major slug, or `null` for
   *  "all majors in this faculty" (the fallback tier — also what every
   *  pre-existing template effectively means; see
   *  backfillWorkflowTemplateMajor.ts). Always written explicitly, never
   *  omitted, so `.where('major','==',null)` reliably matches it. */
  major: string | null;
  version: number;
  status: WorkflowTemplateStatus;
  milestones: WorkflowMilestoneSpec[];
  createdBy: string;
  createdAt: string;
  proposedNote: string | null;
  /** Whether approving this version also retroactively updates in-progress
   *  projects/theses already using an older version (see
   *  applyTemplateRetroactively) — chosen once, at proposal time. */
  applyMode: ApplyMode;
  /** Template-level default chain — any milestone without its own `routing`
   *  inherits this. Omitted means DEFAULT_ROUTING (today's hardcoded chain). */
  defaultRouting?: MilestoneRoutingSpec;
  /** Who must sign off on examiner invitations before they go out, once a
   *  coordinator has approved the recommended list — distinct from the
   *  milestone routing model above, this governs the separate
   *  examinerRecommendations flow, not milestone approval/rejection.
   *  Omitted → legacy default (`grad_school_head` for msc_thesis, `'none'`
   *  for everything else — today's exact hardcoded behavior, so nothing
   *  already-approved changes). `'none'` → no second tier at all, for any
   *  process type. A ChainRole → that role must sign off, for any process
   *  type (not msc_thesis-only anymore) — see resolveExaminerSignoffRole. */
  examinerSignoffRole?: ChainRole | 'none';
  /** Who signs off on a defense milestone's already-computed final grade,
   *  before it transfers to Michlol — distinct from milestone routing and
   *  from examinerSignoffRole. No `'none'` option: this is the terminal gate,
   *  someone must always sign off. Omitted → legacy default `grad_school_head`
   *  (today's unconditional behavior — approveFinalGrade has no processType
   *  branching, so the default doesn't vary by process type either). See
   *  resolveFinalGradeSignoffRole. */
  finalGradeSignoffRole?: ChainRole;
  /** What a student with no active project sees first, for this template's
   *  faculty+processType+major: browse/apply to individually-posted projects
   *  (today's only behavior), or browse/pick a supervisor instead. Omitted →
   *  'browse_projects'. See resolveFirstStepMode. */
  firstStepMode?: 'browse_projects' | 'choose_supervisor';
  /** Only meaningful when firstStepMode === 'choose_supervisor'. Whether
   *  picking a supervisor still requires submitting files for that
   *  supervisor's approval (today's application flow, applyToProject/
   *  handleApplicationDecision/confirmApplicationStart, unchanged), or seats
   *  the student immediately (joinProjectDirect, mirrors enrollStudentAdmin).
   *  Omitted → true (the safer default — requires approval). */
  supervisorSelectionRequiresApproval?: boolean;
  approvedBy?: string;
  approvedAt?: string;
  /** Set once, at approval time, only when applyMode === 'now'. */
  retroactiveAppliedAt?: string;
  retroactiveAffectedCount?: number;
  rejectedBy?: string;
  rejectedAt?: string;
  rejectionReason?: string;
}

// The same 4-milestone default this app has always used — kept as the
// fallback for any facultyId/processType with no approved template yet.
export const DEFAULT_MILESTONES: WorkflowMilestoneSpec[] = [
  { type: 'research_proposal', nameHe: 'הצעת מחקר',    nameEn: 'Research Proposal', order: 1, dueDaysFromStart: 30,  requiresExaminers: false },
  { type: 'progress_report',   nameHe: 'דו"ח התקדמות', nameEn: 'Progress Report',   order: 2, dueDaysFromStart: 120, requiresExaminers: false },
  { type: 'final_report',      nameHe: 'דו"ח מסכם',    nameEn: 'Final Report',      order: 3, dueDaysFromStart: 210, requiresExaminers: false },
  { type: 'defense',           nameHe: 'בחינת הגנה',   nameEn: 'Defense Exam',      order: 4, dueDaysFromStart: 240, requiresExaminers: true  },
];

// A project's explicit binding to the approved template governing one
// (degreeType, projectType) combination it's open to — resolved once, at
// creation time (see createAdminProject/createSupervisorProject), and
// consulted at enrollment instead of re-deriving/re-querying (see
// projectEnrollment.ts). One entry per combination implied by the project's
// degreeTypes x projectTypes checkboxes; entries that collapse to the same
// processType (bachelors ignores projectType — see deriveProcessType) simply
// share the same templateId.
export interface WorkflowTemplateRef {
  degreeType: 'bachelors' | 'masters';
  projectType: 'project' | 'thesis';
  templateId: string;
}

const COLLECTION = 'workflowTemplates';

/** Resolves the most specific currently-approved template for a subject —
 *  exact major match first, falling back to the faculty's "all majors"
 *  template (major === null). Returns null (not DEFAULT_MILESTONES) when
 *  nothing is approved yet — callers decide for themselves whether that's a
 *  fine fallback (enrollment, today's behavior) or a hard error (project
 *  creation, which now requires an explicit template — see
 *  createAdminProject/createSupervisorProject). */
export async function findApprovedTemplateId(
  facultyId: string,
  processType: ProcessType,
  major: string | null
): Promise<{
  id: string; milestones: WorkflowMilestoneSpec[]; defaultRouting?: MilestoneRoutingSpec;
  examinerSignoffRole?: ChainRole | 'none'; finalGradeSignoffRole?: ChainRole;
  firstStepMode?: 'browse_projects' | 'choose_supervisor'; supervisorSelectionRequiresApproval?: boolean;
} | null> {
  const tryMajor = async (m: string | null) => {
    const snap = await db.collection(COLLECTION)
      .where('facultyId', '==', facultyId)
      .where('processType', '==', processType)
      .where('major', '==', m)
      .where('status', '==', 'approved')
      .limit(1)
      .get();
    if (snap.empty) return null;
    const doc = snap.docs[0]!;
    const data = doc.data();
    const milestones = (data.milestones ?? []) as WorkflowMilestoneSpec[];
    if (milestones.length === 0) return null;
    const result: {
      id: string; milestones: WorkflowMilestoneSpec[]; defaultRouting?: MilestoneRoutingSpec;
      examinerSignoffRole?: ChainRole | 'none'; finalGradeSignoffRole?: ChainRole;
      firstStepMode?: 'browse_projects' | 'choose_supervisor'; supervisorSelectionRequiresApproval?: boolean;
    } = { id: doc.id, milestones };
    if (data.defaultRouting) result.defaultRouting = data.defaultRouting as MilestoneRoutingSpec;
    if (data.examinerSignoffRole) result.examinerSignoffRole = data.examinerSignoffRole as ChainRole | 'none';
    if (data.finalGradeSignoffRole) result.finalGradeSignoffRole = data.finalGradeSignoffRole as ChainRole;
    if (data.firstStepMode) result.firstStepMode = data.firstStepMode as 'browse_projects' | 'choose_supervisor';
    if (data.supervisorSelectionRequiresApproval !== undefined && data.supervisorSelectionRequiresApproval !== null) {
      result.supervisorSelectionRequiresApproval = data.supervisorSelectionRequiresApproval as boolean;
    }
    return result;
  };

  // Bug fix: the previous `major ? await tryMajor(major) : null` / `exact ??
  // (major ? await tryMajor(null) : null)` pairing skipped the "all majors"
  // (major === null) query entirely whenever the CALLER's own `major` was
  // already null — the single most common case (a project/subject with no
  // specific major). It always returned null without ever checking for an
  // approved whole-faculty template, silently falling back to
  // DEFAULT_MILESTONES/"missing template" for every major-agnostic subject.
  if (major) {
    const exact = await tryMajor(major);
    if (exact) return exact;
  }
  return tryMajor(null);
}

/** Who must sign off on examiner invitations for this subject before they go
 *  out, once a coordinator has approved the recommended list (see
 *  coordinatorController.ts's approveExaminerRecommendation) — or `null` for
 *  no second tier (invitations go out immediately on coordinator approval).
 *  Falls back to today's exact hardcoded behavior when no template is
 *  approved yet, or the approved template predates this field entirely. */
export async function resolveExaminerSignoffRole(
  facultyId: string, processType: ProcessType, major: string | null
): Promise<ChainRole | null> {
  const resolved = await findApprovedTemplateId(facultyId, processType, major);
  const configured = resolved?.examinerSignoffRole;
  if (configured === 'none') return null;
  if (configured) return configured;
  // Legacy default — matches today's hardcoded behavior exactly.
  return processType === 'msc_thesis' ? 'grad_school_head' : null;
}

/** Who must sign off on a defense milestone's already-computed final grade
 *  (see gradSchoolHeadController.ts's approveFinalGrade) before it transfers
 *  to Michlol. Unlike resolveExaminerSignoffRole, there is no "no tier at
 *  all" option — someone must always sign off. Falls back to today's exact
 *  hardcoded behavior (`grad_school_head`, unconditionally, for every
 *  process type) when no template is approved yet, or the approved template
 *  predates this field entirely. */
export async function resolveFinalGradeSignoffRole(
  facultyId: string, processType: ProcessType, major: string | null
): Promise<ChainRole> {
  const resolved = await findApprovedTemplateId(facultyId, processType, major);
  return resolved?.finalGradeSignoffRole ?? 'grad_school_head';
}

/** What a student with no active project in this faculty+degree(+major)
 *  should see first — see WorkflowTemplateDoc.firstStepMode. Bachelor's has
 *  exactly one processType (bsc_project), so this is a single lookup.
 *  Master's splits into msc_thesis/msc_project — a browsing student hasn't
 *  picked between them yet, so both are resolved; if they agree, that mode
 *  wins (supervisorSelectionRequiresApproval taken from whichever config
 *  said 'choose_supervisor', defaulting true if unset), and if they disagree
 *  or either has no approved template, this falls back to 'browse_projects'
 *  — always safe, since it's today's universal, unconditional behavior. */
export async function resolveFirstStepMode(
  facultyId: string, degreeType: 'bachelors' | 'masters', major: string | null
): Promise<{ firstStepMode: 'browse_projects' | 'choose_supervisor'; supervisorSelectionRequiresApproval: boolean }> {
  const fallback = { firstStepMode: 'browse_projects' as const, supervisorSelectionRequiresApproval: true };

  if (degreeType === 'bachelors') {
    const resolved = await findApprovedTemplateId(facultyId, 'bsc_project', major);
    if (!resolved?.firstStepMode) return fallback;
    return {
      firstStepMode: resolved.firstStepMode,
      supervisorSelectionRequiresApproval: resolved.supervisorSelectionRequiresApproval ?? true,
    };
  }

  const [thesis, project] = await Promise.all([
    findApprovedTemplateId(facultyId, 'msc_thesis', major),
    findApprovedTemplateId(facultyId, 'msc_project', major),
  ]);
  const thesisMode = thesis?.firstStepMode ?? 'browse_projects';
  const projectMode = project?.firstStepMode ?? 'browse_projects';
  if (thesisMode !== projectMode) return fallback;
  if (thesisMode === 'browse_projects') return fallback;
  // Both agree on 'choose_supervisor' — require approval unless BOTH
  // configs explicitly opted out of it.
  const requiresApproval = (thesis?.supervisorSelectionRequiresApproval ?? true) || (project?.supervisorSelectionRequiresApproval ?? true);
  return { firstStepMode: 'choose_supervisor', supervisorSelectionRequiresApproval: requiresApproval };
}

/** The milestone list a NEW enrollment should use, falling back to the app
 *  default when no template has been approved yet (the fallback path for
 *  legacy projects with no workflowTemplateRefs of their own — see
 *  projectEnrollment.ts). Also surfaces the template's defaultRouting (if
 *  any) so callers can snapshot each created milestone's resolved chain. */
export async function getActiveMilestonesFor(
  facultyId: string, processType: ProcessType, major: string | null
): Promise<{ milestones: WorkflowMilestoneSpec[]; defaultRouting?: MilestoneRoutingSpec }> {
  const resolved = await findApprovedTemplateId(facultyId, processType, major);
  if (!resolved) return { milestones: DEFAULT_MILESTONES };
  const result: { milestones: WorkflowMilestoneSpec[]; defaultRouting?: MilestoneRoutingSpec } = {
    milestones: resolved.milestones.slice().sort((a, b) => a.order - b.order),
  };
  if (resolved.defaultRouting) result.defaultRouting = resolved.defaultRouting;
  return result;
}

/** Resolves the full workflowTemplateRefs array for a project being created
 *  in one faculty, open to the given degreeTypes x projectTypes combinations.
 *  Combinations that collapse to the same processType (bachelors ignores
 *  projectType) naturally resolve to the same templateId — no special-casing
 *  needed. `missing` lists every combination with no approved template, for
 *  the caller to hard-block creation on (see createAdminProject/
 *  createSupervisorProject) rather than silently falling back to defaults. */
export async function resolveWorkflowTemplateRefs(
  facultyId: string,
  degreeTypes: ('bachelors' | 'masters')[],
  projectTypes: ('project' | 'thesis')[],
  major: string | null
): Promise<{ refs: WorkflowTemplateRef[]; missing: { degreeType: string; projectType: string }[] }> {
  const refs: WorkflowTemplateRef[] = [];
  const missing: { degreeType: string; projectType: string }[] = [];
  // One Firestore lookup per distinct processType, not per (degreeType,
  // projectType) pair — bachelors always collapses to bsc_project regardless
  // of which projectType boxes are checked.
  const resolvedByProcessType = new Map<ProcessType, string | null>();

  for (const degreeType of degreeTypes) {
    for (const projectType of projectTypes) {
      const processType = deriveProcessType(degreeType, projectType);
      if (!resolvedByProcessType.has(processType)) {
        const found = await findApprovedTemplateId(facultyId, processType, major);
        resolvedByProcessType.set(processType, found?.id ?? null);
      }
      const templateId = resolvedByProcessType.get(processType) ?? null;
      if (templateId) refs.push({ degreeType, projectType, templateId });
      else missing.push({ degreeType, projectType });
    }
  }

  return { refs, missing };
}

/** Fetches a specific template's milestones by id, sorted, plus its
 *  defaultRouting (if any) — used at enrollment time when the project
 *  already carries an explicit workflowTemplateRefs entry (see
 *  projectEnrollment.ts) and at track-change time (see trackChange.ts).
 *  Returns null if the template no longer exists (deleted after the project
 *  was created). */
export async function getMilestonesForTemplateId(
  templateId: string
): Promise<{ milestones: WorkflowMilestoneSpec[]; defaultRouting?: MilestoneRoutingSpec } | null> {
  const snap = await db.collection(COLLECTION).doc(templateId).get();
  if (!snap.exists) return null;
  const data = snap.data() ?? {};
  const milestones = ((data.milestones ?? []) as WorkflowMilestoneSpec[]).slice().sort((a, b) => a.order - b.order);
  const result: { milestones: WorkflowMilestoneSpec[]; defaultRouting?: MilestoneRoutingSpec } = { milestones };
  if (data.defaultRouting) result.defaultRouting = data.defaultRouting as MilestoneRoutingSpec;
  return result;
}

/** Resolves a project's own resolved template milestone list — same
 *  fallback chain used inline by supervisorController.ts's
 *  getSupervisorProjectDetail and coordinatorStatistics.ts's
 *  resolveTemplateMilestones (not exported there): an explicit
 *  workflowTemplateRefs entry for the project's own track first, else the
 *  faculty's currently-active template. Pulled out here as a third call site
 *  (getActiveProjects) needed the exact same resolution. */
export async function resolveProjectTemplateMilestones(projectData: {
  workflowTemplateRefs?: { degreeType: string; projectType: string; templateId: string }[];
  degreeType?: string | null;
  projectType?: string | null;
  facultyId?: string | null;
  major?: string | null;
}): Promise<WorkflowMilestoneSpec[]> {
  const refs = projectData.workflowTemplateRefs ?? [];
  const matchingRef = refs.find(
    (r) => r.degreeType === projectData.degreeType && r.projectType === projectData.projectType
  );
  if (matchingRef) {
    const resolved = await getMilestonesForTemplateId(matchingRef.templateId);
    if (resolved) return resolved.milestones;
  }
  const processType = deriveProcessType(projectData.degreeType ?? null, projectData.projectType ?? null);
  const resolved = await getActiveMilestonesFor(projectData.facultyId ?? '', processType, projectData.major ?? null);
  return resolved.milestones;
}

export async function listWorkflowTemplates(facultyId: string, major?: string | null): Promise<WorkflowTemplateDoc[]> {
  // Sorted in memory rather than via .orderBy('createdAt') — combining that
  // with the facultyId equality filter needs a composite index Firestore
  // doesn't have here, which throws and turns into a 500 (same class of bug
  // fixed for feedback-history queries).
  let query: FirebaseFirestore.Query = db.collection(COLLECTION).where('facultyId', '==', facultyId);
  // When filtering by a specific major, return both templates scoped to that major
  // AND templates with major=null (which apply to all majors in the faculty).
  if (major !== undefined && major !== null) {
    query = query.where('major', 'in', [major, null]);
  } else if (major === null) {
    query = query.where('major', '==', null);
  }
  const snap = await query.get();
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as WorkflowTemplateDoc))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
}

export async function proposeWorkflowTemplate(params: {
  facultyId: string;
  processType: ProcessType;
  major: string | null;
  milestones: WorkflowMilestoneSpec[];
  createdBy: string;
  note?: string | null;
  applyMode: ApplyMode;
  defaultRouting?: MilestoneRoutingSpec;
  examinerSignoffRole?: ChainRole | 'none';
  finalGradeSignoffRole?: ChainRole;
  firstStepMode?: 'browse_projects' | 'choose_supervisor';
  supervisorSelectionRequiresApproval?: boolean;
}): Promise<{ id: string }> {
  // Fetch the creator's user document to get their major
  const creatorDoc = await db.collection('users').doc(params.createdBy).get();
  const creatorMajor = creatorDoc.exists ? (creatorDoc.data()?.major ?? null) : null;

  // Version numbering is scoped per facultyId+processType+major — each
  // subject gets its own clean version history, rather than an unrelated
  // major's proposals bumping this one's version number.
  const existingSnap = await db.collection(COLLECTION)
    .where('facultyId', '==', params.facultyId)
    .where('processType', '==', params.processType)
    .where('major', '==', params.major)
    .get();
  const maxVersion = existingSnap.docs.reduce((max, d) => Math.max(max, d.data().version ?? 0), 0);

  const ref = db.collection(COLLECTION).doc();
  await ref.set({
    facultyId: params.facultyId,
    processType: params.processType,
    major: params.major,
    version: maxVersion + 1,
    status: 'pending_approval',
    milestones: params.milestones,
    createdBy: params.createdBy,
    createdByMajor: creatorMajor,
    createdAt: new Date().toISOString(),
    proposedNote: params.note ?? null,
    applyMode: params.applyMode,
    defaultRouting: params.defaultRouting ?? null,
    examinerSignoffRole: params.examinerSignoffRole ?? null,
    finalGradeSignoffRole: params.finalGradeSignoffRole ?? null,
    firstStepMode: params.firstStepMode ?? null,
    supervisorSelectionRequiresApproval: params.firstStepMode === 'choose_supervisor'
      ? (params.supervisorSelectionRequiresApproval ?? true)
      : null,
  });
  return { id: ref.id };
}

/**
 * Updates a still-undecided proposal IN PLACE — same doc, same version,
 * same status ('pending_approval') — instead of proposeWorkflowTemplate's
 * always-create-a-new-version behavior. Lets staff fix a typo or reorder
 * milestones on their own not-yet-approved proposal without leaving the
 * original pending doc orphaned alongside a second one. Once a proposal has
 * been approved/rejected/superseded it's archival — editing it must go
 * through proposeWorkflowTemplate (a fresh version) instead, never this.
 */
export async function updatePendingWorkflowTemplate(id: string, params: {
  milestones: WorkflowMilestoneSpec[];
  note?: string | null;
  applyMode: ApplyMode;
  defaultRouting?: MilestoneRoutingSpec;
  examinerSignoffRole?: ChainRole | 'none';
  finalGradeSignoffRole?: ChainRole;
  firstStepMode?: 'browse_projects' | 'choose_supervisor';
  supervisorSelectionRequiresApproval?: boolean;
}): Promise<void> {
  const ref = db.collection(COLLECTION).doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new Error('Template not found.');
  if (snap.data()!.status !== 'pending_approval') {
    throw new Error('Only a pending proposal can be edited in place — this one has already been decided.');
  }

  await ref.update({
    milestones: params.milestones,
    proposedNote: params.note ?? null,
    applyMode: params.applyMode,
    defaultRouting: params.defaultRouting ?? null,
    examinerSignoffRole: params.examinerSignoffRole ?? null,
    finalGradeSignoffRole: params.finalGradeSignoffRole ?? null,
    firstStepMode: params.firstStepMode ?? null,
    supervisorSelectionRequiresApproval: params.firstStepMode === 'choose_supervisor'
      ? (params.supervisorSelectionRequiresApproval ?? true)
      : null,
  });
}

/**
 * Marks the template approved and supersedes whatever was previously approved
 * for the same facultyId+processType+major — only one template per subject
 * is ever "active" (consulted by getActiveMilestonesFor) at a time, but
 * every prior version stays in Firestore with status 'superseded' for
 * audit/history. Does NOT run the retroactive-apply engine itself — see
 * applyTemplateRetroactively, invoked separately by the caller when
 * `applyMode === 'now'`.
 */
export async function approveWorkflowTemplate(id: string, approvedBy: string): Promise<WorkflowTemplateDoc> {
  const ref = db.collection(COLLECTION).doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new Error('Template not found.');
  const data = snap.data()!;
  if (data.status !== 'pending_approval') {
    throw new Error(`Template is already "${data.status}".`);
  }

  const prevApprovedSnap = await db.collection(COLLECTION)
    .where('facultyId', '==', data.facultyId)
    .where('processType', '==', data.processType)
    .where('major', '==', data.major ?? null)
    .where('status', '==', 'approved')
    .get();

  const batch = db.batch();
  prevApprovedSnap.docs.forEach((d) => batch.update(d.ref, { status: 'superseded' }));
  const approvedAt = new Date().toISOString();
  batch.update(ref, { status: 'approved', approvedBy, approvedAt });
  await batch.commit();

  return { id, ...data, status: 'approved', approvedBy, approvedAt } as WorkflowTemplateDoc;
}

export async function deleteWorkflowTemplate(id: string): Promise<void> {
  const ref = db.collection(COLLECTION).doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new Error('Template not found.');
  if (snap.data()!.status === 'approved') {
    throw new Error('Cannot delete the currently-active template — approve a replacement first.');
  }
  await ref.delete();
}

export async function rejectWorkflowTemplate(id: string, rejectedBy: string, reason: string): Promise<WorkflowTemplateDoc> {
  const ref = db.collection(COLLECTION).doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new Error('Template not found.');
  const data = snap.data()!;
  if (data.status !== 'pending_approval') {
    throw new Error(`Template is already "${data.status}".`);
  }

  const rejectedAt = new Date().toISOString();
  await ref.update({ status: 'rejected', rejectedBy, rejectedAt, rejectionReason: reason });
  return { id, ...data, status: 'rejected', rejectedBy, rejectedAt, rejectionReason: reason } as WorkflowTemplateDoc;
}
