// lib/thesisExam.ts
// Shared bits of the CS M.Sc. thesis exam flow (server's
// services/thesisExam.ts): step labels, and day/slot formatting. Dates are
// plain Israel-calendar days (YYYY-MM-DD), like seminar dates.

import type { ThesisExamStatus, ThesisExamSlot } from './apiClient';

export const THESIS_EXAM_STEPS: Array<{ status: ThesisExamStatus; he: string; en: string }> = [
  { status: 'exam_nomination', he: 'מינוי בוחנים', en: 'Examiner nomination' },
  { status: 'exam_nomination_review', he: 'אישור המינוי', en: 'Nomination approval' },
  { status: 'exam_availability', he: 'בחירת תאריכים', en: 'Date picking' },
  { status: 'exam_date_review', he: 'אישור ראש התוכנית', en: 'Program head approval' },
  { status: 'exam_date_final_review', he: 'אישור ראש בית הספר', en: 'Grad school head approval' },
  { status: 'exam_scheduled', he: 'הבחינה וטופס הבוחנים', en: "The exam and examiners' form" },
  { status: 'exam_committee_review', he: 'דיון הוועדה', en: 'Committee review' },
];

export const THESIS_EXAM_STATUS_LABEL: Record<ThesisExamStatus, { he: string; en: string }> = {
  exam_nomination: { he: 'ממתין למינוי בוחנים', en: 'Awaiting examiner nomination' },
  exam_nomination_review: { he: 'מינוי הבוחנים ממתין לאישור', en: 'Nomination awaiting approval' },
  exam_availability: { he: 'בחירת תאריכים לבחינה', en: 'Picking exam dates' },
  exam_date_coordinator: { he: 'הרכזת קובעת את המועד', en: 'Coordinator setting the time' },
  exam_date_review: { he: 'מועד ממתין לאישור ראש התוכנית', en: 'Date awaiting program head' },
  exam_date_final_review: { he: 'מועד ממתין לאישור ראש בית הספר', en: 'Date awaiting grad school head' },
  exam_scheduled: { he: 'מועד הבחינה נקבע', en: 'Exam scheduled' },
  exam_committee_review: { he: 'ממתין לוועדה', en: 'Awaiting the committee' },
};

/** Which step of THESIS_EXAM_STEPS a status belongs to — the coordinator
 *  setting the time is part of scheduling, not a step of its own. */
export function thesisExamStepIndex(status: ThesisExamStatus): number {
  const s = status === 'exam_date_coordinator' ? 'exam_availability' : status;
  return THESIS_EXAM_STEPS.findIndex((x) => x.status === s);
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
