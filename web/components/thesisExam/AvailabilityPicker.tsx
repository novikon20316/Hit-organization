'use client';

// components/thesisExam/AvailabilityPicker.tsx
// One participant's picks for the CS thesis exam (server's
// services/thesisExam.ts): exactly N dates inside the round's window, each
// with the hours they're free. Used on /thesis-exam and on the outside
// examiner's access page — the data source is passed in.

import { useState } from 'react';
import type { ThesisExamAvailabilityEntry } from '@/lib/apiClient';
import { formatExamDay } from '@/lib/thesisExam';

// Israel's date/clock, not the browser's — the server's window and its
// "already passed" check (services/thesisExam.ts validateAvailability) are
// both in Asia/Jerusalem, so an examiner abroad must see the same days.
function israelNow(): { date: string; time: string } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date())
      .map((p) => [p.type, p.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

// Exam rules the server enforces too (services/thesisExam.ts assertExamTime):
// no exams on Shabbat, and only daytime hours — nothing at night.
export const EXAM_DAY_START = '06:00';
export const EXAM_DAY_END = '22:00';

export function isShabbat(date: string): boolean {
  return new Date(`${date}T12:00:00Z`).getUTCDay() === 6;
}

/** Israel daylight-saving rule (since 2013): summer time from the Friday
 *  before March's last Sunday until October's last Sunday. Same pure date
 *  math as the server's services/thesisExam.ts, so all sides agree. */
function isIsraelSummerTime(date: string): boolean {
  const y = Number(date.slice(0, 4));
  const lastSunday = (month: number) => {
    const d = new Date(Date.UTC(y, month + 1, 0));
    d.setUTCDate(d.getUTCDate() - d.getUTCDay());
    return d;
  };
  const start = lastSunday(2);
  start.setUTCDate(start.getUTCDate() - 2);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return date >= iso(start) && date < iso(lastSunday(9));
}

/** Latest end time on a Friday (Shabbat comes in): 15:30 in winter, 16:30
 *  in summer. null on any other day. */
export function fridayLatestEnd(date: string): string | null {
  if (!date || new Date(`${date}T12:00:00Z`).getUTCDay() !== 5) return null;
  return isIsraelSummerTime(date) ? '16:30' : '15:30';
}

/** The latest hour an exam may end on that date. */
export function latestEndFor(date: string): string {
  return fridayLatestEnd(date) ?? EXAM_DAY_END;
}

/** Every quarter hour from EXAM_DAY_START to EXAM_DAY_END, inclusive. */
export const EXAM_TIMES: string[] = (() => {
  const out: string[] = [];
  const [sh, sm] = EXAM_DAY_START.split(':').map(Number);
  const [eh, em] = EXAM_DAY_END.split(':').map(Number);
  for (let m = sh! * 60 + sm!; m <= eh! * 60 + em!; m += 15) out.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
  return out;
})();

export function daysBetween(start: string, end: string): string[] {
  const out: string[] = [];
  const d = new Date(`${start}T12:00:00Z`);
  const last = new Date(`${end}T12:00:00Z`);
  while (d <= last) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

export function AvailabilityPicker({
  lang,
  window,
  count,
  initial,
  onSubmit,
}: {
  lang: 'he' | 'en';
  window: { start: string; end: string };
  count: number;
  initial: ThesisExamAvailabilityEntry[] | null;
  onSubmit: (entries: ThesisExamAvailabilityEntry[]) => Promise<void>;
}) {
  const he = lang === 'he';
  const now = israelNow();
  const min = now.date > window.start ? now.date : window.start;
  // The ONLY days that can be chosen: today (or the round's first day) up to
  // the window's last day. A free date box let people type any date and only
  // learn it was illegal on submit.
  // Saturdays are left out altogether.
  const allowedDays = daysBetween(min, window.end).filter((d) => !isShabbat(d));
  const [rows, setRows] = useState<ThesisExamAvailabilityEntry[]>(() => {
    const blank = { date: '', from: '', to: '' };
    if (!initial || initial.length !== count) return Array.from({ length: count }, () => ({ ...blank }));
    // A saved pick whose day has since passed is cleared, not kept.
    return initial.map((e) => (e.date >= min && e.date <= window.end && !isShabbat(e.date) ? { ...e } : { ...blank }));
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  // Set by the first submit attempt: from then on EMPTY fields are marked
  // too. A filled field that is wrong (end before start, hours already
  // passed) is marked right away.
  const [attempted, setAttempted] = useState(false);

  const update = (i: number, field: keyof ThesisExamAvailabilityEntry, value: string) => {
    setSaved(false);
    setError('');
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)));
  };

  type RowIssue = { date: boolean; from: boolean; to: boolean; message: string };
  const issueOf = (r: ThesisExamAvailabilityEntry, i: number): RowIssue | null => {
    const missing = { date: !r.date, from: !r.from, to: !r.to };
    if (r.date && (r.date < min || r.date > window.end)) {
      return { date: true, from: false, to: false, message: he ? 'התאריך מחוץ לטווח המותר.' : 'This date is outside the allowed range.' };
    }
    if (r.date && isShabbat(r.date)) {
      return { date: true, from: false, to: false, message: he ? 'לא ניתן לבחור יום שבת.' : 'Saturday (Shabbat) cannot be picked.' };
    }
    if (r.date && rows.some((o, j) => j !== i && o.date === r.date)) {
      return { date: true, from: false, to: false, message: he ? 'התאריך כבר נבחר בשורה אחרת.' : 'This date is already used in another row.' };
    }
    const atNight = (t: string) => !!t && (t < EXAM_DAY_START || t > EXAM_DAY_END);
    if (atNight(r.from) || atNight(r.to)) {
      return {
        date: false,
        from: atNight(r.from),
        to: atNight(r.to),
        message: he ? `ניתן לבחור רק שעות בין ${EXAM_DAY_START} ל-${EXAM_DAY_END} (לא בשעות הלילה).` : `Only hours between ${EXAM_DAY_START} and ${EXAM_DAY_END} (no night hours).`,
      };
    }
    const fridayEnd = fridayLatestEnd(r.date);
    if (fridayEnd && ((r.to && r.to > fridayEnd) || (r.from && r.from >= fridayEnd))) {
      return {
        date: false,
        from: !!r.from && r.from >= fridayEnd,
        to: !!r.to && r.to > fridayEnd,
        message: he ? `יום שישי — ניתן לבחור שעות עד ${fridayEnd} בלבד (כניסת שבת).` : `Friday — hours only until ${fridayEnd} (Shabbat begins).`,
      };
    }
    if (r.from && r.to && r.to <= r.from) {
      return { date: false, from: true, to: true, message: he ? 'שעת הסיום חייבת להיות אחרי שעת ההתחלה.' : 'The end time must be after the start time.' };
    }
    if (r.date === now.date && r.to && r.to <= now.time) {
      return { date: false, from: true, to: true, message: he ? 'השעות שנבחרו להיום כבר עברו.' : 'The hours picked for today have already passed.' };
    }
    if (attempted && (missing.date || missing.from || missing.to)) {
      return { ...missing, message: he ? 'יש לבחור תאריך, שעת התחלה ושעת סיום.' : 'Choose a date, a start time and an end time.' };
    }
    return null;
  };
  const issues = rows.map(issueOf);
  const incomplete = rows.some((r) => !r.date || !r.from || !r.to);
  const badRows = issues.flatMap((x, i) => (x ? [i + 1] : []));

  const submit = async () => {
    setAttempted(true);
    if (incomplete || rows.some((r, i) => issueOf(r, i))) {
      const nums = rows.flatMap((r, i) => (!r.date || !r.from || !r.to || issueOf(r, i) ? [i + 1] : [])).join(', ');
      setError(he ? `יש לתקן את השורות המסומנות באדום (${nums}).` : `Fix the rows marked in red (${nums}).`);
      return;
    }
    setBusy(true);
    setError('');
    try {
      await onSubmit([...rows].sort((a, b) => a.date.localeCompare(b.date)));
      setSaved(true);
      setAttempted(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : he ? 'השמירה נכשלה' : 'Saving failed');
    } finally {
      setBusy(false);
    }
  };

  // Only daytime quarter hours can be chosen ("from" can't be the last one,
  // "to" can't be the first). A saved value outside the list is still shown
  // so its row's red message makes sense.
  const timeOptions = (value: string, kind: 'from' | 'to', date: string) => {
    // On a Friday the list stops at 15:30 (winter) / 16:30 (summer).
    const end = latestEndFor(date);
    const list = EXAM_TIMES.filter((t) => (kind === 'from' ? t < end : t > EXAM_DAY_START && t <= end));
    const all = value && !list.includes(value) ? [value, ...list] : list;
    return [
      <option key="" value="">--:--</option>,
      ...all.map((t) => <option key={t} value={t}>{t}</option>),
    ];
  };

  const field = (bad: boolean) =>
    `rounded-md border px-2 py-1 text-sm ${bad ? 'border-danger bg-surface ring-2 ring-danger' : 'border-line bg-surface'}`;

  return (
    <div className="mt-3 rounded-lg border border-line bg-paper p-3">
      <p className="text-xs text-muted">
        {he
          ? `בחר/י ${count} תאריכים בין ${formatExamDay(min, 'he', { day: 'numeric', month: 'numeric' })} ל-${formatExamDay(window.end, 'he', { day: 'numeric', month: 'numeric' })}, ובכל תאריך את השעות שבהן את/ה פנוי/ה (${EXAM_DAY_START}–${EXAM_DAY_END}, בשישי עד כניסת השבת, ללא שבת). המערכת תקבע את המועד המשותף לכולם.`
          : `Pick ${count} dates between ${formatExamDay(min, 'en', { day: 'numeric', month: 'numeric' })} and ${formatExamDay(window.end, 'en', { day: 'numeric', month: 'numeric' })}, and the hours you're free on each (${EXAM_DAY_START}–${EXAM_DAY_END}, Fridays until Shabbat comes in, no Saturdays). The system sets the time everyone shares.`}
      </p>
      <div className="mt-2 grid gap-2">
        {rows.map((r, i) => {
          const issue = issues[i];
          return (
            <div key={i} className={`rounded-md px-1.5 py-1 ${issue ? 'bg-danger-bg outline outline-1 outline-danger' : ''}`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`w-5 text-xs font-semibold ${issue ? 'text-danger' : 'text-muted'}`}>{i + 1}.</span>
                <label className="sr-only" htmlFor={`exam-date-${i}`}>{he ? `תאריך ${i + 1}` : `Date ${i + 1}`}</label>
                <select id={`exam-date-${i}`} value={r.date} onChange={(e) => update(i, 'date', e.target.value)} aria-invalid={!!issue?.date} aria-describedby={issue ? `exam-row-err-${i}` : undefined} className={field(!!issue?.date)}>
                  <option value="">{he ? 'בחירת תאריך' : 'Choose a date'}</option>
                  {allowedDays.map((d) => (
                    // A day already used in another row can't be chosen twice.
                    <option key={d} value={d} disabled={d !== r.date && rows.some((o) => o.date === d)}>
                      {formatExamDay(d, lang, { weekday: 'short', day: 'numeric', month: 'numeric', year: 'numeric' })}
                    </option>
                  ))}
                </select>
                <label className="text-xs text-muted" htmlFor={`exam-from-${i}`}>{he ? 'משעה' : 'From'}</label>
                <select id={`exam-from-${i}`} value={r.from} onChange={(e) => update(i, 'from', e.target.value)} aria-invalid={!!issue?.from} aria-describedby={issue ? `exam-row-err-${i}` : undefined} className={field(!!issue?.from)}>
                  {timeOptions(r.from, 'from', r.date)}
                </select>
                <label className="text-xs text-muted" htmlFor={`exam-to-${i}`}>{he ? 'עד שעה' : 'To'}</label>
                <select id={`exam-to-${i}`} value={r.to} onChange={(e) => update(i, 'to', e.target.value)} aria-invalid={!!issue?.to} aria-describedby={issue ? `exam-row-err-${i}` : undefined} className={field(!!issue?.to)}>
                  {timeOptions(r.to, 'to', r.date)}
                </select>
              </div>
              {issue && <p id={`exam-row-err-${i}`} className="mt-1 ps-7 text-xs text-danger">⚠ {issue.message}</p>}
            </div>
          );
        })}
      </div>
      {error && <p className="mt-2 text-xs text-danger" role="alert">{error}</p>}
      {!error && badRows.length > 0 && (
        <p className="mt-2 text-xs text-danger" role="status">{he ? `יש לתקן את השורות המסומנות באדום (${badRows.join(', ')}).` : `Fix the rows marked in red (${badRows.join(', ')}).`}</p>
      )}
      {saved && !error && <p className="mt-2 text-xs text-success" role="status">{he ? '✓ התאריכים נשמרו. ניתן לעדכן עד שכולם יבחרו.' : '✓ Dates saved. You can update them until everyone has picked.'}</p>}
      <button type="button" onClick={submit} disabled={busy} className="mt-3 rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-primary-ink hover:bg-primary-hover disabled:opacity-60">
        {busy ? '…' : initial ? (he ? 'עדכון התאריכים' : 'Update my dates') : (he ? 'שליחת התאריכים' : 'Submit my dates')}
      </button>
    </div>
  );
}
