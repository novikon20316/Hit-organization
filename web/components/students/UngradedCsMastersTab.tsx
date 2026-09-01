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
// Live-synced, not fetch-once: the roster is a Firestore onSnapshot listener
// (same established pattern as hooks/useStudentData.ts's proposals/milestones
// listeners), not a one-shot apiClient call. firestore.rules already lets any
// signed-in user read `users` docs directly (see mobile/firestore.rules's
// "allow read: if isSignedIn()" on /users/{userId} — the actual write stays
// server-only, see below), so this needs no new rule. The practical effect:
// the instant either role's grade-average write commits on the server, EVERY
// open viewer's list updates itself within the same snapshot round-trip — no
// manual refresh, and the other grader typically never even sees a student
// who was just graded a moment ago.
//
// One-time by business rule: the instant a student's average is saved, they
// leave this list for good (server/src/services/studentTrack.ts's
// setThesisEligibilityFromAverage never lets a second average overwrite the
// first). Writing thesisEligibility itself is NOT done from this listener —
// firestore.rules only allows self-service profile-field updates and one
// unrelated isActive toggle from the client, everything else (including this
// field) must go through the server, so saves still call
// apiClient.setStudentThesisAverage exactly as before. The live listener
// mostly prevents the race described below from ever being seen; the
// server-side transaction remains the actual correctness guarantee for the
// split-second case where two saves land before either listener update does:
// the loser gets a 409/ALREADY_GRADED response instead of silently
// clobbering the winner's value, which this component turns into a
// plain-language notice instead of a thrown error.

import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient, ApiError } from '@/lib/apiClient';

interface UngradedStudent {
  id: string;
  displayName: string;
  email: string;
  studentId: string;
}

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
  const [students, setStudents] = useState<UngradedStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [averageInputs, setAverageInputs] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<{ text: string; tone: 'conflict' | 'success' } | null>(null);

  // The one hard-coded scope rule for this tab: computer_science + masters
  // (the only coordinator_gated program today), live from Firestore rather
  // than a point-in-time fetch. "Without an average" is applied client-side
  // below rather than as a fourth where() clause, since Firestore can't
  // query "field is null or missing" directly.
  useEffect(() => {
    setLoading(true);
    setLoadError('');
    const q = query(
      collection(db, 'users'),
      where('role', '==', 'student'),
      where('major', '==', 'computer_science'),
      where('degreeType', '==', 'masters')
    );
    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const rows = snapshot.docs
          .filter((d) => d.data().thesisEligibility?.average == null)
          .map((d) => {
            const data = d.data();
            return {
              id: d.id,
              displayName: data.displayName ?? '',
              email: data.email ?? '',
              studentId: data.studentId ?? '',
            };
          });
        setStudents(rows);
        setLoading(false);
      },
      (err) => {
        console.error('Ungraded CS-masters students snapshot error:', err);
        setLoadError(lang === 'he' ? 'טעינת רשימת הסטודנטים נכשלה' : 'Failed to load students list');
        setLoading(false);
      }
    );
    return () => unsub();
  }, [lang]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return students;
    return students.filter(
      (s) => s.displayName.toLowerCase().includes(q) || s.email.toLowerCase().includes(q) || s.studentId.toLowerCase().includes(q)
    );
  }, [students, search]);

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
      // The live listener above will also drop this row once the write
      // propagates, but that's typically one round-trip later than this —
      // remove it immediately too so the person who just saved isn't left
      // looking at their own now-stale row for a beat.
      setStudents((prev) => prev.filter((s) => s.id !== studentId));
      setNotice({ text: lang === 'he' ? 'הממוצע נשמר בהצלחה.' : 'Average saved successfully.', tone: 'success' });
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // The other grader's write landed first, in the split-second window
        // before this tab's live listener had a chance to drop the row on
        // its own — not a bug, just the two-grader race this tab expects.
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
        <span className="text-xs text-muted">🟢 {lang === 'he' ? 'מסונכרן בזמן אמת' : 'Live-synced'}</span>
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
