// src/controllers/workflowTemplateController.ts
//
// Faculty-configurable milestone templates (see services/workflowTemplates.ts).
// Approval chain: master's process types (msc_thesis, msc_project) require
// grad_school_head sign-off; bachelor's (bsc_project) is approved by the
// faculty itself — matches the requirements doc's "בתואר שני אישור הסטייה
// יהיה של בית הספר ללימודי מוסמכים; בתואר ראשון הפקולטה תאשר בעצמה."

import { Response } from 'express';
import { db } from '../config/firebase.js';
import { AuthenticatedRequest } from '../middleware/auth.js';
import {
  ProcessType,
  WorkflowMilestoneSpec,
  GradingComponentSpec,
  ChainRole,
  ChainStage,
  MilestoneRoutingSpec,
  listWorkflowTemplates,
  proposeWorkflowTemplate,
  approveWorkflowTemplate,
  rejectWorkflowTemplate,
  deleteWorkflowTemplate,
} from '../services/workflowTemplates.js';
import { previewRetroactiveImpact, applyTemplateRetroactively } from '../services/workflowTemplateRetroactiveApply.js';
import { majorsForFaculty } from '../config/majors.js';
import { logAuditEvent } from '../services/auditLog.js';

const PROCESS_TYPES: ProcessType[] = ['msc_thesis', 'msc_project', 'bsc_project'];
// grad_school_head added — previously could only approve master's templates,
// never propose/add one themselves, even though they're the head-of-school
// role this whole approval chain is built around.
const PROPOSER_ROLES = ['coordinator', 'faculty_admin', 'program_head', 'administrative_secretary', 'grad_school_head', 'system_admin'];
// administrative_secretary added to both — templates must be modifiable by
// system_admin, administrative_secretary, and the relevant head-of-faculty/
// head-of-school regardless of process type (previously administrative_secretary
// could propose a template but never actually approve/activate one).
const GRAD_SCHOOL_APPROVER_ROLES = ['grad_school_head', 'administrative_secretary', 'system_admin'];
const FACULTY_APPROVER_ROLES = ['faculty_admin', 'coordinator', 'administrative_secretary', 'system_admin'];
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

const CHAIN_ROLES: ChainRole[] = ['supervisor', 'coordinator', 'faculty_admin', 'administrative_secretary', 'grad_school_head', 'program_head'];

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

function validateMilestones(input: any): WorkflowMilestoneSpec[] | null {
  if (!Array.isArray(input) || input.length === 0) return null;
  const cleaned: WorkflowMilestoneSpec[] = [];
  for (const m of input) {
    if (!m || typeof m.type !== 'string' || !m.type.trim()) return null;
    if (typeof m.nameHe !== 'string' || typeof m.nameEn !== 'string') return null;
    const order = Number(m.order);
    const dueDaysFromStart = Number(m.dueDaysFromStart);
    if (!Number.isFinite(order) || !Number.isFinite(dueDaysFromStart) || dueDaysFromStart < 0) return null;

    const gradingComponents = validateGradingComponents(m.gradingComponents);
    if (gradingComponents === null) return null;

    const routing = validateOptionalRouting(m.routing);
    if (!routing.ok) return null;

    const spec: WorkflowMilestoneSpec = {
      type: m.type.trim(),
      nameHe: m.nameHe.trim(),
      nameEn: m.nameEn.trim(),
      order,
      dueDaysFromStart,
      requiresExaminers: !!m.requiresExaminers,
    };
    if (gradingComponents.length > 0) spec.gradingComponents = gradingComponents;
    if (routing.value) spec.routing = routing.value;
    cleaned.push(spec);
  }
  return cleaned;
}

// ─── GET /api/workflow-templates?facultyId=&major= ────────────────────────────
// Own faculty only, unless caller is grad_school_head/system_admin
// (cross-faculty). administrative_secretary is scoped further still — she
// only ever sees templates matching one of her own coordinatorScopes
// (facultyId+major) tuples, never anything outside them ("keep a
// separation between degrees").
export const getWorkflowTemplates = async (req: AuthenticatedRequest, res: Response) => {
  const role = req.user?.role;
  if (!role) return res.status(401).json({ message: 'Unauthorized.' });

  const requestedFacultyId = (req.query.facultyId as string | undefined) ?? undefined;
  const requestedMajor = req.query.major === 'all' ? null : (req.query.major as string | undefined) ?? undefined;

  if (role === 'administrative_secretary') {
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

  const isCrossFaculty = GRAD_SCHOOL_APPROVER_ROLES.includes(role);
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
    return res.status(400).json({ message: 'Invalid milestones — each needs type, nameHe, nameEn, order, dueDaysFromStart.' });
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
    if (req.body.examinerSignoffRole !== 'none' && !CHAIN_ROLES.includes(req.body.examinerSignoffRole)) {
      return res.status(400).json({ message: `Invalid examinerSignoffRole: ${req.body.examinerSignoffRole}` });
    }
    examinerSignoffRole = req.body.examinerSignoffRole;
  }
  // Who signs off on a defense milestone's already-computed final grade — any
  // ChainRole (no 'none' option, unlike examinerSignoffRole — this is the
  // terminal gate before Michlol transfer, always required).
  let finalGradeSignoffRole: ChainRole | undefined;
  if (req.body.finalGradeSignoffRole !== undefined) {
    if (!CHAIN_ROLES.includes(req.body.finalGradeSignoffRole)) {
      return res.status(400).json({ message: `Invalid finalGradeSignoffRole: ${req.body.finalGradeSignoffRole}` });
    }
    finalGradeSignoffRole = req.body.finalGradeSignoffRole;
  }

  try {
    const result = await proposeWorkflowTemplate({
      facultyId: facultyId!, processType, major, milestones, createdBy: uid, note: note ?? null, applyMode,
      ...(defaultRouting.value ? { defaultRouting: defaultRouting.value } : {}),
      ...(examinerSignoffRole !== undefined ? { examinerSignoffRole } : {}),
      ...(finalGradeSignoffRole !== undefined ? { finalGradeSignoffRole } : {}),
    });
    return res.status(201).json({ success: true, id: result.id, status: 'pending_approval' });
  } catch (error: any) {
    console.error('createWorkflowTemplateProposal error:', error);
    return res.status(500).json({ message: error.message || 'Failed to propose workflow template.' });
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

    if (!canApprove(processType, role)) {
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
  const role = req.user?.role;
  if (!role) return res.status(401).json({ message: 'Unauthorized.' });

  const processType = req.query.processType as ProcessType;
  if (!PROCESS_TYPES.includes(processType)) {
    return res.status(400).json({ message: `Invalid processType: ${processType}` });
  }
  const requestedMajor = req.query.major === 'all' ? null : (req.query.major as string | undefined) ?? null;

  let facultyId: string | undefined;
  let major = requestedMajor;

  if (role === 'administrative_secretary') {
    const scope = resolveCoordinatorScope(req.user?.coordinatorScopes ?? [], { facultyId: req.query.facultyId as string | undefined, major: requestedMajor });
    if (!scope) return res.status(403).json({ message: 'You may only preview a subject assigned to you.' });
    facultyId = scope.facultyId;
    major = scope.major;
  } else {
    facultyId = (req.query.facultyId as string | undefined) ?? (CROSS_FACULTY_PROPOSER_ROLES.includes(role) ? undefined : req.user?.facultyId);
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

    if (!canApprove(processType, role)) {
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

    if (!canApprove(processType, role)) {
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
