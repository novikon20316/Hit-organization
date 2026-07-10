// src/services/studentProgress.ts
//
// Shared "how far along is this project" logic for the grad_school_head and
// program_head dashboards (gradSchoolHeadController.ts / programHeadController.ts).
// Centralized here (rather than duplicated per-controller, which is this
// codebase's usual convention for small constants like MILESTONE_ORDER) because
// both controllers are new in the same change — copy-paste drift here would be
// immediate, not hypothetical.

export const MILESTONE_ORDER = ['research_proposal', 'progress_report', 'final_report', 'defense'];

// No confirmed college policy on what counts as "stuck" yet — provisional
// threshold, flag to the user before relying on it for real decisions.
export const STUCK_THRESHOLD_DAYS = 30;

export interface MilestoneDoc {
  id: string;
  type: string;
  status: string;
  dueDate?: FirebaseFirestore.Timestamp | null;
  createdAt?: FirebaseFirestore.Timestamp | null;
  submittedAt?: FirebaseFirestore.Timestamp | null;
  gradedAt?: FirebaseFirestore.Timestamp | null;
  coordinatorApprovedAt?: FirebaseFirestore.Timestamp | null;
  approvedAt?: FirebaseFirestore.Timestamp | null;
  examinerIds?: string[];
  examiner1Score?: number | null;
  examiner2Score?: number | null;
  nameHe?: string;
  nameEn?: string;
  [key: string]: unknown;
}

export interface MilestoneProgress {
  current: MilestoneDoc | null;
  daysInStage: number;
  isOverdue: boolean;
  isStuck: boolean;
}

const DONE_STATUSES = new Set(['coordinator_approved', 'completed']);

/**
 * `daysInStage`'s reference point is the most specific "entered this state"
 * timestamp available. `updatedAt` is NOT reliable — most milestone-mutating
 * controllers (submitMilestone, coordinatorApproveMilestone, gradeMilestone,
 * coordinatorRejectMilestone) never set it, only their own specific *_At field.
 */
function stageEnteredAt(milestone: MilestoneDoc): FirebaseFirestore.Timestamp | null {
  return (
    milestone.gradedAt ??
    milestone.submittedAt ??
    milestone.coordinatorApprovedAt ??
    milestone.approvedAt ??
    milestone.createdAt ??
    null
  );
}

export function computeMilestoneProgress(milestones: MilestoneDoc[]): MilestoneProgress {
  const ordered = milestones
    .slice()
    .sort((a, b) => MILESTONE_ORDER.indexOf(a.type) - MILESTONE_ORDER.indexOf(b.type));

  const current =
    ordered.find((m) => !DONE_STATUSES.has(m.status)) ?? ordered[ordered.length - 1] ?? null;

  if (!current) {
    return { current: null, daysInStage: 0, isOverdue: false, isStuck: false };
  }

  const now = Date.now();
  const enteredAt = stageEnteredAt(current);
  const daysInStage = enteredAt
    ? Math.floor((now - enteredAt.toDate().getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  const isOverdue =
    current.status === 'pending' &&
    !!current.dueDate?.toDate &&
    current.dueDate.toDate().getTime() < now;

  const isStuck = daysInStage > STUCK_THRESHOLD_DAYS && !DONE_STATUSES.has(current.status);

  return { current, daysInStage, isOverdue, isStuck };
}

/**
 * Server-side mirror of FACULTY_LABELS (mobile/components/i18n.ts) — the
 * server has no equivalent today, and ProcessSummary.facultyNameHe/En needs one.
 * Keep in sync with mobile/components/i18n.ts's FACULTY_LABELS.
 */
export const FACULTY_NAMES: Record<string, { he: string; en: string }> = {
  sciences: { he: 'הפקולטה למדעים', en: 'Faculty of Sciences' },
  electrical: { he: 'הפקולטה להנדסת חשמל ואלקטרוניקה', en: 'Faculty of Electrical and Electronics Engineering' },
  industrial: { he: 'הפקולטה להנדסת תעשייה וניהול טכנולוגיה', en: 'Faculty of Industrial Engineering and Technology Management' },
  learning_tech: { he: 'הפקולטה לטכנולוגיות למידה', en: 'Faculty of Instructional Technologies' },
  medical_tech: { he: 'הפקולטה לטכנולוגיות רפואיות', en: 'Faculty of Medical Technologies' },
  design: { he: 'הפקולטה לעיצוב', en: 'Faculty of Design' },
  data_science: { he: 'המחלקה למדעי הנתונים', en: 'Department of Data Science' },
};

export function facultyName(facultyId: string): { he: string; en: string } {
  return FACULTY_NAMES[facultyId] ?? { he: facultyId, en: facultyId };
}

/**
 * No urgency/priority field exists on examinerRecommendations or facultyTemplates
 * docs — synthesized from age since creation. Provisional heuristic, not a
 * confirmed business rule.
 */
export function urgencyFromAge(createdAt?: FirebaseFirestore.Timestamp | null): 'low' | 'medium' | 'high' {
  if (!createdAt) return 'low';
  const days = (Date.now() - createdAt.toDate().getTime()) / (1000 * 60 * 60 * 24);
  if (days > 14) return 'high';
  if (days > 5) return 'medium';
  return 'low';
}

/** project.projectType is 'thesis' | 'project' — anything else defaults to masters_project. */
export function trackTypeOf(projectType: string | undefined): 'thesis' | 'masters_project' {
  return projectType === 'thesis' ? 'thesis' : 'masters_project';
}
