'use client';

// components/students/UngradedCsMastersTab.tsx
// "סטודנטים ללא ציון ממוצע" (Students without a grade average) — shared by
// the grad_school_head and administrative_coordinator (administrative_secretary)
// dashboards. Narrower and purpose-built compared to StudentsListTab: shows
// ONLY computer_science masters students (the only program where a grade
// average even means anything — see server/src/config/studentTrack.ts's
// MASTERS_TRACK_POLICY) who have never had an average entered, with a search
// bar that filters that list client-side as you type, and an inline
// grade-average field per row.
//
// One-time by business rule: the instant a student's average is saved, they
// leave this list for good (server/src/services/studentTrack.ts's
// setThesisEligibilityFromAverage never lets a second average overwrite the
// first). Two staff members entering the same student's grade at nearly the
// same moment is handled server-side via a Firestore transaction — the
// loser of that race gets back a 409/ALREADY_GRADED response instead of
// silently clobbering the winner's value, which this component turns into a
// plain-language notice instead of a thrown error, and removes the row same
// as a successful save would.

import { useEffect, useMemo, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient, ApiError } from '@/lib/apiClient';

type StudentRecord = Awaited<ReturnType<typeof apiClient.getStudentsList>>['students'][number];

function errorText(err: unknown, lang: 'he' | 'en', fallback: string): string {
  if (err instanceof ApiError) {
    const body = err.body as { messageHe?: string; messageEn?: string } | undefined;
    const localized = lang === 'he' ? body?.messageHe : body?.messageEn;
    if (localized) return localized;
  }
  return err instanceof Error ? err.message : fallback;
}

export function UngradedCsMastersTab() {
  const { lang } = useLanguage();
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [averageInputs, setAverageInputs] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<{ text: string; tone: 'conflict' | 'success' } | null>(null);

  const load = () => {
    setLoading(true);
    setLoadError('');
    apiClient
      .getStudentsList()
      .then((res) => setStudents(res.students ?? []))
      .catch((err) => setLoadError(errorText(err, lang, lang === 'he' ? 'טעינת רשימת הסטודנטים נכשלה' : 'Failed to load students list')))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The one hard-coded scope rule for this tab: computer_science + masters
  // (the only coordinator_gated program today) and never-yet-graded. Every
  // other major/degree a viewer's account can otherwise see via
  // getStudentsList is deliberately excluded here — "nothing else".
  const ungraded = useMemo(
    () => students.filter((s) => s.major === 'computer_science' && s.degreeType === 'masters' && s.thesisEligibility?.average == null),
    [students]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return ungraded;
    return ungraded.filter(
      (s) => s.displayName.toLowerCase().includes(q) || s.email.toLowerCase().includes(q) || s.studentId.toLowerCase().includes(q)
    );
  }, [ungraded, search]);

  const handleSave = async (studentId: string) => {
    const raw = averageInputs[studentId] ?? '';
    const parsed = Number(raw);
    if (raw.trim() === '' || !Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
      setRowErrors((prev) => ({ ...prev, [studentId]: lang === 'he' ? 'יש להזין ממוצע תקין בין 0 ל-100' : 'Enter a valid average between 0 and 100' }));
      return;
    }
    setRowErrors((prev) => {
      const next = { ...prev };
      delete next[studentId];
      return next;
    });
    setSavingId(studentId);
    try {
      await apiClient.setStudentThesisAverage(studentId, parsed);
      setStudents((prev) => prev.filter((s) => s.id !== studentId));
      setNotice({ text: lang === 'he' ? 'הממוצע נשמר בהצלחה.' : 'Average saved successfully.', tone: 'success' });
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // Someone else (the other role that can grade this same student)
        // already entered an average for them, most likely moments ago —
        // not a bug, just the two-grader race this tab is built to expect.
        // Surface it plainly and drop the row instead of leaving a dead
        // "Save" button pointed at a student who's no longer gradable.
        setNotice({ text: errorText(err, lang, lang === 'he' ? 'סטודנט/ית זה כבר צוין/ה' : 'This student was already graded'), tone: 'conflict' });
        setStudents((prev) => prev.filter((s) => s.id !== studentId));
      } else {
        setRowErrors((prev) => ({ ...prev, [studentId]: errorText(err, lang, lang === 'he' ? 'השמירה נכשלה' : 'Save failed') }));
      }
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div>
      {notice && (
        <div
          className={`mb-4 flex items-start justify-between gap-3 rounded-md px-3 py-2 text-sm ${
            notice.tone === 'conflict' ? 'bg-accent/10 text-accent' : 'bg-success/10 text-success'
          }`}
          role="status"
        >
          <span>{notice.tone === 'conflict' ? '⚠️ ' : '✅ '}{notice.text}</span>
          <button type="button" onClick={() => setNotice(null)} className="shrink-0 text-xs underline opacity-70 hover:opacity-100">
            {lang === 'he' ? 'סגור' : 'Dismiss'}
          </button>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={lang === 'he' ? 'חפש סטודנט...' : 'Search students...'}
          className="w-full max-w-sm rounded-lg border border-line bg-surface px-3.5 py-2 text-sm text-ink focus:border-primary focus:outline-none"
        />
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="rounded-lg border border-line bg-surface px-3 py-2 text-xs font-medium text-ink hover:border-primary disabled:opacity-60"
        >
          🔄 {lang === 'he' ? 'רענן' : 'Refresh'}
        </button>
      </div>

      {loadError && <p className="mb-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">{loadError}</p>}

      {loading ? (
        <p className="text-sm text-muted">{lang === 'he' ? 'טוען...' : 'Loading...'}</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {filtered.map((s) => (
            <div key={s.id} className="rounded-[var(--radius)] border border-line bg-surface p-4">
              <p className="truncate text-sm font-semibold text-ink">{s.displayName}</p>
              <p className="truncate text-xs text-muted" dir="ltr">{s.email}</p>
              {s.studentId && <p className="mt-0.5 text-xs text-muted">{lang === 'he' ? 'ת.ז:' : 'ID:'} {s.studentId}</p>}

              <div className="mt-3 flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  max={100}
                  step="any"
                  value={averageInputs[s.id] ?? ''}
                  onChange={(e) => setAverageInputs((prev) => ({ ...prev, [s.id]: e.target.value }))}
                  placeholder={lang === 'he' ? 'ממוצע (0-100)' : 'Average (0-100)'}
                  className="w-32 rounded-lg border border-line bg-paper px-3 py-1.5 text-sm text-ink focus:border-primary focus:outline-none"
                />
                <button
                  type="button"
                  disabled={savingId === s.id}
                  onClick={() => handleSave(s.id)}
                  className="rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-ink hover:bg-primary-hover disabled:opacity-60"
                >
                  {savingId === s.id ? '…' : lang === 'he' ? 'שמור' : 'Save'}
                </button>
              </div>
              {rowErrors[s.id] && <p className="mt-1.5 text-xs text-danger">{rowErrors[s.id]}</p>}
            </div>
          ))}
          {filtered.length === 0 && (
            <p className="text-sm text-muted sm:col-span-2">
              {search
                ? (lang === 'he' ? 'לא נמצאו סטודנטים תואמים' : 'No matching students found')
                : (lang === 'he' ? '🎉 לכל הסטודנטים הוזן ממוצע' : '🎉 Every student already has a grade average')}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
