// src/utils/dueTime.ts
//
// Every milestone due date lands at 12:00 noon Israel time on its day.
// Before this, a relative due date kept the time of day the student happened
// to enroll at (e.g. 06:45), and a staff-picked date landed on midnight UTC
// (02:00/03:00 Israel) — so "due Nov 17" meant a different hour per student.

import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';

dayjs.extend(utc);
dayjs.extend(timezone);

export const DUE_TZ = 'Asia/Jerusalem';
export const DUE_HOUR = 12;

/** The same Israel calendar day as `input`, at 12:00 Israel time (DST-aware).
 *  A bare 'YYYY-MM-DD' string is taken as that calendar day. */
export function atDueTime(input: Date | string): Date {
  const day = typeof input === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input)
    ? input
    : dayjs(input).tz(DUE_TZ).format('YYYY-MM-DD');
  return dayjs.tz(`${day}T${String(DUE_HOUR).padStart(2, '0')}:00:00`, DUE_TZ).toDate();
}
