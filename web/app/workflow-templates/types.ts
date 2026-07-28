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

// Mirrors ChainRole/RejectionTarget/ChainStage/MilestoneRoutingSpec in
// server/src/services/workflowTemplates.ts.
export type ChainRole = 'supervisor' | 'coordinator' | 'faculty_admin' | 'administrative_secretary' | 'grad_school_head' | 'program_head';
export type RejectionTarget = 'student' | string;

export interface ChainStage {
  id: string;
  role: ChainRole;
  action: 'grade' | 'approve';
  rejectTo: RejectionTarget;
}

export type MilestoneRoutingSpec = ChainStage[];

export const CHAIN_ROLES: { key: ChainRole; he: string; en: string }[] = [
  { key: 'supervisor', he: 'מנחה', en: 'Supervisor' },
  { key: 'coordinator', he: 'רכז', en: 'Coordinator' },
  { key: 'faculty_admin', he: 'מנהל פקולטה', en: 'Faculty Admin' },
  { key: 'administrative_secretary', he: 'מזכירה אקדמית', en: 'Administrative Secretary' },
  { key: 'grad_school_head', he: 'ראש בית ספר ללימודי מוסמכים', en: 'Grad School Head' },
  { key: 'program_head', he: 'ראש תוכנית', en: 'Program Head' },
];

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
  dueDaysFromStart: number;
  requiresExaminers: boolean;
  /** Optional — see GradingComponentSpec's comment server-side: schema and
   *  editor exist now, the grading UI itself doesn't read this yet. */
  gradingComponents?: GradingComponentSpec[];
  /** Per-milestone override of the template's defaultRouting. Omitted means
   *  this milestone inherits defaultRouting (or DEFAULT_ROUTING). */
  routing?: MilestoneRoutingSpec;
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
  return { type: `custom_${makeId()}`, nameHe: '', nameEn: '', order, dueDaysFromStart: 90, requiresExaminers: false };
}
