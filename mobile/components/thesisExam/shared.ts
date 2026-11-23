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
  { status: 'exam_date_coordinator', he: 'שעות ע״י הרכזת', en: 'Coordinator hours' },
  { status: 'exam_date_review', he: 'ראש התוכנית', en: 'Program head' },
  { status: 'exam_date_final_review', he: 'ראש בית הספר', en: 'Grad school head' },
  { status: 'exam_scheduled', he: 'הבחינה וטופס היו״ר', en: "Exam & chairman's form" },
  { status: 'exam_signatures', he: 'חתימת הבוחנים', en: 'Signatures' },
  { status: 'exam_grades_pending', he: 'השלמת הציון', en: 'Completing grade' },
  { status: 'exam_grade_review', he: 'ראש בית הספר', en: 'Grad school head' },
  { status: 'exam_coordinator_approval', he: 'אישור סופי', en: 'Final approval' },
];

export const THESIS_EXAM_STATUS_LABEL: Record<ThesisExamStatus, { he: string; en: string }> = {
  exam_nomination: { he: 'ממתין למינוי בוחנים', en: 'Awaiting examiner nomination' },
  exam_nomination_review: { he: 'מינוי הבוחנים ממתין לאישור', en: 'Nomination awaiting approval' },
  exam_availability: { he: 'בחירת תאריכים לבחינה', en: 'Picking exam dates' },
  exam_date_coordinator: { he: 'הרכזת קובעת את שעות הבחינה', en: 'Coordinator setting the exam hours' },
  exam_date_review: { he: 'מועד ממתין לאישור ראש התוכנית', en: 'Date awaiting program head' },
  exam_date_final_review: { he: 'מועד ממתין לאישור ראש בית הספר', en: 'Date awaiting grad school head' },
  exam_scheduled: { he: 'מועד הבחינה נקבע', en: 'Exam scheduled' },
  exam_signatures: { he: 'טופס הבחינה ממתין לחתימת הבוחנים', en: "Exam form awaiting the examiners' signatures" },
  exam_committee_review: { he: 'ממתין לציון המחקר של המנחה', en: "Waiting for the supervisor's research grade" },
  exam_grades_pending: { he: 'הציון הסופי בהשלמה', en: 'Final grade being completed' },
  exam_grade_review: { he: 'הציון הסופי ממתין לאישור ראש בית הספר', en: 'Final grade awaiting the grad school head' },
  exam_grade_denied: { he: 'הציון הסופי נדחה ע״י ראש בית הספר', en: 'Final grade denied by the grad school head' },
  exam_returned_to_supervisor: { he: 'הוחזר למנחה להמשך עבודה', en: 'Returned to the supervisor for more work' },
  exam_coordinator_approval: { he: 'ממתין לאישור הסופי של הרכזת', en: "Awaiting the coordinator's final approval" },
  exam_completed: { he: 'התזה הושלמה', en: 'Thesis completed' },
  exam_supervisor_fix: { he: 'הציון נדחה — המנחה מתקן את ציון המחקר', en: 'Grade denied — the supervisor is fixing the research grade' },
  exam_fix_committee_review: { he: 'הוועדה בודקת את תיקון הציון', en: 'The committee is reviewing the grade fix' },
};

/** Which step a status belongs to. */
export function thesisExamStepIndex(status: ThesisExamStatus): number {
  if (status === 'exam_completed') return THESIS_EXAM_STEPS.length;
  const as: ThesisExamStatus = status === 'exam_committee_review' ? 'exam_grades_pending'
    : status === 'exam_grade_denied' || status === 'exam_returned_to_supervisor' || status === 'exam_supervisor_fix' || status === 'exam_fix_committee_review' ? 'exam_grade_review'
    : status;
  return THESIS_EXAM_STEPS.findIndex((x) => x.status === as);
}

export function formatExamDay(date: string, lang: Lang, opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'numeric' }): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-GB', opts);
}

export function formatExamSlot(slot: ThesisExamSlot, lang: Lang): string {
  return `${formatExamDay(slot.date, lang, { weekday: 'long', day: 'numeric', month: 'numeric', year: 'numeric' })} · ${slot.from}–${slot.to}`;
}

export const C = {
  primary: '#2E86FF',
  accent: '#b8862e',
  accentBg: 'rgba(184,134,46,0.12)',
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

/** "18.11 14:00" — a deadline in Israel time (Hermes' Intl may lack the
 *  zone; falls back to the device clock). */
export function formatExamDeadline(iso: string, lang: Lang): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  try {
    const p = Object.fromEntries(
      new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
        .formatToParts(d).map((x) => [x.type, x.value]),
    );
    if (p.day && p.month && p.hour && p.minute) return lang === 'he' ? `${p.day}.${p.month} בשעה ${p.hour}:${p.minute}` : `${p.day}/${p.month} at ${p.hour}:${p.minute}`;
  } catch { /* fall through */ }
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
