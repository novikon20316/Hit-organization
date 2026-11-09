// lib/seminar.ts
// Shared bits of the seminar milestone flow (server/src/services/
// seminarScheduling.ts). SEMINAR_COLOR is the one colour every calendar uses
// for a seminar — none of the defense calendar's urgency colours (red, amber,
// green), so the two can't be mistaken for each other.

export const SEMINAR_COLOR = '#7C3AED';
/** Defenses on the administrative coordinator's seminar calendar. */
export const DEFENSE_CALENDAR_COLOR = '#3E6C8C';

export interface SeminarSlot {
  date: string;
  time: string;
  location?: string;
  note?: string;
  /** ISO instant the talk starts (Israel time) — only on the administrative
   *  coordinator's seminar list. */
  startsAt?: string;
}

export interface SeminarAttempt {
  date: string;
  time: string;
  location?: string;
  outcome: 'performed' | 'not_performed';
  note?: string;
  decidedByName?: string;
  decidedAt?: string | null;
}

export function isSeminarInProgress(status: string | null | undefined): boolean {
  return status === 'seminar_awaiting_date' || status === 'seminar_scheduled';
}

/** `YYYY-MM-DD` → a local Date at noon, so formatting can't slip a day. */
export function seminarDayToDate(date: string): Date {
  return new Date(`${date}T12:00:00`);
}

export function formatSeminarDay(date: string, lang: 'he' | 'en', opts: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }): string {
  return seminarDayToDate(date).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-GB', opts);
}

/** The yes/no on whether the talk took place opens from its booked time —
 *  same rule the server enforces. */
export function seminarHasStarted(slot: SeminarSlot | null | undefined, now: number): boolean {
  return !!slot?.startsAt && Date.parse(slot.startsAt) <= now;
}
