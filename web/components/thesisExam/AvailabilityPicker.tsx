'use client';

// components/thesisExam/AvailabilityPicker.tsx
// One participant's picks for the CS thesis exam (server's
// services/thesisExam.ts): exactly N dates inside the round's window, each
// with the hours they're free. Used on /thesis-exam and on the outside
// examiner's access page — the data source is passed in.

import { useState } from 'react';
import type { ThesisExamAvailabilityEntry } from '@/lib/apiClient';
import { formatExamDay } from '@/lib/thesisExam';

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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
  const min = todayIso() > window.start ? todayIso() : window.start;
  const [rows, setRows] = useState<ThesisExamAvailabilityEntry[]>(() =>
    initial && initial.length === count ? initial.map((e) => ({ ...e })) : Array.from({ length: count }, () => ({ date: '', from: '', to: '' })),
  );
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
            <input id={`exam-date-${i}`} type="date" min={min} max={window.end} value={r.date} onChange={(e) => update(i, 'date', e.target.value)} className="rounded-md border border-line bg-surface px-2 py-1 text-sm" />
            <label className="text-xs text-muted" htmlFor={`exam-from-${i}`}>{he ? 'משעה' : 'From'}</label>
            <input id={`exam-from-${i}`} type="time" step={900} value={r.from} onChange={(e) => update(i, 'from', e.target.value)} className="rounded-md border border-line bg-surface px-2 py-1 text-sm" />
            <label className="text-xs text-muted" htmlFor={`exam-to-${i}`}>{he ? 'עד שעה' : 'To'}</label>
            <input id={`exam-to-${i}`} type="time" step={900} value={r.to} onChange={(e) => update(i, 'to', e.target.value)} className="rounded-md border border-line bg-surface px-2 py-1 text-sm" />
            {r.date && <span className="text-xs text-muted">{formatExamDay(r.date, lang, { weekday: 'short' })}</span>}
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
