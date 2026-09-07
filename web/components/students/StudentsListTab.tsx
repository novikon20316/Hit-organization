'use client';

// components/students/StudentsListTab.tsx
// "Students List" tab for faculty_admin, grad_school_head, and
// administrative_secretary — scoped server-side by GET /api/admin/students-list
// (see server/src/controllers/studentsListController.ts): faculty_admin sees
// every student in their faculty regardless of major/degree, grad_school_head
// sees masters students only narrowed to whichever majors their
// coordinatorScopes name (or the whole faculty if none are set), and
// administrative_secretary ("administrative coordinator") sees whatever her
// own coordinatorScopes name. No create/edit/toggle actions here — just a
// searchable/filterable roster, modeled on components/staff/ManagedStaffTab.tsx's
// card-grid shell — except for the optional password-reset action below,
// opted into only by administrative_secretary's own "Users" tab (see
// app/administrative_coordinator/dashboard/page.tsx), which is the one role
// among these three actually allowed to call it (adminController.ts's
// resetUserPasswordAdmin enforces this server-side regardless).

import { useEffect, useMemo, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/apiClient';
import { facultyLabel, type FacultyId } from '@/lib/i18n';
import { majorsForFaculty } from '@/lib/permissions';
import { getDegreeTypeColor, getTrackColor, withAlpha } from '@/lib/facultyColors';

type StudentRecord = Awaited<ReturnType<typeof apiClient.getStudentsList>>['students'][number];

const selectCls = 'rounded-lg border border-line bg-surface px-3 py-1.5 text-sm text-ink focus:border-primary focus:outline-none';
const inputCls = 'rounded-lg border border-line bg-surface px-3.5 py-2 text-sm text-ink focus:border-primary focus:outline-none';

function majorLabel(facultyId: string, major: string | null, lang: 'he' | 'en'): string | null {
  if (!major) return null;
  const match = majorsForFaculty(facultyId).find((m) => m.slug === major);
  return match?.label[lang] ?? major;
}

/** Per-card password-reset action — its own local state (busy/result) so
 *  resetting one student's password doesn't affect any other card. */
function ResetPasswordAction({ studentId }: { studentId: string }) {
  const { lang } = useLanguage();
  const [busy, setBusy] = useState(false);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleReset = async () => {
    if (!window.confirm(
      lang === 'he'
        ? 'תיווצר סיסמה זמנית חדשה עבור הסטודנט/ית, והוא/היא יידרש/תידרש להחליף אותה בכניסה הבאה. להמשיך?'
        : "A new temporary password will be generated for this student, and they'll be required to change it on next login. Continue?"
    )) {
      return;
    }
    setBusy(true);
    try {
      const result = await apiClient.resetUserPasswordAdmin(studentId);
      setTempPassword(result.tempPassword);
    } catch (err) {
      alert(err instanceof Error ? err.message : lang === 'he' ? 'איפוס הסיסמה נכשל' : 'Failed to reset password');
    } finally {
      setBusy(false);
    }
  };

  const handleCopy = async () => {
    if (!tempPassword) return;
    try {
      await navigator.clipboard.writeText(tempPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable/denied — the value is still visible on
      // screen for the coordinator to select and copy manually.
    }
  };

  return (
    <div className="mt-2 border-t border-line pt-2" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        disabled={busy}
        onClick={handleReset}
        className="rounded-lg border border-line px-2.5 py-1 text-xs font-medium text-ink hover:border-primary hover:text-primary disabled:opacity-60"
      >
        🔑 {busy ? (lang === 'he' ? 'מאפס…' : 'Resetting…') : (lang === 'he' ? 'איפוס סיסמה' : 'Reset password')}
      </button>

      {tempPassword && (
        <div className="mt-2 grid gap-1.5 rounded-lg border border-line bg-paper p-2">
          <span className="text-[11px] font-medium text-muted">
            {lang === 'he' ? 'סיסמה זמנית חדשה:' : 'New temporary password:'}
          </span>
          <div className="flex items-center gap-1.5">
            <code dir="ltr" className="flex-1 truncate rounded-md border border-line bg-surface px-2 py-1 text-xs text-ink">
              {tempPassword}
            </code>
            <button
              type="button"
              onClick={handleCopy}
              className="shrink-0 rounded-md border border-line px-2 py-1 text-[11px] font-medium text-ink hover:bg-surface"
            >
              {copied ? (lang === 'he' ? 'הועתק!' : 'Copied!') : (lang === 'he' ? 'העתק' : 'Copy')}
            </button>
            <button
              type="button"
              onClick={() => setTempPassword(null)}
              className="shrink-0 rounded-md border border-line px-2 py-1 text-[11px] font-medium text-muted hover:text-ink"
            >
              {lang === 'he' ? 'סגור' : 'Dismiss'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function StudentsListTab({ enablePasswordReset = false }: { enablePasswordReset?: boolean }) {
  const { lang, t } = useLanguage();
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [majorFilter, setMajorFilter] = useState('all');
  const [degreeFilter, setDegreeFilter] = useState('all');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiClient
      .getStudentsList()
      .then((res) => {
        if (!cancelled) setStudents(res.students ?? []);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : lang === 'he' ? 'טעינת רשימת הסטודנטים נכשלה' : 'Failed to load students list');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const majorOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const s of students) {
      if (s.major && !seen.has(s.major)) seen.set(s.major, majorLabel(s.facultyId, s.major, lang) ?? s.major);
    }
    return [...seen.entries()];
  }, [students, lang]);

  const degreeOptions = useMemo(() => [...new Set(students.map((s) => s.degreeType).filter(Boolean) as string[])], [students]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return students.filter((s) => {
      const searchOk = !q || s.displayName.toLowerCase().includes(q) || s.email.toLowerCase().includes(q) || s.studentId.toLowerCase().includes(q);
      const majorOk = majorFilter === 'all' || s.major === majorFilter;
      const degreeOk = degreeFilter === 'all' || s.degreeType === degreeFilter;
      return searchOk && majorOk && degreeOk;
    });
  }, [students, search, majorFilter, degreeFilter]);

  if (loading) {
    return <p className="text-sm text-muted">{lang === 'he' ? 'טוען...' : 'Loading...'}</p>;
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={lang === 'he' ? 'חפש סטודנט...' : 'Search students...'}
          className={`${inputCls} w-full max-w-sm`}
        />
        {majorOptions.length > 1 && (
          <select value={majorFilter} onChange={(e) => setMajorFilter(e.target.value)} className={selectCls}>
            <option value="all">{lang === 'he' ? 'כל החוגים' : 'All majors'}</option>
            {majorOptions.map(([slug, label]) => (
              <option key={slug} value={slug}>
                {label}
              </option>
            ))}
          </select>
        )}
        {degreeOptions.length > 1 && (
          <select value={degreeFilter} onChange={(e) => setDegreeFilter(e.target.value)} className={selectCls}>
            <option value="all">{lang === 'he' ? 'כל הדרגות' : 'All degrees'}</option>
            {degreeOptions.map((d) => (
              <option key={d} value={d}>
                {t(d as 'bachelors' | 'masters')}
              </option>
            ))}
          </select>
        )}
      </div>

      {error && <p className="mb-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">{error}</p>}

      <div className="grid gap-3 sm:grid-cols-2">
        {filtered.map((s) => (
          <div key={s.id} className="rounded-[var(--radius)] border border-line bg-surface p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink">{s.displayName}</p>
                <p className="truncate text-xs text-muted" dir="ltr">
                  {s.email}
                </p>
              </div>
              <span
                className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  s.isActive === false ? 'bg-danger-bg text-danger' : 'bg-primary/10 text-primary'
                }`}
              >
                {s.isActive === false ? (lang === 'he' ? 'מושבת' : 'Inactive') : lang === 'he' ? 'פעיל' : 'Active'}
              </span>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted">
              <span className="rounded-full bg-paper px-2 py-0.5">{facultyLabel(s.facultyId as FacultyId, lang)}</span>
              {majorLabel(s.facultyId, s.major, lang) && (
                <span className="rounded-full bg-paper px-2 py-0.5">{majorLabel(s.facultyId, s.major, lang)}</span>
              )}
              {s.degreeType && (
                <span
                  className="rounded-full px-2 py-0.5 font-medium"
                  style={{ backgroundColor: withAlpha(getDegreeTypeColor(s.degreeType)!, 0.12), color: getDegreeTypeColor(s.degreeType)! }}
                >
                  🎓 {t(s.degreeType as 'bachelors' | 'masters')}
                </span>
              )}
              {s.track && (
                <span
                  className="rounded-full px-2 py-0.5 font-medium"
                  style={{ backgroundColor: withAlpha(getTrackColor(s.track)!, 0.12), color: getTrackColor(s.track)! }}
                >
                  📘 {s.track === 'thesis' ? (lang === 'he' ? 'תזה' : 'Thesis') : lang === 'he' ? 'פרויקט' : 'Project'}
                </span>
              )}
              {s.yearOfStudy != null && (
                <span className="rounded-full bg-paper px-2 py-0.5">{lang === 'he' ? `שנה ${s.yearOfStudy}` : `Year ${s.yearOfStudy}`}</span>
              )}
              {s.hasActiveProject && (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-primary">{lang === 'he' ? 'פרויקט פעיל' : 'Active project'}</span>
              )}
            </div>

            {enablePasswordReset && <ResetPasswordAction studentId={s.id} />}
          </div>
        ))}
        {filtered.length === 0 && <p className="text-sm text-muted">{t('noData')}</p>}
      </div>
    </div>
  );
}
