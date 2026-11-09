// components/thesisExam/shared.ts
// Labels and formatting for the CS M.Sc. thesis exam (server's
// services/thesisExam.ts) — mobile counterpart of web's lib/thesisExam.ts.
// Dates are plain Israel-calendar days (YYYY-MM-DD).

import type { ThesisExamStatus, ThesisExamSlot } from '@/src/api/apiClient';
import type { Lang } from '@/components/i18n';

export const THESIS_EXAM_STEPS: { status: ThesisExamStatus; he: string; en: string }[] = [
  { status: 'exam_nomination', he: 'מינוי בוחנים', en: 'Nomination' },
  { status: 'exam_nomination_review', he: 'אישור המינוי', en: 'Nomination approval' },
  { status: 'exam_availability', he: 'בחירת תאריכים', en: 'Date picking' },
  { status: 'exam_date_review', he: 'ראש התוכנית', en: 'Program head' },
  { status: 'exam_date_final_review', he: 'ראש בית הספר', en: 'Grad school head' },
  { status: 'exam_scheduled', he: 'הבחינה והטופס', en: 'Exam & form' },
  { status: 'exam_committee_review', he: 'הוועדה', en: 'Committee' },
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

/** Which step a status belongs to — the coordinator setting the time is
 *  part of scheduling, not a step of its own. */
export function thesisExamStepIndex(status: ThesisExamStatus): number {
  const s = status === 'exam_date_coordinator' ? 'exam_availability' : status;
  return THESIS_EXAM_STEPS.findIndex((x) => x.status === s);
}

export function formatExamDay(date: string, lang: Lang, opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'numeric' }): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-GB', opts);
}

export function formatExamSlot(slot: ThesisExamSlot, lang: Lang): string {
  return `${formatExamDay(slot.date, lang, { weekday: 'long', day: 'numeric', month: 'numeric', year: 'numeric' })} · ${slot.from}–${slot.to}`;
}

export const C = {
  primary: '#2E86FF',
  ink: '#1A1F36',
  muted: '#6B7280',
  faint: '#8899BB',
  line: '#E5E7EB',
  paper: '#F7F8FA',
  danger: '#DC2626',
  dangerBg: '#FDECEC',
  success: '#0F7B4B',
  successBg: '#E6F6EE',
};
