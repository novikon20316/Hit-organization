'use client';

// app/reports/AdminCoordinatorReportsFlow.tsx
// The administrative coordinator's own take on /reports, swapped in by
// page.tsx for her (activeRole === 'administrative_secretary') instead of
// the shared report-type-first + big-filter-bar experience everyone else
// gets. She manages a handful of specific projects, not a whole faculty of
// students, so this is project-first instead: pick the exact project she
// needs → pick which of the 10 report types to run for it → preview it on
// the page or download it — rather than filtering a cross-project list down
// by hand.
//
// Three steps, driven by two pieces of state (selectedProject/
// selectedReportType) rather than a URL param — unlike the shared page,
// there's nothing here worth deep-linking to or preserving across a refresh.

import { useEffect, useMemo, useState } from 'react';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/apiClient';
import { REPORTS, displayValue, fieldsForAdministrativeCoordinator, type ReportType } from './types';
import { downloadReportExport } from './downloadExport';

interface ProjectOption {
  id: string;
  projectTitleHe: string;
  projectTitleEn: string;
  advisorName: string;
  startYearHebrew: string | null;
}

export function AdminCoordinatorReportsFlow() {
  const { lang, t } = useLanguage();

  const [projects, setProjects] = useState<ProjectOption[] | null>(null);
  const [projectsError, setProjectsError] = useState('');
  const [search, setSearch] = useState('');
  const [selectedProject, setSelectedProject] = useState<ProjectOption | null>(null);
  const [selectedReportType, setSelectedReportType] = useState<ReportType | null>(null);

  const [rows, setRows] = useState<Record<string, unknown>[] | null>(null);
  const [meta, setMeta] = useState<{ threshold?: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .getReportProjects()
      .then((res) => {
        if (!cancelled) setProjects(res.projects ?? []);
      })
      .catch((err) => {
        if (!cancelled) setProjectsError(err instanceof Error ? err.message : lang === 'he' ? 'טעינת הפרויקטים נכשלה' : 'Failed to load projects');
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredProjects = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!projects) return [];
    if (!q) return projects;
    return projects.filter(
      (p) => p.projectTitleHe.toLowerCase().includes(q) || p.projectTitleEn.toLowerCase().includes(q) || p.advisorName.toLowerCase().includes(q)
    );
  }, [projects, search]);

  useEffect(() => {
    if (!selectedProject || !selectedReportType) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    apiClient
      .getReport(selectedReportType, { projectId: selectedProject.id })
      .then((res) => {
        if (cancelled) return;
        const data = res.data;
        if (selectedReportType === 'stuck-students') {
          const d = data as { students?: Record<string, unknown>[]; threshold?: number };
          setRows(d.students ?? []);
          setMeta({ threshold: d.threshold });
        } else {
          setRows(Array.isArray(data) ? (data as Record<string, unknown>[]) : []);
          setMeta(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : lang === 'he' ? 'טעינת הדוח נכשלה' : 'Failed to load the report');
          setRows([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProject, selectedReportType]);

  const handleDownload = async () => {
    if (!selectedProject || !selectedReportType) return;
    setExporting(true);
    setError('');
    try {
      await downloadReportExport(selectedReportType, { projectId: selectedProject.id });
    } catch (err) {
      setError(err instanceof Error ? err.message : lang === 'he' ? 'הייצוא נכשל' : 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  const projectLabel = (p: ProjectOption) => (lang === 'he' ? p.projectTitleHe || p.projectTitleEn : p.projectTitleEn || p.projectTitleHe);
  const def = selectedReportType ? REPORTS.find((r) => r.key === selectedReportType)! : null;
  const displayFields = def ? fieldsForAdministrativeCoordinator(def) : [];

  return (
    <DashboardShell title={lang === 'he' ? 'דוחות' : 'Reports'} subtitle={lang === 'he' ? 'מעקב תהליכים והנחיה בפקולטה' : 'Process and supervision tracking'}>
      {!selectedProject ? (
        <>
          <p className="mb-3 text-sm font-medium text-ink">
            {lang === 'he' ? '1. בחר/י פרויקט' : '1. Pick a project'}
          </p>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={lang === 'he' ? 'חיפוש פרויקט/תזה או מנחה...' : 'Search project/thesis or supervisor...'}
            className="mb-4 w-full max-w-sm rounded-lg border border-line bg-surface px-3.5 py-2 text-sm text-ink focus:border-primary focus:outline-none"
          />

          {projectsError && <p className="mb-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">{projectsError}</p>}

          {projects === null ? (
            <p className="text-sm text-muted">{t('loading')}</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filteredProjects.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedProject(p)}
                  className="rounded-[var(--radius)] border border-line bg-surface p-3.5 text-start transition-colors hover:border-primary/40"
                >
                  <p className="text-sm font-semibold text-ink">{projectLabel(p)}</p>
                  <p className="mt-1 text-xs text-muted">👨‍🏫 {p.advisorName}</p>
                  {p.startYearHebrew && <p className="mt-0.5 text-xs text-muted">📅 {p.startYearHebrew}</p>}
                </button>
              ))}
              {filteredProjects.length === 0 && (
                <p className="text-sm text-muted sm:col-span-2 lg:col-span-3">
                  📭 {search ? (lang === 'he' ? 'לא נמצאו פרויקטים תואמים' : 'No matching projects found') : (lang === 'he' ? 'אין פרויקטים להצגה' : 'No projects to show')}
                </p>
              )}
            </div>
          )}
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={() => {
              setSelectedProject(null);
              setSelectedReportType(null);
              setRows(null);
            }}
            className="mb-3 rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink hover:border-primary hover:text-primary"
          >
            {lang === 'he' ? '← החלף פרויקט' : '← Change project'}
          </button>
          <p className="mb-4 text-sm font-semibold text-ink">📁 {projectLabel(selectedProject)}</p>

          {!selectedReportType ? (
            <>
              <p className="mb-3 text-sm font-medium text-ink">
                {lang === 'he' ? '2. בחר/י דוח' : '2. Pick a report'}
              </p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {REPORTS.map((r) => (
                  <button
                    key={r.key}
                    type="button"
                    onClick={() => setSelectedReportType(r.key)}
                    className="rounded-[var(--radius)] border border-line bg-surface p-3.5 text-start transition-colors hover:border-primary/40"
                  >
                    <p className="text-sm font-semibold text-ink">{lang === 'he' ? r.he : r.en}</p>
                    <p className="mt-1 text-xs text-muted">{lang === 'he' ? r.heDesc : r.enDesc}</p>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  setSelectedReportType(null);
                  setRows(null);
                }}
                className="mb-3 rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink hover:border-primary hover:text-primary"
              >
                {lang === 'he' ? '← החלף דוח' : '← Change report'}
              </button>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-ink">{lang === 'he' ? def!.he : def!.en}</p>
                <button
                  type="button"
                  onClick={handleDownload}
                  disabled={exporting}
                  className="rounded-lg bg-success px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
                >
                  {exporting ? '…' : `⬇ ${lang === 'he' ? 'הורדה לאקסל' : 'Download as Excel'}`}
                </button>
              </div>

              {meta?.threshold != null && (
                <p className="mb-3 text-xs text-muted">{lang === 'he' ? `סף "תקוע": ${meta.threshold} ימים` : `"Stuck" threshold: ${meta.threshold} days`}</p>
              )}
              {error && <p className="mb-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">{error}</p>}

              <p className="mb-2 text-xs font-medium text-muted">👁 {lang === 'he' ? 'תצוגה מקדימה' : 'Preview'}</p>
              {loading || rows === null ? (
                <p className="text-sm text-muted">{t('loading')}</p>
              ) : rows.length === 0 ? (
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
        </>
      )}
    </DashboardShell>
  );
}
