'use client';

// app/administrative_coordinator/dashboard/GradeOverridesTab.tsx
// The coordinator's half of the three-rubric final-grade override workflow
// (see workflowTemplates.ts's finalGradeComponents) — a supervisor proposed
// changing a defense milestone's auto-calculated grade with a mandatory
// reason (supervisorController.ts's decideFinalGrade); she either approves
// the change or keeps the automatic grade (gradSchoolHeadController.ts's
// decideGradeOverride — same controller/gating as the grad_school_head's
// existing final-grade sign-off, since finalGradeSignoffRole is configurable
// per template and set to administrative_secretary for data_science).

import { useEffect, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/apiClient';

interface GradeOverrideRow {
  milestoneId: string;
  projectTitleHe: string;
  projectTitleEn: string;
  studentNames: string[];
  kind: 'auto_confirmed' | 'override';
  autoCalculatedFinalGrade: number | null;
  proposedGrade: number | null;
  reason: string;
  supervisorEvaluationTotal: number | null;
  examinerProjectAvg: number | null;
  examinerDefenseAvg: number | null;
  supervisorEvaluationFileUrls: string[];
  examinerProjectFileUrls: string[];
  examinerDefenseFileUrls: string[];
  gradeOverrideFileUrls: string[];
}

function FileLinks({ label, urls }: { label: string; urls: string[] }) {
  if (urls.length === 0) return null;
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
      <span className="text-[10px] text-muted">{label}</span>
      {urls.map((url, i) => (
        <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="rounded-full border border-line bg-surface px-2 py-0.5 text-xs text-ink hover:border-primary">
          📄 {i + 1}
        </a>
      ))}
    </div>
  );
}

export function GradeOverridesTab() {
  const { lang } = useLanguage();
  const [rows, setRows] = useState<GradeOverrideRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const fetchRows = () => {
    setLoading(true);
    return apiClient
      .getPendingGradeOverrides()
      .then((res) => {
        setRows(res.overrides);
        setError('');
      })
      .catch((err) => setError(err instanceof Error ? err.message : lang === 'he' ? 'לא ניתן לטעון נתונים' : 'Could not load data'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const decide = async (milestoneId: string, decision: 'approve_override' | 'keep_auto') => {
    setBusyId(milestoneId);
    try {
      await apiClient.decideGradeOverride(milestoneId, decision);
      await fetchRows();
    } catch (err) {
      setError(err instanceof Error ? err.message : lang === 'he' ? 'הפעולה נכשלה' : 'The action failed');
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return <p className="text-sm text-muted">…</p>;
  if (error) return <p className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">{error}</p>;
  if (rows.length === 0) {
    return <p className="text-sm text-muted">✅ {lang === 'he' ? 'אין ציונים סופיים ממתינים לאישור' : 'No final grades pending approval'}</p>;
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {rows.map((r) => (
        <div key={r.milestoneId} className="role-rail rounded-[var(--radius)] border border-line bg-surface p-4" style={{ '--rail-color': 'var(--accent)' } as React.CSSProperties}>
          <p className="text-sm font-semibold text-ink">{lang === 'he' ? r.projectTitleHe : r.projectTitleEn}</p>
          <p className="mt-0.5 text-xs text-muted">👤 {r.studentNames.join(', ')}</p>

          {(r.supervisorEvaluationTotal != null || r.examinerProjectAvg != null || r.examinerDefenseAvg != null) && (
            <div className="mt-2 flex gap-1.5">
              <div className="flex-1 rounded-md bg-paper p-1.5 text-center">
                <p className="text-[10px] text-muted">{lang === 'he' ? 'מנחה' : 'Supervisor'}</p>
                <p className="text-xs font-semibold text-ink">{r.supervisorEvaluationTotal ?? '—'}</p>
              </div>
              <div className="flex-1 rounded-md bg-paper p-1.5 text-center">
                <p className="text-[10px] text-muted">{lang === 'he' ? 'בוחן — עבודה' : 'Examiner — project'}</p>
                <p className="text-xs font-semibold text-ink">{r.examinerProjectAvg ?? '—'}</p>
              </div>
              <div className="flex-1 rounded-md bg-paper p-1.5 text-center">
                <p className="text-[10px] text-muted">{lang === 'he' ? 'בוחן — הגנה' : 'Examiner — defense'}</p>
                <p className="text-xs font-semibold text-ink">{r.examinerDefenseAvg ?? '—'}</p>
              </div>
            </div>
          )}

          <FileLinks label={lang === 'he' ? '📎 מנחה:' : '📎 Supervisor:'} urls={r.supervisorEvaluationFileUrls} />
          <FileLinks label={lang === 'he' ? '📎 בוחן — עבודה:' : '📎 Examiner — project:'} urls={r.examinerProjectFileUrls} />
          <FileLinks label={lang === 'he' ? '📎 בוחן — הגנה:' : '📎 Examiner — defense:'} urls={r.examinerDefenseFileUrls} />
          <FileLinks label={lang === 'he' ? '📎 טופס הציון הסופי:' : '📎 Final-grade form:'} urls={r.gradeOverrideFileUrls} />

          {r.kind === 'override' ? (
            <>
              <div className="mt-3 flex gap-2">
                <div className="flex-1 rounded-lg bg-paper p-2 text-center">
                  <p className="text-[10px] text-muted">{lang === 'he' ? 'ציון מחושב' : 'Computed'}</p>
                  <p className="text-lg font-bold text-ink">{r.autoCalculatedFinalGrade}</p>
                </div>
                <div className="flex-1 rounded-lg bg-[#FBF3E3] p-2 text-center">
                  <p className="text-[10px] text-accent">{lang === 'he' ? 'ציון מוצע' : 'Proposed'}</p>
                  <p className="text-lg font-bold text-accent">{r.proposedGrade}</p>
                </div>
              </div>

              <p className="mt-2 rounded-md bg-paper px-2.5 py-1.5 text-xs text-ink">💬 {r.reason}</p>

              <div className="mt-3 flex gap-1.5">
                <button
                  type="button"
                  onClick={() => decide(r.milestoneId, 'approve_override')}
                  disabled={busyId === r.milestoneId}
                  className="flex-1 rounded-lg bg-primary px-2.5 py-1.5 text-xs font-semibold text-primary-ink hover:bg-primary-hover disabled:opacity-60"
                >
                  {lang === 'he' ? '✓ אשר את השינוי' : '✓ Approve change'}
                </button>
                <button
                  type="button"
                  onClick={() => decide(r.milestoneId, 'keep_auto')}
                  disabled={busyId === r.milestoneId}
                  className="flex-1 rounded-lg border border-line px-2.5 py-1.5 text-xs font-medium text-ink hover:bg-paper disabled:opacity-60"
                >
                  {lang === 'he' ? 'השאר מחושב' : 'Keep computed'}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="mt-3 rounded-lg bg-paper p-2 text-center">
                <p className="text-[10px] text-muted">{lang === 'he' ? 'המנחה אישר את הציון המחושב' : "Supervisor confirmed the computed grade"}</p>
                <p className="text-lg font-bold text-ink">{r.proposedGrade}</p>
              </div>

              <div className="mt-3">
                <button
                  type="button"
                  onClick={() => decide(r.milestoneId, 'approve_override')}
                  disabled={busyId === r.milestoneId}
                  className="w-full rounded-lg bg-primary px-2.5 py-1.5 text-xs font-semibold text-primary-ink hover:bg-primary-hover disabled:opacity-60"
                >
                  {lang === 'he' ? '✓ אשר ציון סופי' : '✓ Approve final grade'}
                </button>
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
