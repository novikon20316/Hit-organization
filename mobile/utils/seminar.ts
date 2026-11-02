// utils/seminar.ts
// Mirror of web's lib/seminar.ts — see server/src/services/seminarScheduling.ts.

export const SEMINAR_COLOR = '#7C3AED';
export const DEFENSE_CALENDAR_COLOR = '#3E6C8C';

export interface SeminarSlot {
  date: string;
  time: string;
  location?: string;
  note?: string;
}

export interface SeminarAttempt {
  date: string;
  time: string;
  location?: string;
  outcome: 'performed' | 'not_performed';
  note?: string;
}

export function isSeminarInProgress(status: string | null | undefined): boolean {
  return status === 'seminar_awaiting_date' || status === 'seminar_scheduled';
}

export function formatSeminarDay(date: string, lang: 'he' | 'en', opts: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-GB', opts);
}
