// services/milestoneService.ts
//
// Called once when a supervisor approves a student application.
// Creates all 4 milestones in Firestore with default deadlines
// calculated from the approval date.
// Coordinator can adjust dates later via the coordinator screen.

import {
  collection, addDoc, serverTimestamp, Timestamp,
  writeBatch, doc,
} from 'firebase/firestore';
import { db } from '../src/firebase/firebase';

// ─── Types ────────────────────────────────────────────────────────────────────
export type MilestoneType =
  | 'research_proposal'
  | 'progress_report'
  | 'final_report'
  | 'defense';

export type MilestoneStatus =
  | 'pending'          // not yet submitted
  | 'submitted'        // student uploaded, awaiting supervisor grade
  | 'supervisor_graded'    // supervisor filled form, awaiting coordinator
  | 'coordinator_approved' // coordinator approved
  | 'examiner_graded'      // both examiners graded (defense only)
  | 'completed';           // final grade locked

export interface MilestoneTemplate {
  type:                  MilestoneType;
  nameHe:                string;
  nameEn:                string;
  descriptionHe:         string;
  descriptionEn:         string;
  defaultDaysFromApproval: number; // default deadline offset
  requiresCoordinatorApproval: boolean;
  requiresExaminers:     boolean;  // true for defense only
  approvalChainHe:       string[];
  approvalChainEn:       string[];
}

// ─── Default milestone templates (from the Hebrew spec) ───────────────────────
//
// Research Proposal:  ~30 days  (roughly 1 month after semester start / approval)
// Progress Report:    ~120 days (end of semester 1, ~4 months)
// Final Report:       ~210 days (~7 months)
// Defense:            ~240 days (~8 months, scheduled by coordinator)
//
export const MILESTONE_TEMPLATES: MilestoneTemplate[] = [
  {
    type:                    'research_proposal',
    nameHe:                  'הצעת מחקר',
    nameEn:                  'Research Proposal',
    descriptionHe:           'הגשת הצעת מחקר מפורטת. עוברת לאישור המנחה (טופס ציונים מפורט) ואחר כך לאישור רכז הפרויקטים.',
    descriptionEn:           'Submit a detailed research proposal. Goes to supervisor for grading, then to project coordinator for approval.',
    defaultDaysFromApproval: 30,
    requiresCoordinatorApproval: true,
    requiresExaminers:       false,
    approvalChainHe:         ['הגשת הסטודנט', 'אישור מנחה (טופס ציונים)', 'אישור רכז הפרויקטים'],
    approvalChainEn:         ['Student Submission', 'Supervisor Approval (grading form)', 'Coordinator Approval'],
  },
  {
    type:                    'progress_report',
    nameHe:                  'דו"ח התקדמות',
    nameEn:                  'Progress Report',
    descriptionHe:           'דו"ח התקדמות המוגש בדרך כלל בתום סמסטר א׳. עובר לאישור המנחה ולאחר מכן לאישור רכז הפרויקטים.',
    descriptionEn:           'Progress report submitted at the end of semester 1. Goes to supervisor then coordinator for approval.',
    defaultDaysFromApproval: 120,
    requiresCoordinatorApproval: true,
    requiresExaminers:       false,
    approvalChainHe:         ['הגשת הסטודנט', 'אישור מנחה (טופס ציונים)', 'אישור רכז הפרויקטים'],
    approvalChainEn:         ['Student Submission', 'Supervisor Approval (grading form)', 'Coordinator Approval'],
  },
  {
    type:                    'final_report',
    nameHe:                  'דו"ח מסכם',
    nameEn:                  'Final Report',
    descriptionHe:           'דו"ח מסכם של הפרויקט. עובר לאישור המנחה ולאחר מכן לאישור רכז הפרויקטים. לאחר מכן עובר לשני בוחנים.',
    descriptionEn:           'Final project report. Goes to supervisor then coordinator. After approval, sent to two examiners.',
    defaultDaysFromApproval: 210,
    requiresCoordinatorApproval: true,
    requiresExaminers:       false,
    approvalChainHe:         ['הגשת הסטודנט', 'אישור מנחה (טופס ציונים)', 'אישור רכז הפרויקטים', 'הקצאת בוחנים'],
    approvalChainEn:         ['Student Submission', 'Supervisor Approval (grading form)', 'Coordinator Approval', 'Examiner Assignment'],
  },
  {
    type:                    'defense',
    nameHe:                  'בחינת הגנה',
    nameEn:                  'Defense Exam',
    descriptionHe:           'בחינת הגנה עם הסטודנט ושני הבוחנים. המועד מתואם על ידי האפליקציה. הבוחנים ממלאים טופס ציונים מפורט. האפליקציה מחשבת את הציון הסופי.',
    descriptionEn:           'Defense exam with the student and two examiners. Date coordinated by the app. Examiners fill a detailed grading form. The app calculates the final grade.',
    defaultDaysFromApproval: 240,
    requiresCoordinatorApproval: false,
    requiresExaminers:       true,
    approvalChainHe:         ['תיאום מועד (רכז)', 'הגנה עם שני בוחנים', 'טופס ציונים (כל בוחן)', 'חישוב ציון סופי'],
    approvalChainEn:         ['Date Coordination (Coordinator)', 'Defense with Two Examiners', 'Grading Form (each examiner)', 'Final Grade Calculation'],
  },
];

// ─── Helper: add days to a date ───────────────────────────────────────────────
function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

// ─── Main: auto-create all 4 milestones on approval ──────────────────────────
export async function createMilestonesOnApproval(params: {
  projectId:   string;
  studentIds:  string[];  // usually just one student
  facultyId:   string;
  supervisorId:string;
  approvalDate?: Date;    // defaults to now
}): Promise<void> {
  const approvalDate = params.approvalDate ?? new Date();
  const batch = writeBatch(db);

  for (const template of MILESTONE_TEMPLATES) {
    const dueDate = addDays(approvalDate, template.defaultDaysFromApproval);
    const ref = doc(collection(db, 'milestones'));

    batch.set(ref, {
      // Identity
      projectId:    params.projectId,
      studentIds:   params.studentIds,
      facultyId:    params.facultyId,
      supervisorId: params.supervisorId,

      // Milestone type + metadata
      type:          template.type,
      nameHe:        template.nameHe,
      nameEn:        template.nameEn,
      descriptionHe: template.descriptionHe,
      descriptionEn: template.descriptionEn,

      // Status
      status: 'pending' as MilestoneStatus,

      // Dates
      dueDate:      Timestamp.fromDate(dueDate),
      approvalDate: Timestamp.fromDate(approvalDate),
      submittedAt:  null,

      // Approval chain
      requiresCoordinatorApproval: template.requiresCoordinatorApproval,
      requiresExaminers:           template.requiresExaminers,
      approvalChainHe:             template.approvalChainHe,
      approvalChainEn:             template.approvalChainEn,

      // Grading
      supervisorGradeId:     null,
      coordinatorApprovedAt: null,
      examinerIds:           [],
      defenseDate:           null,
      defenseRoom:           null,
      finalGrade:            null,

      // Files
      fileUrls:       [],
      submissionNote: '',

      // Deadline reminder tracking
      reminder7dSent: false,
      reminder1dSent: false,

      createdAt: serverTimestamp(),
    });
  }

  await batch.commit();
  console.log(`✅ Created ${MILESTONE_TEMPLATES.length} milestones for project ${params.projectId}`);
}

// ─── Milestone state machine — valid transitions ───────────────────────────────
export const MILESTONE_TRANSITIONS: Record<MilestoneStatus, MilestoneStatus[]> = {
  pending:              ['submitted'],
  submitted:            ['supervisor_graded'],
  supervisor_graded:    ['coordinator_approved'],
  coordinator_approved: ['examiner_graded', 'completed'],
  examiner_graded:      ['completed'],
  completed:            [],
};

export function canTransition(from: MilestoneStatus, to: MilestoneStatus): boolean {
  return MILESTONE_TRANSITIONS[from]?.includes(to) ?? false;
}

// ─── Days remaining helper ────────────────────────────────────────────────────
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