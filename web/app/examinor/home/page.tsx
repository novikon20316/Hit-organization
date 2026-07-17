'use client';

// app/examinor/home/page.tsx
// Ported from mobile/app/examinor/home.tsx.

import { useCallback, useEffect, useState } from 'react';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { useRequireRole } from '@/hooks/useRequireRole';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/apiClient';
import { getFacultyColor } from '@/lib/facultyColors';
import type { AppRole } from '@/lib/roles';
import { AssignmentCard } from './AssignmentCard';
import { GradeExaminerModal } from './GradeExaminerModal';
import type { AssignedMilestone } from './types';

const EXAMINER_ROLES: AppRole[] = ['internal_examiner', 'system_admin'];

function daysUntil(date: Date): number {
  return Math.ceil((date.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

export default function ExaminerHomePage() {
  const { loading: guardLoading, isAllowed } = useRequireRole(EXAMINER_ROLES);
  const { firebaseUser } = useAuth();
  const { lang, t } = useLanguage();

  const [tab, setTab] = useState<'defenses' | 'schedule'>('defenses');
  const [assignments, setAssignments] = useState<AssignedMilestone[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [gradingTarget, setGradingTarget] = useState<AssignedMilestone | null>(null);

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
    >
      <div className="mb-5 flex gap-1 border-b border-line">
        {(
          [
            { key: 'defenses' as const, label: lang === 'he' ? 'הגנות לבחינה' : 'Defenses', badge: assignments.length },
            { key: 'schedule' as const, label: lang === 'he' ? 'לוח זמנים' : 'Schedule', badge: scheduled.length },
          ] as const
        ).map(({ key, label, badge }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === key ? 'border-primary text-primary' : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            {label}
            {badge > 0 ? ` (${badge})` : ''}
          </button>
        ))}
      </div>

      {loadError && <p className="mb-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{loadError}</p>}

      {loadingData ? (
        <p className="text-sm text-muted">{t('loading')}</p>
      ) : tab === 'defenses' ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {assignments.map((m) => (
            <AssignmentCard key={m.id} milestone={m} uid={firebaseUser?.uid ?? ''} onChanged={fetchDashboard} onGrade={setGradingTarget} />
          ))}
          {assignments.length === 0 && <p className="text-sm text-muted">📭 {lang === 'he' ? 'לא הוקצו לך הגנות לבחינה' : 'No defenses assigned to you'}</p>}
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
              <div key={m.id} className="role-rail rounded-[var(--radius)] border border-line bg-surface p-4" style={{ '--rail-color': facultyColor } as React.CSSProperties}>
                <span className="rounded-full px-2.5 py-1 text-xs font-semibold text-white" style={{ backgroundColor: urgencyColor }}>
                  {urgencyLabel}
                </span>
                <p className="mt-2 text-sm font-semibold text-ink">{lang === 'he' ? m.projectTitleHe : m.projectTitleEn}</p>
                <p className="mt-0.5 text-xs text-muted">👤 {m.studentNames.length > 0 ? m.studentNames.join(', ') : lang === 'he' ? 'לא ידוע' : 'Unknown'}</p>
                <p className="mt-0.5 text-xs text-muted">
                  👨‍🏫 {lang === 'he' ? 'מנחה:' : 'Supervisor:'} {m.supervisorName}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                  <span className="rounded-lg bg-paper px-2.5 py-1.5">
                    <span className="block text-[10px] text-muted">{lang === 'he' ? 'תאריך' : 'Date'}</span>
                    <span className="font-medium text-ink">
                      {isValid ? defDate.toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '—'}
                    </span>
                  </span>
                  {isValid && (
                    <span className="rounded-lg bg-paper px-2.5 py-1.5">
                      <span className="block text-[10px] text-muted">{t('time')}</span>
                      <span className="font-medium text-ink">{defDate.toLocaleTimeString(lang === 'he' ? 'he-IL' : 'en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}</span>
                    </span>
                  )}
                  {m.defenseRoom && (
                    <span className="rounded-lg bg-paper px-2.5 py-1.5">
                      <span className="block text-[10px] text-muted">{lang === 'he' ? 'חדר' : 'Room'}</span>
                      <span className="font-medium text-ink">{m.defenseRoom}</span>
                    </span>
                  )}
                </div>
              </div>
            );
          })}
          {scheduled.length === 0 && <p className="text-sm text-muted">📅 {lang === 'he' ? 'אין הגנות מתוכננות עדיין' : 'No defenses scheduled yet'}</p>}
        </div>
      )}

      {gradingTarget && <GradeExaminerModal key={gradingTarget.id} milestone={gradingTarget} onClose={() => setGradingTarget(null)} onGraded={fetchDashboard} />}
    </DashboardShell>
  );
}
