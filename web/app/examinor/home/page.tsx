'use client';

// app/examinor/home/page.tsx
// Ported from mobile/app/examinor/home.tsx.

import { Suspense, useCallback, useEffect, useState } from 'react';
import { defenseModeIcon, defenseModeLabel, resolveDefenseMode, showsDefenseLink, showsDefensePlace } from '@/lib/defenseDisplay';
import { useSearchParams } from 'next/navigation';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { useRequireRole } from '@/hooks/useRequireRole';
import { useAuth } from '@/contexts/AuthContext';
import { useDefenseScheduleLiveRefresh } from '@/hooks/useDefenseScheduleLiveRefresh';
import { useLiveRefresh } from '@/hooks/useLiveRefresh';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/apiClient';
import { getFacultyColor } from '@/lib/facultyColors';
import type { AppRole } from '@/lib/roles';
import { AssignmentCard } from './AssignmentCard';
import { GradeExaminerModal } from './GradeExaminerModal';
import { ExaminerEvaluationModal } from './ExaminerEvaluationModal';
import { ExaminerFormFieldsModal } from './ExaminerFormFieldsModal';
import { ExaminerSignoffModal } from './ExaminerSignoffModal';
import type { AssignedMilestone } from './types';
import { FieldGuideOverlay } from '@/components/guidance/FieldGuideOverlay';
import { ASSIGNMENTS_FIELD_GUIDE, ASSIGNMENTS_GUIDE_KEY } from './fieldGuide';

const EXAMINER_ROLES: AppRole[] = ['internal_examiner', 'system_admin'];

type ExaminerTab = 'defenses' | 'schedule';
const isExaminerTab = (v: string | null): v is ExaminerTab => v === 'defenses' || v === 'schedule';

function daysUntil(date: Date): number {
  return Math.ceil((date.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

function ExaminerHomeContent() {
  const { loading: guardLoading, isAllowed } = useRequireRole(EXAMINER_ROLES);
  const { firebaseUser } = useAuth();
  const { lang, t } = useLanguage();
  const searchParams = useSearchParams();

  // The URL's `?tab=` is the single source of truth for which tab is open —
  // no separate mirrored state — so the sidebar's Defenses/Schedule links
  // actually switch tabs even when this page is already mounted. Mirrors
  // app/admin/panel/page.tsx's identical pattern.
  const tab: ExaminerTab = isExaminerTab(searchParams.get('tab')) ? (searchParams.get('tab') as ExaminerTab) : 'defenses';
  const [assignments, setAssignments] = useState<AssignedMilestone[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [gradingTarget, setGradingTarget] = useState<AssignedMilestone | null>(null);
  const [evaluationTarget, setEvaluationTarget] = useState<{ milestone: AssignedMilestone; kind: 'project' | 'defense' } | null>(null);
  const [formTarget, setFormTarget] = useState<AssignedMilestone | null>(null);
  const [signoffTarget, setSignoffTarget] = useState<AssignedMilestone | null>(null);

  const fetchDashboard = useCallback(async () => {
    try {
      const data = await apiClient.getExaminerDashboard();
      setAssignments((data.milestones ?? []) as unknown as AssignedMilestone[]);
      setLoadError('');
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : lang === 'he' ? 'נכשלה טעינת נתוני השרת' : 'Could not synchronize data with backend server');
    } finally {
      setLoadingData(false);
    }
  }, [lang]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; setState calls happen after the awaited network call resolves, not synchronously in this effect
    if (isAllowed) fetchDashboard();
  }, [isAllowed, fetchDashboard]);

  // The listener below only overlays milestones already in the list — a
  // defense this examiner was just assigned to (or removed from) needs a
  // re-fetch, as do panel names resolved server-side. See
  // hooks/useDefenseScheduleLiveRefresh.ts.
  useDefenseScheduleLiveRefresh(() => { if (isAllowed) fetchDashboard(); });

  // Live refresh goes through the API, never a direct milestone read: the
  // milestone doc holds every co-examiner's scores and evaluations, so
  // examiners no longer have Firestore read access to it (fixed 2026-11-08 —
  // see getExaminerDashboard, which returns only this examiner's own entries).
  // Any notification to this examiner, or a defense-schedule change (above),
  // re-fetches.
  useLiveRefresh(() => { if (isAllowed) fetchDashboard(); });

  if (guardLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper">
        <p className="text-sm text-muted">…</p>
      </div>
    );
  }

  const scheduled = [...assignments].filter((m) => !!m.defenseDate).sort((a, b) => new Date(a.defenseDate!).getTime() - new Date(b.defenseDate!).getTime());

  return (
    <DashboardShell
      title={lang === 'he' ? 'בוחן פנימי' : 'Internal Examiner'}
      subtitle={lang === 'he' ? 'הגנות לבחינה ולוח זמנים' : 'Defenses to examine and your schedule'}
      showBackButton={tab !== 'defenses'}
    >
      {loadError && <p className="mb-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">{loadError}</p>}

      {loadingData ? (
        <p className="text-sm text-examinor-on-surface-variant">{t('loading')}</p>
      ) : tab === 'defenses' ? (
        <div data-field-guide-id="assignmentList" className="grid gap-3 sm:grid-cols-2">
          <FieldGuideOverlay guideKey={ASSIGNMENTS_GUIDE_KEY} steps={ASSIGNMENTS_FIELD_GUIDE} />
          {assignments.map((m) => (
            <AssignmentCard
              key={m.id}
              milestone={m}
              uid={firebaseUser?.uid ?? ''}
              onChanged={fetchDashboard}
              onGrade={setGradingTarget}
              onGradeKind={(milestone, kind) => setEvaluationTarget({ milestone, kind })}
              onGradeForm={setFormTarget}
              onSignoff={setSignoffTarget}
            />
          ))}
          {assignments.length === 0 && <p className="text-sm text-examinor-on-surface-variant">📭 {lang === 'he' ? 'לא הוקצו לך הגנות לבחינה' : 'No defenses assigned to you'}</p>}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {scheduled.map((m) => {
            const defDate = new Date(m.defenseDate!);
            const isValid = !isNaN(defDate.getTime());
            const days = isValid ? daysUntil(defDate) : null;
            const facultyColor = getFacultyColor(m.facultyId);

            const urgencyColor = days === null ? '#6B7280' : days < 0 ? '#9CA3AF' : days === 0 ? 'var(--danger)' : days <= 3 ? '#F97316' : days <= 7 ? 'var(--accent)' : 'var(--success)';
            const urgencyLabel =
              lang === 'he'
                ? days === null
                  ? '—'
                  : days < 0
                    ? 'עברה'
                    : days === 0
                      ? 'היום!'
                      : days === 1
                        ? 'מחר!'
                        : `בעוד ${days} ימים`
                : days === null
                  ? '—'
                  : days < 0
                    ? 'Past'
                    : days === 0
                      ? 'Today!'
                      : days === 1
                        ? 'Tomorrow!'
                        : `In ${days} days`;

            return (
              <div key={m.id} className="role-rail rounded-examinor border border-examinor-outline-variant bg-examinor-surface-container-lowest p-4" style={{ '--rail-color': facultyColor } as React.CSSProperties}>
                <span className="rounded-full px-2.5 py-1 text-xs font-semibold text-white" style={{ backgroundColor: urgencyColor }}>
                  {urgencyLabel}
                </span>
                <p className="mt-2 text-sm font-semibold text-examinor-on-surface">{lang === 'he' ? m.projectTitleHe : m.projectTitleEn}</p>
                <p className="mt-0.5 text-xs text-examinor-on-surface-variant">👤 {m.studentNames.length > 0 ? m.studentNames.join(', ') : lang === 'he' ? 'לא ידוע' : 'Unknown'}</p>
                <p className="mt-0.5 text-xs text-examinor-on-surface-variant">
                  👨‍🏫 {lang === 'he' ? 'מנחה:' : 'Supervisor:'} {m.supervisorName}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                  <span className="rounded-lg bg-examinor-surface-container-low px-2.5 py-1.5">
                    <span className="block text-[10px] text-examinor-on-surface-variant">{lang === 'he' ? 'תאריך' : 'Date'}</span>
                    <span className="font-medium text-examinor-on-surface">
                      {isValid ? defDate.toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '—'}
                    </span>
                  </span>
                  {m.defenseTime && (
                    <span className="rounded-lg bg-examinor-surface-container-low px-2.5 py-1.5">
                      <span className="block text-[10px] text-examinor-on-surface-variant">{t('time')}</span>
                      <span className="font-medium text-examinor-on-surface">{m.defenseTime}</span>
                    </span>
                  )}
                  {m.defenseTime && (
                    <span className="rounded-lg bg-examinor-surface-container-low px-2.5 py-1.5">
                      <span className="block text-[10px] text-examinor-on-surface-variant">{lang === 'he' ? 'אופן' : 'Format'}</span>
                      <span className="font-medium text-examinor-on-surface">{defenseModeIcon(resolveDefenseMode(m))} {defenseModeLabel(resolveDefenseMode(m), lang)}</span>
                    </span>
                  )}
                  {showsDefensePlace(m) && m.defenseBuilding && (
                    <span className="rounded-lg bg-examinor-surface-container-low px-2.5 py-1.5">
                      <span className="block text-[10px] text-examinor-on-surface-variant">{lang === 'he' ? 'בניין' : 'Building'}</span>
                      <span className="font-medium text-examinor-on-surface">{m.defenseBuilding}</span>
                    </span>
                  )}
                  {showsDefenseLink(m) && (
                    <a
                      href={m.onlineDefenseLink!}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg bg-examinor-primary px-2.5 py-1.5 font-semibold text-examinor-on-primary hover:opacity-90"
                    >
                      💻 {lang === 'he' ? 'הצטרפות לזום' : 'Join Zoom'}
                    </a>
                  )}
                  {showsDefensePlace(m) && m.defenseRoom && (
                    <span className="rounded-lg bg-examinor-surface-container-low px-2.5 py-1.5">
                      <span className="block text-[10px] text-examinor-on-surface-variant">{lang === 'he' ? 'חדר' : 'Room'}</span>
                      <span className="font-medium text-examinor-on-surface">{m.defenseRoom}</span>
                    </span>
                  )}
                </div>
              </div>
            );
          })}
          {scheduled.length === 0 && <p className="text-sm text-examinor-on-surface-variant">📅 {lang === 'he' ? 'אין הגנות מתוכננות עדיין' : 'No defenses scheduled yet'}</p>}
        </div>
      )}

      {gradingTarget && <GradeExaminerModal key={gradingTarget.id} milestone={gradingTarget} onClose={() => setGradingTarget(null)} onGraded={fetchDashboard} />}
      {formTarget && <ExaminerFormFieldsModal key={formTarget.id} milestone={formTarget} onClose={() => setFormTarget(null)} onSubmitted={fetchDashboard} />}
      {signoffTarget && <ExaminerSignoffModal key={signoffTarget.id} milestone={signoffTarget} onClose={() => setSignoffTarget(null)} onSubmitted={fetchDashboard} />}
      {evaluationTarget && (
        <ExaminerEvaluationModal
          key={`${evaluationTarget.milestone.id}-${evaluationTarget.kind}`}
          milestone={evaluationTarget.milestone}
          kind={evaluationTarget.kind}
          onClose={() => setEvaluationTarget(null)}
          onSubmitted={fetchDashboard}
        />
      )}
    </DashboardShell>
  );
}

export default function ExaminerHomePage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">…</p>}>
      <ExaminerHomeContent />
    </Suspense>
  );
}
