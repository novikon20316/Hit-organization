'use client';

// components/dashboard/SupervisorCreditPointsPanel.tsx
// Standalone screen for "נקודות זכות למנחים" (Supervisor credit points),
// extracted out of CoordinatorStatisticsTab.tsx's section 7 so
// administrative_secretary/system_admin get it as its own menu item instead
// of a scroll-to-the-bottom-of-Statistics section. Reuses the same
// GET /api/project-coordinator/statistics response CoordinatorStatisticsTab
// uses (it already returns supervisorPaymentRates + supervisorCreditPoints
// for every faculty in the caller's scope) — no backend change needed. The
// plain coordinator role still sees this inline in its own Statistics tab
// (see CoordinatorStatisticsTab's showCreditPoints prop), so this panel
// intentionally duplicates that section's rendering rather than sharing it.

import { useEffect, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient, type PaymentCategory, type SupervisorPaymentRates } from '@/lib/apiClient';
import { facultyLabel, type FacultyId } from '@/lib/i18n';

type Stats = Awaited<ReturnType<typeof apiClient.getCoordinatorStatistics>>;

const PAYMENT_CATEGORIES: PaymentCategory[] = ['msc_thesis', 'msc_project', 'bsc_project'];
const CATEGORY_LABELS: Record<PaymentCategory, { he: string; en: string }> = {
  msc_thesis: { he: 'תזה', en: 'Thesis' },
  msc_project: { he: 'פרויקט גמר תואר שני', en: "Master's final project" },
  bsc_project: { he: 'פרויקט גמר תואר ראשון', en: "Bachelor's final project" },
};
const EMPTY_RATE_ROW: Record<PaymentCategory, number | null> = { msc_thesis: null, msc_project: null, bsc_project: null };

export function SupervisorCreditPointsPanel() {
  const { lang } = useLanguage();
  const [data, setData] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [noScopeAssigned, setNoScopeAssigned] = useState(false);
  const [rateEdits, setRateEdits] = useState<SupervisorPaymentRates>({});
  const [savingRates, setSavingRates] = useState(false);
  const [rateSaveError, setRateSaveError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiClient
      .getCoordinatorStatistics()
      .then((res) => {
        if (cancelled) return;
        setData(res);
        setNoScopeAssigned(!!res.noScopeAssigned);
        setRateEdits(res.supervisorPaymentRates ?? {});
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
  }, [lang, reloadKey]);

  const updateRateEdit = (facultyId: string, category: PaymentCategory, value: string) => {
    setRateEdits((prev) => ({
      ...prev,
      [facultyId]: { ...EMPTY_RATE_ROW, ...prev[facultyId], [category]: value === '' ? null : Number(value) },
    }));
  };

  const handleSaveRates = async () => {
    setSavingRates(true);
    setRateSaveError('');
    try {
      await apiClient.updateSupervisorPaymentRates(rateEdits);
      setReloadKey((k) => k + 1);
    } catch (err) {
      setRateSaveError(err instanceof Error ? err.message : lang === 'he' ? 'השמירה נכשלה' : 'Save failed');
    } finally {
      setSavingRates(false);
    }
  };

  if (loading && !data) return <p className="text-sm text-muted">…</p>;
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
  if (!data) return null;

  const allowedFacultyIds = data.allowedFacultyIds ?? [];

  return (
    <div className="mb-4 rounded-[var(--radius)] border border-line bg-surface p-4">
      <p className="mb-3 text-sm font-semibold text-ink">
        {lang === 'he' ? '💰 נקודות זכות למנחים (לאישור תשלום)' : '💰 Supervisor credit points (for payment approval)'}
      </p>
      <p className="mb-3 text-xs text-muted">
        {lang === 'he'
          ? 'מפתח נקודות לכל פקולטה וסוג פרויקט — יש להזין את הערכים הסופיים כשיתקבלו. עד אז, פרויקטים ללא ערך מוגדר לא יחושבו בסה"כ (מסומן ב־⚠️).'
          : "Credit-point key per faculty/category — fill in the final values once known. Until then, categories with no rate set aren't counted in the total (flagged with ⚠️)."}
      </p>

      <div className="mb-4 overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-start text-muted">
              <th className="px-2 py-1 text-start">{lang === 'he' ? 'פקולטה' : 'Faculty'}</th>
              {PAYMENT_CATEGORIES.map((cat) => (
                <th key={cat} className="px-2 py-1 text-start">{lang === 'he' ? CATEGORY_LABELS[cat].he : CATEGORY_LABELS[cat].en}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {allowedFacultyIds.length === 0 && (
              <tr><td colSpan={4} className="px-2 py-1 text-muted">{lang === 'he' ? 'אין נתונים' : 'No data'}</td></tr>
            )}
            {allowedFacultyIds.map((fid) => {
              const row = rateEdits[fid] ?? EMPTY_RATE_ROW;
              return (
                <tr key={fid} className="border-t border-line">
                  <td className="px-2 py-1.5 text-ink">{facultyLabel(fid as FacultyId, lang)}</td>
                  {PAYMENT_CATEGORIES.map((cat) => (
                    <td key={cat} className="px-2 py-1.5">
                      <input
                        type="number"
                        min={0}
                        value={row[cat] ?? ''}
                        onChange={(e) => updateRateEdit(fid, cat, e.target.value)}
                        placeholder="—"
                        className="w-20 rounded-md border border-line bg-surface px-2 py-1 text-xs text-ink focus:border-primary focus:outline-none"
                      />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mb-4 flex items-center gap-2">
        <button
          type="button"
          onClick={handleSaveRates}
          disabled={savingRates || allowedFacultyIds.length === 0}
          className="rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium text-ink hover:border-primary hover:text-primary disabled:opacity-60"
        >
          {savingRates ? '…' : lang === 'he' ? 'שמירת המפתח' : 'Save key'}
        </button>
        {rateSaveError && <span className="text-xs text-danger" role="alert">{rateSaveError}</span>}
      </div>

      {data.supervisorCreditPoints.length === 0 && <p className="text-sm text-muted">{lang === 'he' ? 'אין נתונים' : 'No data'}</p>}
      {[...new Set(data.supervisorCreditPoints.map((r) => r.facultyId))].map((fid) => (
        <div key={fid} className="mb-3">
          <p className="mb-1 text-xs font-semibold text-muted">{facultyLabel(fid as FacultyId, lang)}</p>
          <div className="grid gap-1.5">
            {data.supervisorCreditPoints.filter((r) => r.facultyId === fid).map((r) => (
              <div key={r.supervisorId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-paper px-2.5 py-1.5 text-sm">
                <span className="text-ink">{r.supervisorName}</span>
                <span className="text-xs text-muted">
                  {PAYMENT_CATEGORIES.map((cat) => `${lang === 'he' ? CATEGORY_LABELS[cat].he : CATEGORY_LABELS[cat].en}: ${r.counts[cat]}`).join(' · ')}
                  {' · '}
                  <span className="font-semibold text-ink">{lang === 'he' ? 'סה"כ נקודות' : 'Total points'}: {r.totalPoints}</span>
                  {r.incompleteRates && (
                    <span title={lang === 'he' ? 'המפתח לא הוגדר במלואו — הסכום חלקי' : 'Key not fully set — total is partial'}> ⚠️</span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
