// app/student/home/types.ts

export type StudentState = 'loading' | 'ineligible' | 'no_project' | 'pending' | 'active';
export type DegreeType = 'bachelors' | 'masters';
export type ProjectType = 'project' | 'thesis';
export type MilestoneType = 'research_proposal' | 'progress_report' | 'final_report' | 'defense' | 'poster';

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
  /** Weighted across every milestone by the project's workflow template's
   *  own percentOfFinalGrade per milestone type — see
   *  server/src/services/gradeEngine.ts's computeProjectFinalGrade. null
   *  until every nonzero-weighted milestone is graded. */
  overallFinalGrade?: number | null;
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

/** The data_science three-rubric defense workflow's supervisor-side rubric
 *  (see server/src/services/workflowTemplates.ts's finalGradeComponents,
 *  server/src/controllers/projectController.ts's submitSupervisorEvaluation)
 *  — one of the "supervisor forms" the manager's requirement says the
 *  student should be able to see. Absent for any milestone/faculty that
 *  hasn't configured finalGradeComponents. */
export interface StudentVisibleSupervisorEvaluation {
  scores: Record<string, { score: number; maxScore: number; weight: number }>;
  total: number;
  comment?: string;
}

/** The proposal/midterm staff record the supervisor files alongside the
 *  student's own submission (staffRecordMode: 'upload_or_form' — see
 *  server/src/controllers/supervisorController.ts's submitStaffRecord).
 *  `formData` keys match the template's staffFormFields (see
 *  workflow-templates/types.ts's FormFieldSpec) so labels can be resolved. */
export interface StudentVisibleStaffRecord {
  mode: 'upload' | 'form';
  fileUrls?: string[];
  formData?: Record<string, unknown>;
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
  coordinatorComment?: string | null;
  revisionHistory?: MilestoneRevision[];
  /** Three-rubric defense workflow — the supervisor's own evaluation
   *  (distinct from examinerEvaluations, which the student never receives —
   *  see server/src/services/milestoneVisibility.ts). */
  supervisorEvaluation?: StudentVisibleSupervisorEvaluation | null;
  /** The template's own rubric definition, needed to label each score in
   *  supervisorEvaluation.scores (component labels/maxScores/weights). */
  finalGradeComponents?: {
    supervisorEvaluation: { components: { key: string; labelHe: string; labelEn: string; maxScore: number; weight: number }[] };
  } | null;
  autoCalculatedFinalGrade?: number | null;
  /** The server sends the full object, but the student UI only ever reads
   *  `.status` — the supervisor's override reason isn't meant for display
   *  here, just whether a decision is still pending. */
  gradeOverride?: { status: 'pending' | 'approved' | 'rejected' } | null;
  staffRecord?: StudentVisibleStaffRecord | null;
  staffFormFields?: { key: string; labelHe: string; labelEn: string }[];
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
//
// Record<string, ...> rather than Record<MilestoneType, ...> — faculty
// admins can add custom milestones via the Workflow Template Manager, which
// land here with a type like `custom_xxxxx` (see server/src/services/
// projectEnrollment.ts), a value MilestoneType's 4-literal union doesn't
// actually cover despite the `type: MilestoneType` field declaration below.
// Callers must use ?.[lang] with a fallback (see ActiveDashboard.tsx).
export const MILESTONE_LABEL: Record<string, { he: string; en: string }> = {
  research_proposal: { he: 'הצעת מחקר', en: 'Research Proposal' },
  progress_report: { he: 'דו"ח התקדמות', en: 'Progress Report' },
  final_report: { he: 'דו"ח מסכם', en: 'Final Report' },
  defense: { he: 'הגנה', en: 'Defense' },
  poster: { he: 'פוסטר', en: 'Poster Session' },
};

export const MILESTONE_ORDER: MilestoneType[] = ['research_proposal', 'progress_report', 'final_report', 'defense', 'poster'];

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
