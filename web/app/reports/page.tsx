'use client';

// app/reports/page.tsx
// Ported from mobile/app/(tabs)/Reports.tsx — same 9 report types, same
// curated field list per type, same filter bar and export button.

import { useCallback, useEffect, useState } from 'react';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { useRequireRole } from '@/hooks/useRequireRole';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/apiClient';
import type { AppRole } from '@/lib/roles';
import { FACULTY_LABELS, type FacultyId } from '@/lib/i18n';
import { REPORTS, displayValue, type ReportType } from './types';
import { downloadReportExport } from './downloadExport';

const REPORT_ROLES: AppRole[] = ['coordinator', 'faculty_admin', 'program_head', 'administrative_secretary', 'grad_school_head', 'system_admin'];

const DEGREE_TYPES = ['bachelors', 'masters'] as const;
const PROJECT_TYPES = ['project', 'thesis'] as const;
const MILESTONE_TYPES = ['research_proposal', 'progress_report', 'final_report', 'defense'] as const;
// Mirrors CLOSED_STATUSES + the two live in-progress values in
// services/reports.ts / projectEnrollment.ts — project.status, not the
// separate student-status taxonomy.
const PROCESS_STATUSES = ['active', 'in_progress', 'completed', 'withdrawn', 'admin_closed'] as const;

const DEGREE_TYPE_LABEL: Record<string, { he: string; en: string }> = {
  bachelors: { he: 'תואר ראשון', en: 'Bachelor’s' },
  masters: { he: 'תואר שני', en: 'Master’s' },
};
const PROJECT_TYPE_LABEL: Record<string, { he: string; en: string }> = {
  project: { he: 'פרויקט', en: 'Project' },
  thesis: { he: 'תזה', en: 'Thesis' },
};
const MILESTONE_TYPE_LABEL: Record<string, { he: string; en: string }> = {
  research_proposal: { he: 'הצעת מחקר', en: 'Research Proposal' },
  progress_report: { he: 'דו"ח התקדמות', en: 'Progress Report' },
  final_report: { he: 'דו"ח מסכם', en: 'Final Report' },
  defense: { he: 'הגנה', en: 'Defense' },
};
const PROCESS_STATUS_LABEL: Record<string, { he: string; en: string }> = {
  active: { he: 'פעיל', en: 'Active' },
  in_progress: { he: 'בתהליך', en: 'In Progress' },
  completed: { he: 'הושלם', en: 'Completed' },
  withdrawn: { he: 'פרש/ה', en: 'Withdrawn' },
  admin_closed: { he: 'נסגר מנהלתית', en: 'Admin Closed' },
};

export default function ReportsPage() {
  const { loading: guardLoading, isAllowed } = useRequireRole(REPORT_ROLES);
  const { userData } = useAuth();
  const { lang, t } = useLanguage();

  const [activeReport, setActiveReport] = useState<ReportType>('full-status');
  const [startYear, setStartYear] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [degreeType, setDegreeType] = useState('');
  const [projectType, setProjectType] = useState('');
  const [milestoneType, setMilestoneType] = useState('');
  const [processStatus, setProcessStatus] = useState('');
  const [facultyId, setFacultyId] = useState('');
  const [advisorId, setAdvisorId] = useState('');
  const [examinerId, setExaminerId] = useState('');
  const [examinerOptions, setExaminerOptions] = useState<Array<{ id: string; displayName: string }>>([]);

  const isSystemAdmin = userData?.role === 'system_admin';
  const isGradSchoolHead = userData?.role === 'grad_school_head';
  const isCrossFaculty = isSystemAdmin || isGradSchoolHead;

  // Mirrors the server's effectiveFacultyIds (scopeAuthorization.ts) —
  // grad_school_head is no longer automatically cross-faculty, so only offer
  // faculties the server will actually accept for them: their own faculty
  // plus any gradSchoolHeadFacultyIds extras, or every faculty if they're
  // explicitly kept/set to facultyId 'all'. system_admin stays unrestricted.
  const gradSchoolHeadFacultyOptions: FacultyId[] | 'all' = !isGradSchoolHead
    ? 'all'
    : userData?.facultyId === 'all'
    ? ((userData.gradSchoolHeadFacultyIds?.length ?? 0) > 0 ? (userData.gradSchoolHeadFacultyIds as FacultyId[]) : 'all')
    : ([userData?.facultyId, ...(userData?.gradSchoolHeadFacultyIds ?? [])].filter(Boolean) as FacultyId[]);

  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [meta, setMeta] = useState<{ threshold?: number } | null>(null);
  const [error, setError] = useState('');

  const filters = {
    startYear: startYear ? Number(startYear) : undefined,
    overdueOnly: overdueOnly || undefined,
    degreeType: degreeType || undefined,
    projectType: projectType || undefined,
    milestoneType: milestoneType || undefined,
    processStatus: processStatus || undefined,
    facultyId: isCrossFaculty && facultyId ? facultyId : undefined,
    advisorId: advisorId || undefined,
    examinerId: examinerId || undefined,
  };

  // Examiner dropdown source — internal examiners only (external examiners
  // have no uid to filter by; examinerId here matches defense.examinerIds,
  // see services/reports.ts).
  useEffect(() => {
    if (!isAllowed) return;
    apiClient.getInternalExaminerList()
      .then((list) => setExaminerOptions((list ?? []).map((u: any) => ({ id: u.id, displayName: u.displayName ?? u.id }))))
      .catch(() => setExaminerOptions([]));
  }, [isAllowed]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiClient.getReport(activeReport, filters);
      const data = res.data;
      if (activeReport === 'stuck-students') {
        const d = data as { students?: Record<string, unknown>[]; threshold?: number };
        setRows(d.students ?? []);
        setMeta({ threshold: d.threshold });
      } else {
        setRows(Array.isArray(data) ? (data as Record<string, unknown>[]) : []);
        setMeta(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : lang === 'he' ? 'טעינת הדוח נכשלה' : 'Failed to load the report');
      setRows([]);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeReport, startYear, overdueOnly, degreeType, projectType, milestoneType, processStatus, facultyId, advisorId, examinerId, isCrossFaculty, lang]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount / report-switch; load's setState calls happen after its awaited network call resolves, not synchronously in this effect
    if (isAllowed) load();
  }, [isAllowed, load]);

  const handleExport = async () => {
    setExporting(true);
    setError('');
    try {
      await downloadReportExport(activeReport, filters);
    } catch (err) {
      setError(err instanceof Error ? err.message : lang === 'he' ? 'הייצוא נכשל' : 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  if (guardLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper">
        <p className="text-sm text-muted">…</p>
      </div>
    );
  }

  const def = REPORTS.find((r) => r.key === activeReport)!;

  return (
    <DashboardShell title={lang === 'he' ? 'דוחות' : 'Reports'} subtitle={lang === 'he' ? 'מעקב תהליכים והנחיה בפקולטה' : 'Process and supervision tracking'}>
      <div className="mb-4 flex gap-1.5 overflow-x-auto pb-1">
        {REPORTS.map((r) => (
          <button
            key={r.key}
            type="button"
            onClick={() => setActiveReport(r.key)}
            className={`shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium ${
              activeReport === r.key ? 'border-primary bg-primary text-primary-ink' : 'border-line bg-surface text-ink'
            }`}
          >
            {lang === 'he' ? r.he : r.en}
          </button>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          value={startYear}
          onChange={(e) => setStartYear(e.target.value.replace(/\D/g, ''))}
          placeholder={lang === 'he' ? 'שנת התחלה' : 'Start year'}
          className="w-32 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none"
        />

        {isCrossFaculty && (
          <select
            value={facultyId}
            onChange={(e) => setFacultyId(e.target.value)}
            className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none"
          >
            <option value="">{lang === 'he' ? 'כל הפקולטות' : 'All faculties'}</option>
            {(gradSchoolHeadFacultyOptions === 'all'
              ? (Object.keys(FACULTY_LABELS) as FacultyId[]).filter((id) => id !== 'all')
              : gradSchoolHeadFacultyOptions
            ).map((id) => (
              <option key={id} value={id}>{FACULTY_LABELS[id][lang]}</option>
            ))}
          </select>
        )}

        <select
          value={degreeType}
          onChange={(e) => setDegreeType(e.target.value)}
          className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none"
        >
          <option value="">{lang === 'he' ? 'כל התארים' : 'All degrees'}</option>
          {DEGREE_TYPES.map((v) => (
            <option key={v} value={v}>{DEGREE_TYPE_LABEL[v][lang]}</option>
          ))}
        </select>

        <select
          value={projectType}
          onChange={(e) => setProjectType(e.target.value)}
          className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none"
        >
          <option value="">{lang === 'he' ? 'כל המסלולים' : 'All tracks'}</option>
          {PROJECT_TYPES.map((v) => (
            <option key={v} value={v}>{PROJECT_TYPE_LABEL[v][lang]}</option>
          ))}
        </select>

        <select
          value={milestoneType}
          onChange={(e) => setMilestoneType(e.target.value)}
          className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none"
        >
          <option value="">{lang === 'he' ? 'כל אבני הדרך' : 'All milestones'}</option>
          {MILESTONE_TYPES.map((v) => (
            <option key={v} value={v}>{MILESTONE_TYPE_LABEL[v][lang]}</option>
          ))}
        </select>

        <select
          value={processStatus}
          onChange={(e) => setProcessStatus(e.target.value)}
          className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none"
        >
          <option value="">{lang === 'he' ? 'כל הסטטוסים' : 'All statuses'}</option>
          {PROCESS_STATUSES.map((v) => (
            <option key={v} value={v}>{PROCESS_STATUS_LABEL[v][lang]}</option>
          ))}
        </select>

        <select
          value={examinerId}
          onChange={(e) => setExaminerId(e.target.value)}
          className="max-w-[12rem] rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none"
        >
          <option value="">{lang === 'he' ? 'כל הבוחנים' : 'All examiners'}</option>
          {examinerOptions.map((ex) => (
            <option key={ex.id} value={ex.id}>{ex.displayName}</option>
          ))}
        </select>

        <input
          value={advisorId}
          onChange={(e) => setAdvisorId(e.target.value)}
          placeholder={lang === 'he' ? 'מזהה מנחה' : 'Advisor ID'}
          className="w-36 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none"
        />

        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" checked={overdueOnly} onChange={(e) => setOverdueOnly(e.target.checked)} className="h-4 w-4 accent-[var(--primary)]" />
          {lang === 'he' ? 'חריגה בלבד' : 'Overdue only'}
        </label>
        <button
          type="button"
          onClick={handleExport}
          disabled={exporting}
          className="ms-auto rounded-lg bg-success px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
        >
          {exporting ? '…' : `📤 ${lang === 'he' ? 'ייצוא לאקסל' : 'Export to Excel'}`}
        </button>
      </div>

      {(degreeType || projectType || milestoneType || processStatus || facultyId || advisorId || examinerId) && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {[
            degreeType && { label: DEGREE_TYPE_LABEL[degreeType][lang], clear: () => setDegreeType('') },
            projectType && { label: PROJECT_TYPE_LABEL[projectType][lang], clear: () => setProjectType('') },
            milestoneType && { label: MILESTONE_TYPE_LABEL[milestoneType][lang], clear: () => setMilestoneType('') },
            processStatus && { label: PROCESS_STATUS_LABEL[processStatus][lang], clear: () => setProcessStatus('') },
            facultyId && { label: FACULTY_LABELS[facultyId as FacultyId]?.[lang] ?? facultyId, clear: () => setFacultyId('') },
            examinerId && { label: examinerOptions.find((e) => e.id === examinerId)?.displayName ?? examinerId, clear: () => setExaminerId('') },
            advisorId && { label: advisorId, clear: () => setAdvisorId('') },
          ].filter(Boolean).map((chip: any, i) => (
            <button
              key={i}
              type="button"
              onClick={chip.clear}
              className="rounded-full border border-line bg-paper px-2.5 py-1 text-xs text-muted hover:border-danger hover:text-danger"
            >
              {chip.label} ✕
            </button>
          ))}
        </div>
      )}

      {meta?.threshold != null && (
        <p className="mb-3 text-xs text-muted">{lang === 'he' ? `סף "תקוע": ${meta.threshold} ימים` : `"Stuck" threshold: ${meta.threshold} days`}</p>
      )}

      {error && <p className="mb-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>}

      {loading ? (
        <p className="text-sm text-muted">{t('loading')}</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted">📭 {lang === 'he' ? 'אין נתונים' : 'No data'}</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {rows.map((row, idx) => (
            <div key={idx} className="rounded-[var(--radius)] border border-line bg-surface p-3.5">
              {def.fields.map((f) => (
                <div key={f.key} className="flex items-center justify-between gap-2 py-0.5">
                  <span className="text-xs text-muted">{lang === 'he' ? f.he : f.en}</span>
                  <span className="text-end text-sm font-medium text-ink">{displayValue(row[f.key])}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </DashboardShell>
  );
}
