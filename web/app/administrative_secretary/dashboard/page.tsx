'use client';

// app/administrative_secretary/dashboard/page.tsx
// Ported from mobile/app/administrative_secretary/administrative_secretary_dashboard.tsx.
// Dropped: the "View" button that routed to /admin/panel?groupId=... — that
// page is system_admin-gated (this role would just get redirected away) and
// never reads a groupId param anyway, so it was a dead link on mobile too.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { useRequireRole } from '@/hooks/useRequireRole';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/apiClient';
import { getFacultyColor } from '@/lib/facultyColors';
import type { AppRole } from '@/lib/roles';
import { BulkDueDateModal } from '@/components/BulkDueDateModal';
import { AcademicYearLink } from '@/components/AcademicYearLink';
import { WorkflowTemplatesLink } from '@/components/WorkflowTemplatesLink';
import { SendExaminerModal } from './SendExaminerModal';
import { DefenseLogisticsModal } from './DefenseLogisticsModal';
import type { ProjectGroup } from './types';

const ADMIN_SECRETARY_ROLES: AppRole[] = ['administrative_secretary', 'system_admin'];

export default function AdministrativeSecretaryDashboardPage() {
  const { loading: guardLoading, isAllowed } = useRequireRole(ADMIN_SECRETARY_ROLES);
  const { firebaseUser } = useAuth();
  const { lang, t } = useLanguage();

  const [coordinatorName, setCoordinatorName] = useState('');
  const [facultyId, setFacultyId] = useState('');
  const [groups, setGroups] = useState<ProjectGroup[]>([]);
  const [stats, setStats] = useState({ totalGroups: 0, activeGroups: 0, scheduledDefenses: 0, overdueGroups: 0 });
  const [loadingData, setLoadingData] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [search, setSearch] = useState('');
  const [filterTrack, setFilterTrack] = useState<'all' | 'bachelor_project' | 'masters_project'>('all');
  const [filterOverdue, setFilterOverdue] = useState(false);

  const [examinerModalGroup, setExaminerModalGroup] = useState<ProjectGroup | null>(null);
  const [defenseModalGroup, setDefenseModalGroup] = useState<ProjectGroup | null>(null);
  const [showBulkDueDate, setShowBulkDueDate] = useState(false);

  const fetchDashboard = useCallback(async () => {
    if (!firebaseUser) return;
    try {
      const data = await apiClient.getProjectCoordinatorDashboard(firebaseUser.uid);
      setCoordinatorName(data.coordinatorName ?? '');
      setFacultyId(data.facultyId ?? '');
      setGroups((data.groups ?? []) as ProjectGroup[]);
      setStats(data.stats ?? { totalGroups: 0, activeGroups: 0, scheduledDefenses: 0, overdueGroups: 0 });
      setLoadError('');
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : lang === 'he' ? 'לא ניתן לטעון נתונים' : 'Could not load data');
    } finally {
      setLoadingData(false);
    }
  }, [firebaseUser, lang]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; setState calls happen after the awaited network call resolves, not synchronously in this effect
    if (isAllowed) fetchDashboard();
  }, [isAllowed, fetchDashboard]);

  const filteredGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    return groups.filter((g) => {
      const matchesSearch = !q || g.projectTitle.toLowerCase().includes(q) || g.supervisorName.toLowerCase().includes(q) || g.members.some((m) => m.name.toLowerCase().includes(q));
      const matchesTrack = filterTrack === 'all' || g.trackType === filterTrack;
      const matchesOverdue = !filterOverdue || g.isOverdue;
      return matchesSearch && matchesTrack && matchesOverdue;
    });
  }, [groups, search, filterTrack, filterOverdue]);

  const facultyColor = getFacultyColor(facultyId);

  if (guardLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper">
        <p className="text-sm text-muted">…</p>
      </div>
    );
  }

  return (
    <DashboardShell
      title={lang === 'he' ? 'לוח בקרה — מזכירה אדמיניסטרטיבית' : 'Administrative Secretary Dashboard'}
      subtitle={lang === 'he' ? 'קבוצות פרויקט, הגנות ובוחנים חיצוניים' : 'Project groups, defenses, and external examiners'}
      actions={
        <div className="flex items-center gap-2">
          <WorkflowTemplatesLink />
          <AcademicYearLink />
        </div>
      }
    >
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard value={stats.totalGroups} label={lang === 'he' ? 'קבוצות' : 'Groups'} color={facultyColor} />
        <StatCard value={stats.activeGroups} label={lang === 'he' ? 'פעילות' : 'Active'} color="var(--success)" />
        <StatCard value={stats.scheduledDefenses} label={lang === 'he' ? 'הגנות מתוכננות' : 'Defenses'} color="#3E6C8C" />
        <StatCard value={stats.overdueGroups} label={lang === 'he' ? 'באיחור' : 'Overdue'} color="var(--danger)" />
      </div>

      {loadError && <p className="mb-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{loadError}</p>}

      {loadingData ? (
        <p className="text-sm text-muted">{t('loading')}</p>
      ) : (
        <>
          <button
            type="button"
            onClick={() => setShowBulkDueDate(true)}
            className="mb-4 rounded-lg border border-accent bg-[#FBF3E3] px-4 py-2 text-sm font-semibold text-accent"
          >
            📅 {lang === 'he' ? 'עדכון תאריכי יעד מרוכז' : 'Bulk Update Due Dates'}
          </button>

          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('searchPlaceholder')}
            className="mb-3 w-full max-w-sm rounded-lg border border-line bg-surface px-3.5 py-2 text-sm text-ink focus:border-primary focus:outline-none"
          />
          <div className="mb-4 flex flex-wrap gap-1.5">
            {(['all', 'bachelor_project', 'masters_project'] as const).map((track) => (
              <button
                key={track}
                type="button"
                onClick={() => setFilterTrack(track)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                  filterTrack === track ? 'border-primary bg-primary text-primary-ink' : 'border-line bg-surface text-ink'
                }`}
              >
                {track === 'all' ? t('all') : track === 'bachelor_project' ? t('trackBachelorProject') : t('trackMastersProject')}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setFilterOverdue((v) => !v)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                filterOverdue ? 'border-danger bg-danger text-white' : 'border-line bg-surface text-ink'
              }`}
            >
              ⚠️ {lang === 'he' ? 'באיחור' : 'Overdue'}
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {filteredGroups.map((group) => (
              <div
                key={group.id}
                className="role-rail rounded-[var(--radius)] border border-line bg-surface p-4"
                style={{ '--rail-color': group.isOverdue ? 'var(--danger)' : facultyColor } as React.CSSProperties}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-ink">{group.projectTitle}</p>
                  {group.isOverdue && <span className="shrink-0 rounded-full bg-danger-bg px-2 py-0.5 text-xs font-medium text-danger">⚠️ {t('overdue')}</span>}
                </div>
                <p className="mt-1 text-xs text-muted">👨‍🏫 {group.supervisorName}</p>
                <p className="mt-0.5 text-xs text-muted">👥 {group.members.map((m) => m.name).join(' · ')}</p>

                <div className="mt-2 flex items-center justify-between">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${group.trackType === 'bachelor_project' ? 'bg-[#E9F0F5] text-[#3E6C8C]' : 'bg-[#EFEBF6] text-[#6E5A99]'}`}>
                    {group.trackType === 'bachelor_project' ? t('trackBachelorProject') : t('trackMastersProject')}
                  </span>
                  <span className="text-xs text-muted">📍 {group.currentMilestone}</span>
                </div>

                {group.defenseDate ? (
                  <p className="mt-2 rounded-lg bg-paper px-2.5 py-1.5 text-xs font-medium text-ink">
                    🛡 {t('defenseDate')} {new Date(group.defenseDate).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-US')}
                    {group.defenseRoom ? ` · ${group.defenseRoom}` : ''}
                  </p>
                ) : (
                  <p className="mt-2 text-xs text-muted">📅 {t('defenseNotScheduled')}</p>
                )}

                <div className="mt-3 flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => setDefenseModalGroup(group)}
                    className="flex-1 rounded-lg border border-success px-2.5 py-1.5 text-xs font-medium text-success hover:bg-success-bg"
                  >
                    🛡 {t('scheduleDefense')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setExaminerModalGroup(group)}
                    className="flex-1 rounded-lg border border-accent px-2.5 py-1.5 text-xs font-medium text-accent hover:bg-[#FBF3E3]"
                  >
                    📧 {t('externalExaminer')}
                  </button>
                </div>
              </div>
            ))}
            {filteredGroups.length === 0 && <p className="text-sm text-muted">📭 {lang === 'he' ? 'אין קבוצות להצגה' : 'No groups to show'}</p>}
          </div>
        </>
      )}

      {examinerModalGroup && (
        <SendExaminerModal
          key={examinerModalGroup.id}
          group={examinerModalGroup}
          coordinatorUid={firebaseUser?.uid ?? ''}
          coordinatorName={coordinatorName}
          onClose={() => setExaminerModalGroup(null)}
        />
      )}
      {defenseModalGroup && (
        <DefenseLogisticsModal key={defenseModalGroup.id} group={defenseModalGroup} onClose={() => setDefenseModalGroup(null)} onSaved={fetchDashboard} />
      )}
      {showBulkDueDate && (
        <BulkDueDateModal
          projects={groups.map((g) => ({ id: g.id, label: g.projectTitle }))}
          onClose={() => setShowBulkDueDate(false)}
          onSaved={fetchDashboard}
        />
      )}
    </DashboardShell>
  );
}

function StatCard({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div className="rounded-[var(--radius)] border border-line bg-surface p-4">
      <div className="text-2xl font-semibold" style={{ color }}>
        {value}
      </div>
      <div className="text-xs text-muted">{label}</div>
    </div>
  );
}
