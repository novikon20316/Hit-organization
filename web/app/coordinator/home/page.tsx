'use client';

// app/coordinator/home/page.tsx
// Ported from mobile/app/coordinator/home.tsx — Pending, Defense, In
// Progress, Deadlines, and Recommendations tabs.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { ReportsLink } from '@/components/ReportsLink';
import { InfoFilesLink } from '@/components/InfoFilesLink';
import { WorkflowTemplatesLink } from '@/components/WorkflowTemplatesLink';
import { useRequireRole } from '@/hooks/useRequireRole';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/apiClient';
import type { AppRole } from '@/lib/roles';
import { PendingMilestoneCard } from './PendingMilestoneCard';
import { RecommendationCard } from './RecommendationCard';
import { AssignExaminersModal } from './AssignExaminersModal';
import { DefenseTab, buildDefenseCards } from './DefenseTab';
import { InProgressTab } from './InProgressTab';
import { DeadlinesTab } from './DeadlinesTab';
import { BulkImportModal } from '@/components/BulkImportModal';
import { PendingSignoffsWidget } from '@/components/dashboard/PendingSignoffsWidget';
import { CoordinatorStatisticsTab } from '@/components/dashboard/CoordinatorStatisticsTab';
import { ArchivedProjectsTab } from '@/components/ArchivedProjectsTab';
import type { CoordinatorDeadline, CoordinatorPendingMilestone, ExaminerRecommendation, ExaminerUser, InProgressProject, Project } from './types';

const COORDINATOR_ROLES: AppRole[] = ['coordinator', 'administrative_secretary', 'system_admin'];

type Tab = 'pending' | 'defense' | 'inProgress' | 'deadlines' | 'recommendations' | 'signoffs' | 'statistics' | 'archived';

export default function CoordinatorHomePage() {
  const { loading: guardLoading, isAllowed, firebaseUser, userData } = useRequireRole(COORDINATOR_ROLES);
  const { lang, t } = useLanguage();

  const [tab, setTab] = useState<Tab>('pending');
  const [allMilestones, setAllMilestones] = useState<CoordinatorPendingMilestone[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [examiners, setExaminers] = useState<ExaminerUser[]>([]);
  const [recommendations, setRecommendations] = useState<ExaminerRecommendation[]>([]);
  const [inProgressProjects, setInProgressProjects] = useState<InProgressProject[]>([]);
  const [deadlines, setDeadlines] = useState<CoordinatorDeadline[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [assigningMilestone, setAssigningMilestone] = useState<CoordinatorPendingMilestone | null>(null);
  const [showBulkImport, setShowBulkImport] = useState(false);

  const fetchAll = useCallback(async () => {
    try {
      const [dashboard, examinerList] = await Promise.all([
        apiClient.getCoordinatorDashboard(),
        apiClient.getInternalExaminerList(),
      ]);
      setAllMilestones((dashboard.pendingMilestones ?? []) as unknown as CoordinatorPendingMilestone[]);
      setProjects((dashboard.projects ?? []) as unknown as Project[]);
      setExaminers((examinerList ?? []) as unknown as ExaminerUser[]);
      setLoadError('');

      // Non-fatal fetches below — each mirrors mobile's own try/catch around
      // these calls so one failing tab's data doesn't block the others.
      try {
        const recs = await apiClient.getCoordinatorExaminerRecommendations();
        setRecommendations((recs.recommendations ?? []) as unknown as ExaminerRecommendation[]);
      } catch {
        setRecommendations([]);
      }

      // getActiveProjects can 403 for administrative coordinator/system_admin
      // (server-side role check today only allows coordinator/faculty_admin/
      // admin) — treat that as an empty In Progress tab, not a crash.
      try {
        const active = await apiClient.getActiveProjects();
        setInProgressProjects((active.InProgress ?? []) as unknown as InProgressProject[]);
      } catch {
        setInProgressProjects([]);
      }

      try {
        if (firebaseUser) {
          const dl = await apiClient.getStaffDeadlines(firebaseUser.uid);
          setDeadlines((dl.deadlines ?? []) as unknown as CoordinatorDeadline[]);
        }
      } catch {
        setDeadlines([]);
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : lang === 'he' ? 'טעינת לוח הבקרה נכשלה' : 'Failed to load the dashboard');
    } finally {
      setLoadingData(false);
    }
  }, [lang, firebaseUser]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; fetchAll's setState calls happen after its awaited network calls resolve, not synchronously in this effect
    if (isAllowed) fetchAll();
  }, [isAllowed, fetchAll]);

  const defenseCards = useMemo(() => buildDefenseCards(allMilestones, projects), [allMilestones, projects]);

  // Same split mobile applies: a final_report already fully graded moves to
  // the Defense tab instead of staying in Pending.
  const pendingMilestones = useMemo(
    () => allMilestones.filter((m) => !(m.type === 'final_report' && m.status === 'graded')),
    [allMilestones]
  );

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: 'pending', label: lang === 'he' ? 'ממתינים לאישור' : 'Pending Approval', count: pendingMilestones.length },
    { key: 'defense', label: lang === 'he' ? 'הגנות' : 'Defenses', count: defenseCards.length },
    { key: 'inProgress', label: lang === 'he' ? 'פרויקטים פעילים' : 'In Progress', count: inProgressProjects.length },
    { key: 'deadlines', label: lang === 'he' ? 'מועדי הגשה' : 'Deadlines' },
    { key: 'recommendations', label: lang === 'he' ? 'המלצות בוחנים' : 'Examiner Recommendations', count: recommendations.length },
    { key: 'signoffs', label: lang === 'he' ? 'ממתין לאישורך' : 'Awaiting Your Sign-off' },
    { key: 'statistics', label: lang === 'he' ? 'סטטיסטיקות' : 'Statistics' },
    // Erasure/archive protocol is coordinator + system_admin only —
    // administrative_secretary shares this page but not this tab.
    ...(userData?.role !== 'administrative_secretary' ? [{ key: 'archived' as Tab, label: t('archivedTab') }] : []),
  ];

  if (guardLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper">
        <p className="text-sm text-muted">…</p>
      </div>
    );
  }

  return (
    <DashboardShell
      title={lang === 'he' ? 'לוח בקרה — רכז' : 'Coordinator Dashboard'}
      subtitle={lang === 'he' ? 'אישור אבני דרך והמלצות בוחנים' : 'Milestone approvals and examiner recommendations'}
      actions={
        <div className="flex items-center gap-2">
          <InfoFilesLink />
          <WorkflowTemplatesLink />
          <ReportsLink />
          <button
            type="button"
            onClick={() => setShowBulkImport(true)}
            className="rounded-full border border-line px-3.5 py-1.5 text-sm font-medium text-ink hover:border-primary hover:text-primary"
          >
            📥 {lang === 'he' ? 'ייבוא/ייצוא' : 'Import/Export'}
          </button>
        </div>
      }
    >
      <div className="mb-5 flex flex-wrap gap-1 border-b border-line">
        {tabs.map(({ key, label, count }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === key ? 'border-primary text-primary' : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            {label}
            {count !== undefined ? ` (${count})` : ''}
          </button>
        ))}
      </div>

      {loadError && <p className="mb-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{loadError}</p>}

      {loadingData ? (
        <p className="text-sm text-muted">{t('loading')}</p>
      ) : tab === 'pending' ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {pendingMilestones.map((m) => (
            <PendingMilestoneCard key={m.id} milestone={m} onChanged={fetchAll} onApproveFinalReport={setAssigningMilestone} />
          ))}
          {pendingMilestones.length === 0 && (
            <p className="text-sm text-muted">{lang === 'he' ? '✅ אין אבני דרך הממתינות לאישור' : '✅ No milestones awaiting approval'}</p>
          )}
        </div>
      ) : tab === 'defense' ? (
        <DefenseTab
          cards={defenseCards}
          examiners={examiners}
          onChanged={fetchAll}
          onApproveFinalReport={setAssigningMilestone}
          onOpenAssignExaminers={setAssigningMilestone}
        />
      ) : tab === 'inProgress' ? (
        <InProgressTab projects={inProgressProjects} />
      ) : tab === 'deadlines' ? (
        <DeadlinesTab deadlines={deadlines} projects={projects} onSaved={fetchAll} />
      ) : tab === 'recommendations' ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {recommendations.map((rec) => (
            <RecommendationCard key={rec.id} recommendation={rec} onChanged={fetchAll} />
          ))}
          {recommendations.length === 0 && (
            <p className="text-sm text-muted">{lang === 'he' ? '👥 אין המלצות בוחנים ממתינות' : '👥 No pending examiner recommendations'}</p>
          )}
        </div>
      ) : tab === 'statistics' ? (
        <CoordinatorStatisticsTab />
      ) : tab === 'archived' ? (
        <ArchivedProjectsTab />
      ) : (
        <PendingSignoffsWidget showEmptyState />
      )}

      {assigningMilestone && (
        <AssignExaminersModal
          key={assigningMilestone.id}
          milestone={assigningMilestone}
          examiners={examiners}
          onClose={() => setAssigningMilestone(null)}
          onAssigned={fetchAll}
        />
      )}
      {showBulkImport && <BulkImportModal scope="coordinator" onClose={() => setShowBulkImport(false)} onImported={fetchAll} />}
    </DashboardShell>
  );
}
