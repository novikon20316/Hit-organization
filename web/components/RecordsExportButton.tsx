'use client';

// components/RecordsExportButton.tsx
// "Export to Excel" box on every staff project-records landing page.
// Downloads GET /api/project-records/export — one sheet per project summary
// and one per record, limited server-side to what the caller may see.
// Faculty list comes from GET /api/project-records/faculties (already scoped).

import { Select } from '@/components/ui/Select';
import { useEffect, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient, downloadAuthenticatedFile } from '@/lib/apiClient';
import { facultyLabel, type FacultyId } from '@/lib/i18n';

export function RecordsExportButton() {
  const { lang } = useLanguage();
  const he = lang === 'he';
  const [faculties, setFaculties] = useState<string[]>([]);
  const [facultyId, setFacultyId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    apiClient.getFacultyTaxonomyForRecords()
      .then((res) => setFaculties(res.faculties.map((f) => f.facultyId)))
      .catch(() => setFaculties([]));
  }, []);

  const handleDownload = async () => {
    setDownloading(true);
    setError('');
    try {
      const stamp = new Date().toISOString().slice(0, 10);
      await downloadAuthenticatedFile(
        '/api/project-records/export',
        `project-records-${facultyId || 'all'}-${stamp}.xlsx`,
        { facultyId: facultyId || undefined, from: from || undefined, to: to || undefined },
      );
    } catch {
      setError(he ? 'ההורדה נכשלה' : 'Download failed');
    } finally {
      setDownloading(false);
    }
  };

  const inputClass = 'rounded-lg border border-line bg-surface px-2 py-1.5 text-sm text-ink';

  return (
    <div className="mb-6 rounded-xl border border-line bg-surface p-4">
      <p className="text-sm font-semibold text-ink">{he ? 'ייצוא לאקסל' : 'Export to Excel'}</p>
      <p className="mb-3 mt-1 text-xs text-muted">
        {he
          ? 'כל הרישומים שבתחום האחריות שלך: גיליון סיכום לכל פרויקט (הגשות, דחיות, אישורים, פעילות ראשונה ואחרונה) וגיליון של כל הרשומות. אפשר לסנן לפי פקולטה וטווח תאריכים.'
          : 'Every record within your scope: a summary sheet per project (submissions, rejections, approvals, first and last activity) and a sheet of all records. Optionally filter by faculty and date range.'}
      </p>
      <div className="flex flex-wrap items-end gap-3">
        {faculties.length > 1 && (
          <label className="flex flex-col gap-1 text-xs text-muted">
            {he ? 'פקולטה' : 'Faculty'}
            <Select className={inputClass} value={facultyId} onChange={(e) => setFacultyId(e.target.value)}>
              <option value="">{he ? 'הכל' : 'All'}</option>
              {faculties.map((f) => (
                <option key={f} value={f}>{facultyLabel(f as FacultyId, lang)}</option>
              ))}
            </Select>
          </label>
        )}
        <label className="flex flex-col gap-1 text-xs text-muted">
          {he ? 'מתאריך' : 'From'}
          <input type="date" className={inputClass} value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          {he ? 'עד תאריך' : 'To'}
          <input type="date" className={inputClass} value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
        </label>
        <button
          type="button"
          onClick={handleDownload}
          disabled={downloading}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {downloading ? (he ? 'מוריד…' : 'Downloading…') : (he ? 'הורדת Excel' : 'Download Excel')}
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-red-600" role="alert">{error}</p>}
    </div>
  );
}
