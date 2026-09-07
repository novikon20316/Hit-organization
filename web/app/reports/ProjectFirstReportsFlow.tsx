'use client';

// app/reports/ProjectFirstReportsFlow.tsx
// The one Reports experience for every report-viewing role (coordinator,
// faculty_admin, program_head, administrative_secretary, grad_school_head,
// system_admin) — supersedes both the old report-type-first + auto-computed
// "every matching row" page body and administrative_secretary's own
// single-project AdminCoordinatorReportsFlow. Project-first for everyone:
// pick a report type, check off the project(s)/thesis you want it for from
// the results list, "Create Report" previews it on the page, "Export to
// Excel" downloads the current filter-wide set.
//
// Every role sees only the projects its own permissions allow — the server
// (reportsController.ts's resolveFacultyScope) already scopes
// getReportProjects/getReport per role (coordinator/administrative_secretary
// by their coordinatorScopes, faculty_admin/program_head/grad_school_head by
// their granted faculty(s), system_admin unrestricted) — this component adds
// no client-side scoping of its own, it just renders whatever the server
// hands back. The one role-visible difference is the faculty filter, shown
// only for system_admin since she's the only one without a single pinned
// faculty scope to begin with.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/apiClient';
import type { AppRole } from '@/lib/roles';
import { REPORTS, displayValue, fieldsForAdministrativeCoordinator, type ReportType } from './types';
import { downloadReportExport } from './downloadExport';
import { ReportFiltersBar } from './ReportFiltersBar';

interface ProjectOption {
  id: string;
  projectTitleHe: string;
  projectTitleEn: string;
  advisorName: string;
  startYearHebrew: string | null;
}

interface ProjectFirstReportsFlowProps {
  activeRole: AppRole | null | undefined;
}

export function ProjectFirstReportsFlow({ activeRole }: ProjectFirstReportsFlowProps) {
  const { lang, t } = useLanguage();
  const isSystemAdmin = activeRole === 'system_admin';
  // She manages a handful of specific projects rather than a whole faculty of
  // students — every report's "Student" column becomes "Project/Thesis"
  // instead, so a group project's several students don't show as identical
  // rows (see fieldsForAdministrativeCoordinator). Her export also matches
  // whichever language she's viewing in; everyone else's export stays
  // English-only, unchanged.
  const isAdminCoordinator = activeRole === 'administrative_secretary';

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
  const [search, setSearch] = useState('');

  const [activeReport, setActiveReport] = useState<ReportType | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [projects, setProjects] = useState<ProjectOption[] | null>(null);
  const [projectsError, setProjectsError] = useState('');

  const [rows, setRows] = useState<Record<string, unknown>[] | null>(null);
  const [meta, setMeta] = useState<{ threshold?: number } | null>(null);
  const [creating, setCreating] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');

  const filters = useMemo(() => ({
    startYear: startYear ? Number(startYear) : undefined,
    overdueOnly: overdueOnly || undefined,
    degreeType: degreeType || undefined,
    projectType: projectType || undefined,
    milestoneType: milestoneType || undefined,
    processStatus: processStatus || undefined,
    facultyId: isSystemAdmin && facultyId ? facultyId : undefined,
    advisorId: advisorId || undefined,
    examinerId: examinerId || undefined,
  }), [startYear, overdueOnly, degreeType, projectType, milestoneType, processStatus, facultyId, advisorId, examinerId, isSystemAdmin]);

  useEffect(() => {
    apiClient.getInternalExaminerList()
      .then((list) => setExaminerOptions((list ?? []).map((u: any) => ({ id: u.id, displayName: u.displayName ?? u.id }))))
      .catch(() => setExaminerOptions([]));
  }, []);

  const loadProjects = useCallback(() => {
    setProjectsError('');
    apiClient.getReportProjects(filters)
      .then((res) => {
        const list = res.projects ?? [];
        setProjects(list);
        // A filter change can drop a project out of the list out from under
        // an existing checkbox pick — un-check it rather than silently
        // running "Create Report" against a project no longer shown.
        setSelectedIds((prev) => new Set([...prev].filter((id) => list.some((p) => p.id === id))));
      })
      .catch((err) => {
        setProjectsError(err instanceof Error ? err.message : lang === 'he' ? 'טעינת הפרויקטים נכשלה' : 'Failed to load projects');
        setProjects([]);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, lang]);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const filteredProjects = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!projects) return [];
    if (!q) return projects;
    return projects.filter(
      (p) => p.projectTitleHe.toLowerCase().includes(q) || p.projectTitleEn.toLowerCase().includes(q) || p.advisorName.toLowerCase().includes(q)
    );
  }, [projects, search]);

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleCreateReport = async () => {
    if (!activeReport || selectedIds.size === 0) return;
    setCreating(true);
    setError('');
    try {
      const res = await apiClient.getReport(activeReport, { ...filters, projectIds: [...selectedIds].join(',') });
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
      setCreating(false);
    }
  };

  const handleExport = async () => {
    if (!activeReport) return;
    setExporting(true);
    setError('');
    try {
      await downloadReportExport(activeReport, isAdminCoordinator ? { ...filters, lang } : filters);
    } catch (err) {
      setError(err instanceof Error ? err.message : lang === 'he' ? 'הייצוא נכשל' : 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  const projectLabel = (p: ProjectOption) => (lang === 'he' ? p.projectTitleHe || p.projectTitleEn : p.projectTitleEn || p.projectTitleHe);
  const def = activeReport ? REPORTS.find((r) => r.key === activeReport)! : null;
  const displayFields = def ? (isAdminCoordinator ? fieldsForAdministrativeCoordinator(def) : def.fields) : [];

  return (
    <DashboardShell
      title={lang === 'he' ? 'דוחות' : 'Reports'}
      subtitle={isSystemAdmin
        ? (lang === 'he' ? 'מעקב תהליכים והנחיה בכל הפקולטות' : 'Cross-faculty process and supervision tracking')
        : (lang === 'he' ? 'מעקב תהליכים והנחיה בפקולטה' : 'Process and supervision tracking')}
    >
      <ReportFiltersBar
        lang={lang}
        isSystemAdmin={isSystemAdmin}
        startYear={startYear} onStartYearChange={setStartYear}
        facultyId={facultyId} onFacultyIdChange={setFacultyId}
        degreeType={degreeType} onDegreeTypeChange={setDegreeType}
        projectType={projectType} onProjectTypeChange={setProjectType}
        milestoneType={milestoneType} onMilestoneTypeChange={setMilestoneType}
        processStatus={processStatus} onProcessStatusChange={setProcessStatus}
        examinerId={examinerId} onExaminerIdChange={setExaminerId} examinerOptions={examinerOptions}
        advisorId={advisorId} onAdvisorIdChange={setAdvisorId}
        overdueOnly={overdueOnly} onOverdueOnlyChange={setOverdueOnly}
        actions={
          <>
            <button
              type="button"
              onClick={handleCreateReport}
              disabled={!activeReport || selectedIds.size === 0 || creating}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
            >
              {creating ? '…' : `📊 ${lang === 'he' ? 'צור דוח' : 'Create Report'}`}
            </button>
            <button
              type="button"
              onClick={handleExport}
              disabled={!activeReport || exporting}
              className="rounded-lg bg-success px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
            >
              {exporting ? '…' : `📤 ${lang === 'he' ? 'ייצוא לאקסל' : 'Export to Excel'}`}
            </button>
          </>
        }
      />

      <p className="mb-2 text-sm font-medium text-ink">{lang === 'he' ? '1. בחר/י סוג דוח' : '1. Pick a report type'}</p>
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {REPORTS.map((r) => (
          <button
            key={r.key}
            type="button"
            onClick={() => setActiveReport(r.key)}
            className={`rounded-[var(--radius)] border p-3.5 text-start transition-colors ${
              activeReport === r.key ? 'border-primary bg-primary/5' : 'border-line bg-surface hover:border-primary/40'
            }`}
          >
            <p className={`text-sm font-semibold ${activeReport === r.key ? 'text-primary' : 'text-ink'}`}>
              {lang === 'he' ? r.he : r.en}
            </p>
            <p className="mt-1 text-xs text-muted">{lang === 'he' ? r.heDesc : r.enDesc}</p>
          </button>
        ))}
      </div>

      <p className="mb-3 text-sm font-medium text-ink">
        {lang === 'he' ? `2. בחר/י פרויקטים/תזות (${selectedIds.size} נבחרו)` : `2. Pick project(s)/thesis (${selectedIds.size} selected)`}
      </p>
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={lang === 'he' ? 'חיפוש פרויקט/תזה או מנחה...' : 'Search project/thesis or advisor...'}
        className="mb-3 w-full max-w-sm rounded-lg border border-line bg-surface px-3.5 py-2 text-sm text-ink focus:border-primary focus:outline-none"
      />
      {projectsError && <p className="mb-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">{projectsError}</p>}
      {projects === null ? (
        <p className="text-sm text-muted">{t('loading')}</p>
      ) : filteredProjects.length === 0 ? (
        <p className="text-sm text-muted">
          📭 {search
            ? (lang === 'he' ? 'לא נמצאו פרויקטים תואמים' : 'No matching projects found')
            : (lang === 'he' ? 'אין פרויקטים תואמים לסינון' : 'No projects match the current filters')}
        </p>
      ) : (
        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filteredProjects.map((p) => (
            <label
              key={p.id}
              className={`flex cursor-pointer items-start gap-2 rounded-[var(--radius)] border p-3.5 transition-colors ${
                selectedIds.has(p.id) ? 'border-primary bg-primary/5' : 'border-line bg-surface hover:border-primary/40'
              }`}
            >
              <input
                type="checkbox"
                checked={selectedIds.has(p.id)}
                onChange={() => toggleSelected(p.id)}
                className="mt-1 h-4 w-4 accent-[var(--primary)]"
              />
              <span>
                <p className="text-sm font-semibold text-ink">{projectLabel(p)}</p>
                <p className="mt-1 text-xs text-muted">👨‍🏫 {p.advisorName}</p>
                {p.startYearHebrew && <p className="mt-0.5 text-xs text-muted">📅 {p.startYearHebrew}</p>}
              </span>
            </label>
          ))}
        </div>
      )}

      {error && <p className="mb-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">{error}</p>}

      {rows !== null && def && (
        <>
          <p className="mb-2 text-sm font-semibold text-ink">👁 {lang === 'he' ? def.he : def.en}</p>
          {meta?.threshold != null && (
            <p className="mb-3 text-xs text-muted">{lang === 'he' ? `סף "תקוע": ${meta.threshold} ימים` : `"Stuck" threshold: ${meta.threshold} days`}</p>
          )}
          {rows.length === 0 ? (
            <p className="text-sm text-muted">📭 {lang === 'he' ? 'אין נתונים' : 'No data'}</p>
          ) : (
            <div className="overflow-x-auto rounded-[var(--radius)] border border-line">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-paper">
                    {displayFields.map((f) => (
                      <th key={f.key} className="border-b border-line px-3 py-2 text-start font-semibold text-ink">
                        {lang === 'he' ? f.he : f.en}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, idx) => (
                    <tr key={idx} className="bg-surface even:bg-paper/40">
                      {displayFields.map((f) => (
                        <td key={f.key} className="border-b border-line px-3 py-2 text-ink">
                          {displayValue(row[f.key])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </DashboardShell>
  );
}
