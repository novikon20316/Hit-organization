'use client';

// components/dashboard/CoordinatorStatisticsTab.tsx
// Shared "Statistics" tab for both coordinator-like dashboards
// (app/administrative_coordinator/dashboard and app/coordinator/home) — the
// six job-relevant statistics: milestone distribution, milestone completion
// rates, final grades, applications per faculty, on-time completion, and
// year-of-study distribution — each viewable aggregated across every faculty
// in the caller's scope (the default) or narrowed to one via the faculty
// filter below, and downloadable as a multi-sheet .xlsx. Data comes from
// GET /api/project-coordinator/statistics (see
// projectCoordinatorController.ts's getCoordinatorStatistics), which scopes
// the response per-role: administrative_secretary and coordinator each only
// ever see their own assigned faculty/faculties, never anyone else's.

import { useEffect, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient, downloadAuthenticatedFile, type PaymentCategory, type SupervisorPaymentRates } from '@/lib/apiClient';
import { facultyLabel, type FacultyId } from '@/lib/i18n';

type Stats = Awaited<ReturnType<typeof apiClient.getCoordinatorStatistics>>;

const PAYMENT_CATEGORIES: PaymentCategory[] = ['msc_thesis', 'msc_project', 'bsc_project'];
const CATEGORY_LABELS: Record<PaymentCategory, { he: string; en: string }> = {
  msc_thesis: { he: 'תזה', en: 'Thesis' },
  msc_project: { he: 'פרויקט גמר תואר שני', en: "Master's final project" },
  bsc_project: { he: 'פרויקט גמר תואר ראשון', en: "Bachelor's final project" },
};
const EMPTY_RATE_ROW: Record<PaymentCategory, number | null> = { msc_thesis: null, msc_project: null, bsc_project: null };

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mb-4 rounded-[var(--radius)] border border-line bg-surface p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-ink">{title}</p>
        {action}
      </div>
      {children}
    </div>
  );
}

function DownloadButton({ onClick, busy, lang }: { onClick: () => void; busy: boolean; lang: 'he' | 'en' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="shrink-0 rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium text-ink hover:border-primary hover:text-primary disabled:opacity-60"
    >
      {busy ? '…' : `⬇️ ${lang === 'he' ? 'הורדה' : 'Download'}`}
    </button>
  );
}

export function CoordinatorStatisticsTab() {
  const { lang } = useLanguage();
  const [facultyFilter, setFacultyFilter] = useState<'all' | FacultyId>('all');
  const [allowedFacultyIds, setAllowedFacultyIds] = useState<string[]>([]);
  const [data, setData] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [noScopeAssigned, setNoScopeAssigned] = useState(false);
  const [expandedType, setExpandedType] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState('');
  const [rateEdits, setRateEdits] = useState<SupervisorPaymentRates>({});
  const [savingRates, setSavingRates] = useState(false);
  const [rateSaveError, setRateSaveError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiClient
      .getCoordinatorStatistics(facultyFilter === 'all' ? undefined : facultyFilter)
      .then((res) => {
        if (cancelled) return;
        setData(res);
        setAllowedFacultyIds(res.allowedFacultyIds ?? []);
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
  }, [facultyFilter, lang, reloadKey]);

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

  const handleDownload = async () => {
    setDownloading(true);
    setDownloadError('');
    try {
      await downloadAuthenticatedFile(
        '/api/project-coordinator/statistics/export',
        'coordinator-statistics.xlsx',
        { facultyId: facultyFilter === 'all' ? undefined : facultyFilter },
      );
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : lang === 'he' ? 'ההורדה נכשלה' : 'Download failed');
    } finally {
      setDownloading(false);
    }
  };

  if (loading && !data) return <p className="text-sm text-muted">…</p>;
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
  if (!data) return null;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <select
          value={facultyFilter}
          onChange={(e) => setFacultyFilter(e.target.value as 'all' | FacultyId)}
          className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm text-ink focus:border-primary focus:outline-none"
        >
          <option value="all">{lang === 'he' ? 'כל הפקולטות (סה"כ)' : 'All faculties (overall)'}</option>
          {allowedFacultyIds.map((fid) => (
            <option key={fid} value={fid}>
              {facultyLabel(fid as FacultyId, lang)}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-2">
          {downloadError && <span className="text-xs text-danger">{downloadError}</span>}
          <DownloadButton onClick={handleDownload} busy={downloading} lang={lang} />
        </div>
      </div>

      {/* 1. Students per milestone */}
      <Section title={lang === 'he' ? '📚 סטודנטים לפי אבן דרך נוכחית' : '📚 Students per current milestone'}>
        {data.milestoneDistribution.length === 0 && <p className="text-sm text-muted">{lang === 'he' ? 'אין נתונים' : 'No data'}</p>}
        <div className="grid gap-2">
          {data.milestoneDistribution.map((row) => (
            <div key={row.type} className="rounded-lg bg-paper p-2.5">
              <button
                type="button"
                onClick={() => setExpandedType(expandedType === row.type ? null : row.type)}
                className="flex w-full items-center justify-between text-start"
              >
                <span className="text-sm text-ink">{lang === 'he' ? row.nameHe : row.nameEn}</span>
                <span className="flex items-center gap-2 text-xs text-muted">
                  <span className="font-semibold text-ink">{row.count}</span>
                  <span>({row.percent}%)</span>
                  <span>{expandedType === row.type ? '▲' : '▼'}</span>
                </span>
              </button>
              {expandedType === row.type && (
                <div className="mt-2 grid gap-1 border-t border-line pt-2">
                  {row.students.map((s) => (
                    <div key={s.studentId} className="flex items-center justify-between text-xs">
                      <span className="text-ink">
                        {s.studentName} · {lang === 'he' ? s.projectTitleHe : s.projectTitleEn}
                      </span>
                      <span
                        className="font-medium"
                        style={{ color: s.status === 'overdue' ? 'var(--danger)' : s.status === 'stuck' ? 'var(--accent)' : 'var(--success)' }}
                      >
                        {s.status === 'overdue'
                          ? (lang === 'he' ? `⚠️ באיחור · ${s.daysInStage}ד׳` : `⚠️ Overdue · ${s.daysInStage}d`)
                          : s.status === 'stuck'
                            ? (lang === 'he' ? `${s.daysInStage} ימים בשלב` : `${s.daysInStage}d in stage`)
                            : (lang === 'he' ? 'בתהליך' : 'On track')}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </Section>

      {/* 2. Milestone completion rates */}
      <Section title={lang === 'he' ? '✅ שיעור השלמת אבני דרך' : '✅ Milestone completion rate'}>
        {data.milestoneCompletion.length === 0 && <p className="text-sm text-muted">{lang === 'he' ? 'אין נתונים' : 'No data'}</p>}
        <div className="grid gap-1.5">
          {data.milestoneCompletion.map((row) => (
            <div key={row.type} className="flex items-center justify-between rounded-lg bg-paper px-2.5 py-1.5 text-sm">
              <span className="text-ink">{lang === 'he' ? row.nameHe : row.nameEn}</span>
              <span className="text-xs text-muted">
                <span className="font-semibold text-ink">{row.completed}</span> / {row.totalReached} ({row.percent}%)
              </span>
            </div>
          ))}
        </div>
      </Section>

      {/* 3. Final grades */}
      <Section title={lang === 'he' ? '🎓 ציונים סופיים' : '🎓 Final grades'}>
        <p className="mb-2 text-xs text-muted">
          {lang === 'he'
            ? `ממוצע ציון פרויקט כולל: ${data.finalGrades.averageProjectFinalGrade ?? '—'}`
            : `Average overall project grade: ${data.finalGrades.averageProjectFinalGrade ?? '—'}`}
        </p>
        <div className="grid gap-1.5">
          {data.finalGrades.byMilestoneType.map((row) => (
            <div key={row.type} className="rounded-lg bg-paper p-2.5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-ink">{lang === 'he' ? row.nameHe : row.nameEn}</span>
                <span className="text-xs text-muted">
                  {lang === 'he' ? 'ממוצע:' : 'Avg:'} <span className="font-semibold text-ink">{row.averageFinalGrade ?? '—'}</span> ({row.gradedCount} {lang === 'he' ? 'צוינו' : 'graded'})
                </span>
              </div>
              {(row.averageSupervisorEvaluation != null || row.averageExaminerProjectEvaluation != null || row.averageExaminerDefenseEvaluation != null) && (
                <div className="mt-1.5 flex gap-1.5">
                  <div className="flex-1 rounded-md bg-surface p-1.5 text-center">
                    <p className="text-[10px] text-muted">{lang === 'he' ? 'מנחה' : 'Supervisor'}</p>
                    <p className="text-xs font-semibold text-ink">{row.averageSupervisorEvaluation ?? '—'}</p>
                  </div>
                  <div className="flex-1 rounded-md bg-surface p-1.5 text-center">
                    <p className="text-[10px] text-muted">{lang === 'he' ? 'בוחן — עבודה' : 'Examiner — project'}</p>
                    <p className="text-xs font-semibold text-ink">{row.averageExaminerProjectEvaluation ?? '—'}</p>
                  </div>
                  <div className="flex-1 rounded-md bg-surface p-1.5 text-center">
                    <p className="text-[10px] text-muted">{lang === 'he' ? 'בוחן — הגנה' : 'Examiner — defense'}</p>
                    <p className="text-xs font-semibold text-ink">{row.averageExaminerDefenseEvaluation ?? '—'}</p>
                  </div>
                </div>
              )}
            </div>
          ))}
          {data.finalGrades.byMilestoneType.length === 0 && <p className="text-sm text-muted">{lang === 'he' ? 'אין נתונים' : 'No data'}</p>}
        </div>
        {data.finalGrades.byStudent.some((s) => s.unconfigured) && (
          <p className="mt-2 rounded-md bg-[#FBF3E3] px-2.5 py-1.5 text-xs text-accent">
            {lang === 'he'
              ? '⚠️ עבור חלק מהפרויקטים משקל הציון הסופי (percentOfFinalGrade) טרם הוגדר בתבנית — הציון הכולל שלהם יוצג כ־0 עד שיוגדר.'
              : "⚠️ Some projects' workflow templates haven't configured percentOfFinalGrade yet — their overall grade will show as 0 until that's set."}
          </p>
        )}
      </Section>

      {/* 4. Applications submitted per faculty */}
      <Section title={lang === 'he' ? '📥 בקשות שהוגשו לפי פקולטה' : '📥 Applications submitted per faculty'}>
        {data.applicationsByFaculty.length === 0 && <p className="text-sm text-muted">{lang === 'he' ? 'אין נתונים' : 'No data'}</p>}
        <div className="grid gap-1.5">
          {data.applicationsByFaculty.map((row) => (
            <div key={row.facultyId} className="flex items-center justify-between rounded-lg bg-paper px-2.5 py-1.5 text-sm">
              <span className="text-ink">{facultyLabel(row.facultyId as FacultyId, lang)}</span>
              <span className="text-xs text-muted">
                <span className="font-semibold text-ink">{row.count}</span> ({row.percent}%)
              </span>
            </div>
          ))}
        </div>
      </Section>

      {/* 5. On-time completion */}
      <Section title={lang === 'he' ? '⏱ סיום בזמן' : '⏱ On-time completion'}>
        {data.onTimeCompletion.length === 0 && <p className="text-sm text-muted">{lang === 'he' ? 'אין סטודנטים שסיימו עדיין' : 'No completed students yet'}</p>}
        <div className="grid gap-1.5">
          {data.onTimeCompletion.map((row) => (
            <div key={row.facultyId} className="flex items-center justify-between rounded-lg bg-paper px-2.5 py-1.5 text-sm">
              <span className="text-ink">{facultyLabel(row.facultyId as FacultyId, lang)}</span>
              <span className="text-xs text-muted">
                <span className="font-semibold" style={{ color: 'var(--success)' }}>{row.onTime}</span>
                {' / '}
                <span className="font-semibold" style={{ color: 'var(--danger)' }}>{row.late}</span>
                {' '}
                {lang === 'he' ? 'בזמן/באיחור' : 'on-time/late'} ({row.percentOnTime}% {lang === 'he' ? 'בזמן' : 'on time'})
              </span>
            </div>
          ))}
        </div>
      </Section>

      {/* 6. Year-of-study distribution */}
      <Section title={lang === 'he' ? '📅 פילוח לפי שנת לימודים' : '📅 Year-of-study distribution'}>
        {data.yearOfStudyDistribution.length === 0 && <p className="text-sm text-muted">{lang === 'he' ? 'אין נתונים' : 'No data'}</p>}
        <div className="grid gap-1.5">
          {data.yearOfStudyDistribution.map((row) => (
            <div key={row.yearOfStudy} className="flex items-center justify-between rounded-lg bg-paper px-2.5 py-1.5 text-sm">
              <span className="text-ink">
                {row.yearOfStudy === 'unknown' ? (lang === 'he' ? 'לא ידוע' : 'Unknown') : `${lang === 'he' ? 'שנה' : 'Year'} ${row.yearOfStudy}`}
              </span>
              <span className="text-xs text-muted">
                <span className="font-semibold text-ink">{row.count}</span> {lang === 'he' ? 'סטודנטים' : 'students'} · {lang === 'he' ? 'התקדמות ממוצעת' : 'avg progress'}: {row.averageProgressPercent}%
              </span>
            </div>
          ))}
        </div>
      </Section>

      {/* 7. Supervisor credit points — for payment approval */}
      <Section title={lang === 'he' ? '💰 נקודות זכות למנחים (לאישור תשלום)' : '💰 Supervisor credit points (for payment approval)'}>
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
          {rateSaveError && <span className="text-xs text-danger">{rateSaveError}</span>}
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
      </Section>
    </div>
  );
}
