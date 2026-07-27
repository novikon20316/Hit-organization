// app/student/home/types.ts

export type StudentState = 'loading' | 'ineligible' | 'no_project' | 'pending' | 'active';
export type DegreeType = 'bachelors' | 'masters';
export type ProjectType = 'project' | 'thesis';
export type MilestoneType = 'research_proposal' | 'progress_report' | 'final_report' | 'defense';

export type MilestoneStatus =
  | 'pending'
  | 'submitted'
  | 'rejected'
  | 'supervisor_graded'
  | 'graded'
  | 'coordinator_approved'
  | 'examiners_assigned'
  | 'examiner_graded'
  | 'both_examiners_graded'
  | 'awaiting_defense_date'
  | 'date_conflict'
  | 'defense_date_set'
  | 'scheduled'
  | 'completed';

export interface ProjectProposal {
  id: string;
  titleHe: string;
  titleEn: string;
  descriptionHe: string;
  descriptionEn: string;
  supervisorId: string;
  supervisorName: string;
  facultyId: string;
  /** Primary/first value — kept for legacy display code. Prefer
   *  degreeTypes/projectTypes (the full multi-select set) for anything
   *  eligibility- or filter-related; `?? [degreeType]`/`?? [projectType]`
   *  covers pre-migration projects that only have the scalar field. */
  degreeType: DegreeType;
  projectType: ProjectType;
  /** Full multi-select set — a project can be open to more than one degree
   *  type and/or project type at once (see adminController.ts's
   *  createAdminProject). Absent on pre-migration projects. */
  degreeTypes?: DegreeType[];
  projectTypes?: ProjectType[];
  NumberOfStudents: number;
  requiredSkills: string[];
  prerequisites?: string[];
  status: string;
  academicYear: string;
  projectFileUrl: string | null;
  /** Optional single major within facultyId — set when the project's
   *  supervisor is restricted via assignedMajors (see
   *  server/src/controllers/supervisorController.ts's createSupervisorProject).
   *  Missing/empty means open to every major in the faculty. */
  major?: string;
}

export interface ActiveProject {
  id: string;
  titleHe: string;
  titleEn: string;
  descriptionHe: string;
  descriptionEn: string;
  supervisorId: string;
  supervisorName: string;
  academicYear: string;
  semesterStart: string | null;
  status: string;
  degreeType?: string;
  projectType?: string;
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

export interface Milestone {
  id: string;
  type: MilestoneType;
  status: MilestoneStatus;
  dueDate: string | null;
  submittedAt: string | null;
  fileUrls: string[];
  finalGrade: number | null;
  supervisorScore?: number | null;
  defenseDate: string | null;
  defenseRoom: string | null;
  defenseBuilding?: string | null;
  defenseTime?: string | null;
  examinerNames: string[];
  examinerIds: string[];
  rejectionReason?: string | null;
  revisionHistory?: MilestoneRevision[];
}

export interface PendingApplication {
  id: string;
  projectId: string;
  projectTitleHe: string;
  projectTitleEn: string;
  submittedAt: string;
  status: 'pending' | 'meeting_requested';
}

// Ported from the local MILESTONE_LABEL const duplicated in mobile's
// coordinator/home.tsx AND (tabs)/Activedashboard.tsx — same values both
// places, kept here as the one copy the web side needs.
export const MILESTONE_LABEL: Record<MilestoneType, { he: string; en: string }> = {
  research_proposal: { he: 'הצעת מחקר', en: 'Research Proposal' },
  progress_report: { he: 'דו"ח התקדמות', en: 'Progress Report' },
  final_report: { he: 'דו"ח מסכם', en: 'Final Report' },
  defense: { he: 'הגנה', en: 'Defense' },
};

export const MILESTONE_ORDER: MilestoneType[] = ['research_proposal', 'progress_report', 'final_report', 'defense'];

// Ported from Activedashboard.tsx's STATUS_CONFIG, hex values swapped for
// this site's own muted palette rather than mobile's saturated colors —
// same idea as lib/facultyColors.ts.
export const STATUS_CONFIG: Record<MilestoneStatus, { color: string; bg: string; icon: string }> = {
  pending: { color: '#6B7280', bg: '#F1F0EC', icon: '🕐' },
  submitted: { color: '#B8862E', bg: '#FBF3E3', icon: '📤' },
  rejected: { color: '#A8433A', bg: 'var(--danger-bg)', icon: '❌' },
  supervisor_graded: { color: '#3E6C8C', bg: '#E9F0F5', icon: '👨‍🏫' },
  graded: { color: '#3E6C8C', bg: '#E9F0F5', icon: '👨‍🏫' },
  coordinator_approved: { color: '#6E5A99', bg: '#EFEBF6', icon: '✅' },
  examiners_assigned: { color: '#736B8C', bg: '#EDEBF2', icon: '👥' },
  examiner_graded: { color: '#3F6B4C', bg: 'var(--success-bg)', icon: '🎓' },
  both_examiners_graded: { color: '#3F6B4C', bg: 'var(--success-bg)', icon: '🎓' },
  awaiting_defense_date: { color: '#B8862E', bg: '#FBF3E3', icon: '📅' },
  date_conflict: { color: '#A8433A', bg: 'var(--danger-bg)', icon: '⚠️' },
  defense_date_set: { color: '#736B8C', bg: '#EDEBF2', icon: '📌' },
  scheduled: { color: '#3F6B4C', bg: 'var(--success-bg)', icon: '🎓' },
  completed: { color: '#3F6B4C', bg: 'var(--success-bg)', icon: '🏁' },
};

export const STATUS_LABEL: Record<MilestoneStatus, { he: string; en: string }> = {
  pending: { he: 'ממתין', en: 'Pending' },
  submitted: { he: 'הוגש', en: 'Submitted' },
  rejected: { he: 'הוחזר לתיקון', en: 'Returned for revision' },
  supervisor_graded: { he: 'נוקד ע"י מנחה', en: 'Supervisor Graded' },
  graded: { he: 'נוקד ע"י מנחה', en: 'Supervisor Graded' },
  examiners_assigned: { he: 'נבחרו בוחנים', en: 'Examiners Assigned' },
  examiner_graded: { he: 'נוקד ע"י בוחן', en: 'Examiner Graded' },
  both_examiners_graded: { he: 'שני בוחנים ניקדו', en: 'Both Examiners Graded' },
  awaiting_defense_date: { he: 'ממתין לתאריך הגנה', en: 'Awaiting Defense Date' },
  date_conflict: { he: 'לא נמצא תאריך משותף', en: 'No Common Date' },
  defense_date_set: { he: 'תאריך הגנה נקבע', en: 'Defense Date Set' },
  scheduled: { he: 'הגנה נקבעה', en: 'Defense Scheduled' },
  coordinator_approved: { he: 'אושר ע"י רכז', en: 'Coordinator Approved' },
  completed: { he: 'הושלם', en: 'Completed' },
};

export function toDate(val: unknown): Date | null {
  if (!val) return null;
  if (typeof val === 'object' && val !== null && 'toDate' in val && typeof (val as { toDate: unknown }).toDate === 'function') {
    return (val as { toDate: () => Date }).toDate();
  }
  const d = new Date(val as string | number);
  return isNaN(d.getTime()) ? null : d;
}

export function daysUntil(val: unknown): number | null {
  const date = toDate(val);
  if (!date) return null;
  return Math.ceil((date.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

export function gradeColor(grade: number): string {
  if (grade >= 90) return '#3F6B4C';
  if (grade >= 80) return '#5C8A63';
  if (grade >= 70) return '#B8862E';
  if (grade >= 60) return '#C77B3E';
  return '#A8433A';
}
