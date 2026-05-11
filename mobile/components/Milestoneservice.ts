// services/milestoneService.ts

import {
  collection, Timestamp, writeBatch, doc,
} from 'firebase/firestore';
import { db } from '../src/firebase/firebase';

export type MilestoneType =
  | 'research_proposal'
  | 'progress_report'
  | 'final_report'
  | 'defense';

export type MilestoneStatus =
  | 'pending'
  | 'submitted'
  | 'supervisor_graded'
  | 'coordinator_approved'
  | 'examiners_assigned'    // coordinator picked 2 examiners (after final_report)
  | 'examiner_graded'       // at least one examiner graded
  | 'both_examiners_graded' // both examiners submitted grades
  | 'completed';

export interface GradeWeights {
  supervisorWeight: number;   // e.g. 0.30
  examiner1Weight:  number;   // e.g. 0.35
  examiner2Weight:  number;   // e.g. 0.35
}

export interface MilestoneTemplate {
  type:                        MilestoneType;
  nameHe:                      string;
  nameEn:                      string;
  descriptionHe:               string;
  descriptionEn:               string;
  defaultDaysFromApproval:     number;
  requiresCoordinatorApproval: boolean;
  requiresExaminers:           boolean;
  approvalChainHe:             string[];
  approvalChainEn:             string[];
}

export const MILESTONE_TEMPLATES: MilestoneTemplate[] = [
  {
    type:                        'research_proposal',
    nameHe:                      'הצעת מחקר',
    nameEn:                      'Research Proposal',
    descriptionHe:               'הגשת הצעת מחקר מפורטת. עוברת לאישור המנחה ואחר כך לאישור רכז הפרויקטים.',
    descriptionEn:               'Submit a detailed research proposal. Goes to supervisor, then coordinator.',
    defaultDaysFromApproval:     30,
    requiresCoordinatorApproval: true,
    requiresExaminers:           false,
    approvalChainHe:             ['הגשת הסטודנט', 'ציון מנחה', 'אישור רכז'],
    approvalChainEn:             ['Student Submission', 'Supervisor Grade', 'Coordinator Approval'],
  },
  {
    type:                        'progress_report',
    nameHe:                      'דו"ח התקדמות',
    nameEn:                      'Progress Report',
    descriptionHe:               'דו"ח התקדמות בתום סמסטר א׳. עובר לאישור המנחה ולאחר מכן לאישור רכז.',
    descriptionEn:               'Progress report at end of semester 1. Supervisor then coordinator.',
    defaultDaysFromApproval:     120,
    requiresCoordinatorApproval: true,
    requiresExaminers:           false,
    approvalChainHe:             ['הגשת הסטודנט', 'ציון מנחה', 'אישור רכז'],
    approvalChainEn:             ['Student Submission', 'Supervisor Grade', 'Coordinator Approval'],
  },
  {
    type:                        'final_report',
    nameHe:                      'דו"ח מסכם',
    nameEn:                      'Final Report',
    descriptionHe:               'דו"ח מסכם. לאחר אישור הרכז, הרכז מקצה שני בוחנים וקובע משקלות ציון.',
    descriptionEn:               'Final report. After coordinator approval, coordinator assigns 2 examiners and sets grade weights.',
    defaultDaysFromApproval:     210,
    requiresCoordinatorApproval: true,
    requiresExaminers:           true,
    approvalChainHe:             ['הגשת הסטודנט', 'ציון מנחה', 'אישור רכז', 'הקצאת בוחנים + משקלות'],
    approvalChainEn:             ['Student Submission', 'Supervisor Grade', 'Coordinator Approval', 'Assign Examiners + Weights'],
  },
  {
    type:                        'defense',
    nameHe:                      'בחינת הגנה',
    nameEn:                      'Defense Exam',
    descriptionHe:               'הגנה עם שני בוחנים. כל בוחן ממלא טופס ציונים מפורט. האפליקציה מחשבת ציון סופי משוקלל.',
    descriptionEn:               'Defense with two examiners. Each fills a detailed gradesheet. App calculates weighted final grade.',
    defaultDaysFromApproval:     240,
    requiresCoordinatorApproval: false,
    requiresExaminers:           true,
    approvalChainHe:             ['תיאום מועד (רכז)', 'הגנה עם שני בוחנים', 'טופס ציונים (כל בוחן)', 'חישוב ציון סופי'],
    approvalChainEn:             ['Date Coordination (Coordinator)', 'Defense with Two Examiners', 'Grading Form (each examiner)', 'Final Grade Calculation'],
  },
];

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export async function createMilestonesOnApproval(params: {
  projectId:    string;
  studentIds:   string[];
  facultyId:    string;
  supervisorId: string;
  approvalDate?: Date;
}): Promise<void> {
  const approvalDate = params.approvalDate ?? new Date();
  const batch = writeBatch(db);

  for (const template of MILESTONE_TEMPLATES) {
    const dueDate = addDays(approvalDate, template.defaultDaysFromApproval);
    const ref = doc(collection(db, 'milestones'));

    batch.set(ref, {
      projectId:    params.projectId,
      studentIds:   params.studentIds,
      facultyId:    params.facultyId,
      supervisorId: params.supervisorId,

      type:          template.type,
      nameHe:        template.nameHe,
      nameEn:        template.nameEn,
      descriptionHe: template.descriptionHe,
      descriptionEn: template.descriptionEn,

      status: 'pending' as MilestoneStatus,

      dueDate:      Timestamp.fromDate(dueDate),
      approvalDate: Timestamp.fromDate(approvalDate),
      submittedAt:  null,

      requiresCoordinatorApproval: template.requiresCoordinatorApproval,
      requiresExaminers:           template.requiresExaminers,
      approvalChainHe:             template.approvalChainHe,
      approvalChainEn:             template.approvalChainEn,

      // Supervisor grading
      supervisorGradeId:     null,
      supervisorScore:       null,

      // Coordinator
      coordinatorApprovedAt: null,
      coordinatorId:         null,

      // Examiners (set by coordinator on final_report approval)
      examinerIds:           [],
      examiner1Score:        null,
      examiner2Score:        null,
      examiner1GradeId:      null,
      examiner2GradeId:      null,
      examiner1SubmittedAt:  null,
      examiner2SubmittedAt:  null,

      // Grade weights (set by coordinator)
      gradeWeights: null as GradeWeights | null,

      // Defense specific
      defenseDate:  null,
      defenseRoom:  null,

      // Final
      finalGrade:   null,

      fileUrls:       [],
      submissionNote: '',

      reminder7dSent: false,
      reminder1dSent: false,

      createdAt: new Date(),
    });
  }

  await batch.commit();
}

// ── Weighted grade calculator ─────────────────────────────────────────────────
export function calculateFinalGrade(params: {
  supervisorScore: number;
  examiner1Score:  number;
  examiner2Score:  number;
  weights:         GradeWeights;
}): number {
  const { supervisorScore, examiner1Score, examiner2Score, weights } = params;
  const total =
    supervisorScore  * weights.supervisorWeight +
    examiner1Score   * weights.examiner1Weight  +
    examiner2Score   * weights.examiner2Weight;
  return Math.round(total * 10) / 10; // one decimal place
}

export const MILESTONE_TRANSITIONS: Record<MilestoneStatus, MilestoneStatus[]> = {
  pending:              ['submitted'],
  submitted:            ['supervisor_graded'],
  supervisor_graded:    ['coordinator_approved'],
  coordinator_approved: ['examiners_assigned', 'completed'],
  examiners_assigned:   ['examiner_graded'],
  examiner_graded:      ['both_examiners_graded'],
  both_examiners_graded:['completed'],
  completed:            [],
};

export function canTransition(from: MilestoneStatus, to: MilestoneStatus): boolean {
  return MILESTONE_TRANSITIONS[from]?.includes(to) ?? false;
}

export function daysUntil(dueDate: Timestamp): number {
  const diff = dueDate.toMillis() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export function urgencyLevel(days: number): 'overdue' | 'critical' | 'warning' | 'ok' {
  if (days < 0)   return 'overdue';
  if (days <= 3)  return 'critical';
  if (days <= 14) return 'warning';
  return 'ok';
}

export const URGENCY_COLORS = {
  overdue:  { text: '#EF4444', bg: '#FEF2F2', border: '#FECACA' },
  critical: { text: '#F97316', bg: '#FFF7ED', border: '#FED7AA' },
  warning:  { text: '#F59E0B', bg: '#FFFBEB', border: '#FDE68A' },
  ok:       { text: '#10B981', bg: '#ECFDF5', border: '#A7F3D0' },
};