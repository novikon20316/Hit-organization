'use client';

// app/administrative_coordinator/dashboard/SeminarsTab.tsx
// The seminar calendar — see server/src/services/seminarScheduling.ts. A
// seminar reaches her once the supervisor approves it: she books a date, and
// once its booked time passes records whether the student gave the talk. Performed
// closes the milestone; not performed sends her straight back to booking a
// new date. Defenses in the same scope sit on the calendar in their own
// colour, so a clash is visible before she books.

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useModalA11y } from '@/hooks/useModalA11y';
import { useLiveRefresh } from '@/hooks/useLiveRefresh';
import { useDefenseScheduleLiveRefresh } from '@/hooks/useDefenseScheduleLiveRefresh';
import { Select } from '@/components/ui/Select';
import { apiClient, type SeminarCalendarDefense, type SeminarRow } from '@/lib/apiClient';
import { DEFENSE_CALENDAR_COLOR, SEMINAR_COLOR, formatSeminarDay, seminarHasStarted } from '@/lib/seminar';

const inputCls = 'w-full rounded-lg border border-administrative-coordinator-outline-variant bg-administrative-coordinator-surface-container-low px-3 py-2 text-sm text-administrative-coordinator-on-surface focus:border-administrative-coordinator-primary focus:bg-administrative-coordinator-surface-container-lowest focus:outline-none';

interface CalendarEntry {
  key: string;
  label: string;
  title: string;
  color: string;
  faded: boolean;
  seminar?: SeminarRow;
}

const pad = (n: number) => String(n).padStart(2, '0');
const dayKey = (year: number, month: number, day: number) => `${year}-${pad(month + 1)}-${pad(day)}`;

export function SeminarsTab() {
  const { lang } = useLanguage();
  const [seminars, setSeminars] = useState<SeminarRow[]>([]);
  const [defenses, setDefenses] = useState<SeminarCalendarDefense[]>([]);
  const [today, setToday] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dateTarget, setDateTarget] = useState<{ seminar: SeminarRow | null; date: string } | null>(null);
  // choice null = the dialog asks; true/false = the card's own button was pressed.
  const [outcomeTarget, setOutcomeTarget] = useState<{ seminar: SeminarRow; choice: boolean | null } | null>(null);
  // Ticks so a talk booked for later today unlocks its buttons once it starts.
  const [now, setNow] = useState(() => Date.now());
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d;
  });

  const fetchSeminars = useCallback(async () => {
    try {
      const res = await apiClient.getSeminars();
      setSeminars(res.seminars);
      setDefenses(res.defenses);
      setToday(res.today);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : lang === 'he' ? 'לא ניתן לטעון נתונים' : 'Could not load data');
    } finally {
      setLoading(false);
    }
  }, [lang]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; setState happens after the awaited call resolves
    fetchSeminars();
  }, [fetchSeminars]);
  useLiveRefresh(fetchSeminars);
  useDefenseScheduleLiveRefresh(fetchSeminars);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const awaiting = useMemo(() => seminars.filter((s) => s.status === 'seminar_awaiting_date'), [seminars]);
  const scheduled = useMemo(
    () => seminars.filter((s) => s.status === 'seminar_scheduled' && s.schedule).sort((a, b) => a.schedule!.date.localeCompare(b.schedule!.date)),
    [seminars]
  );
  const dueForOutcome = scheduled.filter((s) => s.schedule!.date <= today);
  const upcoming = scheduled.filter((s) => s.schedule!.date > today);

  const entriesByDay = useMemo(() => {
    const map = new Map<string, CalendarEntry[]>();
    const add = (date: string, entry: CalendarEntry) => {
      if (!map.has(date)) map.set(date, []);
      map.get(date)!.push(entry);
    };
    for (const s of seminars) {
      const name = s.students.map((st) => st.name).join(', ');
      if (s.schedule) {
        add(s.schedule.date, { key: s.milestoneId, label: `${s.schedule.time} ${name}`, title: `${name} — ${lang === 'he' ? s.projectTitleHe : s.projectTitleEn}`, color: SEMINAR_COLOR, faded: false, seminar: s });
      }
      s.attempts.forEach((a, i) => {
        add(a.date, {
          key: `${s.milestoneId}-${i}`,
          label: `${a.outcome === 'performed' ? '✓' : '✗'} ${name}`,
          title: `${name} — ${a.outcome === 'performed' ? (lang === 'he' ? 'בוצע' : 'Performed') : lang === 'he' ? 'לא בוצע' : 'Not performed'}`,
          color: SEMINAR_COLOR,
          faded: true,
        });
      });
    }
    for (const d of defenses) {
      const title = lang === 'he' ? d.projectTitleHe : d.projectTitleEn;
      add(d.date, { key: d.milestoneId, label: `${d.time ? `${d.time} ` : ''}${title}`, title, color: DEFENSE_CALENDAR_COLOR, faded: false });
    }
    return map;
  }, [seminars, defenses, lang]);

  const openSeminarEntry = (s: SeminarRow) => {
    if (seminarHasStarted(s.schedule, now)) setOutcomeTarget({ seminar: s, choice: null });
    else setDateTarget({ seminar: s, date: s.schedule?.date ?? '' });
  };

  if (loading) {
    return <p className="text-sm text-administrative-coordinator-on-surface-variant">{lang === 'he' ? 'טוען...' : 'Loading...'}</p>;
  }

  const year = calendarMonth.getFullYear();
  const month = calendarMonth.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstWeekday = new Date(year, month, 1).getDay();
  const cellCount = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;
  const monthLabel = calendarMonth.toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-US', { month: 'long', year: 'numeric' });
  const weekdayLabels = Array.from({ length: 7 }, (_, i) =>
    new Date(2024, 0, 7 + i).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-US', { weekday: 'short' })
  );
  const monthButton = 'rounded-administrative-coordinator border border-administrative-coordinator-outline-variant px-2 py-1 text-xs text-administrative-coordinator-on-surface-variant hover:bg-administrative-coordinator-surface-container-lowest';

  return (
    <div className="grid gap-5">
      <p className="text-xs text-administrative-coordinator-on-surface-variant">
        {lang === 'he'
          ? 'סמינרים שהמנחה אישר/ה. יש לקבוע מועד (לחיצה על יום בלוח או על "קביעת מועד"), ואחרי שעת הסמינר לסמן "הסמינר בוצע" או "הסמינר לא בוצע". אם לא בוצע — יש לקבוע מועד חדש.'
          : "Seminars the supervisor approved. Set a date (click a day on the calendar, or \"Set date\"), then once the seminar's time has passed record \"Performed\" or \"Not performed\". If not performed, set a new date."}
      </p>

      {error && <p className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">{error}</p>}

      <div className="overflow-hidden rounded-administrative-coordinator-lg border border-administrative-coordinator-outline-variant bg-administrative-coordinator-surface-container-lowest">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-administrative-coordinator-outline-variant bg-administrative-coordinator-surface-container-low px-4 py-2.5">
          <h3 className="text-sm font-bold text-administrative-coordinator-on-surface">{monthLabel}</h3>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1 text-xs text-administrative-coordinator-on-surface-variant">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: SEMINAR_COLOR }} />
              {lang === 'he' ? 'סמינר' : 'Seminar'}
            </span>
            <span className="flex items-center gap-1 text-xs text-administrative-coordinator-on-surface-variant">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: DEFENSE_CALENDAR_COLOR }} />
              {lang === 'he' ? 'הגנה' : 'Defense'}
            </span>
            <div className="flex gap-1">
              <button type="button" onClick={() => setCalendarMonth(new Date(year, month - 1, 1))} className={monthButton}>‹</button>
              <button type="button" onClick={() => setCalendarMonth(new Date())} className={monthButton}>{lang === 'he' ? 'היום' : 'Today'}</button>
              <button type="button" onClick={() => setCalendarMonth(new Date(year, month + 1, 1))} className={monthButton}>›</button>
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <div className="min-w-[640px]">
            <div className="grid grid-cols-7 border-b border-administrative-coordinator-outline-variant bg-administrative-coordinator-surface-container-low">
              {weekdayLabels.map((wd) => (
                <div key={wd} className="border-e border-administrative-coordinator-outline-variant py-1.5 text-center text-[10px] font-semibold uppercase tracking-wide text-administrative-coordinator-on-surface-variant last:border-e-0">
                  {wd}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-px bg-administrative-coordinator-outline-variant">
              {Array.from({ length: cellCount }, (_, i) => {
                const dayNum = i - firstWeekday + 1;
                const inMonth = dayNum >= 1 && dayNum <= daysInMonth;
                const key = inMonth ? dayKey(year, month, dayNum) : '';
                const entries = inMonth ? (entriesByDay.get(key) ?? []) : [];
                const bookable = inMonth && key >= today && awaiting.length > 0;
                return (
                  <div
                    key={i}
                    className={`min-h-[86px] p-1.5 ${inMonth ? 'bg-administrative-coordinator-surface-container-lowest' : 'bg-administrative-coordinator-surface-container-low'}`}
                  >
                    {inMonth && (
                      <button
                        type="button"
                        disabled={!bookable}
                        onClick={() => setDateTarget({ seminar: awaiting.length === 1 ? awaiting[0]! : null, date: key })}
                        aria-label={lang === 'he' ? `קביעת סמינר ל-${formatSeminarDay(key, lang)}` : `Set a seminar on ${formatSeminarDay(key, lang)}`}
                        className={`rounded px-1 text-xs ${key === today ? 'font-bold text-administrative-coordinator-primary' : 'text-administrative-coordinator-on-surface-variant'} ${bookable ? 'hover:bg-administrative-coordinator-surface-container-low' : 'cursor-default'}`}
                      >
                        {dayNum}
                      </button>
                    )}
                    <div className="mt-1 grid gap-1">
                      {entries.map((e) => (
                        <button
                          key={e.key}
                          type="button"
                          disabled={!e.seminar}
                          onClick={() => e.seminar && openSeminarEntry(e.seminar)}
                          title={e.title}
                          className="truncate rounded px-1 py-0.5 text-start text-[10px] leading-tight text-white disabled:cursor-default"
                          style={{ backgroundColor: e.color, opacity: e.faded ? 0.55 : 1 }}
                        >
                          {e.label}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <SeminarSection title={lang === 'he' ? 'יש לאשר אם הסמינר בוצע' : 'Confirm whether the seminar took place'} seminars={dueForOutcome}>
        {(s) => {
          const started = seminarHasStarted(s.schedule, now);
          return (
            <div className="grid gap-2">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={!started}
                  onClick={() => setOutcomeTarget({ seminar: s, choice: true })}
                  className="rounded-lg bg-success px-3 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  ✅ {lang === 'he' ? 'הסמינר בוצע' : 'Performed'}
                </button>
                <button
                  type="button"
                  disabled={!started}
                  onClick={() => setOutcomeTarget({ seminar: s, choice: false })}
                  className="rounded-lg bg-danger px-3 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  ✗ {lang === 'he' ? 'הסמינר לא בוצע' : 'Not performed'}
                </button>
                {!started && (
                  <button
                    type="button"
                    onClick={() => setDateTarget({ seminar: s, date: s.schedule!.date })}
                    className="rounded-lg border border-administrative-coordinator-outline-variant px-3 py-2 text-xs font-semibold text-administrative-coordinator-on-surface hover:border-administrative-coordinator-primary"
                  >
                    ✏️ {lang === 'he' ? 'שינוי מועד' : 'Change date'}
                  </button>
                )}
              </div>
              {!started && (
                <p className="text-xs text-administrative-coordinator-on-surface-variant">
                  🕐 {lang === 'he' ? `ניתן לסמן החל מהשעה ${s.schedule!.time}` : `Can be recorded from ${s.schedule!.time}`}
                </p>
              )}
            </div>
          );
        }}
      </SeminarSection>

      <SeminarSection title={lang === 'he' ? 'ממתינים לקביעת מועד' : 'Waiting for a date'} seminars={awaiting}>
        {(s) => (
          <button type="button" onClick={() => setDateTarget({ seminar: s, date: '' })} className="rounded-lg px-3 py-2 text-xs font-semibold text-white hover:opacity-90" style={{ backgroundColor: SEMINAR_COLOR }}>
            📅 {lang === 'he' ? 'קביעת מועד' : 'Set date'}
          </button>
        )}
      </SeminarSection>

      <SeminarSection title={lang === 'he' ? 'מועדים שנקבעו' : 'Scheduled'} seminars={upcoming}>
        {(s) => (
          <button
            type="button"
            onClick={() => setDateTarget({ seminar: s, date: s.schedule!.date })}
            className="rounded-lg border border-administrative-coordinator-outline-variant px-3 py-2 text-xs font-semibold text-administrative-coordinator-on-surface hover:border-administrative-coordinator-primary"
          >
            ✏️ {lang === 'he' ? 'שינוי מועד' : 'Change date'}
          </button>
        )}
      </SeminarSection>

      {seminars.filter((s) => s.status === 'seminar_awaiting_date' || s.status === 'seminar_scheduled').length === 0 && (
        <p className="text-sm text-administrative-coordinator-on-surface-variant">
          ✅ {lang === 'he' ? 'אין סמינרים הממתינים לטיפול' : 'No seminars need attention'}
        </p>
      )}

      {dateTarget && (
        <SeminarDateModal
          seminar={dateTarget.seminar}
          options={awaiting}
          initialDate={dateTarget.date}
          today={today}
          onClose={() => setDateTarget(null)}
          onSaved={fetchSeminars}
        />
      )}
      {outcomeTarget && (
        <SeminarOutcomeModal
          seminar={outcomeTarget.seminar}
          choice={outcomeTarget.choice}
          onClose={() => setOutcomeTarget(null)}
          onSaved={async (performed) => {
            const seminar = outcomeTarget.seminar;
            setOutcomeTarget(null);
            await fetchSeminars();
            // Not performed means a new date is mandatory — go straight to it.
            if (!performed) setDateTarget({ seminar: { ...seminar, status: 'seminar_awaiting_date', schedule: null }, date: '' });
          }}
        />
      )}
    </div>
  );
}

function SeminarSection({ title, seminars, children }: { title: string; seminars: SeminarRow[]; children: (s: SeminarRow) => React.ReactNode }) {
  if (seminars.length === 0) return null;
  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold text-administrative-coordinator-on-surface">{title} ({seminars.length})</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        {seminars.map((s) => (
          <SeminarCard key={s.milestoneId} seminar={s} action={children(s)} />
        ))}
      </div>
    </section>
  );
}

function SeminarCard({ seminar: s, action }: { seminar: SeminarRow; action: React.ReactNode }) {
  const { lang } = useLanguage();
  const missed = s.attempts.filter((a) => a.outcome === 'not_performed');
  return (
    <div
      className="rounded-administrative-coordinator-lg border-s-4 border border-administrative-coordinator-outline-variant bg-administrative-coordinator-surface-container-lowest p-4"
      style={{ borderInlineStartColor: SEMINAR_COLOR }}
    >
      <p className="text-sm font-semibold text-administrative-coordinator-on-surface">{lang === 'he' ? s.projectTitleHe : s.projectTitleEn}</p>
      <p className="mt-1 text-xs text-administrative-coordinator-on-surface-variant">
        👤{' '}
        {s.students.map((st, i) => (
          <span key={st.id}>
            {i > 0 && ', '}
            <Link href={`/administrative_coordinator/dashboard/students/${st.id}`} className="hover:underline">{st.name}</Link>
          </span>
        ))}
        {s.supervisorName ? ` · 👨‍🏫 ${s.supervisorName}` : ''}
      </p>
      {s.schedule && (
        <p className="mt-1.5 text-xs font-semibold" style={{ color: SEMINAR_COLOR }}>
          📅 {formatSeminarDay(s.schedule.date, lang)} · 🕐 {s.schedule.time}
          {s.schedule.location ? ` · 🏫 ${s.schedule.location}` : ''}
        </p>
      )}
      {missed.length > 0 && (
        <p className="mt-1 text-xs text-danger">
          ✗ {lang === 'he' ? 'לא בוצע במועד:' : 'Not performed on:'}{' '}
          {missed.map((a) => formatSeminarDay(a.date, lang, { day: 'numeric', month: 'numeric', year: '2-digit' })).join(', ')}
        </p>
      )}
      {s.contactRequests.map((r) => (
        <div key={r.id} className="mt-2 rounded-lg bg-administrative-coordinator-surface-container-low p-2.5">
          <p className="text-xs font-semibold text-administrative-coordinator-on-surface">✉️ {r.studentName}</p>
          <p className="mt-0.5 whitespace-pre-wrap text-xs text-administrative-coordinator-on-surface-variant">{r.message}</p>
        </div>
      ))}
      <div className="mt-3">{action}</div>
    </div>
  );
}

function SeminarDateModal({
  seminar,
  options,
  initialDate,
  today,
  onClose,
  onSaved,
}: {
  seminar: SeminarRow | null;
  options: SeminarRow[];
  initialDate: string;
  today: string;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const { lang } = useLanguage();
  const modalRef = useRef<HTMLDivElement>(null);
  useModalA11y(modalRef, true, onClose);
  const [pickedId, setPickedId] = useState('');
  const [date, setDate] = useState(initialDate);
  const [time, setTime] = useState(seminar?.schedule?.time ?? '');
  const [location, setLocation] = useState(seminar?.schedule?.location ?? '');
  const [note, setNote] = useState(seminar?.schedule?.note ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const target = seminar ?? options.find((o) => o.milestoneId === pickedId) ?? null;
  const isChange = !!seminar?.schedule;

  const save = async () => {
    if (!target || !date || !time) {
      setError(lang === 'he' ? 'יש לבחור סמינר, תאריך ושעה' : 'Please pick a seminar, a date and a time');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await apiClient.scheduleSeminar(target.milestoneId, { date, time, location, note });
      await onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : lang === 'he' ? 'השמירה נכשלה' : 'Failed to save');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center-safe justify-center overflow-y-auto bg-black/40 p-4">
      <div
        ref={modalRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-administrative-coordinator-lg bg-administrative-coordinator-surface-container-lowest p-6 text-administrative-coordinator-on-surface shadow-lg outline-none"
      >
        <div className="flex items-start justify-between">
          <h2 className="text-lg font-semibold">📅 {isChange ? (lang === 'he' ? 'שינוי מועד סמינר' : 'Change seminar date') : lang === 'he' ? 'קביעת מועד סמינר' : 'Set seminar date'}</h2>
          <button type="button" onClick={onClose} aria-label={lang === 'he' ? 'סגור' : 'Close'} className="text-administrative-coordinator-on-surface-variant hover:text-administrative-coordinator-on-surface">✕</button>
        </div>

        {seminar ? (
          <div className="mt-3 rounded-lg bg-administrative-coordinator-surface-container-low p-3">
            <p className="text-sm font-semibold">{lang === 'he' ? seminar.projectTitleHe : seminar.projectTitleEn}</p>
            <p className="mt-0.5 text-xs text-administrative-coordinator-on-surface-variant">👤 {seminar.students.map((s) => s.name).join(', ')}</p>
          </div>
        ) : (
          <label className="mt-3 block">
            <span className="mb-1.5 block text-sm font-medium">{lang === 'he' ? 'סטודנט/ית' : 'Student'}</span>
            <Select value={pickedId} onChange={(e) => setPickedId(e.target.value)} className={inputCls}>
              <option value="">{lang === 'he' ? 'בחירת סמינר' : 'Select a seminar'}</option>
              {options.map((o) => (
                <option key={o.milestoneId} value={o.milestoneId}>
                  {o.students.map((s) => s.name).join(', ')} — {lang === 'he' ? o.projectTitleHe : o.projectTitleEn}
                </option>
              ))}
            </Select>
          </label>
        )}

        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">{lang === 'he' ? 'תאריך' : 'Date'}</span>
            <input type="date" min={today} value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">{lang === 'he' ? 'שעה' : 'Time'}</span>
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={inputCls} />
          </label>
        </div>
        <label className="mt-3 block">
          <span className="mb-1.5 block text-sm font-medium">{lang === 'he' ? 'מיקום (לא חובה)' : 'Location (optional)'}</span>
          <input value={location} maxLength={200} onChange={(e) => setLocation(e.target.value)} className={inputCls} />
        </label>
        <label className="mt-3 block">
          <span className="mb-1.5 block text-sm font-medium">{lang === 'he' ? 'הערה לסטודנט/ית (לא חובה)' : 'Note to the student (optional)'}</span>
          <textarea rows={2} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} className={inputCls} />
        </label>

        <p className="mt-3 text-xs text-administrative-coordinator-on-surface-variant">
          {lang === 'he' ? 'הסטודנט/ית והמנחה יקבלו הודעה ודוא"ל עם המועד.' : 'The student and supervisor will get a notification and an email with the date.'}
        </p>
        {error && <p className="mt-2 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">{error}</p>}

        <button
          type="button"
          disabled={saving}
          onClick={save}
          className="mt-4 w-full rounded-lg py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
          style={{ backgroundColor: SEMINAR_COLOR }}
        >
          {saving ? '…' : lang === 'he' ? 'שמירה ושליחה לסטודנט/ית' : 'Save and notify the student'}
        </button>
      </div>
    </div>
  );
}

function SeminarOutcomeModal({
  seminar,
  choice,
  onClose,
  onSaved,
}: {
  seminar: SeminarRow;
  choice: boolean | null;
  onClose: () => void;
  onSaved: (performed: boolean) => Promise<void> | void;
}) {
  const { lang } = useLanguage();
  const modalRef = useRef<HTMLDivElement>(null);
  useModalA11y(modalRef, true, onClose);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async (performed: boolean) => {
    setSaving(true);
    setError('');
    try {
      await apiClient.recordSeminarOutcome(seminar.milestoneId, { performed, note });
      await onSaved(performed);
    } catch (err) {
      setError(err instanceof Error ? err.message : lang === 'he' ? 'השמירה נכשלה' : 'Failed to save');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center-safe justify-center overflow-y-auto bg-black/40 p-4">
      <div
        ref={modalRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-administrative-coordinator-lg bg-administrative-coordinator-surface-container-lowest p-6 text-administrative-coordinator-on-surface shadow-lg outline-none"
      >
        <div className="flex items-start justify-between">
          <h2 className="text-lg font-semibold">
            {choice === true
              ? lang === 'he' ? 'אישור: הסמינר בוצע' : 'Confirm: seminar performed'
              : choice === false
                ? lang === 'he' ? 'אישור: הסמינר לא בוצע' : 'Confirm: seminar not performed'
                : lang === 'he' ? 'האם הסמינר התקיים?' : 'Did the seminar take place?'}
          </h2>
          <button type="button" onClick={onClose} aria-label={lang === 'he' ? 'סגור' : 'Close'} className="text-administrative-coordinator-on-surface-variant hover:text-administrative-coordinator-on-surface">✕</button>
        </div>
        <div className="mt-3 rounded-lg bg-administrative-coordinator-surface-container-low p-3">
          <p className="text-sm font-semibold">{seminar.students.map((s) => s.name).join(', ')}</p>
          {seminar.schedule && (
            <p className="mt-0.5 text-xs text-administrative-coordinator-on-surface-variant">
              📅 {formatSeminarDay(seminar.schedule.date, lang)} · 🕐 {seminar.schedule.time}
            </p>
          )}
        </div>
        <label className="mt-3 block">
          <span className="mb-1.5 block text-sm font-medium">{lang === 'he' ? 'הערה (לא חובה)' : 'Note (optional)'}</span>
          <textarea rows={2} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} className={inputCls} />
        </label>
        {error && <p className="mt-2 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">{error}</p>}
        <div className="mt-4 grid grid-cols-2 gap-2">
          {choice !== false && (
            <button type="button" disabled={saving} onClick={() => save(true)} className="rounded-lg bg-success py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60">
              ✅ {lang === 'he' ? 'בוצע' : 'Performed'}
            </button>
          )}
          {choice !== true && (
            <button type="button" disabled={saving} onClick={() => save(false)} className="rounded-lg bg-danger py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60">
              ✗ {lang === 'he' ? 'לא בוצע' : 'Not performed'}
            </button>
          )}
          {choice !== null && (
            <button
              type="button"
              disabled={saving}
              onClick={onClose}
              className="rounded-lg border border-administrative-coordinator-outline-variant py-2.5 text-sm font-semibold text-administrative-coordinator-on-surface hover:border-administrative-coordinator-primary disabled:opacity-60"
            >
              {lang === 'he' ? 'ביטול' : 'Cancel'}
            </button>
          )}
        </div>
        <p className="mt-3 text-xs text-administrative-coordinator-on-surface-variant">
          {lang === 'he'
            ? '"בוצע" מסיים את אבן הדרך והסטודנט/ית ממשיך/ה לשלב הבא. "לא בוצע" מחייב קביעת מועד חדש.'
            : '"Performed" finishes the milestone and the student moves on. "Not performed" requires setting a new date.'}
        </p>
      </div>
    </div>
  );
}
