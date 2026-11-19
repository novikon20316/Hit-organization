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
  { status: 'exam_committee_review', he: 'דיון הוועדה', en: 'Committee review' },
  { status: 'exam_approved', he: 'החלטת יו"ר הוועדה', en: "Chairman's decision" },
];

export const THESIS_EXAM_STATUS_LABEL: Record<ThesisExamStatus, { he: string; en: string }> = {
  exam_nomination: { he: 'ממתין למינוי בוחנים', en: 'Awaiting examiner nomination' },
  exam_nomination_review: { he: 'מינוי הבוחנים ממתין לאישור', en: 'Nomination awaiting approval' },
  exam_availability: { he: 'בחירת תאריכים לבחינה', en: 'Picking exam dates' },
  exam_date_coordinator: { he: 'הרכזת קובעת את שעות הבחינה', en: 'Coordinator setting the exam hours' },
  exam_date_review: { he: 'מועד ממתין לאישור ראש התוכנית', en: 'Date awaiting program head' },
  exam_date_final_review: { he: 'מועד ממתין לאישור ראש בית הספר', en: 'Date awaiting grad school head' },
  exam_scheduled: { he: 'מועד הבחינה נקבע', en: 'Exam scheduled' },
  exam_committee_review: { he: 'ממתין לוועדה', en: 'Awaiting the committee' },
  exam_approved: { he: 'הבחינה אושרה — התזה הושלמה', en: 'Exam approved — thesis completed' },
  exam_failed: { he: 'הבחינה לא עברה', en: 'Exam not passed' },
};

/** The committee's three outcomes, as the chairman and members choose them. */
export const EXAM_DECISION_LABEL: Record<'approve' | 'fix' | 'fail', { he: string; en: string; hintHe: string; hintEn: string }> = {
  approve: { he: 'אישור', en: 'Approve', hintHe: 'הסטודנט/ית סיים/ה בהצלחה את התזה; הציון המשוקלל הופך לציון הסופי.', hintEn: 'The student completed the thesis; the weighted grade becomes the final grade.' },
  fix: { he: 'תיקון', en: 'Fix', hintHe: 'הסטודנט/ית מגיש/ה תזה טובה יותר מאבן הדרך "אישור תיזה" — כל התהליך מתחיל מחדש משם.', hintEn: 'The student submits a better thesis from the "thesis approval" milestone — the whole process restarts there.' },
  fail: { he: 'כישלון', en: 'Fail', hintHe: 'ההחלטה נרשמת; ההמשך ייקבע לפי הנחיות הפקולטה.', hintEn: "The decision is recorded; what follows will be set by the faculty's rules." },
};

/** Which step of THESIS_EXAM_STEPS a status belongs to. */
export function thesisExamStepIndex(status: ThesisExamStatus): number {
  return THESIS_EXAM_STEPS.findIndex((x) => x.status === (status === 'exam_failed' ? 'exam_approved' : status));
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
