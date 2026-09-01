'use client';

// components/BulkImportModal.tsx
// Shared by admin/panel and coordinator/home — same three actions
// (export users, import staff, import student roster), scoped to that
// role's own faculty when scope is 'coordinator'.

import { useRef, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient, downloadAuthenticatedFile } from '@/lib/apiClient';
import { useModalA11y } from '@/hooks/useModalA11y';

type Scope = 'admin' | 'coordinator';

interface BulkImportModalProps {
  scope: Scope;
  onClose: () => void;
  onImported?: () => void;
}

interface ImportResultRow {
  row: number;
  label: string;
  status: string;
  reason?: string;
}

export function BulkImportModal({ scope, onClose, onImported }: BulkImportModalProps) {
  const { lang } = useLanguage();
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalA11y(dialogRef, true, onClose);
  const [exporting, setExporting] = useState(false);
  const [importingStaff, setImportingStaff] = useState(false);
  const [importingRoster, setImportingRoster] = useState(false);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState<{ title: string; counts: Record<string, number>; failedRows: ImportResultRow[] } | null>(null);

  const handleExport = async () => {
    setExporting(true);
    setError('');
    try {
      const path = scope === 'admin' ? '/api/admin/users/export' : '/api/coordinator/users/export';
      await downloadAuthenticatedFile(path, `users_export_${scope}.xlsx`);
    } catch (err) {
      setError(err instanceof Error ? err.message : lang === 'he' ? 'ייצוא המשתמשים נכשל' : 'Failed to export users');
    } finally {
      setExporting(false);
    }
  };

  const pickExcelFile = (): Promise<File | null> =>
    new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel';
      input.onchange = () => resolve(input.files?.[0] ?? null);
      input.click();
    });

  const handleImportStaff = async () => {
    const file = await pickExcelFile();
    if (!file) return;
    setImportingStaff(true);
    setError('');
    setSummary(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await apiClient.importStaffExcel(scope, formData);
      const s = res.summary;
      setSummary({
        title: lang === 'he' ? '📥 תוצאות ייבוא סגל' : '📥 Staff Import Results',
        counts: {
          [lang === 'he' ? 'נוצרו' : 'Created']: s.created,
          [lang === 'he' ? 'דולגו' : 'Skipped']: s.skipped,
          [lang === 'he' ? 'נכשלו' : 'Failed']: s.failed,
          [lang === 'he' ? 'סה"כ שורות' : 'Total rows']: s.totalRows,
        },
        failedRows: s.details.filter((d) => d.status === 'failed').map((d) => ({ row: d.row, label: d.email, status: d.status, reason: d.reason })),
      });
      onImported?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : lang === 'he' ? 'ייבוא הסגל נכשל' : 'Failed to import staff');
    } finally {
      setImportingStaff(false);
    }
  };

  const handleImportRoster = async () => {
    const file = await pickExcelFile();
    if (!file) return;
    setImportingRoster(true);
    setError('');
    setSummary(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await apiClient.importStudentRosterExcel(scope, formData);
      const s = res.summary;
      setSummary({
        title: lang === 'he' ? '🎓 תוצאות ייבוא רשימת סטודנטים' : '🎓 Student Roster Import Results',
        counts: {
          [lang === 'he' ? 'נוספו' : 'Added']: s.imported,
          [lang === 'he' ? 'דולגו' : 'Skipped']: s.skipped,
          [lang === 'he' ? 'נכשלו' : 'Failed']: s.failed,
          [lang === 'he' ? 'סה"כ שורות' : 'Total rows']: s.totalRows,
        },
        failedRows: s.details.filter((d) => d.status === 'failed').map((d) => ({ row: d.row, label: d.studentId, status: d.status, reason: d.reason })),
      });
      onImported?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : lang === 'he' ? 'ייבוא רשימת הסטודנטים נכשל' : 'Failed to import the student roster');
    } finally {
      setImportingRoster(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-[var(--radius)] bg-surface p-6 shadow-lg outline-none"
      >
        <div className="flex items-start justify-between">
          <h2 className="text-lg font-semibold text-ink">{lang === 'he' ? 'ייבוא וייצוא נתונים' : 'Bulk Import / Export'}</h2>
          <button type="button" onClick={onClose} aria-label={lang === 'he' ? 'סגור' : 'Close'} className="text-muted hover:text-ink">
            ✕
          </button>
        </div>
        <p className="mt-1 text-xs text-muted">
          {scope === 'coordinator'
            ? lang === 'he' ? 'הפעולות מוגבלות לפקולטה שלך בלבד' : 'Actions are scoped to your own faculty only'
            : lang === 'he' ? 'הפעולות חלות על כל המערכת' : 'Actions apply system-wide'}
        </p>

        <div className="mt-5 grid gap-2.5">
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting}
            className="rounded-lg border border-line px-4 py-2.5 text-sm font-medium text-ink hover:border-primary hover:text-primary disabled:opacity-60"
          >
            {exporting ? '…' : `⬇️ ${lang === 'he' ? 'ייצוא רשימת משתמשים' : 'Export Users List'}`}
          </button>

          <button
            type="button"
            onClick={handleImportStaff}
            disabled={importingStaff}
            className="rounded-lg border border-line px-4 py-2.5 text-sm font-medium text-ink hover:border-primary hover:text-primary disabled:opacity-60"
          >
            {importingStaff ? (lang === 'he' ? 'מעלה ומעבד...' : 'Uploading & processing…') : `📤 ${lang === 'he' ? 'ייבוא רשימת סגל (Excel)' : 'Import Staff List (Excel)'}`}
          </button>

          <button
            type="button"
            onClick={handleImportRoster}
            disabled={importingRoster}
            className="rounded-lg border border-line px-4 py-2.5 text-sm font-medium text-ink hover:border-primary hover:text-primary disabled:opacity-60"
          >
            {importingRoster ? (lang === 'he' ? 'מעלה ומעבד...' : 'Uploading & processing…') : `🎓 ${lang === 'he' ? 'ייבוא רשימת סטודנטים מאושרים (Excel)' : 'Import Approved Student Roster (Excel)'}`}
          </button>
        </div>

        {error && <p className="mt-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">{error}</p>}

        {summary && (
          <div className="mt-4 rounded-lg bg-paper p-3.5">
            <p className="text-sm font-semibold text-ink">{summary.title}</p>
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              {Object.entries(summary.counts).map(([label, value]) => (
                <div key={label} className="flex items-center justify-between rounded-md bg-surface px-2.5 py-1.5 text-xs">
                  <span className="text-muted">{label}</span>
                  <span className="font-semibold text-ink">{value}</span>
                </div>
              ))}
            </div>
            {summary.failedRows.length > 0 && (
              <div className="mt-3 grid gap-1">
                <p className="text-xs font-semibold text-danger">{lang === 'he' ? 'שורות שנכשלו:' : 'Failed rows:'}</p>
                {summary.failedRows.slice(0, 10).map((r, i) => (
                  <p key={i} className="text-xs text-danger">
                    #{r.row} {r.label || '—'}: {r.reason}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
