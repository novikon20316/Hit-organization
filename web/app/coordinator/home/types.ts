// app/coordinator/home/types.ts
import type { FacultyId } from '@/lib/i18n';
import type { ChainStage } from '@/app/workflow-templates/types';

// ── Defense tab (mobile parity) ─────────────────────────────────────────────
// See server/src/services/defenseScheduling.ts for how these get written.

export interface DefensePanelMember {
  type: 'internal' | 'external';
  ref: string; // uid for internal, examinerTokens doc id for external
  displayName: string;
  email?: string;
}

// A defense milestone embedded inside a Project's `milestones` array (as
// returned by getCoordinatorDashboard's `projects` and getActiveProjects).
// `dueDate` carries the confirmed defense date once matched — it can arrive
// as an ISO string, a client Timestamp, or an Admin-SDK `{_seconds}` object;
// see parseServerDate in DefenseTab.tsx.
export interface AssignedMilestone {
  id: string;
  type: string;
  status:
    | 'pending'
    | 'awaiting_defense_date'
    | 'date_conflict'
    | 'defense_date_set'
    | 'scheduled'
    | 'completed'
    | string;
  studentNames: string[];
  dueDate?: string | { toDate?: () => Date; _seconds?: number } | null;
  defenseDate?: string | null;
  defenseRoom?: string | null;
  defenseTime?: string | null;
  defensePanel?: DefensePanelMember[];
  examinerGrading?: Record<string, { gradedAt?: string | null }>;
}

export interface Project {
  id: string;
  titleHe: string;
  titleEn: string;
  facultyId: FacultyId;
  supervisorId?: string;
  enrolledStudentIds?: string[];
  examinerIds?: string[];
  milestones?: AssignedMilestone[];
}

// ── In Progress tab ──────────────────────────────────────────────────────────
export interface InProgressStudentMilestone {
  type: string;
  status: string;
  supervisorScore: number | null;
}

export interface InProgressStudent {
  id: string;
  name: string;
  progress: number;
  milestones: InProgressStudentMilestone[];
}

export interface InProgressProject {
  id: string;
  projectTitleHe: string;
  projectTitleEn: string;
  facultyId: FacultyId;
  supervisorName: string;
  status: string;
  students: InProgressStudent[];
}

// ── Deadlines tab ────────────────────────────────────────────────────────────
// Shape is a raw milestone doc spread onto `{ id, deadline }` server-side
// (see staffController.ts getDeadLines) — every field but `id` is optional.
export interface CoordinatorDeadline {
  id: string;
  milestoneId?: string;
  studentId?: string;
  studentName?: string;
  degreeType?: string;
  yearOfStudy?: string;
  projectTitle?: string;
  milestoneName?: string;
  daysLeft?: number | null;
  class?: string;
}

export interface MilestoneRevision {
  version: number;
  fileUrls: string[];
  submissionNote: string;
  submittedAt: string | null;
  status: string;
  decision: 'approved' | 'rejected' | null;
  decisionReason: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
}

export interface CoordinatorPendingMilestone {
  id: string;
  projectId: string;
  projectTitleHe: string;
  projectTitleEn: string;
  type: string;
  status: string;
  /** Chain-driven routing (see services/milestoneRouting.ts) — null for
   *  legacy, non-chain-driven milestones. Used to tell "genuinely awaiting a
   *  coordinator approve decision right now" apart from a chain-driven
   *  milestone that just happens to share this array's coarse status filter
   *  while its current stage belongs to a different role/action. */
  routing?: ChainStage[] | null;
  currentStageIndex?: number;
  studentNames: string[];
  studentIds: string[];
  supervisorId: string;
  supervisorName?: string;
  supervisorScore: number | null;
  supervisorComment?: string | null;
  submissionNote?: string | null;
  fileUrls?: string[];
  revisionHistory?: MilestoneRevision[];
  facultyId: FacultyId;
  // ── Defense-tab "setup" bucket extras (final_report already graded /
  // coordinator_approved) — mostly empty until examiners get assigned, see
  // DefenseTab.tsx's defenseSetups bucket.
  examinerIds?: string[];
  defenseDate?: string | null;
  defenseRoom?: string | null;
  milestoneGrades?: Array<{ type: string; score: number | null }>;
  /** How many examiner slots this milestone's defense panel needs — see
   *  server/src/services/workflowTemplates.ts's examinerCount. Omitted
   *  means the legacy default of 2. */
  examinerCount?: number;
}

export interface ExaminerUser {
  id: string;
  displayName: string;
  email: string;
  facultyId: FacultyId;
}

export interface RecommendedExaminer {
  priority: number;
  type: 'internal' | 'external';
  name: string;
  email?: string;
  institution?: string;
  expertise?: string;
  internalUserId?: string;
}

export interface ExaminerRecommendation {
  id: string;
  projectId: string;
  projectTitleHe: string;
  projectTitleEn: string;
  supervisorName: string;
  recommendedExaminers: RecommendedExaminer[];
}

// Ported from the local MILESTONE_LABEL const in mobile/app/coordinator/home.tsx
export const MILESTONE_LABEL: Record<string, { he: string; en: string }> = {
  research_proposal: { he: 'הצעת מחקר', en: 'Research Proposal' },
  progress_report: { he: 'דו"ח התקדמות', en: 'Progress Report' },
  final_report: { he: 'דו"ח מסכם', en: 'Final Report' },
  defense: { he: 'הגנה', en: 'Defense' },
  poster: { he: 'פוסטר', en: 'Poster Session' },
};
