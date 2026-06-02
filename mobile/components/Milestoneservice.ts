import { Timestamp } from "firebase/firestore";

export interface GradeWeights {
  supervisorWeight: number;   // e.g. 0.30
  examiner1Weight:  number;   // e.g. 0.35
  examiner2Weight:  number;   // e.g. 0.35
}

export function daysUntil(dueDate: Timestamp | string | null | undefined): number {
  if (!dueDate) return 0;
  
  let date: Date;
  if (typeof dueDate === 'string') {
    date = new Date(dueDate);
  } else if (dueDate instanceof Timestamp) {
    date = dueDate.toDate();
  } else if (typeof (dueDate as any).toDate === 'function') {
    // handles admin SDK Timestamp too
    date = (dueDate as any).toDate();
  } else {
    return 0;
  }

  if (isNaN(date.getTime())) return 0;
  return Math.ceil((date.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
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

export type MilestoneStatus =
  | 'pending'
  | 'submitted'
  | 'supervisor_graded'
  | 'graded'
  | 'coordinator_approved'
  | 'examiners_assigned'    // coordinator picked 2 examiners (after final_report)
  | 'examiner_graded'       // at least one examiner graded
  | 'both_examiners_graded' // both examiners submitted grades
  | 'completed';