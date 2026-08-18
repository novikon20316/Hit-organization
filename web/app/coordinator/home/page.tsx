'use client';

// app/coordinator/home/page.tsx
// Ported from mobile/app/coordinator/home.tsx — Pending, Defense, In
// Progress, Deadlines, and Recommendations tabs.
//
// useSearchParams() forces this static route into client-side rendering at
// the Suspense boundary during prerendering (Next.js requirement) — wrapped
// below so the rest of the app shell can still be prerendered.

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { useRequireRole } from '@/hooks/useRequireRole';
import { useAuth } from '@/contexts/AuthContext';
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
import { CreateOwnProjectButton } from '@/components/CreateOwnProjectButton';
import { MyApplicationsWidget } from '@/components/MyApplicationsWidget';
import { MyProjectsWidget } from '@/components/MyProjectsWidget';
import type { CoordinatorDeadline, CoordinatorPendingMilestone, ExaminerRecommendation, ExaminerUser, InProgressProject, Project } from './types';

const COORDINATOR_ROLES: AppRole[] = ['coordinator', 'administrative_secretary', 'system_admin'];

type Tab = 'overview' | 'pending' | 'defense' | 'inProgress' | 'deadlines' | 'recommendations' | 'signoffs' | 'statistics' | 'archived';

const TABS: Tab[] = ['overview', 'pending', 'defense', 'inProgress', 'deadlines', 'recommendations', 'signoffs', 'statistics', 'archived'];
const isTab = (v: string | null): v is Tab => !!v && (TABS as string[]).includes(v);

function CoordinatorHomeContent() {
  const { loading: guardLoading, isAllowed, firebaseUser, userData } = useRequireRole(COORDINATOR_ROLES);
  const { activeRole } = useAuth();
  const { lang, t } = useLanguage();
  const router = useRouter();
  const searchParams = useSearchParams();

  // "Import/Export" used to be a DashboardShell hamburger action — it now
  // lives in the sidebar (app/coordinator/layout.tsx) and opens via this
  // ?modal= param instead, same "URL is the source of truth" pattern as
  // app/admin/panel/page.tsx.
  const showBulkImport = searchParams.get('modal') === 'bulkImport';
  const closeBulkImport = useCallback(() => {
    const qs = new URLSearchParams(searchParams);
    qs.delete('modal');
    const query = qs.toString();
    router.replace(query ? `/coordinator/home?${query}` : '/coordinator/home', { scroll: false });
  }, [router, searchParams]);

  // The URL's `?tab=` is the single source of truth for which tab is open —
  // no separate mirrored state — same pattern as app/admin/panel/page.tsx,
  // so the sidebar's coordinator nav items (app/coordinator/layout.tsx,
  // each linking to /coordinator/home?tab=...) actually switch tabs even
  // when this page is already mounted, and browser back/forward works too.
  // `archived` is additionally gated here against a hand-edited URL — it's
  // coordinator/system_admin-only, matching the activeRole check the item
  // used to make locally when building the now-removed tab-bar array.
  const paramTab = searchParams.get('tab');
  const tab: Tab = isTab(paramTab) && !(paramTab === 'archived' && activeRole === 'administrative_secretary') ? paramTab : 'overview';
  const [allMilestones, setAllMilestones] = useState<CoordinatorPendingMilestone[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [examiners, setExaminers] = useState<ExaminerUser[]>([]);
  const [recommendations, setRecommendations] = useState<ExaminerRecommendation[]>([]);
  const [inProgressProjects, setInProgressProjects] = useState<InProgressProject[]>([]);
  const [deadlines, setDeadlines] = useState<CoordinatorDeadline[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [assigningMilestone, setAssigningMilestone] = useState<CoordinatorPendingMilestone | null>(null);

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
  // the Defense tab instead of staying in Pending. Two more exclusions catch
  // items that share this array's coarse status filter (see
  // coordinatorController.ts's getCoordinatorDashboard) without actually
  // still needing a coordinator decision:
  //  - 'coordinator_approved' means fully finalized already — the Defense
  //    tab still wants those (its "setup" bucket), Pending shouldn't.
  //  - a chain-driven milestone (has `routing`) whose CURRENT stage isn't an
  //    'approve' action — its status can still be 'submitted'/
  //    'supervisor_graded' from a stage owned by a different role/action, so
  //    clicking Approve/Reject here would always fail server-side.
  const pendingMilestones = useMemo(
    () => allMilestones.filter((m) => {
      if (m.type === 'final_report' && m.status === 'graded') return false;
      if (m.status === 'coordinator_approved') return false;
      if (m.routing && m.routing.length > 0 && m.type !== 'defense') {
        const stage = m.routing[m.currentStageIndex ?? 0];
        if (!stage || stage.action !== 'approve') return false;
      }
      return true;
    }),
    [allMilestones]
  );

  // Defense cards with no confirmed path forward yet — surfaced on the
  // Overview tab's "Alerts" metric and Urgent Actions feed.
  const defenseAlertCards = useMemo(
    () => defenseCards.filter((c) => c.kind === 'conflict' || c.kind === 'expiredUngraded'),
    [defenseCards]
  );

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
    >
      {loadError && <p className="mb-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{loadError}</p>}

      {loadingData ? (
        <p className="text-sm text-muted">{t('loading')}</p>
      ) : tab === 'overview' ? (
        <div className="grid gap-6">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <div className="rounded-coordinator-lg border border-coordinator-outline-variant bg-coordinator-surface-container-lowest p-4">
              <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-coordinator-secondary">
                {lang === 'he' ? 'פרויקטים פעילים' : 'Active Projects'}
              </h4>
              <span className="text-4xl font-bold leading-none text-coordinator-on-surface">{inProgressProjects.length}</span>
            </div>
            <div className="rounded-coordinator-lg border border-coordinator-outline-variant bg-coordinator-surface-container-lowest p-4">
              <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-coordinator-secondary">
                {lang === 'he' ? 'ממתינים לאישור' : 'Pending Approvals'}
              </h4>
              <span className="text-4xl font-bold leading-none text-coordinator-on-surface">{pendingMilestones.length}</span>
            </div>
            <div className="rounded-coordinator-lg border border-coordinator-outline-variant bg-coordinator-surface-container-lowest p-4">
              <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-coordinator-secondary">
                {lang === 'he' ? 'הגנות' : 'Defenses'}
              </h4>
              <span className="text-4xl font-bold leading-none text-coordinator-on-surface">{defenseCards.length}</span>
            </div>
            <div className="rounded-coordinator-lg border border-coordinator-error-container bg-coordinator-error-container/10 p-4">
              <h4 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-coordinator-error">
                {lang === 'he' ? 'התראות מערכת' : 'System Alerts'}
              </h4>
              <span className="text-4xl font-bold leading-none text-coordinator-error">{defenseAlertCards.length}</span>
            </div>
          </div>

          <div className="rounded-coordinator-lg border border-coordinator-outline-variant bg-coordinator-surface-container-lowest p-5">
            <h3 className="mb-4 flex items-center gap-2 text-base font-semibold text-coordinator-on-surface">
              ⚠️ {lang === 'he' ? 'פעולות דחופות' : 'Urgent Actions'}
            </h3>
            {pendingMilestones.length === 0 && defenseAlertCards.length === 0 ? (
              <p className="text-sm text-coordinator-on-surface-variant">
                ✅ {lang === 'he' ? 'אין פעולות דחופות כרגע' : 'Nothing urgent right now'}
              </p>
            ) : (
              <ul className="grid gap-2">
                {pendingMilestones.slice(0, 3).map((m) => (
                  <li key={m.id}>
                    <Link
                      href="/coordinator/home?tab=pending"
                      className="block w-full rounded-coordinator border border-coordinator-outline-variant p-3 text-start transition-colors hover:bg-coordinator-surface-container-low"
                    >
                      <span className="mb-1 block rounded-coordinator-sm bg-coordinator-secondary-container px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-coordinator-on-secondary-container">
                        {lang === 'he' ? 'ממתין לאישור' : 'Pending Approval'}
                      </span>
                      <p className="text-sm font-medium text-coordinator-on-surface">
                        {lang === 'he' ? m.projectTitleHe : m.projectTitleEn}
                      </p>
                    </Link>
                  </li>
                ))}
                {defenseAlertCards.slice(0, 3).map((c) => (
                  <li key={c.key}>
                    <Link
                      href="/coordinator/home?tab=defense"
                      className="block w-full rounded-coordinator border border-coordinator-error-container p-3 text-start transition-colors hover:bg-coordinator-surface-container-low"
                    >
                      <span className="mb-1 block rounded-coordinator-sm bg-coordinator-error-container px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-coordinator-error">
                        {c.kind === 'conflict'
                          ? lang === 'he' ? 'התנגשות תאריכים' : 'Date Conflict'
                          : lang === 'he' ? 'הגנה שחלפה ללא ציון' : 'Overdue Grading'}
                      </span>
                      <p className="text-sm font-medium text-coordinator-on-surface">{lang === 'he' ? c.titleHe : c.titleEn}</p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
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
        <>
          <CreateOwnProjectButton onCreated={fetchAll} />
          <div className="mt-3">
            <MyApplicationsWidget />
          </div>
          <div className="mt-3">
            <MyProjectsWidget />
          </div>
          <div className="mt-3">
            <InProgressTab projects={inProgressProjects} currentUserId={firebaseUser?.uid} onChanged={fetchAll} />
          </div>
        </>
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
      {showBulkImport && <BulkImportModal scope="coordinator" onClose={closeBulkImport} onImported={fetchAll} />}
    </DashboardShell>
  );
}

export default function CoordinatorHomePage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">…</p>}>
      <CoordinatorHomeContent />
    </Suspense>
  );
}
