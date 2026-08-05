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
  type: 'text' | 'textarea' | 'date' | 'number' | 'table';
  required: boolean;
  /** Only meaningful when type === 'table' — the columns of each row. */
  tableColumns?: Array<{ key: string; labelHe: string; labelEn: string; type: 'text' | 'number' | 'date' }>;
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
export type ChainRole = 'supervisor' | 'examiner' | 'coordinator' | 'faculty_admin' | 'administrative_secretary' | 'grad_school_head' | 'program_head';
// 'student', or another stage's `id` within the same chain (self-reference allowed).
export type RejectionTarget = 'student' | string;

export interface ChainStage {
  /** Stable id (client-generated), used for rejectTo references + reordering. */
  id: string;
  role: ChainRole;
  /** 'grade' submits a numeric score against the milestone's rubric; 'approve' is a pure sign-off. */
  action: 'grade' | 'approve';
  rejectTo: RejectionTarget;
}

export type MilestoneRoutingSpec = ChainStage[];

/** Resolves the absolute due date for one milestone spec, given the
 *  enrollment/creation base date — shared by projectEnrollment.ts,
 *  trackChange.ts, and workflowTemplateRetroactiveApply.ts so the
 *  fixed-vs-offset branch only lives in one place. A 'fixed' spec with no
 *  usable fixedDate falls back to the offset behavior rather than throwing,
 *  so a malformed/legacy doc never blocks enrollment. */
export function resolveMilestoneDueDate(spec: WorkflowMilestoneSpec, baseDate: Date): Date {
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
  requiresExaminers: boolean;
  /** How many examiner slots a defense panel needs for this milestone.
   *  Only meaningful when requiresExaminers is true. Omitted means the
   *  legacy default of 2 (today's hardcoded business rule) — see
   *  coordinatorController.ts's assignExaminers and
   *  defenseScheduling.ts's openDefenseSchedulingIfPanelReady. */
  examinerCount?: number;
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
  /** Only meaningful for research_proposal/progress_report-type milestones —
   *  lets staff (the supervisor) attach an official record alongside the
   *  student's own submission, either by uploading a completed file or
   *  filling in staffFormFields online. Omitted/'none' keeps today's
   *  behavior (student submission only, no staff-side record). */
  staffRecordMode?: 'none' | 'upload_or_form';
  /** The online-form field list shown when staffRecordMode === 'upload_or_form'. */
  staffFormFields?: FormFieldSpec[];
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
    } = { id: doc.id, milestones };
    if (data.defaultRouting) result.defaultRouting = data.defaultRouting as MilestoneRoutingSpec;
    if (data.examinerSignoffRole) result.examinerSignoffRole = data.examinerSignoffRole as ChainRole | 'none';
    if (data.finalGradeSignoffRole) result.finalGradeSignoffRole = data.finalGradeSignoffRole as ChainRole;
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

export async function listWorkflowTemplates(facultyId: string, major?: string | null): Promise<WorkflowTemplateDoc[]> {
  // Sorted in memory rather than via .orderBy('createdAt') — combining that
  // with the facultyId equality filter needs a composite index Firestore
  // doesn't have here, which throws and turns into a 500 (same class of bug
  // fixed for feedback-history queries).
  let query: FirebaseFirestore.Query = db.collection(COLLECTION).where('facultyId', '==', facultyId);
  if (major !== undefined) query = query.where('major', '==', major);
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
}): Promise<{ id: string }> {
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
    createdAt: new Date().toISOString(),
    proposedNote: params.note ?? null,
    applyMode: params.applyMode,
    defaultRouting: params.defaultRouting ?? null,
    examinerSignoffRole: params.examinerSignoffRole ?? null,
    finalGradeSignoffRole: params.finalGradeSignoffRole ?? null,
  });
  return { id: ref.id };
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
