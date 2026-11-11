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

function daysBetween(start: string, end: string): string[] {
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
  const allowedDays = daysBetween(min, window.end);
  const [rows, setRows] = useState<ThesisExamAvailabilityEntry[]>(() => {
    const blank = { date: '', from: '', to: '' };
    if (!initial || initial.length !== count) return Array.from({ length: count }, () => ({ ...blank }));
    // A saved pick whose day has since passed is cleared, not kept.
    return initial.map((e) => (e.date >= min && e.date <= window.end ? { ...e } : { ...blank }));
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const update = (i: number, field: keyof ThesisExamAvailabilityEntry, value: string) => {
    setSaved(false);
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)));
  };

  const problem = (() => {
    if (rows.some((r) => !r.date || !r.from || !r.to)) return he ? `יש למלא ${count} תאריכים, ובכל אחד שעת התחלה וסיום.` : `Fill in ${count} dates, each with a start and end time.`;
    if (new Set(rows.map((r) => r.date)).size !== rows.length) return he ? 'כל תאריך יכול להופיע פעם אחת בלבד.' : 'Each date may appear only once.';
    if (rows.some((r) => r.date < min || r.date > window.end)) return he ? 'אחד התאריכים מחוץ לטווח המותר.' : 'One of the dates is outside the allowed range.';
    if (rows.some((r) => r.to <= r.from)) return he ? 'שעת הסיום חייבת להיות אחרי שעת ההתחלה.' : 'The end time must be after the start time.';
    if (rows.some((r) => r.date === now.date && r.to <= now.time)) return he ? 'השעות שנבחרו להיום כבר עברו.' : 'The hours picked for today have already passed.';
    return '';
  })();

  const submit = async () => {
    if (problem) { setError(problem); return; }
    setBusy(true);
    setError('');
    try {
      await onSubmit([...rows].sort((a, b) => a.date.localeCompare(b.date)));
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : he ? 'השמירה נכשלה' : 'Saving failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 rounded-lg border border-line bg-paper p-3">
      <p className="text-xs text-muted">
        {he
          ? `בחר/י ${count} תאריכים בין ${formatExamDay(min, 'he', { day: 'numeric', month: 'numeric' })} ל-${formatExamDay(window.end, 'he', { day: 'numeric', month: 'numeric' })}, ובכל תאריך את השעות שבהן את/ה פנוי/ה. המערכת תקבע את המועד המשותף לכולם.`
          : `Pick ${count} dates between ${formatExamDay(min, 'en', { day: 'numeric', month: 'numeric' })} and ${formatExamDay(window.end, 'en', { day: 'numeric', month: 'numeric' })}, and the hours you're free on each. The system sets the time everyone shares.`}
      </p>
      <div className="mt-2 grid gap-2">
        {rows.map((r, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <span className="w-5 text-xs font-semibold text-muted">{i + 1}.</span>
            <label className="sr-only" htmlFor={`exam-date-${i}`}>{he ? `תאריך ${i + 1}` : `Date ${i + 1}`}</label>
            <select id={`exam-date-${i}`} value={r.date} onChange={(e) => update(i, 'date', e.target.value)} className="rounded-md border border-line bg-surface px-2 py-1 text-sm">
              <option value="">{he ? 'בחירת תאריך' : 'Choose a date'}</option>
              {allowedDays.map((d) => (
                // A day already used in another row can't be chosen twice.
                <option key={d} value={d} disabled={d !== r.date && rows.some((o) => o.date === d)}>
                  {formatExamDay(d, lang, { weekday: 'short', day: 'numeric', month: 'numeric', year: 'numeric' })}
                </option>
              ))}
            </select>
            <label className="text-xs text-muted" htmlFor={`exam-from-${i}`}>{he ? 'משעה' : 'From'}</label>
            <input id={`exam-from-${i}`} type="time" step={900} value={r.from} onChange={(e) => update(i, 'from', e.target.value)} className="rounded-md border border-line bg-surface px-2 py-1 text-sm" />
            <label className="text-xs text-muted" htmlFor={`exam-to-${i}`}>{he ? 'עד שעה' : 'To'}</label>
            <input id={`exam-to-${i}`} type="time" step={900} value={r.to} onChange={(e) => update(i, 'to', e.target.value)} className="rounded-md border border-line bg-surface px-2 py-1 text-sm" />
          </div>
        ))}
      </div>
      {error && <p className="mt-2 text-xs text-danger" role="alert">{error}</p>}
      {saved && !error && <p className="mt-2 text-xs text-success" role="status">{he ? '✓ התאריכים נשמרו. ניתן לעדכן עד שכולם יבחרו.' : '✓ Dates saved. You can update them until everyone has picked.'}</p>}
      <button type="button" onClick={submit} disabled={busy} className="mt-3 rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-primary-ink hover:bg-primary-hover disabled:opacity-60">
        {busy ? '…' : initial ? (he ? 'עדכון התאריכים' : 'Update my dates') : (he ? 'שליחת התאריכים' : 'Submit my dates')}
      </button>
    </div>
  );
}
