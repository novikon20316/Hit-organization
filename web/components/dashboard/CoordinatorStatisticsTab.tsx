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
import { apiClient, downloadAuthenticatedFile } from '@/lib/apiClient';
import { facultyLabel, type FacultyId } from '@/lib/i18n';

type Stats = Awaited<ReturnType<typeof apiClient.getCoordinatorStatistics>>;

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
  }, [facultyFilter, lang]);

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
    </div>
  );
}
