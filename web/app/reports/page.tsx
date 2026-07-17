'use client';

// app/reports/page.tsx
// Ported from mobile/app/(tabs)/Reports.tsx — same 9 report types, same
// curated field list per type, same filter bar and export button.

import { useCallback, useEffect, useState } from 'react';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { useRequireRole } from '@/hooks/useRequireRole';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/apiClient';
import type { AppRole } from '@/lib/roles';
import { REPORTS, displayValue, type ReportType } from './types';
import { downloadReportExport } from './downloadExport';

const REPORT_ROLES: AppRole[] = ['coordinator', 'faculty_admin', 'program_head', 'administrative_secretary', 'grad_school_head', 'system_admin'];

export default function ReportsPage() {
  const { loading: guardLoading, isAllowed } = useRequireRole(REPORT_ROLES);
  const { lang, t } = useLanguage();

  const [activeReport, setActiveReport] = useState<ReportType>('full-status');
  const [startYear, setStartYear] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(false);

  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [meta, setMeta] = useState<{ threshold?: number } | null>(null);
  const [error, setError] = useState('');

  const filters = {
    startYear: startYear ? Number(startYear) : undefined,
    overdueOnly: overdueOnly || undefined,
  };

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
  }, [activeReport, startYear, overdueOnly, lang]);

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
