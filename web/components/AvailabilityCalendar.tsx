'use client';

// components/AvailabilityCalendar.tsx
// E2 — pick defense availability on a month calendar instead of adding one
// date at a time. Tap days to toggle them; Fridays/Saturdays, past days and
// days outside the scheduling window are disabled (the server re-checks all
// of this — defenseScheduling.ts's validateCandidateDates). Used by internal
// examiners (examinor/home/AssignmentCard.tsx) and external examiners
// (examiner-access/DefenseDateSection.tsx). Dates are plain 'YYYY-MM-DD'
// strings, computed in UTC so no time zone can shift a day.

import { useMemo, useState } from 'react';

interface AvailabilityCalendarProps {
  lang: 'he' | 'en';
  /** Inclusive 'YYYY-MM-DD' bounds; null = unbounded on that side. */
  windowStart: string | null;
  windowEnd: string | null;
  selected: string[];
  onChange: (dates: string[]) => void;
}

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const parse = (s: string) => new Date(`${s}T00:00:00Z`);

function todayYmd(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

const WEEKDAYS = { he: ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'], en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] };

export function AvailabilityCalendar({ lang, windowStart, windowEnd, selected, onChange }: AvailabilityCalendarProps) {
  const he = lang === 'he';
  const today = todayYmd();
  const min = windowStart && windowStart > today ? windowStart : today;
  const max = windowEnd;
  const firstMonth = parse(min.slice(0, 8) + '01');
  const lastMonth = max ? parse(max.slice(0, 8) + '01') : null;
  const [month, setMonth] = useState(firstMonth);

  const selectable = (d: string) => {
    const day = parse(d).getUTCDay();
    return day !== 5 && day !== 6 && d >= min && (!max || d <= max);
  };

  const cells = useMemo(() => {
    const first = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), 1));
    const daysInMonth = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0)).getUTCDate();
    const out: Array<string | null> = Array.from({ length: first.getUTCDay() }, () => null);
    for (let i = 1; i <= daysInMonth; i++) out.push(ymd(new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), i))));
    return out;
  }, [month]);

  const toggle = (d: string) => onChange(selected.includes(d) ? selected.filter((x) => x !== d) : [...selected, d].sort());
  const monthSelectable = cells.filter((d): d is string => !!d && selectable(d));
  const allMonthSelected = monthSelectable.length > 0 && monthSelectable.every((d) => selected.includes(d));
  const shiftMonth = (delta: number) => setMonth(new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + delta, 1)));
  const canPrev = month > firstMonth;
  const canNext = !lastMonth || month < lastMonth;

  return (
    <div className="rounded-lg border border-line bg-surface p-2">
      <div className="mb-1 flex items-center justify-between">
        <button type="button" onClick={() => shiftMonth(-1)} disabled={!canPrev} aria-label={he ? 'החודש הקודם' : 'Previous month'} className="rounded px-2 py-1 text-sm text-ink disabled:opacity-30">
          {he ? '→' : '←'}
        </button>
        <p className="text-sm font-semibold text-ink" aria-live="polite">
          {month.toLocaleDateString(he ? 'he-IL' : 'en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })}
        </p>
        <button type="button" onClick={() => shiftMonth(1)} disabled={!canNext} aria-label={he ? 'החודש הבא' : 'Next month'} className="rounded px-2 py-1 text-sm text-ink disabled:opacity-30">
          {he ? '←' : '→'}
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center" role="group" aria-label={he ? 'בחירת תאריכים' : 'Choose dates'}>
        {WEEKDAYS[lang].map((w) => <span key={w} className="text-[11px] font-medium text-muted">{w}</span>)}
        {cells.map((d, i) => {
          if (!d) return <span key={`blank-${i}`} />;
          const can = selectable(d);
          const on = selected.includes(d);
          return (
            <button
              key={d}
              type="button"
              disabled={!can}
              onClick={() => toggle(d)}
              aria-pressed={on}
              aria-label={parse(d).toLocaleDateString(he ? 'he-IL' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })}
              className={`h-8 rounded text-xs font-medium ${on ? 'bg-primary text-primary-ink' : can ? 'bg-paper text-ink hover:border hover:border-primary' : 'text-muted/40'}`}
            >
              {Number(d.slice(8))}
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="text-muted">{he ? `נבחרו ${selected.length} תאריכים` : `${selected.length} date${selected.length === 1 ? '' : 's'} selected`}</span>
        <span className="flex gap-3">
          {monthSelectable.length > 0 && (
            <button
              type="button"
              onClick={() => onChange(allMonthSelected
                ? selected.filter((d) => !monthSelectable.includes(d))
                : [...new Set([...selected, ...monthSelectable])].sort())}
              className="font-medium text-primary hover:underline"
            >
              {allMonthSelected ? (he ? 'בטל את כל החודש' : 'Clear this month') : (he ? 'סמן את כל החודש' : 'Select all this month')}
            </button>
          )}
          {selected.length > 0 && (
            <button type="button" onClick={() => onChange([])} className="font-medium text-muted hover:text-danger">
              {he ? 'נקה הכל' : 'Clear all'}
            </button>
          )}
        </span>
      </div>
    </div>
  );
}
