'use client';

// app/administrative_coordinator/dashboard/StudentsReportTab.tsx
// A full roster of every student in the coordinator's assigned degree(s),
// including students who haven't enrolled in a project yet — unlike the
// project-group cards on the main tab, which only ever show enrolled
// students. Data comes from GET /api/project-coordinator/students-report
// (see projectCoordinatorController.ts's getStudentsReport).

import { useEffect, useMemo, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/apiClient';
import { facultyLabel, type FacultyId } from '@/lib/i18n';
import { majorsForFaculty } from '@/lib/permissions';

type StudentStatus = 'not_in_project' | 'applied' | 'in_project' | 'awaiting_defense' | 'finished';

interface StudentReportRow {
  id: string;
  name: string;
  status: StudentStatus;
  appliedProjects: Array<{ titleHe: string; titleEn: string }>;
  projectTitleHe: string | null;
  projectTitleEn: string | null;
  supervisorName: string | null;
  milestoneNameHe: string | null;
  milestoneNameEn: string | null;
  days: number | null;
  facultyId: string | null;
  major: string | null;
}

const STATUS_LABEL: Record<StudentStatus, { he: string; en: string }> = {
  not_in_project: { he: 'לא נמצא בפרויקט/תזה', en: 'Not in a project/thesis' },
  applied: { he: 'הגיש בקשה ל־', en: 'Submitted application to' },
  in_project: { he: 'בפרויקט/תזה', en: 'In project/thesis' },
  awaiting_defense: { he: 'ממתין לבחינת הגנה', en: 'Awaiting defense exam' },
  finished: { he: 'סיים', en: 'Finished' },
};

const STATUS_COLOR: Record<StudentStatus, string> = {
  not_in_project: '#8899BB',
  applied: '#F59E0B',
  in_project: '#3E6C8C',
  awaiting_defense: '#7C3AED',
  finished: '#10B981',
};

function statusText(row: StudentReportRow, lang: 'he' | 'en'): string {
  const base = STATUS_LABEL[row.status][lang];
  if (row.status === 'applied' && row.appliedProjects.length > 0) {
    const names = row.appliedProjects.map((p) => (lang === 'he' ? p.titleHe : p.titleEn) || '—').join(lang === 'he' ? ', ' : ', ');
    return `${base} ${names}`;
  }
  return base;
}

// The Major column only makes sense for a faculty that actually splits into
// more than one major (e.g. sciences: computer_science vs applied_math) — a
// single-major faculty would just repeat the same value on every row, so
// that student's cell shows '—' instead.
function majorCellText(row: StudentReportRow, lang: 'he' | 'en'): string {
  if (!row.facultyId) return '—';
  const majors = majorsForFaculty(row.facultyId);
  if (majors.length <= 1) return '—';
  const match = majors.find((m) => m.slug === row.major);
  return match ? match.label[lang] : '—';
}

export function StudentsReportTab() {
  const { lang } = useLanguage();
  const [rows, setRows] = useState<StudentReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [noScopeAssigned, setNoScopeAssigned] = useState(false);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | StudentStatus>('all');

  useEffect(() => {
    let cancelled = false;
    apiClient
      .getStudentsReport()
      .then((res) => {
        if (cancelled) return;
        setRows(res.students as StudentReportRow[]);
        setNoScopeAssigned(!!res.noScopeAssigned);
        setError('');
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : lang === 'he' ? 'לא ניתן לטעון נתונים' : 'Could not load data');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [lang]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      const matchesSearch = !q || r.name.toLowerCase().includes(q);
      const matchesStatus = filterStatus === 'all' || r.status === filterStatus;
      return matchesSearch && matchesStatus;
    });
  }, [rows, search, filterStatus]);

  if (loading) return <p className="text-sm text-muted">…</p>;
  if (error) return <p className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>;
  if (noScopeAssigned) {
    return (
      <p className="rounded-md bg-[#FBF3E3] px-3 py-2 text-sm text-accent">
        {lang === 'he'
          ? 'לא הוקצה לך עדיין תחום אחריות (פקולטה/תואר). פנה/י למנהל המערכת כדי להקצות לך תואר.'
          : 'No degree has been assigned to your account yet — ask your system_admin to assign one via Coordinator Scope.'}
      </p>
    );
  }

  return (
    <div>
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={lang === 'he' ? 'חיפוש לפי שם...' : 'Search by name...'}
        className="mb-3 w-full max-w-sm rounded-lg border border-line bg-surface px-3.5 py-2 text-sm text-ink focus:border-primary focus:outline-none"
      />
      <div className="mb-4 flex flex-wrap gap-1.5">
        {(['all', 'not_in_project', 'applied', 'in_project', 'awaiting_defense', 'finished'] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setFilterStatus(s)}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
              filterStatus === s ? 'border-primary bg-primary text-primary-ink' : 'border-line bg-surface text-ink'
            }`}
          >
            {s === 'all' ? (lang === 'he' ? 'הכל' : 'All') : STATUS_LABEL[s][lang]}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-[var(--radius)] border border-line">
        <table className="w-full min-w-[900px] text-start text-sm">
          <thead>
            <tr className="border-b border-line bg-paper text-xs text-muted">
              <th className="px-3 py-2 text-start font-medium">{lang === 'he' ? 'שם' : 'Name'}</th>
              <th className="px-3 py-2 text-start font-medium">{lang === 'he' ? 'פקולטה' : 'Faculty'}</th>
              <th className="px-3 py-2 text-start font-medium">{lang === 'he' ? 'מגמה' : 'Major'}</th>
              <th className="px-3 py-2 text-start font-medium">{lang === 'he' ? 'סטטוס' : 'Status'}</th>
              <th className="px-3 py-2 text-start font-medium">{lang === 'he' ? 'פרויקט' : 'Project'}</th>
              <th className="px-3 py-2 text-start font-medium">{lang === 'he' ? 'מנחה' : 'Supervisor'}</th>
              <th className="px-3 py-2 text-start font-medium">{lang === 'he' ? 'אבן דרך נוכחית' : 'Current Milestone'}</th>
              <th className="px-3 py-2 text-start font-medium">{lang === 'he' ? 'ימים' : 'Days'}</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((r) => {
              const projectTitle = r.projectTitleHe || r.projectTitleEn ? (lang === 'he' ? r.projectTitleHe : r.projectTitleEn) : null;
              const milestoneName = r.milestoneNameHe || r.milestoneNameEn ? (lang === 'he' ? r.milestoneNameHe : r.milestoneNameEn) : null;
              const daysLabel =
                r.days === null
                  ? '—'
                  : r.status === 'not_in_project' || r.status === 'applied'
                    ? (lang === 'he' ? `${r.days} ימים בחיפוש` : `${r.days}d searching`)
                    : `${r.days}`;
              return (
                <tr key={r.id} className="border-b border-line last:border-b-0">
                  <td className="px-3 py-2 font-medium text-ink">{r.name}</td>
                  <td className="px-3 py-2 text-ink">{r.facultyId ? facultyLabel(r.facultyId as FacultyId, lang) : '—'}</td>
                  <td className="px-3 py-2 text-ink">{majorCellText(r, lang)}</td>
                  <td className="px-3 py-2">
                    <span className="font-medium" style={{ color: STATUS_COLOR[r.status] }}>
                      {statusText(r, lang)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-ink">{projectTitle ?? '—'}</td>
                  <td className="px-3 py-2 text-ink">{r.supervisorName ?? '—'}</td>
                  <td className="px-3 py-2 text-ink">{milestoneName ?? '—'}</td>
                  <td className="px-3 py-2 font-semibold" style={{ color: r.days !== null && r.days < 0 ? 'var(--danger)' : undefined }}>
                    {daysLabel}
                  </td>
                </tr>
              );
            })}
            {filteredRows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-sm text-muted">
                  📭 {lang === 'he' ? 'אין סטודנטים להצגה' : 'No students to show'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
