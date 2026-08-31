// src/controllers/workflowTemplateController.ts
//
// Faculty-configurable milestone templates (see services/workflowTemplates.ts).
// Approval chain: master's process types (msc_thesis, msc_project) require
// grad_school_head sign-off; bachelor's (bsc_project) is approved by the
// faculty itself — matches the requirements doc's "בתואר שני אישור הסטייה
// יהיה של בית הספר ללימודי מוסמכים; בתואר ראשון הפקולטה תאשר בעצמה."

import { Response } from 'express';
import { db } from '../config/firebase.js';
import { AuthenticatedRequest, hasAnyRole } from '../middleware/auth.js';
import {
  ProcessType,
  WorkflowMilestoneSpec,
  GradingComponentSpec,
  FormFieldSpec,
  ChainRole,
  ChainStage,
  MilestoneRoutingSpec,
  SubmissionRequirement,
  listWorkflowTemplates,
  findApprovedTemplateId,
  proposeWorkflowTemplate,
  updatePendingWorkflowTemplate,
  approveWorkflowTemplate,
  rejectWorkflowTemplate,
  deleteWorkflowTemplate,
} from '../services/workflowTemplates.js';
import { previewRetroactiveImpact, applyTemplateRetroactively } from '../services/workflowTemplateRetroactiveApply.js';
import { majorsForFaculty } from '../config/majors.js';
import { logAuditEvent } from '../services/auditLog.js';
import { hasActionGrant, ResourceScope } from '../services/scopeAuthorization.js';

const PROCESS_TYPES: ProcessType[] = ['msc_thesis', 'msc_project', 'bsc_project'];
// grad_school_head added — previously could only approve master's templates,
// never propose/add one themselves, even though they're the head-of-school
// role this whole approval chain is built around.
const PROPOSER_ROLES = ['coordinator', 'faculty_admin', 'program_head', 'administrative_secretary', 'grad_school_head', 'system_admin'];
// administrative_secretary is a proposer only (see PROPOSER_ROLES above) —
// she can draft/edit a template version but must never be able to approve,
// reject, or delete one herself (maker/checker separation — approval stays
// with the relevant head-of-faculty/head-of-school or system_admin).
const GRAD_SCHOOL_APPROVER_ROLES = ['grad_school_head', 'system_admin'];
const FACULTY_APPROVER_ROLES = ['faculty_admin', 'coordinator', 'system_admin'];
// Roles with no single "home" faculty — must name a real target faculty
// explicitly rather than silently proposing against their own facultyId
// ('all'), which getActiveMilestonesFor would never match against a real project.
const CROSS_FACULTY_PROPOSER_ROLES = ['system_admin', 'administrative_secretary', 'grad_school_head'];

function isMastersProcess(processType: ProcessType): boolean {
  return processType === 'msc_thesis' || processType === 'msc_project';
}

function canApprove(processType: ProcessType, role: string): boolean {
  return isMastersProcess(processType)
    ? GRAD_SCHOOL_APPROVER_ROLES.includes(role)
    : FACULTY_APPROVER_ROLES.includes(role);
}

/** Maps a template doc's own facultyId/major/processType to the ResourceScope
 *  shape scopeAuthorization.ts's hasActionGrant() matches ScopeRule grants
 *  against — lets a system_admin hand an individual staff member (via the
 *  detailed-permissions 'approve_templates' action) approval rights over
 *  templates outside their normal role, scoped to a faculty/major/degree/
 *  process type, without changing their role. */
function templateResourceScope(data: { facultyId: string; major?: string | null; processType: ProcessType }): ResourceScope {
  return {
    facultyId: data.facultyId,
    ...(data.major ? { major: data.major } : {}),
    degreeLevel: isMastersProcess(data.processType) ? 'masters' : 'bachelors',
    ...(data.processType === 'msc_thesis' ? { processType: 'thesis' as const }
      : data.processType === 'msc_project' ? { processType: 'project' as const }
      : {}),
  };
}

// administrative_secretary is scoped to one or more specific subjects via
// the same `coordinatorScopes` field the 'coordinator' role already uses —
// confirmed generic (no role check anywhere) in scopeAuthorization.ts/
// validateCoordinatorScope. Each scope entry is a {facultyId, major?} tuple
// (major omitted = "whole faculty, all majors" — matches e.g. "industrial
// and management faculty" as a whole-faculty assignment). Returns null if
// the requested facultyId/major isn't one of her own assigned scopes.
function resolveCoordinatorScope(
  scopes: { facultyId: string; major?: string }[],
  requested: { facultyId?: string | undefined; major?: string | null | undefined } | undefined,
): { facultyId: string; major: string | null } | null {
  if (scopes.length === 0) return null;
  if (!requested?.facultyId) {
    // No explicit choice needed/possible when she only holds one scope.
    if (scopes.length === 1) return { facultyId: scopes[0]!.facultyId, major: scopes[0]!.major ?? null };
    return null;
  }
  const match = scopes.find((s) => s.facultyId === requested.facultyId && (s.major ?? null) === (requested.major ?? null));
  return match ? { facultyId: match.facultyId, major: match.major ?? null } : null;
}

// Valid roles for a chain STAGE (routing/defaultRouting) — includes
// 'examiner', which resolves to a milestone's own assigned panel (see
// scopeAuthorization.ts's resolveStaffForScope), letting a milestone type be
// graded examiner-only (e.g. a Poster session) with no supervisor stage.
// 'committee' routes to the department's thesis/final_project committee —
// see workflowTemplates.ts's ChainRole doc comment.
const CHAIN_ROLES: ChainRole[] = ['supervisor', 'examiner', 'coordinator', 'faculty_admin', 'administrative_secretary', 'grad_school_head', 'program_head', 'committee'];
// examinerSignoffRole/finalGradeSignoffRole are a single overall approver
// resolved without any per-milestone examinerIds in scope — 'examiner' would
// always resolve to nobody there (or, worse, read as "an examiner approves
// their own submission"), so it's deliberately excluded from this narrower list.
// 'committee' is excluded for the same reason as 'examiner', plus its own:
// it's a multi-actor vote-then-chairman-decides flow, not a single approver
// the signoff endpoints (gradSchoolHeadController.ts) know how to resolve.
const SIGNOFF_ROLES: ChainRole[] = CHAIN_ROLES.filter((r) => r !== 'examiner' && r !== 'committee');
const SUBMISSION_REQUIREMENTS: SubmissionRequirement[] = ['file', 'comment', 'both', 'none'];

/** Validates a routing chain (either a template's defaultRouting or a
 *  milestone's per-milestone override). Returns null on malformed input —
 *  the caller decides whether "field absent entirely" (meaning "inherit",
 *  always valid) is distinguished from this, since `undefined`/`null` never
 *  reach this function directly (see validateOptionalRouting). */
function validateRoutingChain(input: any): MilestoneRoutingSpec | null {
  if (!Array.isArray(input) || input.length === 0) return null;
  const ids = new Set<string>();
  const cleaned: ChainStage[] = [];
  for (const stage of input) {
    if (!stage || typeof stage.id !== 'string' || !stage.id.trim()) return null;
    if (!CHAIN_ROLES.includes(stage.role)) return null;
    if (stage.action !== 'grade' && stage.action !== 'approve') return null;
    if (typeof stage.rejectTo !== 'string' || !stage.rejectTo.trim()) return null;
    const id = stage.id.trim();
    if (ids.has(id)) return null; // duplicate stage id within the same chain
    ids.add(id);
    cleaned.push({ id, role: stage.role, action: stage.action, rejectTo: stage.rejectTo.trim() });
  }
  // rejectTo must resolve to 'student' or another stage's id within this same chain.
  for (const stage of cleaned) {
    if (stage.rejectTo !== 'student' && !ids.has(stage.rejectTo)) return null;
  }
  return cleaned;
}

/** Wraps validateRoutingChain so "field not sent at all" (meaning "inherit
 *  the template default / DEFAULT_ROUTING") is a distinct, always-valid case
 *  from "field sent but malformed" (rejected). */
function validateOptionalRouting(input: any): { ok: true; value?: MilestoneRoutingSpec } | { ok: false } {
  if (input === undefined || input === null) return { ok: true };
  const parsed = validateRoutingChain(input);
  return parsed ? { ok: true, value: parsed } : { ok: false };
}

function validateGradingComponents(input: any): GradingComponentSpec[] | null {
  if (input === undefined || input === null) return [];
  if (!Array.isArray(input)) return null;
  const cleaned: GradingComponentSpec[] = [];
  for (const c of input) {
    if (!c || typeof c.key !== 'string' || !c.key.trim()) return null;
    if (typeof c.labelHe !== 'string' || typeof c.labelEn !== 'string') return null;
    const maxScore = Number(c.maxScore);
    const weight = Number(c.weight);
    if (!Number.isFinite(maxScore) || maxScore <= 0) return null;
    if (!Number.isFinite(weight) || weight < 0) return null;
    cleaned.push({
      key: c.key.trim(),
      labelHe: c.labelHe.trim(),
      labelEn: c.labelEn.trim(),
      maxScore,
      weight,
      hasComment: !!c.hasComment,
      visibleToStudent: !!c.visibleToStudent,
    });
  }
  return cleaned;
}

const FORM_FIELD_TYPES = ['text', 'textarea', 'date', 'number', 'table'];

function validateFormFields(input: any): FormFieldSpec[] | null {
  if (input === undefined || input === null) return [];
  if (!Array.isArray(input)) return null;
  const cleaned: FormFieldSpec[] = [];
  for (const f of input) {
    if (!f || typeof f.key !== 'string' || !f.key.trim()) return null;
    if (typeof f.labelHe !== 'string' || typeof f.labelEn !== 'string') return null;
    if (!FORM_FIELD_TYPES.includes(f.type)) return null;
    const spec: FormFieldSpec = {
      key: f.key.trim(),
      labelHe: f.labelHe.trim(),
      labelEn: f.labelEn.trim(),
      type: f.type,
      required: !!f.required,
    };
    if (f.type === 'table') {
      if (!Array.isArray(f.tableColumns) || f.tableColumns.length === 0) return null;
      const columns: NonNullable<FormFieldSpec['tableColumns']> = [];
      for (const c of f.tableColumns) {
        if (!c || typeof c.key !== 'string' || !c.key.trim()) return null;
        if (typeof c.labelHe !== 'string' || typeof c.labelEn !== 'string') return null;
        if (!['text', 'number', 'date'].includes(c.type)) return null;
        columns.push({ key: c.key.trim(), labelHe: c.labelHe.trim(), labelEn: c.labelEn.trim(), type: c.type });
      }
      spec.tableColumns = columns;
    }
    cleaned.push(spec);
  }
  return cleaned;
}

/** Validates one of the three final-grade rubrics — same component shape as
 *  a regular gradingComponents list, plus its own top-level weight. Returns
 *  null on any malformed input (including a missing/non-numeric weight). */
function validateFinalGradeRubric(input: any): { components: GradingComponentSpec[]; weight: number } | null {
  if (!input || typeof input !== 'object') return null;
  const components = validateGradingComponents(input.components);
  if (components === null || components.length === 0) return null;
  const weight = Number(input.weight);
  if (!Number.isFinite(weight) || weight < 0) return null;
  return { components, weight };
}

/** Validates the full three-rubric finalGradeComponents structure — 'field
 *  not sent at all' means 'this milestone uses the single shared
 *  gradingComponents rubric instead' (always valid); once present, all three
 *  rubrics are required and their weights must sum to 100. */
function validateFinalGradeComponents(input: any): { ok: true; value?: WorkflowMilestoneSpec['finalGradeComponents'] } | { ok: false } {
  if (input === undefined || input === null) return { ok: true };
  if (typeof input !== 'object') return { ok: false };
  const supervisorEvaluation = validateFinalGradeRubric(input.supervisorEvaluation);
  const examinerProjectEvaluation = validateFinalGradeRubric(input.examinerProjectEvaluation);
  const examinerDefenseEvaluation = validateFinalGradeRubric(input.examinerDefenseEvaluation);
  if (!supervisorEvaluation || !examinerProjectEvaluation || !examinerDefenseEvaluation) return { ok: false };
  const weightSum = supervisorEvaluation.weight + examinerProjectEvaluation.weight + examinerDefenseEvaluation.weight;
  if (weightSum !== 100) return { ok: false };
  return { ok: true, value: { supervisorEvaluation, examinerProjectEvaluation, examinerDefenseEvaluation } };
}

function validateMilestones(input: any): WorkflowMilestoneSpec[] | null {
  if (!Array.isArray(input) || input.length === 0) return null;
  const cleaned: WorkflowMilestoneSpec[] = [];
  for (const m of input) {
    if (!m || typeof m.type !== 'string' || !m.type.trim()) return null;
    if (typeof m.nameHe !== 'string' || typeof m.nameEn !== 'string') return null;
    const order = Number(m.order);
    if (!Number.isFinite(order)) return null;

    // 'fixed' means the milestone uses one absolute calendar date for every
    // student under this template instead of an offset from enrollment —
    // see workflowTemplates.ts's WorkflowMilestoneSpec/resolveMilestoneDueDate.
    const dateMode: 'offset' | 'fixed' = m.dateMode === 'fixed' ? 'fixed' : 'offset';
    let dueDaysFromStart = 0;
    let fixedDate = '';
    if (dateMode === 'fixed') {
      if (typeof m.fixedDate !== 'string' || isNaN(new Date(m.fixedDate).getTime())) return null;
      fixedDate = m.fixedDate;
    } else {
      dueDaysFromStart = Number(m.dueDaysFromStart);
      if (!Number.isFinite(dueDaysFromStart) || dueDaysFromStart < 0) return null;
    }

    const gradingComponents = validateGradingComponents(m.gradingComponents);
    if (gradingComponents === null) return null;

    const routing = validateOptionalRouting(m.routing);
    if (!routing.ok) return null;

    // Only meaningful for research_proposal/progress_report — 'none' (or
    // omitted) keeps today's student-submission-only behavior.
    const staffRecordMode: 'none' | 'upload_or_form' = m.staffRecordMode === 'upload_or_form' ? 'upload_or_form' : 'none';
    const staffFormFields = validateFormFields(m.staffFormFields);
    if (staffFormFields === null) return null;

    // Only meaningful for the 'defense' milestone type — omitted keeps
    // today's single shared gradingComponents/hardcoded-criteria rubric.
    const finalGradeComponents = validateFinalGradeComponents(m.finalGradeComponents);
    if (!finalGradeComponents.ok) return null;

    // How much this milestone counts toward the project's OVERALL final
    // grade — validated per-milestone here (range only); the sum-to-100
    // check across every milestone happens once, after this loop, since
    // that's the one property that spans the whole array.
    let percentOfFinalGrade: number | undefined;
    if (m.percentOfFinalGrade !== undefined) {
      percentOfFinalGrade = Number(m.percentOfFinalGrade);
      if (!Number.isFinite(percentOfFinalGrade) || percentOfFinalGrade < 0 || percentOfFinalGrade > 100) return null;
    }

    // What the student must attach to submit this milestone — defaults to
    // 'both' (today's de-facto expectation) rather than rejecting the whole
    // request on a missing/invalid value, same leniency as dateMode/
    // staffRecordMode above.
    const submissionRequirement: SubmissionRequirement = SUBMISSION_REQUIREMENTS.includes(m.submissionRequirement)
      ? m.submissionRequirement
      : 'both';

    const spec: WorkflowMilestoneSpec = {
      type: m.type.trim(),
      nameHe: m.nameHe.trim(),
      nameEn: m.nameEn.trim(),
      order,
      dueDaysFromStart,
      requiresExaminers: !!m.requiresExaminers,
      submissionRequirement,
    };
    if (dateMode === 'fixed') {
      spec.dateMode = 'fixed';
      spec.fixedDate = fixedDate;
    }
    if (gradingComponents.length > 0) spec.gradingComponents = gradingComponents;
    if (routing.value) spec.routing = routing.value;
    if (staffRecordMode === 'upload_or_form') {
      spec.staffRecordMode = staffRecordMode;
      if (staffFormFields.length > 0) spec.staffFormFields = staffFormFields;
    }
    if (finalGradeComponents.value) spec.finalGradeComponents = finalGradeComponents.value;
    if (percentOfFinalGrade !== undefined) spec.percentOfFinalGrade = percentOfFinalGrade;
    cleaned.push(spec);
  }

  // Cross-milestone check — the client already blocks this (see
  // ProposeVersionModal.tsx's handleSubmit), but the API must not trust the
  // client alone. Epsilon tolerance since percentages may be non-integer.
  const totalPercent = cleaned.reduce((sum, m) => sum + (m.percentOfFinalGrade ?? 0), 0);
  if (Math.abs(totalPercent - 100) > 0.01) return null;

  return cleaned;
}

// ─── GET /api/workflow-templates?facultyId=&major= ────────────────────────────
// Own faculty only, unless caller is grad_school_head/system_admin
// (cross-faculty). administrative_secretary is scoped further still — she
// only ever sees templates matching one of her own coordinatorScopes
// (facultyId+major) tuples, never anything outside them ("keep a
// separation between degrees").
export const getWorkflowTemplates = async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ message: 'Unauthorized.' });

  const requestedFacultyId = (req.query.facultyId as string | undefined) ?? undefined;
  const requestedMajor = req.query.major === 'all' ? null : (req.query.major as string | undefined) ?? undefined;

  if (hasAnyRole(req.user, ['administrative_secretary'])) {
    const scope = resolveCoordinatorScope(req.user?.coordinatorScopes ?? [], { facultyId: requestedFacultyId, major: requestedMajor });
    if (!scope) {
      // No scope assigned yet, or the requested one isn't hers — either
      // way, an empty list (never someone else's subject), not an error.
      return res.status(200).json({ facultyId: requestedFacultyId ?? null, major: requestedMajor ?? null, templates: [] });
    }
    try {
      const templates = await listWorkflowTemplates(scope.facultyId, scope.major);
      return res.status(200).json({ facultyId: scope.facultyId, major: scope.major, templates });
    } catch (error: any) {
      console.error('getWorkflowTemplates error:', error);
      return res.status(500).json({ message: 'Failed to load workflow templates.' });
    }
  }

  const isCrossFaculty = hasAnyRole(req.user, GRAD_SCHOOL_APPROVER_ROLES);
  const facultyId = isCrossFaculty ? (requestedFacultyId ?? req.user?.facultyId) : req.user?.facultyId;

  if (!facultyId) return res.status(400).json({ message: 'facultyId could not be resolved.' });
  if (!isCrossFaculty && requestedFacultyId && requestedFacultyId !== req.user?.facultyId) {
    return res.status(403).json({ message: 'You may only view templates for your own faculty.' });
  }

  try {
    const templates = await listWorkflowTemplates(facultyId, requestedMajor);
    return res.status(200).json({ facultyId, major: requestedMajor ?? null, templates });
  } catch (error: any) {
    console.error('getWorkflowTemplates error:', error);
    return res.status(500).json({ message: 'Failed to load workflow templates.' });
  }
};

// ─── POST /api/workflow-templates ──────────────────────────────────────────────
// Body: { processType, milestones, note?, major?, applyMode? } — facultyId
// is the caller's own (system_admin may pass facultyId explicitly to
// propose for another faculty). administrative_secretary never sends
// facultyId/major at all (or, if she holds multiple scopes, names one of
// her OWN — never an arbitrary one) — both are derived from her
// coordinatorScopes server-side, same as getWorkflowTemplates above.
export const createWorkflowTemplateProposal = async (req: AuthenticatedRequest, res: Response) => {
  const uid = req.user?.uid;
  const role = req.user?.role;
  if (!uid || !role) return res.status(401).json({ message: 'Unauthorized.' });
  if (!PROPOSER_ROLES.includes(role)) {
    return res.status(403).json({ message: 'You do not have permission to propose workflow templates.' });
  }

  let facultyId: string | undefined;
  let major: string | null = req.body.major === 'all' || req.body.major === undefined ? null : req.body.major;

  if (role === 'administrative_secretary') {
    const scope = resolveCoordinatorScope(req.user?.coordinatorScopes ?? [], { facultyId: req.body.facultyId, major: req.body.major });
    if (!scope) {
      return res.status(403).json({
        message: (req.user?.coordinatorScopes ?? []).length === 0
          ? 'No subject has been assigned to your account yet — ask your system_admin to assign one.'
          : 'You may only propose templates for a subject assigned to you.',
      });
    }
    facultyId = scope.facultyId;
    major = scope.major;
  } else {
    facultyId = CROSS_FACULTY_PROPOSER_ROLES.includes(role)
      ? (req.body.facultyId ?? req.user?.facultyId)
      : req.user?.facultyId;
    if (!facultyId || facultyId === 'all') {
      return res.status(400).json({
        message: CROSS_FACULTY_PROPOSER_ROLES.includes(role)
          ? 'A specific facultyId is required — please choose which faculty this template applies to.'
          : 'facultyId could not be resolved.',
      });
    }
    if (major && !majorsForFaculty(facultyId).includes(major)) {
      return res.status(400).json({ message: `Invalid major "${major}" for faculty "${facultyId}".` });
    }
  }

  const { processType, note, applyMode } = req.body;
  if (!PROCESS_TYPES.includes(processType)) {
    return res.status(400).json({ message: `Invalid processType: ${processType}` });
  }
  if (applyMode !== 'now' && applyMode !== 'from_now_on') {
    return res.status(400).json({ message: 'applyMode must be "now" or "from_now_on".' });
  }

  const milestones = validateMilestones(req.body.milestones);
  if (!milestones) {
    return res.status(400).json({ message: 'Invalid milestones — each needs type, nameHe, nameEn, order, and either dueDaysFromStart or (dateMode "fixed" + a valid fixedDate).' });
  }

  const defaultRouting = validateOptionalRouting(req.body.defaultRouting);
  if (!defaultRouting.ok) {
    return res.status(400).json({ message: 'Invalid defaultRouting chain — each stage needs a unique id, a valid role, action ("grade"/"approve"), and a rejectTo ("student" or another stage\'s id).' });
  }
  // Who signs off on examiner invitations before they go out — any
  // ChainRole, or 'none' to skip the second tier entirely. Valid for every
  // process type now (not msc_thesis-only — see workflowTemplates.ts's
  // WorkflowTemplateDoc doc comment for the legacy-default fallback when
  // this is omitted).
  let examinerSignoffRole: ChainRole | 'none' | undefined;
  if (req.body.examinerSignoffRole !== undefined) {
    if (req.body.examinerSignoffRole !== 'none' && !SIGNOFF_ROLES.includes(req.body.examinerSignoffRole)) {
      return res.status(400).json({ message: `Invalid examinerSignoffRole: ${req.body.examinerSignoffRole}` });
    }
    examinerSignoffRole = req.body.examinerSignoffRole;
  }
  // Who signs off on a defense milestone's already-computed final grade — any
  // ChainRole (no 'none' option, unlike examinerSignoffRole — this is the
  // terminal gate before Michlol transfer, always required).
  let finalGradeSignoffRole: ChainRole | undefined;
  if (req.body.finalGradeSignoffRole !== undefined) {
    if (!SIGNOFF_ROLES.includes(req.body.finalGradeSignoffRole)) {
      return res.status(400).json({ message: `Invalid finalGradeSignoffRole: ${req.body.finalGradeSignoffRole}` });
    }
    finalGradeSignoffRole = req.body.finalGradeSignoffRole;
  }
  // What a student with no active project sees first for this subject —
  // see WorkflowTemplateDoc.firstStepMode/resolveFirstStepMode.
  let firstStepMode: 'browse_projects' | 'choose_supervisor' | undefined;
  if (req.body.firstStepMode !== undefined) {
    if (req.body.firstStepMode !== 'browse_projects' && req.body.firstStepMode !== 'choose_supervisor') {
      return res.status(400).json({ message: `Invalid firstStepMode: ${req.body.firstStepMode}` });
    }
    firstStepMode = req.body.firstStepMode;
  }
  let supervisorSelectionRequiresApproval: boolean | undefined;
  if (req.body.supervisorSelectionRequiresApproval !== undefined) {
    if (typeof req.body.supervisorSelectionRequiresApproval !== 'boolean') {
      return res.status(400).json({ message: 'supervisorSelectionRequiresApproval must be a boolean.' });
    }
    supervisorSelectionRequiresApproval = req.body.supervisorSelectionRequiresApproval;
  }

  try {
    const result = await proposeWorkflowTemplate({
      facultyId: facultyId!, processType, major, milestones, createdBy: uid, note: note ?? null, applyMode,
      ...(defaultRouting.value ? { defaultRouting: defaultRouting.value } : {}),
      ...(examinerSignoffRole !== undefined ? { examinerSignoffRole } : {}),
      ...(finalGradeSignoffRole !== undefined ? { finalGradeSignoffRole } : {}),
      ...(firstStepMode !== undefined ? { firstStepMode } : {}),
      ...(supervisorSelectionRequiresApproval !== undefined ? { supervisorSelectionRequiresApproval } : {}),
    });
    return res.status(201).json({ success: true, id: result.id, status: 'pending_approval' });
  } catch (error: any) {
    console.error('createWorkflowTemplateProposal error:', error);
    return res.status(500).json({ message: error.message || 'Failed to propose workflow template.' });
  }
};

// ─── PUT /api/workflow-templates/:id ───────────────────────────────────────────
// Edits a still-pending proposal IN PLACE — same doc, same version, stays
// 'pending_approval' — instead of createWorkflowTemplateProposal's
// always-create-a-new-version behavior. Uses the SAME permission tier as
// createWorkflowTemplateProposal (PROPOSER_ROLES + the doc's own
// facultyId/major), not canApprove — editing your own not-yet-decided
// proposal is a maker action, same as creating one, not an approver action
// (unlike delete/approve/reject on this same doc).
export const updateWorkflowTemplateProposalController = async (req: AuthenticatedRequest, res: Response) => {
  const uid = req.user?.uid;
  const role = req.user?.role;
  if (!uid || !role) return res.status(401).json({ message: 'Unauthorized.' });
  if (!PROPOSER_ROLES.includes(role)) {
    return res.status(403).json({ message: 'You do not have permission to edit workflow template proposals.' });
  }

  const { id } = req.params;
  if (!id || typeof id !== 'string') return res.status(400).json({ message: 'Missing template id.' });

  try {
    const snap = await db.collection('workflowTemplates').doc(id).get();
    if (!snap.exists) return res.status(404).json({ message: 'Template not found.' });
    const data = snap.data()!;

    if (role === 'administrative_secretary') {
      const scope = resolveCoordinatorScope(req.user?.coordinatorScopes ?? [], { facultyId: data.facultyId, major: data.major ?? null });
      if (!scope) return res.status(403).json({ message: 'You may only edit proposals for a subject assigned to you.' });
    } else if (!CROSS_FACULTY_PROPOSER_ROLES.includes(role) && data.facultyId !== req.user?.facultyId) {
      return res.status(403).json({ message: 'You may only edit proposals for your own faculty.' });
    }

    const { note, applyMode } = req.body;
    if (applyMode !== 'now' && applyMode !== 'from_now_on') {
      return res.status(400).json({ message: 'applyMode must be "now" or "from_now_on".' });
    }

    const milestones = validateMilestones(req.body.milestones);
    if (!milestones) {
      return res.status(400).json({ message: 'Invalid milestones — each needs type, nameHe, nameEn, order, and either dueDaysFromStart or (dateMode "fixed" + a valid fixedDate).' });
    }

    const defaultRouting = validateOptionalRouting(req.body.defaultRouting);
    if (!defaultRouting.ok) {
      return res.status(400).json({ message: 'Invalid defaultRouting chain — each stage needs a unique id, a valid role, action ("grade"/"approve"), and a rejectTo ("student" or another stage\'s id).' });
    }
    let examinerSignoffRole: ChainRole | 'none' | undefined;
    if (req.body.examinerSignoffRole !== undefined) {
      if (req.body.examinerSignoffRole !== 'none' && !SIGNOFF_ROLES.includes(req.body.examinerSignoffRole)) {
        return res.status(400).json({ message: `Invalid examinerSignoffRole: ${req.body.examinerSignoffRole}` });
      }
      examinerSignoffRole = req.body.examinerSignoffRole;
    }
    let finalGradeSignoffRole: ChainRole | undefined;
    if (req.body.finalGradeSignoffRole !== undefined) {
      if (!SIGNOFF_ROLES.includes(req.body.finalGradeSignoffRole)) {
        return res.status(400).json({ message: `Invalid finalGradeSignoffRole: ${req.body.finalGradeSignoffRole}` });
      }
      finalGradeSignoffRole = req.body.finalGradeSignoffRole;
    }
    let firstStepMode: 'browse_projects' | 'choose_supervisor' | undefined;
    if (req.body.firstStepMode !== undefined) {
      if (req.body.firstStepMode !== 'browse_projects' && req.body.firstStepMode !== 'choose_supervisor') {
        return res.status(400).json({ message: `Invalid firstStepMode: ${req.body.firstStepMode}` });
      }
      firstStepMode = req.body.firstStepMode;
    }
    let supervisorSelectionRequiresApproval: boolean | undefined;
    if (req.body.supervisorSelectionRequiresApproval !== undefined) {
      if (typeof req.body.supervisorSelectionRequiresApproval !== 'boolean') {
        return res.status(400).json({ message: 'supervisorSelectionRequiresApproval must be a boolean.' });
      }
      supervisorSelectionRequiresApproval = req.body.supervisorSelectionRequiresApproval;
    }

    const beforeMilestoneCount = Array.isArray(data.milestones) ? data.milestones.length : 0;

    await updatePendingWorkflowTemplate(id, {
      milestones, note: note ?? null, applyMode,
      ...(defaultRouting.value ? { defaultRouting: defaultRouting.value } : {}),
      ...(examinerSignoffRole !== undefined ? { examinerSignoffRole } : {}),
      ...(finalGradeSignoffRole !== undefined ? { finalGradeSignoffRole } : {}),
      ...(firstStepMode !== undefined ? { firstStepMode } : {}),
      ...(supervisorSelectionRequiresApproval !== undefined ? { supervisorSelectionRequiresApproval } : {}),
    });

    await logAuditEvent({
      userId: uid,
      userRole: role,
      action: 'workflow_template_proposal_updated',
      entityType: 'workflowTemplate',
      entityId: id,
      oldValue: { milestoneCount: beforeMilestoneCount },
      newValue: { milestoneCount: milestones.length },
    });

    return res.status(200).json({ success: true, message: 'Proposal updated.' });
  } catch (error: any) {
    console.error('updateWorkflowTemplateProposalController error:', error);
    return res.status(500).json({ message: error.message || 'Failed to update the workflow template proposal.' });
  }
};

// ─── POST /api/workflow-templates/:id/approve ─────────────────────────────────
export const approveWorkflowTemplateController = async (req: AuthenticatedRequest, res: Response) => {
  const uid = req.user?.uid;
  const role = req.user?.role;
  if (!uid || !role) return res.status(401).json({ message: 'Unauthorized.' });

  const { id } = req.params;
  if (!id || typeof id !== 'string') return res.status(400).json({ message: 'Missing template id.' });

  try {
    const snap = await db.collection('workflowTemplates').doc(id).get();
    if (!snap.exists) return res.status(404).json({ message: 'Template not found.' });
    const data = snap.data()!;
    const processType = data.processType as ProcessType;

    if (!canApprove(processType, role) && !hasActionGrant(req.user, 'approve_templates', templateResourceScope({ facultyId: data.facultyId, major: data.major, processType }))) {
      return res.status(403).json({
        message: isMastersProcess(processType)
          ? 'Only the grad school head can approve this process type.'
          : 'Only the faculty admin/coordinator can approve this process type.',
      });
    }
    // administrative_secretary may only act within her own assigned
    // subject(s) — "keep a separation between degrees" applies to
    // approve/reject/delete, not just proposing/viewing.
    if (role === 'administrative_secretary') {
      const scope = resolveCoordinatorScope(req.user?.coordinatorScopes ?? [], { facultyId: data.facultyId, major: data.major ?? null });
      if (!scope) return res.status(403).json({ message: 'You may only approve templates for a subject assigned to you.' });
    }

    const updated = await approveWorkflowTemplate(id, uid);

    await logAuditEvent({
      userId: uid,
      userRole: role,
      action: 'workflow_template_approved',
      entityType: 'workflowTemplate',
      entityId: id,
      oldValue: { status: 'pending_approval' },
      newValue: { status: 'approved', version: updated.version },
    });

    // Retroactive apply — only when the proposer chose "now" at proposal
    // time. Runs after approval commits so a failure here never blocks the
    // approval itself; the caller can still retry via the preview+approve
    // flow (approve() is idempotent-safe against re-running since the
    // affected-count is recorded, not re-derived).
    let retroactive: { affectedCount: number } | undefined;
    if (data.applyMode === 'now') {
      retroactive = await applyTemplateRetroactively(
        data.facultyId, processType, data.major ?? null, updated.milestones, uid, role, updated.defaultRouting,
      );
      await db.collection('workflowTemplates').doc(id).update({
        retroactiveAppliedAt: new Date().toISOString(),
        retroactiveAffectedCount: retroactive.affectedCount,
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Workflow template approved.',
      retroactiveAffectedCount: retroactive?.affectedCount,
    });
  } catch (error: any) {
    console.error('approveWorkflowTemplateController error:', error);
    return res.status(500).json({ message: error.message || 'Failed to approve workflow template.' });
  }
};

// ─── GET /api/workflow-templates/retroactive-preview?facultyId=&major=&processType= ──
// Read-only — no mutation. Used both when the proposer picks "now"
// (informational) and again right before the approver confirms.
export const getRetroactivePreviewController = async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ message: 'Unauthorized.' });

  const processType = req.query.processType as ProcessType;
  if (!PROCESS_TYPES.includes(processType)) {
    return res.status(400).json({ message: `Invalid processType: ${processType}` });
  }
  const requestedMajor = req.query.major === 'all' ? null : (req.query.major as string | undefined) ?? null;
  const requestedFacultyId = req.query.facultyId as string | undefined;

  let facultyId: string | undefined;
  let major = requestedMajor;
  const isCrossFaculty = hasAnyRole(req.user, CROSS_FACULTY_PROPOSER_ROLES);

  if (hasAnyRole(req.user, ['administrative_secretary'])) {
    const scope = resolveCoordinatorScope(req.user?.coordinatorScopes ?? [], { facultyId: requestedFacultyId, major: requestedMajor });
    if (!scope) return res.status(403).json({ message: 'You may only preview a subject assigned to you.' });
    facultyId = scope.facultyId;
    major = scope.major;
  } else if (isCrossFaculty) {
    facultyId = requestedFacultyId ?? req.user?.facultyId;
  } else {
    // Non-cross-faculty roles (coordinator/faculty_admin/program_head) may
    // only preview their own faculty — a client-supplied facultyId for
    // another faculty must never be trusted, same fix as
    // createWorkflowTemplateProposal/getWorkflowTemplates already enforce.
    if (requestedFacultyId && requestedFacultyId !== req.user?.facultyId) {
      return res.status(403).json({ message: 'You may only preview a subject for your own faculty.' });
    }
    facultyId = req.user?.facultyId;
  }
  if (!facultyId || facultyId === 'all') {
    return res.status(400).json({ message: 'A specific facultyId is required.' });
  }

  try {
    const preview = await previewRetroactiveImpact(facultyId, processType, major);
    return res.status(200).json(preview);
  } catch (error: any) {
    console.error('getRetroactivePreviewController error:', error);
    return res.status(500).json({ message: 'Failed to compute the retroactive-impact preview.' });
  }
};

// ─── POST /api/workflow-templates/duplicate ────────────────────────────────────
// Body: { sourceFacultyId, sourceMajor?, processType, targetFacultyId?, targetMajor? }
// Lets a coordinator (or any PROPOSER_ROLE) reuse ANOTHER faculty's currently
// APPROVED template as the starting point for a proposal in their own
// faculty — e.g. a coordinator who only holds that role in the engineering
// faculty (not data_science) can still pull in data_science's approved
// msc_thesis template instead of building one from scratch. Resolved by
// facultyId+processType+major (findApprovedTemplateId), not by a specific
// doc id — the caller has no way to know a foreign faculty's internal
// template ids, and doesn't need to.
//
// Read side: any PROPOSER_ROLE may read ANY faculty's currently-approved
// template for this purpose — an approved template is published process
// configuration, not sensitive data (unlike a pending/rejected draft, which
// stays outside this endpoint's reach entirely since findApprovedTemplateId
// only ever resolves 'approved' docs).
//
// Write side stays exactly as scoped as an ordinary proposal
// (createWorkflowTemplateProposal): coordinator/faculty_admin/program_head
// can only ever target their OWN faculty — any client-supplied
// targetFacultyId is ignored for them; administrative_secretary is limited
// to her own coordinatorScopes; only grad_school_head/system_admin may name
// an arbitrary target faculty. The copy is created as a fresh version-1
// pending_approval proposal for the target subject and goes through the
// target faculty's normal approval chain like any other proposal — never
// auto-approved, and always applyMode 'from_now_on' (retroactively touching
// the target's in-progress projects isn't implied by "reuse this template").
export const duplicateWorkflowTemplateController = async (req: AuthenticatedRequest, res: Response) => {
  const uid = req.user?.uid;
  const role = req.user?.role;
  if (!uid || !role) return res.status(401).json({ message: 'Unauthorized.' });
  if (!PROPOSER_ROLES.includes(role)) {
    return res.status(403).json({ message: 'You do not have permission to duplicate workflow templates.' });
  }

  const processType = req.body.processType;
  if (!PROCESS_TYPES.includes(processType)) {
    return res.status(400).json({ message: `Invalid processType: ${processType}` });
  }
  const sourceFacultyId = req.body.sourceFacultyId;
  if (typeof sourceFacultyId !== 'string' || majorsForFaculty(sourceFacultyId).length === 0) {
    return res.status(400).json({ message: 'A valid sourceFacultyId is required.' });
  }
  const sourceMajor: string | null = req.body.sourceMajor ? req.body.sourceMajor : null;

  let targetFacultyId: string;
  let targetMajor: string | null;
  if (role === 'administrative_secretary') {
    const scope = resolveCoordinatorScope(req.user?.coordinatorScopes ?? [], { facultyId: req.body.targetFacultyId, major: req.body.targetMajor });
    if (!scope) {
      return res.status(403).json({
        message: (req.user?.coordinatorScopes ?? []).length === 0
          ? 'No subject has been assigned to your account yet — ask your system_admin to assign one.'
          : 'You may only duplicate into a subject assigned to you.',
      });
    }
    targetFacultyId = scope.facultyId;
    targetMajor = scope.major;
  } else if (GRAD_SCHOOL_APPROVER_ROLES.includes(role)) {
    targetFacultyId = req.body.targetFacultyId ?? req.user?.facultyId;
    if (!targetFacultyId || majorsForFaculty(targetFacultyId).length === 0) {
      return res.status(400).json({ message: 'A valid targetFacultyId is required.' });
    }
    targetMajor = req.body.targetMajor ? req.body.targetMajor : null;
  } else {
    // coordinator / faculty_admin / program_head — always their own faculty;
    // any client-supplied targetFacultyId is ignored, matching
    // createWorkflowTemplateProposal's own-faculty enforcement for these
    // roles. They can pull FROM anywhere (see the read-side note above) but
    // only ever write INTO the one faculty they actually manage.
    targetFacultyId = req.user?.facultyId!;
    if (!targetFacultyId || targetFacultyId === 'all') {
      return res.status(400).json({ message: 'facultyId could not be resolved.' });
    }
    targetMajor = req.body.targetMajor ? req.body.targetMajor : null;
  }
  if (targetMajor && !majorsForFaculty(targetFacultyId).includes(targetMajor)) {
    return res.status(400).json({ message: `Invalid major "${targetMajor}" for faculty "${targetFacultyId}".` });
  }
  if (targetFacultyId === sourceFacultyId && targetMajor === sourceMajor) {
    return res.status(400).json({ message: 'Choose a different faculty or major to duplicate into — this is the same subject the template already belongs to.' });
  }

  try {
    const source = await findApprovedTemplateId(sourceFacultyId, processType, sourceMajor);
    if (!source) {
      return res.status(404).json({ message: 'No approved template found for that faculty/major/process type.' });
    }

    // A 'committee' routing stage's committeeId (if set) names a SPECIFIC
    // committee record belonging to the source faculty/major — meaningless
    // (and a cross-faculty data leak) once copied elsewhere, so it's
    // stripped here; target staff pick their own committee when they edit
    // the proposal, same as any committee-role stage on a brand-new template.
    const stripCommitteeIds = (chain: MilestoneRoutingSpec): MilestoneRoutingSpec =>
      chain.map((stage) => {
        if (stage.role !== 'committee' || !stage.committeeId) return stage;
        const { committeeId, ...rest } = stage;
        return rest as ChainStage;
      });
    const duplicatedMilestones = source.milestones.map((m) => ({
      ...m,
      ...(m.routing ? { routing: stripCommitteeIds(m.routing) } : {}),
    }));
    const duplicatedDefaultRouting = source.defaultRouting ? stripCommitteeIds(source.defaultRouting) : undefined;

    const sourceLabel = `${sourceFacultyId}${sourceMajor ? '/' + sourceMajor : ''}`;
    const result = await proposeWorkflowTemplate({
      facultyId: targetFacultyId,
      processType,
      major: targetMajor,
      milestones: duplicatedMilestones,
      createdBy: uid,
      note: `Duplicated from ${sourceLabel}`,
      applyMode: 'from_now_on',
      ...(duplicatedDefaultRouting ? { defaultRouting: duplicatedDefaultRouting } : {}),
      ...(source.examinerSignoffRole ? { examinerSignoffRole: source.examinerSignoffRole } : {}),
      ...(source.finalGradeSignoffRole ? { finalGradeSignoffRole: source.finalGradeSignoffRole } : {}),
      ...(source.firstStepMode ? { firstStepMode: source.firstStepMode } : {}),
      ...(source.supervisorSelectionRequiresApproval !== undefined ? { supervisorSelectionRequiresApproval: source.supervisorSelectionRequiresApproval } : {}),
    });

    await logAuditEvent({
      userId: uid,
      userRole: role,
      action: 'workflow_template_duplicated',
      entityType: 'workflowTemplate',
      entityId: result.id,
      oldValue: { sourceTemplateId: source.id, sourceFacultyId, sourceMajor },
      newValue: { facultyId: targetFacultyId, major: targetMajor, processType },
    });

    return res.status(201).json({ success: true, id: result.id, status: 'pending_approval', facultyId: targetFacultyId, major: targetMajor });
  } catch (error: any) {
    console.error('duplicateWorkflowTemplateController error:', error);
    return res.status(500).json({ message: error.message || 'Failed to duplicate workflow template.' });
  }
};

// ─── DELETE /api/workflow-templates/:id ────────────────────────────────────────
// Same role gate as approve/reject; blocked while the template is the
// currently-active one (status === 'approved') — it must be replaced by
// approving a new version first, never leaving a subject with no active
// template.
export const deleteWorkflowTemplateController = async (req: AuthenticatedRequest, res: Response) => {
  const uid = req.user?.uid;
  const role = req.user?.role;
  if (!uid || !role) return res.status(401).json({ message: 'Unauthorized.' });

  const { id } = req.params;
  if (!id || typeof id !== 'string') return res.status(400).json({ message: 'Missing template id.' });

  try {
    const snap = await db.collection('workflowTemplates').doc(id).get();
    if (!snap.exists) return res.status(404).json({ message: 'Template not found.' });
    const data = snap.data()!;
    const processType = data.processType as ProcessType;

    if (!canApprove(processType, role) && !hasActionGrant(req.user, 'approve_templates', templateResourceScope({ facultyId: data.facultyId, major: data.major, processType }))) {
      return res.status(403).json({
        message: isMastersProcess(processType)
          ? 'Only the grad school head can delete this process type\'s templates.'
          : 'Only the faculty admin/coordinator can delete this process type\'s templates.',
      });
    }
    if (role === 'administrative_secretary') {
      const scope = resolveCoordinatorScope(req.user?.coordinatorScopes ?? [], { facultyId: data.facultyId, major: data.major ?? null });
      if (!scope) return res.status(403).json({ message: 'You may only delete templates for a subject assigned to you.' });
    }

    await deleteWorkflowTemplate(id);

    await logAuditEvent({
      userId: uid,
      userRole: role,
      action: 'workflow_template_deleted',
      entityType: 'workflowTemplate',
      entityId: id,
      oldValue: { status: data.status, version: data.version },
    });

    return res.status(200).json({ success: true, message: 'Workflow template deleted.' });
  } catch (error: any) {
    console.error('deleteWorkflowTemplateController error:', error);
    return res.status(500).json({ message: error.message || 'Failed to delete workflow template.' });
  }
};

// ─── POST /api/workflow-templates/:id/reject ──────────────────────────────────
// Body: { reason: string }
export const rejectWorkflowTemplateController = async (req: AuthenticatedRequest, res: Response) => {
  const uid = req.user?.uid;
  const role = req.user?.role;
  if (!uid || !role) return res.status(401).json({ message: 'Unauthorized.' });

  const { id } = req.params;
  const { reason } = req.body;
  if (!id || typeof id !== 'string') return res.status(400).json({ message: 'Missing template id.' });
  if (!reason || typeof reason !== 'string') {
    return res.status(400).json({ message: 'A rejection reason is required.' });
  }

  try {
    const snap = await db.collection('workflowTemplates').doc(id).get();
    if (!snap.exists) return res.status(404).json({ message: 'Template not found.' });
    const data = snap.data()!;
    const processType = data.processType as ProcessType;

    if (!canApprove(processType, role) && !hasActionGrant(req.user, 'approve_templates', templateResourceScope({ facultyId: data.facultyId, major: data.major, processType }))) {
      return res.status(403).json({
        message: isMastersProcess(processType)
          ? 'Only the grad school head can reject this process type.'
          : 'Only the faculty admin/coordinator can reject this process type.',
      });
    }
    if (role === 'administrative_secretary') {
      const scope = resolveCoordinatorScope(req.user?.coordinatorScopes ?? [], { facultyId: data.facultyId, major: data.major ?? null });
      if (!scope) return res.status(403).json({ message: 'You may only reject templates for a subject assigned to you.' });
    }

    await rejectWorkflowTemplate(id, uid, reason);

    await logAuditEvent({
      userId: uid,
      userRole: role,
      action: 'workflow_template_rejected',
      entityType: 'workflowTemplate',
      entityId: id,
      oldValue: { status: 'pending_approval' },
      newValue: { status: 'rejected' },
      explanation: reason,
    });

    return res.status(200).json({ success: true, message: 'Workflow template rejected.' });
  } catch (error: any) {
    console.error('rejectWorkflowTemplateController error:', error);
    return res.status(500).json({ message: error.message || 'Failed to reject workflow template.' });
  }
};
