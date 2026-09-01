'use client';

// components/students/StudentsListTab.tsx
// Read-only "Students List" tab for faculty_admin and grad_school_head —
// scoped server-side by GET /api/admin/students-list (see
// server/src/controllers/studentsListController.ts): faculty_admin sees
// every student in their faculty regardless of major/degree, grad_school_head
// sees masters students only, narrowed to whichever majors their
// coordinatorScopes name (or the whole faculty if none are set). No
// create/edit/toggle actions — just a searchable/filterable roster, modeled
// on components/staff/ManagedStaffTab.tsx's card-grid shell.

import { useEffect, useMemo, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/apiClient';
import { facultyLabel, type FacultyId } from '@/lib/i18n';
import { majorsForFaculty } from '@/lib/permissions';

type StudentRecord = Awaited<ReturnType<typeof apiClient.getStudentsList>>['students'][number];

const selectCls = 'rounded-lg border border-line bg-surface px-3 py-1.5 text-sm text-ink focus:border-primary focus:outline-none';
const inputCls = 'rounded-lg border border-line bg-surface px-3.5 py-2 text-sm text-ink focus:border-primary focus:outline-none';

function majorLabel(facultyId: string, major: string | null, lang: 'he' | 'en'): string | null {
  if (!major) return null;
  const match = majorsForFaculty(facultyId).find((m) => m.slug === major);
  return match?.label[lang] ?? major;
}

export function StudentsListTab() {
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
              {s.degreeType && <span className="rounded-full bg-paper px-2 py-0.5">{t(s.degreeType as 'bachelors' | 'masters')}</span>}
              {s.yearOfStudy != null && (
                <span className="rounded-full bg-paper px-2 py-0.5">{lang === 'he' ? `שנה ${s.yearOfStudy}` : `Year ${s.yearOfStudy}`}</span>
              )}
              {s.hasActiveProject && (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-primary">{lang === 'he' ? 'פרויקט פעיל' : 'Active project'}</span>
              )}
            </div>
          </div>
        ))}
        {filtered.length === 0 && <p className="text-sm text-muted">{t('noData')}</p>}
      </div>
    </div>
  );
}
