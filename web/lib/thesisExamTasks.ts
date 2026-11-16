// lib/thesisExamTasks.ts
// Turns the caller's thesis exams (GET /api/thesis-exam/mine) into the open
// to-dos that are actually waiting on them — what the dashboard alert strip
// (components/dashboard/ThesisExamAlert.tsx) and the coordinator's Urgent
// Actions show. A card's `actions` alone over-reports: 'availability' stays
// listed after the person already picked, and 'form' before the exam starts.
// 'view_forms' is left out on purpose — the committee step has no defined
// outcome yet (server's services/thesisExam.ts header), so it would nag
// forever with nothing to finish.

import type { ThesisExamCard } from '@/lib/apiClient';

export type ThesisExamTaskKind = 'nominate' | 'review_nomination' | 'availability' | 'set_date' | 'review_date' | 'form';

export interface ThesisExamTask {
  milestoneId: string;
  kind: ThesisExamTaskKind;
  studentNames: string[];
  projectTitleHe: string;
  projectTitleEn: string;
  /** Last day to pick dates — only for 'availability'. */
  deadline: string | null;
}

export function thesisExamTasks(exams: ThesisExamCard[]): ThesisExamTask[] {
  const out: ThesisExamTask[] = [];
  for (const e of exams) {
    const base = { milestoneId: e.milestoneId, studentNames: e.studentNames, projectTitleHe: e.projectTitleHe, projectTitleEn: e.projectTitleEn };
    for (const a of e.actions) {
      if (a === 'view_forms') continue;
      if (a === 'availability' && e.myAvailability) continue;
      if (a === 'form' && (e.myFormSubmitted || !e.formOpen)) continue;
      out.push({ ...base, kind: a, deadline: a === 'availability' ? e.window?.end ?? null : null });
    }
  }
  return out;
}

const LABEL: Record<ThesisExamTaskKind, { he: string; en: string }> = {
  nominate: { he: 'יש למנות בוחנים', en: 'Nominate the examiners' },
  review_nomination: { he: 'יש לאשר את מינוי הבוחנים', en: 'Approve the examiner nomination' },
  availability: { he: 'יש לבחור 5 מועדים לבחינה', en: 'Pick your 5 dates for the exam' },
  set_date: { he: 'יש לקבוע את מועד הבחינה (אין מועד משותף)', en: 'Set the exam time (no common slot)' },
  review_date: { he: 'יש לאשר את מועד הבחינה', en: 'Approve the exam date' },
  form: { he: 'יש למלא את טופס מבחן התזה', en: 'Fill in the thesis exam form' },
};

export function thesisExamTaskLabel(kind: ThesisExamTaskKind, lang: 'he' | 'en'): string {
  return LABEL[kind][lang];
}

export function formatTaskDeadline(iso: string, lang: 'he' | 'en'): string {
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-GB', { day: 'numeric', month: 'short' });
}
