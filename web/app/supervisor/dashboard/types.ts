// app/supervisor/dashboard/types.ts
import type { FacultyId } from '@/lib/i18n';

export interface MyProject {
  id: string;
  titleHe: string;
  titleEn: string;
  descriptionHe: string;
  descriptionEn: string;
  facultyId: FacultyId;
  status: string;
  /** Primary/first value — prefer degreeTypes/projectTypes (the full
   *  multi-select set) for anything eligibility- or filter-related. */
  degreeType: string;
  projectType: string;
  degreeTypes?: string[];
  projectTypes?: string[];
  academicYear: string;
  enrolledStudentIds: string[];
  applicationIds: string[];
  NumberOfStudents: number;
}

export interface Application {
  id: string;
  projectId: string;
  projectTitleHe: string;
  projectTitleEn: string;
  studentId: string;
  studentName: string;
  studentEmail: string;
  transcriptUrl: string;
  cvUrl: string;
  coverNote: string;
  status: string;
  submittedAt: string | { seconds: number } | null;
  degreeType: string;
  /** Set instead of a real rejection when this application was auto-closed
   *  because the student got accepted into a different project — see
   *  server/src/services/projectEnrollment.ts's closeOtherPendingApplications.
   *  supervisorNote stays untouched (null) for these, since no supervisor
   *  actually reviewed/rejected it. */
  autoClosedReason?: 'accepted_elsewhere';
  aiScreening?: {
    verdict: 'strong_fit' | 'partial_fit' | 'weak_fit' | 'unable_to_assess';
    reasoning: string;
    generatedAt: string;
  };
  /** A separate AI pass — independent pass/fail checks (today: grades vs.
   *  prerequisites off the transcript) rolled into one recommendation. See
   *  server/src/services/applicationReviewService.ts. */
  aiReview?: {
    checks: Array<{
      id: string;
      labelHe: string;
      labelEn: string;
      passed: boolean | null;
      reasoning: string;
    }>;
    recommendation: 'approve' | 'meeting' | 'reject';
    generatedAt: string;
  };
}

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

// Shape returned by GET /api/supervisor/dashboard's pendingGrades.
export interface SupervisorPendingMilestone {
  id: string;
  projectId: string;
  projectTitleHe: string;
  projectTitleEn: string;
  type: string;
  status: string;
  studentNames: string[];
  // Parallel to studentNames (same index = same student) — needed to submit
  // the per-student "individual grade" component on group projects (see
  // GradeMilestoneModal.tsx's individual-score fields).
  studentIds: string[];
  fileUrls: string[];
  submissionNote: string;
  facultyId: FacultyId;
  dueDate: string | null;
  submittedAt: string | null;
  // Per-milestone configured grading rubric (see workflowTemplates.ts) —
  // empty means GradeMilestoneModal falls back to the hardcoded
  // GRADING_CRITERIA below.
  gradingComponents?: GradingComponentSpec[];
}

export const MILESTONE_LABEL: Record<string, { he: string; en: string }> = {
  research_proposal: { he: 'הצעת מחקר', en: 'Research Proposal' },
  progress_report: { he: 'דו"ח התקדמות', en: 'Progress Report' },
  final_report: { he: 'דו"ח מסכם', en: 'Final Report' },
  defense: { he: 'הגנה', en: 'Defense' },
  poster: { he: 'פוסטר', en: 'Poster Session' },
};

// Same raw-milestone-doc shape as coordinator's CoordinatorDeadline (see
// staffController.ts getDeadLines) — duplicated rather than shared since
// this codebase colocates types per route folder (see coordinator/home/types.ts).
export interface SupervisorDeadline {
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

export const GRADING_CRITERIA = [
  { key: 'clarity', max: 20, he: 'בהירות המחקר (0–20)', en: 'Research Clarity (0–20)' },
  { key: 'methodology', max: 25, he: 'מתודולוגיה (0–25)', en: 'Methodology (0–25)' },
  { key: 'feasibility', max: 20, he: 'ישימות (0–20)', en: 'Feasibility (0–20)' },
  { key: 'innovation', max: 15, he: 'חדשנות (0–15)', en: 'Innovation (0–15)' },
  { key: 'writing', max: 20, he: 'כתיבה (0–20)', en: 'Writing Quality (0–20)' },
] as const;

export type GradingCriterionKey = (typeof GRADING_CRITERIA)[number]['key'];
