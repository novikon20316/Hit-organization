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
}

export interface MilestoneSpec {
  type: string;
  nameHe: string;
  nameEn: string;
  order: number;
  dueDaysFromStart: number;
  requiresExaminers: boolean;
  /** Optional — see GradingComponentSpec's comment server-side: schema and
   *  editor exist now, the grading UI itself doesn't read this yet. */
  gradingComponents?: GradingComponentSpec[];
}

export interface WorkflowTemplateDoc {
  id: string;
  facultyId: string;
  processType: ProcessType;
  version: number;
  status: TemplateStatus;
  milestones: MilestoneSpec[];
  createdBy: string;
  createdAt: string;
  proposedNote: string | null;
  approvedBy?: string;
  approvedAt?: string;
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
export const GRAD_SCHOOL_APPROVER_ROLES = ['grad_school_head', 'administrative_secretary', 'system_admin'];
export const FACULTY_APPROVER_ROLES = ['faculty_admin', 'coordinator', 'administrative_secretary', 'system_admin'];

export function isMastersProcess(pt: ProcessType): boolean {
  return pt === 'msc_thesis' || pt === 'msc_project';
}

export function canApproveRole(pt: ProcessType, role: string | null | undefined): boolean {
  if (!role) return false;
  return isMastersProcess(pt) ? GRAD_SCHOOL_APPROVER_ROLES.includes(role) : FACULTY_APPROVER_ROLES.includes(role);
}

export function processTypeLabel(pt: ProcessType, lang: 'he' | 'en'): string {
  return PROCESS_TYPES.find((p) => p.key === pt)?.[lang] ?? pt;
}

export function makeId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function emptyMilestone(order: number): MilestoneSpec {
  return { type: `custom_${makeId()}`, nameHe: '', nameEn: '', order, dueDaysFromStart: 90, requiresExaminers: false };
}
