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
  listWorkflowTemplates,
  proposeWorkflowTemplate,
  approveWorkflowTemplate,
  rejectWorkflowTemplate,
} from '../services/workflowTemplates.js';
import { logAuditEvent } from '../services/auditLog.js';

const PROCESS_TYPES: ProcessType[] = ['msc_thesis', 'msc_project', 'bsc_project'];
const PROPOSER_ROLES = ['coordinator', 'faculty_admin', 'program_head', 'administrative_secretary', 'system_admin'];
const GRAD_SCHOOL_APPROVER_ROLES = ['grad_school_head', 'system_admin'];
const FACULTY_APPROVER_ROLES = ['faculty_admin', 'coordinator', 'system_admin'];

function isMastersProcess(processType: ProcessType): boolean {
  return processType === 'msc_thesis' || processType === 'msc_project';
}

function canApprove(processType: ProcessType, role: string): boolean {
  return isMastersProcess(processType)
    ? GRAD_SCHOOL_APPROVER_ROLES.includes(role)
    : FACULTY_APPROVER_ROLES.includes(role);
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
    cleaned.push({
      type: m.type.trim(),
      nameHe: m.nameHe.trim(),
      nameEn: m.nameEn.trim(),
      order,
      dueDaysFromStart,
      requiresExaminers: !!m.requiresExaminers,
    });
  }
  return cleaned;
}

// ─── GET /api/workflow-templates?facultyId=xxx ────────────────────────────────
// Own faculty only, unless caller is grad_school_head/system_admin (cross-faculty).
export const getWorkflowTemplates = async (req: AuthenticatedRequest, res: Response) => {
  const role = req.user?.role;
  if (!role) return res.status(401).json({ message: 'Unauthorized.' });

  const isCrossFaculty = GRAD_SCHOOL_APPROVER_ROLES.includes(role);
  const requestedFacultyId = (req.query.facultyId as string | undefined) ?? undefined;
  const facultyId = isCrossFaculty ? (requestedFacultyId ?? req.user?.facultyId) : req.user?.facultyId;

  if (!facultyId) return res.status(400).json({ message: 'facultyId could not be resolved.' });
  if (!isCrossFaculty && requestedFacultyId && requestedFacultyId !== req.user?.facultyId) {
    return res.status(403).json({ message: 'You may only view templates for your own faculty.' });
  }

  try {
    const templates = await listWorkflowTemplates(facultyId);
    return res.status(200).json({ facultyId, templates });
  } catch (error: any) {
    console.error('getWorkflowTemplates error:', error);
    return res.status(500).json({ message: 'Failed to load workflow templates.' });
  }
};

// ─── POST /api/workflow-templates ──────────────────────────────────────────────
// Body: { processType, milestones, note? } — facultyId is the caller's own
// (system_admin may pass facultyId explicitly to propose for another faculty).
export const createWorkflowTemplateProposal = async (req: AuthenticatedRequest, res: Response) => {
  const uid = req.user?.uid;
  const role = req.user?.role;
  if (!uid || !role) return res.status(401).json({ message: 'Unauthorized.' });
  if (!PROPOSER_ROLES.includes(role)) {
    return res.status(403).json({ message: 'You do not have permission to propose workflow templates.' });
  }

  const facultyId = role === 'system_admin' ? (req.body.facultyId ?? req.user?.facultyId) : req.user?.facultyId;
  if (!facultyId) return res.status(400).json({ message: 'facultyId could not be resolved.' });

  const { processType, note } = req.body;
  if (!PROCESS_TYPES.includes(processType)) {
    return res.status(400).json({ message: `Invalid processType: ${processType}` });
  }

  const milestones = validateMilestones(req.body.milestones);
  if (!milestones) {
    return res.status(400).json({ message: 'Invalid milestones — each needs type, nameHe, nameEn, order, dueDaysFromStart.' });
  }

  try {
    const result = await proposeWorkflowTemplate({
      facultyId, processType, milestones, createdBy: uid, note: note ?? null,
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
    const processType = snap.data()!.processType as ProcessType;

    if (!canApprove(processType, role)) {
      return res.status(403).json({
        message: isMastersProcess(processType)
          ? 'Only the grad school head can approve this process type.'
          : 'Only the faculty admin/coordinator can approve this process type.',
      });
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

    return res.status(200).json({ success: true, message: 'Workflow template approved.' });
  } catch (error: any) {
    console.error('approveWorkflowTemplateController error:', error);
    return res.status(500).json({ message: error.message || 'Failed to approve workflow template.' });
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
    const processType = snap.data()!.processType as ProcessType;

    if (!canApprove(processType, role)) {
      return res.status(403).json({
        message: isMastersProcess(processType)
          ? 'Only the grad school head can reject this process type.'
          : 'Only the faculty admin/coordinator can reject this process type.',
      });
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
