// app/examinor/home/types.ts

export interface GradeWeights {
  supervisorWeight: number;
  examiner1Weight: number;
  examiner2Weight: number;
}

// Shape used once a defense milestone carries examinerScores (identity-keyed,
// post-generalization) instead of the legacy examiner1Score/examiner2Score
// pair — a single shared per-examiner weight, since the two slots were always
// configured equal in practice.
export interface IdentityGradeWeights {
  supervisorWeight: number;
  examinerWeight: number;
}

export interface DefensePanelMember {
  type: 'internal' | 'external';
  ref: string;
  displayName: string;
  email?: string;
}

export interface DefenseDateMatching {
  windowStart: unknown;
  windowEnd: unknown;
  currentRound: number;
  finalDate: unknown | null;
}

export interface MilestoneHistoryEntry {
  type: string;
  supervisorScore: number | null;
  supervisorComment: string;
  fileUrls: string[];
  status: string;
}

export interface AssignedMilestone {
  id: string;
  projectId: string;
  projectTitleHe: string;
  projectTitleEn: string;
  type: string;
  status: string;
  studentNames: string[];
  studentIds: string[];
  supervisorId: string;
  supervisorScore: number | null;
  supervisorName: string;
  facultyId: string;
  examinerIds: string[];
  // Identity-keyed defense milestones (post-generalization) carry this
  // instead of the legacy positional pair below.
  examinerScores?: Record<string, { score: number; comments: string }> | null;
  examiner1Score: number | null;
  examiner2Score: number | null;
  gradeWeights: GradeWeights | IdentityGradeWeights | null;
  defenseDate: string | null;
  defenseRoom: string | null;
  defenseBuilding?: string | null;
  defenseTime?: string | null;
  defensePanel?: DefensePanelMember[];
  dateMatching?: DefenseDateMatching;
  milestoneHistory: MilestoneHistoryEntry[];
}

export const MILESTONE_LABEL: Record<string, { he: string; en: string }> = {
  research_proposal: { he: 'הצעת מחקר', en: 'Research Proposal' },
  progress_report: { he: 'דו"ח התקדמות', en: 'Progress Report' },
  final_report: { he: 'דו"ח מסכם', en: 'Final Report' },
  defense: { he: 'הגנה', en: 'Defense' },
};

// Ported from the local GRADING_CRITERIA const in mobile/app/examinor/home.tsx —
// deliberately different keys/weights from the supervisor's rubric (see
// app/supervisor/dashboard/types.ts's GRADING_CRITERIA) since examiners
// grade the defense itself, not the written milestone.
export const EXAMINER_GRADING_CRITERIA = [
  { key: 'understanding', he: 'הבנת הנושא', en: 'Subject Understanding', max: 25 },
  { key: 'methodology', he: 'מתודולוגיה', en: 'Methodology', max: 25 },
  { key: 'presentation', he: 'מצגת והצגה', en: 'Presentation', max: 25 },
  { key: 'answers', he: 'תשובות לשאלות', en: 'Answers to Questions', max: 25 },
] as const;

export type ExaminerCriterionKey = (typeof EXAMINER_GRADING_CRITERIA)[number]['key'];
