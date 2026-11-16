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

export type ThesisExamTaskKind = 'nominate' | 'review_nomination' | 'availability' | 'late_entry' | 'set_date' | 'set_hours' | 'review_date' | 'form';

export interface ThesisExamTask {
  milestoneId: string;
  kind: ThesisExamTaskKind;
  studentNames: string[];
  projectTitleHe: string;
  projectTitleEn: string;
  /** When it's due: the 48h deadline (an ISO moment) or, on rounds from
   *  before that rule, the window's last day ('YYYY-MM-DD'). */
  deadline: string | null;
}

export function thesisExamTasks(exams: ThesisExamCard[]): ThesisExamTask[] {
  const out: ThesisExamTask[] = [];
  for (const e of exams) {
    // Reached only through the system_admin override — not their job.
    if (e.viaSystemAdminOnly) continue;
    const base = { milestoneId: e.milestoneId, studentNames: e.studentNames, projectTitleHe: e.projectTitleHe, projectTitleEn: e.projectTitleEn };
    for (const a of e.actions) {
      if (a === 'view_forms') continue;
      if (a === 'availability' && e.myAvailability) continue;
      if (a === 'form' && (e.myFormSubmitted || !e.formOpen)) continue;
      const deadline = a === 'availability' ? e.lateEntryDeadline ?? e.pickDeadline ?? e.window?.end ?? null
        : a === 'late_entry' ? e.lateEntryDeadline
        : null;
      const kind: ThesisExamTaskKind = a === 'set_date' && e.coordinatorTask === 'set_hours' ? 'set_hours' : a;
      out.push({ ...base, kind, deadline });
    }
  }
  return out;
}

const LABEL: Record<ThesisExamTaskKind, { he: string; en: string }> = {
  nominate: { he: 'יש למנות בוחנים', en: 'Nominate the examiners' },
  review_nomination: { he: 'יש לאשר את מינוי הבוחנים', en: 'Approve the examiner nomination' },
  availability: { he: 'יש לבחור 5 מועדים לבחינה', en: 'Pick your 5 dates for the exam' },
  late_entry: { he: 'יש ליצור קשר עם מי שלא בחרו תאריכים ולהזין אותם', en: "Call whoever didn't pick dates and enter theirs" },
  set_date: { he: 'יש לקבוע את מועד הבחינה (אין מועד משותף)', en: 'Set the exam time (no common slot)' },
  set_hours: { he: 'נמצא מועד משותף — יש לקבוע את שעות הבחינה', en: 'Common date found — set the exam hours' },
  review_date: { he: 'יש לאשר את מועד הבחינה', en: 'Approve the exam date' },
  form: { he: 'יש למלא את טופס מבחן התזה', en: 'Fill in the thesis exam form' },
};

export function thesisExamTaskLabel(kind: ThesisExamTaskKind, lang: 'he' | 'en'): string {
  return LABEL[kind][lang];
}

export function formatTaskDeadline(iso: string, lang: 'he' | 'en'): string {
  const locale = lang === 'he' ? 'he-IL' : 'en-GB';
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const d = new Date(`${iso}T12:00:00`);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
  }
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(locale, { timeZone: 'Asia/Jerusalem', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
}
