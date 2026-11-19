// lib/thesisExam.ts
// Shared bits of the CS M.Sc. thesis exam flow (server's
// services/thesisExam.ts): step labels, and day/slot formatting. Dates are
// plain Israel-calendar days (YYYY-MM-DD), like seminar dates.

import type { ThesisExamStatus, ThesisExamSlot } from './apiClient';

export const THESIS_EXAM_STEPS: Array<{ status: ThesisExamStatus; he: string; en: string }> = [
  { status: 'exam_nomination', he: 'מינוי בוחנים', en: 'Examiner nomination' },
  { status: 'exam_nomination_review', he: 'אישור המינוי', en: 'Nomination approval' },
  { status: 'exam_availability', he: 'בחירת תאריכים', en: 'Date picking' },
  { status: 'exam_date_coordinator', he: 'קביעת שעות ע״י הרכזת', en: 'Coordinator sets the hours' },
  { status: 'exam_date_review', he: 'אישור ראש התוכנית', en: 'Program head approval' },
  { status: 'exam_date_final_review', he: 'אישור ראש בית הספר', en: 'Grad school head approval' },
  { status: 'exam_scheduled', he: 'הבחינה וטופס הבוחנים', en: "The exam and examiners' form" },
  { status: 'exam_grades_pending', he: 'ציון המחקר של המנחה', en: "Supervisor's research grade" },
  { status: 'exam_grade_review', he: 'אישור ראש בית הספר', en: 'Grad school head approval' },
  { status: 'exam_coordinator_approval', he: 'אישור סופי — הרכזת', en: 'Final approval — coordinator' },
];

export const THESIS_EXAM_STATUS_LABEL: Record<ThesisExamStatus, { he: string; en: string }> = {
  exam_nomination: { he: 'ממתין למינוי בוחנים', en: 'Awaiting examiner nomination' },
  exam_nomination_review: { he: 'מינוי הבוחנים ממתין לאישור', en: 'Nomination awaiting approval' },
  exam_availability: { he: 'בחירת תאריכים לבחינה', en: 'Picking exam dates' },
  exam_date_coordinator: { he: 'הרכזת קובעת את שעות הבחינה', en: 'Coordinator setting the exam hours' },
  exam_date_review: { he: 'מועד ממתין לאישור ראש התוכנית', en: 'Date awaiting program head' },
  exam_date_final_review: { he: 'מועד ממתין לאישור ראש בית הספר', en: 'Date awaiting grad school head' },
  exam_scheduled: { he: 'מועד הבחינה נקבע', en: 'Exam scheduled' },
  exam_committee_review: { he: 'ממתין לציון המחקר של המנחה', en: "Waiting for the supervisor's research grade" },
  exam_grades_pending: { he: 'ממתין לציון המחקר של המנחה', en: "Waiting for the supervisor's research grade" },
  exam_grade_review: { he: 'הציון הסופי ממתין לאישור ראש בית הספר', en: 'Final grade awaiting the grad school head' },
  exam_grade_denied: { he: 'הציון הסופי נדחה ע״י ראש בית הספר', en: 'Final grade denied by the grad school head' },
  exam_returned_to_supervisor: { he: 'הוחזר למנחה להמשך עבודה', en: 'Returned to the supervisor for more work' },
  exam_coordinator_approval: { he: 'ממתין לאישור הסופי של הרכזת', en: "Awaiting the coordinator's final approval" },
  exam_completed: { he: 'התזה הושלמה', en: 'Thesis completed' },
};

/** Which step of THESIS_EXAM_STEPS a status belongs to. */
export function thesisExamStepIndex(status: ThesisExamStatus): number {
  if (status === 'exam_completed') return THESIS_EXAM_STEPS.length;
  const as: ThesisExamStatus = status === 'exam_committee_review' ? 'exam_grades_pending'
    : status === 'exam_grade_denied' || status === 'exam_returned_to_supervisor' ? 'exam_grade_review'
    : status;
  return THESIS_EXAM_STEPS.findIndex((x) => x.status === as);
}

export function isThesisExamStatus(status: string | null | undefined): status is ThesisExamStatus {
  return !!status && status in THESIS_EXAM_STATUS_LABEL;
}

export function formatExamDay(date: string, lang: 'he' | 'en', opts: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-GB', opts);
}

export function formatExamSlot(slot: ThesisExamSlot, lang: 'he' | 'en'): string {
  return `${formatExamDay(slot.date, lang)} · ${slot.from}–${slot.to}`;
}

/** "יום ד׳, 18.11, 14:00" — a deadline in Israel time. */
export function formatExamDeadline(iso: string, lang: 'he' | 'en'): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(lang === 'he' ? 'he-IL' : 'en-GB', { timeZone: 'Asia/Jerusalem', weekday: 'short', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
}
