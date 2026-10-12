'use client';

// app/administrative_coordinator/standard-supervisors/page.tsx
// "Standard Supervisor" table for administrative_secretary + system_admin:
// per supervisor, whether they're qualified to open a bachelor final
// project / masters final project / masters thesis alone, without a
// co-supervisor. Backed by GET /api/admin/standard-supervisors (scoped to
// the caller's own coordinatorScopes for administrative_secretary, everyone
// for system_admin) and POST /api/admin/users/:id/standard-supervisor to
// toggle a flag (see adminController.ts).
//
// Excel import: the template (שם מנחה + one checkbox column per category)
// is read server-side (POST /api/admin/standard-supervisors/import-preview)
// and only FILLS the table — changed cells are highlighted and nothing is
// written until "Save changes", which applies each change through the same
// per-flag endpoint as a manual click.

import { useEffect, useRef, useState } from 'react';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { useRequireRole } from '@/hooks/useRequireRole';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/apiClient';
import { facultyLabel, type FacultyId } from '@/lib/i18n';
import { majorsForFaculty } from '@/lib/permissions';
import type { AppRole } from '@/lib/roles';

const ALLOWED_ROLES: AppRole[] = ['administrative_secretary', 'system_admin'];

type Category = 'bachelor_project' | 'masters_project' | 'masters_thesis';
const CATEGORIES: Category[] = ['bachelor_project', 'masters_project', 'masters_thesis'];
const CATEGORY_LABELS: Record<Category, { he: string; en: string }> = {
  bachelor_project: { he: 'פרויקט גמר תואר ראשון', en: "Bachelor's final project" },
  masters_project: { he: 'פרויקט גמר תואר שני', en: "Master's final project" },
  masters_thesis: { he: 'תזה', en: 'Thesis' },
};

type Supervisor = Awaited<ReturnType<typeof apiClient.getStandardSupervisors>>['supervisors'][number];
type ImportPreview = Awaited<ReturnType<typeof apiClient.previewStandardSupervisorImport>>;
type Flags = Supervisor['standardSupervisorEligibility'];

const UNMATCHED_REASON: Record<ImportPreview['unmatched'][number]['reason'], { he: string; en: string }> = {
  not_found: { he: 'לא נמצא מנחה בשם זה', en: 'No supervisor with this name' },
  ambiguous: { he: 'נמצא יותר ממנחה אחד בשם זה', en: 'More than one supervisor has this name' },
  duplicate: { he: 'המנחה מופיע/ה יותר מפעם אחת בקובץ', en: 'This supervisor appears more than once in the file' },
};

function majorLabels(facultyId: string, majors: string[], lang: 'he' | 'en'): string {
  if (!majors.length) return lang === 'he' ? 'כל המגמות' : 'All majors';
  const all = majorsForFaculty(facultyId);
  return majors.map((slug) => all.find((m) => m.slug === slug)?.label[lang] ?? slug).join(', ');
}

export default function StandardSupervisorsPage() {
  const { isAllowed } = useRequireRole(ALLOWED_ROLES);
  const { lang } = useLanguage();
  const [supervisors, setSupervisors] = useState<Supervisor[] | null>(null);
  const [error, setError] = useState('');
  const [savingKey, setSavingKey] = useState<string | null>(null);

  // Excel import — values loaded from the file but not saved yet, keyed by
  // supervisor id. Present = the table shows these instead of the saved
  // values, and a manual click edits them too until Save/Discard.
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<Record<string, Flags> | null>(null);
  const [importInfo, setImportInfo] = useState<{ fileName: string; matched: number; unmatched: ImportPreview['unmatched'] } | null>(null);
  const [importing, setImporting] = useState(false);
  const [savingImport, setSavingImport] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!isAllowed) return;
    apiClient
      .getStandardSupervisors()
      .then((res) => setSupervisors(res.supervisors))
      .catch(() => {
        setError(lang === 'he' ? 'טעינת רשימת המנחים נכשלה' : 'Failed to load supervisors');
      });
  }, [isAllowed, lang]);

  const shownFlags = (s: Supervisor): Flags => pending?.[s.id] ?? s.standardSupervisorEligibility;
  const changedCells = (supervisors ?? []).flatMap((s) =>
    pending?.[s.id] ? CATEGORIES.filter((c) => pending[s.id]![c] !== s.standardSupervisorEligibility[c]).map((c) => ({ s, c })) : [],
  );

  const handleToggle = async (supervisor: Supervisor, category: Category) => {
    // While an imported file is under review, a click adjusts the pending
    // values instead of saving immediately.
    if (pending) {
      const current = shownFlags(supervisor);
      setPending((prev) => ({ ...(prev ?? {}), [supervisor.id]: { ...current, [category]: !current[category] } }));
      return;
    }
    const key = `${supervisor.id}:${category}`;
    const nextValue = !supervisor.standardSupervisorEligibility[category];
    setSavingKey(key);
    setSupervisors((prev) =>
      prev?.map((s) => (s.id === supervisor.id ? { ...s, standardSupervisorEligibility: { ...s.standardSupervisorEligibility, [category]: nextValue } } : s)) ?? null,
    );
    try {
      await apiClient.setStandardSupervisorFlag(supervisor.id, category, nextValue);
    } catch (err) {
      // Revert on failure.
      setSupervisors((prev) =>
        prev?.map((s) => (s.id === supervisor.id ? { ...s, standardSupervisorEligibility: { ...s.standardSupervisorEligibility, [category]: !nextValue } } : s)) ?? null,
      );
      setError(err instanceof Error ? err.message : lang === 'he' ? 'העדכון נכשל' : 'Update failed');
    } finally {
      setSavingKey(null);
    }
  };

  const handleFilePicked = async (file: File | undefined) => {
    if (!file || !supervisors) return;
    setImporting(true);
    setError('');
    setNotice('');
    try {
      const preview = await apiClient.previewStandardSupervisorImport(file);
      const next: Record<string, Flags> = {};
      preview.matches.forEach((m) => {
        const s = supervisors.find((x) => x.id === m.supervisorId);
        if (!s) return;
        // A category column missing from the file leaves that value as is.
        next[s.id] = { ...s.standardSupervisorEligibility, ...m.flags };
      });
      setPending(next);
      setImportInfo({ fileName: file.name, matched: preview.matches.length, unmatched: preview.unmatched });
    } catch (err) {
      setError(err instanceof Error ? err.message : lang === 'he' ? 'קריאת הקובץ נכשלה' : 'Failed to read the file');
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const discardImport = () => {
    setPending(null);
    setImportInfo(null);
  };

  const saveImport = async () => {
    setSavingImport(true);
    setError('');
    const failures: string[] = [];
    let saved = 0;
    for (const { s, c } of changedCells) {
      const value = pending![s.id]![c];
      try {
        await apiClient.setStandardSupervisorFlag(s.id, c, value);
        saved += 1;
        setSupervisors((prev) =>
          prev?.map((x) => (x.id === s.id ? { ...x, standardSupervisorEligibility: { ...x.standardSupervisorEligibility, [c]: value } } : x)) ?? null,
        );
      } catch {
        failures.push(`${s.displayName} — ${CATEGORY_LABELS[c][lang]}`);
      }
    }
    setSavingImport(false);
    if (failures.length > 0) {
      // Keep the import open so the failed cells stay highlighted for a retry.
      setError(lang === 'he' ? `נשמרו ${saved} שינויים. נכשלו: ${failures.join('; ')}` : `Saved ${saved} changes. Failed: ${failures.join('; ')}`);
      return;
    }
    setPending(null);
    setImportInfo(null);
    setNotice(lang === 'he' ? `נשמרו ${saved} שינויים מהקובץ.` : `Saved ${saved} changes from the file.`);
  };

  if (!isAllowed) return null;

  return (
    <DashboardShell title={lang === 'he' ? 'מנחה סטנדרטי' : 'Standard Supervisor'} showBackButton={false}>
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <p className="min-w-0 flex-1 text-sm text-administrative-coordinator-on-surface-variant">
            {lang === 'he'
              ? 'מנחה סטנדרטי כשיר לפתוח פרויקט גמר/תזה בעצמו, ללא צורך במנחה נוסף. סמן/י בהתאם לכל קטגוריה.'
              : "A standard supervisor is qualified to open a final project/thesis on their own, without needing a co-supervisor. Check the categories that apply."}
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
            className="hidden"
            onChange={(e) => handleFilePicked(e.target.files?.[0])}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={importing || savingImport || supervisors === null}
            className="shrink-0 rounded-lg border border-administrative-coordinator-primary px-3 py-2 text-sm font-semibold text-administrative-coordinator-primary hover:bg-administrative-coordinator-surface-container-low disabled:opacity-60"
          >
            {importing ? (lang === 'he' ? 'קורא את הקובץ…' : 'Reading file…') : `📥 ${lang === 'he' ? 'העלאת קובץ אקסל' : 'Upload Excel file'}`}
          </button>
        </div>

        {importInfo && (
          <div className="mb-4 rounded-administrative-coordinator border border-administrative-coordinator-primary bg-administrative-coordinator-surface-container-low p-3" role="status">
            <p className="text-sm font-semibold text-administrative-coordinator-on-surface">
              {lang === 'he'
                ? `נטען מהקובץ "${importInfo.fileName}": ${importInfo.matched} מנחים זוהו, ${changedCells.length} שינויים — טרם נשמרו.`
                : `Loaded from "${importInfo.fileName}": ${importInfo.matched} supervisors matched, ${changedCells.length} changes — not saved yet.`}
            </p>
            <p className="mt-0.5 text-xs text-administrative-coordinator-on-surface-variant">
              {lang === 'he'
                ? 'התאים שהשתנו מסומנים בטבלה. ניתן לתקן ידנית לפני השמירה.'
                : 'Changed cells are highlighted in the table. You can still adjust them before saving.'}
            </p>
            {importInfo.unmatched.length > 0 && (
              <div className="mt-2 rounded-md bg-danger-bg px-3 py-2 text-xs text-danger">
                <p className="font-semibold">
                  {lang === 'he' ? `${importInfo.unmatched.length} שורות לא יובאו:` : `${importInfo.unmatched.length} rows were not imported:`}
                </p>
                <ul className="mt-1 grid gap-0.5">
                  {importInfo.unmatched.map((u) => (
                    <li key={`${u.rowNumber}-${u.name}`}>
                      {lang === 'he' ? `שורה ${u.rowNumber}` : `Row ${u.rowNumber}`}: {u.name} — {UNMATCHED_REASON[u.reason][lang]}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={saveImport}
                disabled={savingImport || changedCells.length === 0}
                className="rounded-lg bg-administrative-coordinator-primary px-4 py-2 text-sm font-semibold text-administrative-coordinator-on-primary hover:opacity-90 disabled:opacity-60"
              >
                {savingImport ? (lang === 'he' ? 'שומר…' : 'Saving…') : (lang === 'he' ? 'שמירת השינויים' : 'Save changes')}
              </button>
              <button
                type="button"
                onClick={discardImport}
                disabled={savingImport}
                className="rounded-lg border border-administrative-coordinator-outline-variant px-4 py-2 text-sm font-semibold text-administrative-coordinator-on-surface-variant hover:bg-administrative-coordinator-surface-container-lowest disabled:opacity-60"
              >
                {lang === 'he' ? 'ביטול' : 'Discard'}
              </button>
            </div>
          </div>
        )}

        {notice && <p className="mb-4 rounded-md bg-success-bg px-3 py-2 text-sm text-success" role="status">{notice}</p>}
        {error && <p className="mb-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">{error}</p>}
        {!error && supervisors === null && <p className="text-sm text-administrative-coordinator-on-surface-variant" role="status" aria-live="polite">{lang === 'he' ? 'טוען…' : 'Loading…'}</p>}
        {!error && supervisors !== null && supervisors.length === 0 && (
          <p className="text-sm text-administrative-coordinator-on-surface-variant">
            {lang === 'he' ? 'אין מנחים להצגה.' : 'No supervisors to show.'}
          </p>
        )}

        {supervisors !== null && supervisors.length > 0 && (
          <div className="overflow-x-auto rounded-administrative-coordinator border border-administrative-coordinator-outline-variant">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-administrative-coordinator-outline-variant bg-administrative-coordinator-surface-container-lowest text-start text-xs text-administrative-coordinator-on-surface-variant">
                  <th className="px-3 py-2 text-start">{lang === 'he' ? 'מנחה' : 'Supervisor'}</th>
                  <th className="px-3 py-2 text-start">{lang === 'he' ? 'פקולטה / מגמות' : 'Faculty / Majors'}</th>
                  {CATEGORIES.map((cat) => (
                    <th key={cat} className="px-3 py-2 text-center">{lang === 'he' ? CATEGORY_LABELS[cat].he : CATEGORY_LABELS[cat].en}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {supervisors.map((s) => {
                  const flags = shownFlags(s);
                  return (
                    <tr key={s.id} className="border-b border-administrative-coordinator-outline-variant last:border-0">
                      <td className="px-3 py-2">
                        <p className="font-medium text-administrative-coordinator-on-surface">{s.displayName}</p>
                        <p className="text-xs text-administrative-coordinator-on-surface-variant" dir="ltr">{s.email}</p>
                      </td>
                      <td className="px-3 py-2 text-xs text-administrative-coordinator-on-surface-variant">
                        <span className="block">{facultyLabel(s.facultyId as FacultyId, lang)}</span>
                        <span className="block">{majorLabels(s.facultyId, s.assignedMajors, lang)}</span>
                      </td>
                      {CATEGORIES.map((cat) => {
                        const changed = !!pending?.[s.id] && flags[cat] !== s.standardSupervisorEligibility[cat];
                        return (
                          <td key={cat} className={`px-3 py-2 text-center ${changed ? 'bg-administrative-coordinator-primary/15' : ''}`}>
                            <input
                              type="checkbox"
                              checked={!!flags[cat]}
                              disabled={savingKey === `${s.id}:${cat}` || savingImport}
                              onChange={() => handleToggle(s, cat)}
                              aria-label={`${s.displayName} — ${CATEGORY_LABELS[cat][lang]}${changed ? (lang === 'he' ? ' (שונה, טרם נשמר)' : ' (changed, not saved)') : ''}`}
                              className="h-4 w-4 accent-administrative-coordinator-primary"
                            />
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
