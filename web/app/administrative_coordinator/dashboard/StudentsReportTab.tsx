'use client';

// app/administrative_coordinator/dashboard/StudentsReportTab.tsx
// A full roster of every student in the coordinator's assigned degree(s),
// including students who haven't enrolled in a project yet — unlike the
// project-group cards on the main tab, which only ever show enrolled
// students. Data comes from GET /api/project-coordinator/students-report
// (see projectCoordinatorController.ts's getStudentsReport).

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/apiClient';
import { useUsersLiveRefresh } from '@/hooks/useUsersLiveRefresh';
import { facultyLabel, type FacultyId } from '@/lib/i18n';
import { majorsForFaculty } from '@/lib/permissions';
import { specializationLabel } from '@/lib/specialization';
import { HIT_FACULTIES } from '@/lib/faculties';
import { saveStudentMessageRecipients } from '@/lib/studentMessageDraft';

type StudentStatus = 'not_in_project' | 'applied' | 'in_project' | 'awaiting_defense' | 'finished';

interface StudentReportRow {
  id: string;
  name: string;
  status: StudentStatus;
  appliedProjects: Array<{ titleHe: string; titleEn: string; projectType?: 'project' | 'thesis' }>;
  /** Project vs thesis the student is actually doing — set while enrolled. */
  projectType?: 'project' | 'thesis' | null;
  projectTitleHe: string | null;
  projectTitleEn: string | null;
  supervisorName: string | null;
  milestoneNameHe: string | null;
  milestoneNameEn: string | null;
  days: number | null;
  medianGrade: number | null;
  facultyId: string | null;
  major: string | null;
  degreeType: 'bachelors' | 'masters' | null;
  /** Signup-chosen specialization (תחום), see lib/specialization.ts. */
  specialization?: string | null;
  lastLoginAt: string | null;
  lastLoginPlatform: 'web' | 'mobile' | null;
  lastLogoutAt: string | null;
  lastLogoutPlatform: 'web' | 'mobile' | null;
}

function formatLastAt(iso: string | null, platform: 'web' | 'mobile' | null, lang: 'he' | 'en'): string {
  if (!iso) return lang === 'he' ? 'מעולם לא' : 'never';
  const dateStr = new Date(iso).toLocaleString(lang === 'he' ? 'he-IL' : 'en-US', { dateStyle: 'short', timeStyle: 'short' });
  return platform ? `${dateStr} (${platform})` : dateStr;
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

const TRACK_LABEL: Record<'project' | 'thesis', { he: string; en: string }> = {
  project: { he: 'פרויקט', en: 'project' },
  thesis: { he: 'תזה', en: 'thesis' },
};

// While enrolled, "In project/thesis" becomes "In project" or "In thesis";
// an application lists each one as "<track>: <title>".
export function statusText(row: Pick<StudentReportRow, 'status' | 'appliedProjects' | 'projectType'>, lang: 'he' | 'en'): string {
  if (row.status === 'in_project' && row.projectType) {
    return row.projectType === 'thesis' ? (lang === 'he' ? 'בתזה' : 'In thesis') : (lang === 'he' ? 'בפרויקט' : 'In project');
  }
  const base = STATUS_LABEL[row.status][lang];
  if (row.status === 'applied' && row.appliedProjects.length > 0) {
    const names = row.appliedProjects
      .map((p) => {
        const title = (lang === 'he' ? p.titleHe : p.titleEn) || '—';
        return p.projectType ? `${TRACK_LABEL[p.projectType][lang]}: ${title}` : title;
      })
      .join('; ');
    return `${base} ${names}`;
  }
  return base;
}

// The Major column only makes sense for a faculty that actually splits into
// more than one major (e.g. sciences: computer_science vs applied_math) — a
// single-major faculty would just repeat the same value on every row, so
// that student's cell shows '—' instead.
//
// majorsForFaculty() dedupes by slug and strips the degree prefix (a
// bachelor's and master's program can share one slug, e.g. Computer Science)
// — that's the right shape for pickers where degree level is chosen
// separately, but here it would make a B.Sc and M.Sc Computer Science
// student look identical. So once we know the faculty has more than one
// major, look the student's exact program back up in the raw (undeduped)
// HIT_FACULTIES data using both `major` and `degreeType`, which keeps the
// degree prefix in the returned label and disambiguates the two.
//
// A student who picked a specialization at signup (e.g. M.Sc Electrical
// Engineering) shows that instead — it's the more specific answer.
export function majorCellText(row: Pick<StudentReportRow, 'facultyId' | 'major' | 'degreeType' | 'specialization'>, lang: 'he' | 'en'): string {
  const spec = specializationLabel(row.specialization, lang);
  if (spec) return spec;
  if (!row.facultyId) return '—';
  const majors = majorsForFaculty(row.facultyId);
  if (majors.length <= 1) return '—';
  const faculty = HIT_FACULTIES.find((f) => f.key === row.facultyId);
  const program =
    faculty?.programs.find((p) => p.slug === row.major && p.level === row.degreeType) ??
    faculty?.programs.find((p) => p.slug === row.major);
  if (program) return program.label[lang];
  const match = majors.find((m) => m.slug === row.major);
  return match ? match.label[lang] : '—';
}

/** `enableMessaging` adds the row checkboxes + "Send message" button — only
 *  the administrative coordinator's dashboard turns it on; the plain
 *  coordinator's copy of this tab (coordinator/home) stays read-only, and the
 *  server endpoint behind it is gated to the same roles. */
export function StudentsReportTab({ enableMessaging = false }: { enableMessaging?: boolean } = {}) {
  const { lang } = useLanguage();
  const router = useRouter();
  const [rows, setRows] = useState<StudentReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [noScopeAssigned, setNoScopeAssigned] = useState(false);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | StudentStatus>('all');
  // Survives search/filter changes on purpose — she can search for one
  // student, tick them, search for the next, and so on.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [handoffError, setHandoffError] = useState('');

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

  // A student added/edited/removed anywhere — refresh rows in place (no
  // spinner, selection kept). A failed background refresh keeps the rows.
  useUsersLiveRefresh(() => {
    apiClient
      .getStudentsReport()
      .then((res) => {
        setRows(res.students as StudentReportRow[]);
        setNoScopeAssigned(!!res.noScopeAssigned);
      })
      .catch(() => {});
  });

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      const matchesSearch = !q || r.name.toLowerCase().includes(q);
      const matchesStatus = filterStatus === 'all' || r.status === filterStatus;
      return matchesSearch && matchesStatus;
    });
  }, [rows, search, filterStatus]);

  const allVisibleSelected = filteredRows.length > 0 && filteredRows.every((r) => selectedIds.has(r.id));
  const someVisibleSelected = filteredRows.some((r) => selectedIds.has(r.id));

  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // "Select all" acts on what's currently shown (search + status filter), so
  // filtering to e.g. "Not in a project" then ticking the header picks
  // exactly that group.
  const toggleAllVisible = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) filteredRows.forEach((r) => next.delete(r.id));
      else filteredRows.forEach((r) => next.add(r.id));
      return next;
    });
  };

  const goToCompose = () => {
    const recipients = rows.filter((r) => selectedIds.has(r.id)).map((r) => ({ id: r.id, name: r.name }));
    if (recipients.length === 0) return;
    if (!saveStudentMessageRecipients(recipients)) {
      setHandoffError(lang === 'he' ? 'הדפדפן חוסם אחסון זמני — לא ניתן להעביר את הבחירה.' : 'Your browser is blocking session storage, so the selection could not be carried over.');
      return;
    }
    router.push('/notifications?compose=students');
  };

  if (loading) return <p className="text-sm text-administrative-coordinator-on-surface-variant">…</p>;
  if (error) return <p className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">{error}</p>;
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
        className="mb-3 w-full max-w-sm rounded-lg border border-administrative-coordinator-outline-variant bg-administrative-coordinator-surface-container-lowest px-3.5 py-2 text-sm text-administrative-coordinator-on-surface focus:border-administrative-coordinator-primary focus:outline-none"
      />
      <div className="mb-4 flex flex-wrap gap-1.5">
        {(['all', 'not_in_project', 'applied', 'in_project', 'awaiting_defense', 'finished'] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setFilterStatus(s)}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
              filterStatus === s ? 'border-administrative-coordinator-primary bg-administrative-coordinator-primary text-administrative-coordinator-on-primary' : 'border-administrative-coordinator-outline-variant bg-administrative-coordinator-surface-container-lowest text-administrative-coordinator-on-surface'
            }`}
          >
            {s === 'all' ? (lang === 'he' ? 'הכל' : 'All') : STATUS_LABEL[s][lang]}
          </button>
        ))}
      </div>

      {enableMessaging && (
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={goToCompose}
            disabled={selectedIds.size === 0}
            className="rounded-lg bg-administrative-coordinator-primary px-4 py-2 text-sm font-semibold text-administrative-coordinator-on-primary disabled:cursor-not-allowed disabled:opacity-40"
          >
            ✉️ {lang === 'he' ? 'שליחת הודעה' : 'Send message'}
            {selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}
          </button>
          {selectedIds.size > 0 ? (
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              className="text-xs text-administrative-coordinator-on-surface-variant underline hover:text-administrative-coordinator-primary"
            >
              {lang === 'he' ? 'ניקוי בחירה' : 'Clear selection'}
            </button>
          ) : (
            <span className="text-xs text-administrative-coordinator-on-surface-variant">
              {lang === 'he' ? 'סמנו סטודנטים בטבלה כדי לשלוח להם הודעה' : 'Tick students in the table to message them'}
            </span>
          )}
        </div>
      )}
      {handoffError && <p className="mb-3 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">{handoffError}</p>}

      <div className="overflow-x-auto rounded-administrative-coordinator border border-administrative-coordinator-outline-variant">
        <table className="w-full min-w-[900px] text-start text-sm">
          <thead>
            <tr className="border-b border-administrative-coordinator-outline-variant bg-administrative-coordinator-surface-container-low text-xs text-administrative-coordinator-on-surface-variant">
              {enableMessaging && (
                <th className="w-10 px-3 py-2 text-start font-medium">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = !allVisibleSelected && someVisibleSelected;
                    }}
                    onChange={toggleAllVisible}
                    disabled={filteredRows.length === 0}
                    aria-label={lang === 'he' ? 'בחירת כל הסטודנטים המוצגים' : 'Select all shown students'}
                    className="h-4 w-4 cursor-pointer"
                  />
                </th>
              )}
              <th className="px-3 py-2 text-start font-medium">{lang === 'he' ? 'שם' : 'Name'}</th>
              <th className="px-3 py-2 text-start font-medium">{lang === 'he' ? 'פקולטה' : 'Faculty'}</th>
              <th className="px-3 py-2 text-start font-medium">{lang === 'he' ? 'מגמה' : 'Major'}</th>
              <th className="px-3 py-2 text-start font-medium">{lang === 'he' ? 'סטטוס' : 'Status'}</th>
              <th className="px-3 py-2 text-start font-medium">{lang === 'he' ? 'פרויקט' : 'Project'}</th>
              <th className="px-3 py-2 text-start font-medium">{lang === 'he' ? 'מנחה' : 'Supervisor'}</th>
              <th className="px-3 py-2 text-start font-medium">{lang === 'he' ? 'אבן דרך נוכחית' : 'Current Milestone'}</th>
              <th className="px-3 py-2 text-start font-medium">{lang === 'he' ? 'ימים' : 'Days'}</th>
              <th className="px-3 py-2 text-start font-medium">{lang === 'he' ? 'ציון חציוני' : 'Median Grade'}</th>
              <th className="px-3 py-2 text-start font-medium">{lang === 'he' ? 'כניסה אחרונה' : 'Last Login'}</th>
              <th className="px-3 py-2 text-start font-medium">{lang === 'he' ? 'יציאה אחרונה' : 'Last Logout'}</th>
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
                <tr
                  key={r.id}
                  onClick={() => router.push(`/administrative_coordinator/dashboard/students/${r.id}`)}
                  className="cursor-pointer border-b border-administrative-coordinator-outline-variant last:border-b-0 hover:bg-administrative-coordinator-surface-container-low"
                >
                  {enableMessaging && (
                    // Its own click target — the rest of the row still opens
                    // the student's detail page.
                    <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(r.id)}
                        onChange={() => toggleOne(r.id)}
                        aria-label={lang === 'he' ? `בחירת ${r.name}` : `Select ${r.name}`}
                        className="h-4 w-4 cursor-pointer"
                      />
                    </td>
                  )}
                  <td className="px-3 py-2 font-medium text-administrative-coordinator-primary">{r.name}</td>
                  <td className="px-3 py-2 text-administrative-coordinator-on-surface">{r.facultyId ? facultyLabel(r.facultyId as FacultyId, lang) : '—'}</td>
                  <td className="px-3 py-2 text-administrative-coordinator-on-surface">{majorCellText(r, lang)}</td>
                  <td className="px-3 py-2">
                    <span className="font-medium" style={{ color: STATUS_COLOR[r.status] }}>
                      {statusText(r, lang)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-administrative-coordinator-on-surface">{projectTitle ?? '—'}</td>
                  <td className="px-3 py-2 text-administrative-coordinator-on-surface">{r.supervisorName ?? '—'}</td>
                  <td className="px-3 py-2 text-administrative-coordinator-on-surface">{milestoneName ?? '—'}</td>
                  <td className="px-3 py-2 font-semibold" style={{ color: r.days !== null && r.days < 0 ? 'var(--danger)' : undefined }}>
                    {daysLabel}
                  </td>
                  <td className="px-3 py-2 text-administrative-coordinator-on-surface">{r.medianGrade ?? '-'}</td>
                  <td className="px-3 py-2 text-xs text-administrative-coordinator-on-surface-variant">{formatLastAt(r.lastLoginAt, r.lastLoginPlatform, lang)}</td>
                  <td className="px-3 py-2 text-xs text-administrative-coordinator-on-surface-variant">{formatLastAt(r.lastLogoutAt, r.lastLogoutPlatform, lang)}</td>
                </tr>
              );
            })}
            {filteredRows.length === 0 && (
              <tr>
                <td colSpan={enableMessaging ? 12 : 11} className="px-3 py-6 text-center text-sm text-administrative-coordinator-on-surface-variant">
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
