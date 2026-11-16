// utils/timeLeft.ts
//
// Under a day to a deadline, "1 day" is misleading (it could be 14 hours or
// 14 minutes). Every "X days left" countdown checks this first and shows
// hours + minutes instead while 0 < time left < 24h. Kept in sync with
// web/lib/timeLeft.ts.

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;

function toMillis(val: unknown): number | null {
  if (val === null || val === undefined || val === '') return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val.getTime();
  if (typeof val === 'object') {
    const o = val as { toDate?: () => Date; seconds?: number; _seconds?: number };
    if (typeof o.toDate === 'function') return o.toDate().getTime();
    const s = o.seconds ?? o._seconds;
    return typeof s === 'number' ? s * 1000 : null;
  }
  const t = new Date(val as string | number).getTime();
  return isNaN(t) ? null : t;
}

/** "נותרו 14 שעות ו-13 דקות" / "14 hours and 13 minutes left" when the
 *  deadline is less than a day away (and not yet passed); null otherwise,
 *  so the caller falls back to its usual days text. */
export function underADayLeftLabel(due: unknown, lang: string, now: number = Date.now()): string | null {
  const t = toMillis(due);
  if (t === null) return null;
  const left = t - now;
  if (left <= 0 || left >= DAY_MS) return null;
  const totalMinutes = Math.max(1, Math.floor(left / MINUTE_MS));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (lang === 'he') {
    const h = hours === 1 ? 'שעה אחת' : `${hours} שעות`;
    const m = minutes === 1 ? 'דקה אחת' : `${minutes} דקות`;
    if (hours === 0) return `נותרו ${m}`;
    if (minutes === 0) return `נותרו ${h}`;
    return `נותרו ${h} ו-${m}`;
  }
  const h = `${hours} hour${hours === 1 ? '' : 's'}`;
  const m = `${minutes} minute${minutes === 1 ? '' : 's'}`;
  if (hours === 0) return `${m} left`;
  if (minutes === 0) return `${h} left`;
  return `${h} and ${m} left`;
}

/** Hours + minutes left when 0 < time left < 24h, else null. */
export function underADayParts(due: unknown, now: number = Date.now()): { hours: number; minutes: number } | null {
  const t = toMillis(due);
  if (t === null) return null;
  const left = t - now;
  if (left <= 0 || left >= DAY_MS) return null;
  const total = Math.max(1, Math.floor(left / MINUTE_MS));
  return { hours: Math.floor(total / 60), minutes: total % 60 };
}
