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

export function deriveProcessType(degreeType: string | null | undefined, projectType: string | null | undefined): ProcessType {
  if (degreeType === 'masters') {
    return projectType === 'thesis' ? 'msc_thesis' : 'msc_project';
  }
  return 'bsc_project';
}

export interface WorkflowMilestoneSpec {
  type: string;
  nameHe: string;
  nameEn: string;
  order: number;
  dueDaysFromStart: number;
  requiresExaminers: boolean;
}

export type WorkflowTemplateStatus = 'pending_approval' | 'approved' | 'rejected' | 'superseded';

export interface WorkflowTemplateDoc {
  id: string;
  facultyId: string;
  processType: ProcessType;
  version: number;
  status: WorkflowTemplateStatus;
  milestones: WorkflowMilestoneSpec[];
  createdBy: string;
  createdAt: string;
  proposedNote: string | null;
  approvedBy?: string;
  approvedAt?: string;
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

const COLLECTION = 'workflowTemplates';

/** The milestone list a NEW enrollment should use — the faculty's approved template, or the app default. */
export async function getActiveMilestonesFor(facultyId: string, processType: ProcessType): Promise<WorkflowMilestoneSpec[]> {
  const snap = await db.collection(COLLECTION)
    .where('facultyId', '==', facultyId)
    .where('processType', '==', processType)
    .where('status', '==', 'approved')
    .limit(1)
    .get();

  if (snap.empty) return DEFAULT_MILESTONES;
  const milestones = (snap.docs[0]!.data().milestones ?? []) as WorkflowMilestoneSpec[];
  if (milestones.length === 0) return DEFAULT_MILESTONES;
  return milestones.slice().sort((a, b) => a.order - b.order);
}

export async function listWorkflowTemplates(facultyId: string): Promise<WorkflowTemplateDoc[]> {
  // Sorted in memory rather than via .orderBy('createdAt') — combining that
  // with the facultyId equality filter needs a composite index Firestore
  // doesn't have here, which throws and turns into a 500 (same class of bug
  // fixed for feedback-history queries).
  const snap = await db.collection(COLLECTION)
    .where('facultyId', '==', facultyId)
    .get();
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as WorkflowTemplateDoc))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
}

export async function proposeWorkflowTemplate(params: {
  facultyId: string;
  processType: ProcessType;
  milestones: WorkflowMilestoneSpec[];
  createdBy: string;
  note?: string | null;
}): Promise<{ id: string }> {
  const existingSnap = await db.collection(COLLECTION)
    .where('facultyId', '==', params.facultyId)
    .where('processType', '==', params.processType)
    .get();
  const maxVersion = existingSnap.docs.reduce((max, d) => Math.max(max, d.data().version ?? 0), 0);

  const ref = db.collection(COLLECTION).doc();
  await ref.set({
    facultyId: params.facultyId,
    processType: params.processType,
    version: maxVersion + 1,
    status: 'pending_approval',
    milestones: params.milestones,
    createdBy: params.createdBy,
    createdAt: new Date().toISOString(),
    proposedNote: params.note ?? null,
  });
  return { id: ref.id };
}

/**
 * Marks the template approved and supersedes whatever was previously approved
 * for the same facultyId+processType — only one template is ever "active"
 * (consulted by getActiveMilestonesFor) at a time, but every prior version
 * stays in Firestore with status 'superseded' for audit/history.
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
    .where('status', '==', 'approved')
    .get();

  const batch = db.batch();
  prevApprovedSnap.docs.forEach((d) => batch.update(d.ref, { status: 'superseded' }));
  const approvedAt = new Date().toISOString();
  batch.update(ref, { status: 'approved', approvedBy, approvedAt });
  await batch.commit();

  return { id, ...data, status: 'approved', approvedBy, approvedAt } as WorkflowTemplateDoc;
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
