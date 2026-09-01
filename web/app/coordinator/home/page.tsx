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
import { DefenseTab, buildDefenseCards, type DefenseCard } from './DefenseTab';
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
  // Overview tab's "Alerts" metric.
  const defenseAlertCards = useMemo(
    () => defenseCards.filter((c) => c.kind === 'conflict' || c.kind === 'expiredUngraded'),
    [defenseCards]
  );

  // Every defense card the coordinator actually has something to DO about —
  // excludes 'awaitingDate' (ball's in the examiners' court) and
  // 'scheduledUpcoming' (already on track, nothing to fix). Used by the
  // Urgent Actions feed's "defense exams needing attention" bucket, which is
  // deliberately broader than defenseAlertCards above (that one's only the
  // two most severe kinds, for the red stat tile).
  const defenseActionCards = useMemo(
    () => defenseCards.filter((c) => c.kind !== 'awaitingDate' && c.kind !== 'scheduledUpcoming'),
    [defenseCards]
  );

  // Milestones already past their due date — the "students late on a
  // submission" bucket of the Urgent Actions feed. getStaffDeadlines returns
  // daysLeft going negative once overdue (see DeadlinesTab's urgencyColorFor).
  const lateMilestones = useMemo(
    () => deadlines.filter((d) => typeof d.daysLeft === 'number' && d.daysLeft < 0),
    [deadlines]
  );

  // Quick-jump-to-fix-screen links on Urgent Actions cards are a coordinator
  // convenience only — administrative_secretary shares this page but not the
  // rest of its screen (no Pending/Defense/Deadlines tabs in its own sidebar,
  // see navSections.ts), so a deep link here would dead-end for them. Cards
  // render as plain (non-clickable) info for that role instead. system_admin
  // is browsing the actual coordinator screen (this page, "Coordinator View"),
  // so it keeps the same navigation as a real coordinator.
  const canQuickNavigate = activeRole !== 'administrative_secretary';

  function defenseActionLabel(kind: DefenseCard['kind'], lang: 'he' | 'en'): string {
    switch (kind) {
      case 'setup':
      case 'stuckPending':
        return lang === 'he' ? 'טרם שובצו בוחנים' : 'Needs Examiners';
      case 'conflict':
        return lang === 'he' ? 'התנגשות תאריכים' : 'Date Conflict';
      case 'dateSet':
        return lang === 'he' ? 'יש לקבוע פרטים' : 'Set Logistics';
      case 'expiredUngraded':
        return lang === 'he' ? 'הגנה שחלפה ללא ציון' : 'Overdue Grading';
      default:
        return lang === 'he' ? 'הגנה' : 'Defense';
    }
  }

  if (guardLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper">
        <p className="text-sm text-muted">…</p>
      </div>
    );
  }

  return (
    <DashboardShell
      // This route is shared by coordinator/administrative_secretary/
      // system_admin (see COORDINATOR_ROLES above) — the title must reflect
      // whoever's actually viewing it, not always claim "Coordinator"
      // (that misled a system_admin into thinking their own role had
      // changed — same class of bug fixed on the sidebar in
      // app/coordinator/layout.tsx / app/administrative_coordinator/layout.tsx).
      title={
        activeRole === 'administrative_secretary'
          ? (lang === 'he' ? 'לוח בקרה — רכזת אדמיניסטרטיבית' : 'Administrative Coordinator Dashboard')
          : activeRole === 'system_admin'
            ? (lang === 'he' ? 'לוח בקרה — תצוגת רכז (מנהל מערכת)' : "Coordinator View (System Admin)")
            : (lang === 'he' ? 'לוח בקרה — רכז' : 'Coordinator Dashboard')
      }
      subtitle={lang === 'he' ? 'אישור אבני דרך והמלצות בוחנים' : 'Milestone approvals and examiner recommendations'}
      showBackButton={tab !== 'overview'}
    >
      {loadError && <p className="mb-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">{loadError}</p>}

      {loadingData ? (
        <p className="text-sm text-muted">{t('loading')}</p>
      ) : tab === 'overview' ? (
        <div className="grid gap-6">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <Link href="/coordinator/home?tab=inProgress" className="rounded-coordinator-lg border border-coordinator-outline-variant bg-coordinator-surface-container-lowest p-4 transition-colors hover:border-coordinator-primary">
              <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-coordinator-secondary">
                {lang === 'he' ? 'פרויקטים פעילים' : 'Active Projects'}
              </h4>
              <span className="text-4xl font-bold leading-none text-coordinator-on-surface">{inProgressProjects.length}</span>
            </Link>
            <Link href="/coordinator/home?tab=pending" className="rounded-coordinator-lg border border-coordinator-outline-variant bg-coordinator-surface-container-lowest p-4 transition-colors hover:border-coordinator-primary">
              <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-coordinator-secondary">
                {lang === 'he' ? 'הגשות ממתינות לבדיקה' : 'Submissions Pending Review'}
              </h4>
              <span className="text-4xl font-bold leading-none text-coordinator-on-surface">{pendingMilestones.length}</span>
            </Link>
            <Link href="/coordinator/home?tab=defense" className="rounded-coordinator-lg border border-coordinator-outline-variant bg-coordinator-surface-container-lowest p-4 transition-colors hover:border-coordinator-primary">
              <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-coordinator-secondary">
                {lang === 'he' ? 'הגנות' : 'Defenses'}
              </h4>
              <span className="text-4xl font-bold leading-none text-coordinator-on-surface">{defenseCards.length}</span>
            </Link>
            <Link href="/coordinator/home?tab=defense" className="rounded-coordinator-lg border border-coordinator-error-container bg-coordinator-error-container/10 p-4 transition-colors hover:border-coordinator-error">
              <h4 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-coordinator-error">
                {lang === 'he' ? 'התראות מערכת' : 'System Alerts'}
              </h4>
              <span className="text-4xl font-bold leading-none text-coordinator-error">{defenseAlertCards.length}</span>
            </Link>
          </div>

          <div className="rounded-coordinator-lg border border-coordinator-outline-variant bg-coordinator-surface-container-lowest p-5">
            <h3 className="mb-4 flex items-center gap-2 text-base font-semibold text-coordinator-on-surface">
              ⚠️ {lang === 'he' ? 'פעולות דחופות' : 'Urgent Actions'}
            </h3>
            {defenseActionCards.length === 0 && pendingMilestones.length === 0 && lateMilestones.length === 0 ? (
              <p className="text-sm text-coordinator-on-surface-variant">
                ✅ {lang === 'he' ? 'אין פעולות דחופות כרגע' : 'Nothing urgent right now'}
              </p>
            ) : (
              <ul className="grid gap-2">
                {/* 1. Defense exams needing coordinator attention (examiners,
                    date conflicts, logistics, overdue grading). */}
                {defenseActionCards.slice(0, 3).map((c) => (
                  <UrgentActionRow
                    key={c.key}
                    href="/coordinator/home?tab=defense"
                    clickable={canQuickNavigate}
                    accent="error"
                    badgeClassName="bg-coordinator-error-container text-coordinator-error"
                    badge={defenseActionLabel(c.kind, lang)}
                    title={lang === 'he' ? c.titleHe : c.titleEn}
                  />
                ))}
                {/* 2. Submissions awaiting review/approve/reject — already
                    filtered above (pendingMilestones) to whatever the
                    project's workflow template says is currently the
                    coordinator's turn to act on. */}
                {pendingMilestones.slice(0, 3).map((m) => (
                  <UrgentActionRow
                    key={m.id}
                    href="/coordinator/home?tab=pending"
                    clickable={canQuickNavigate}
                    accent="default"
                    badgeClassName="bg-coordinator-secondary-container text-coordinator-on-secondary-container"
                    badge={lang === 'he' ? 'ממתין לאישור' : 'Pending Approval'}
                    title={lang === 'he' ? m.projectTitleHe : m.projectTitleEn}
                  />
                ))}
                {/* 3. Students late on a milestone submission. */}
                {lateMilestones.slice(0, 3).map((d) => (
                  <UrgentActionRow
                    key={`${d.milestoneId ?? d.id}-${d.studentId ?? ''}`}
                    href="/coordinator/home?tab=deadlines"
                    clickable={canQuickNavigate}
                    accent="error"
                    badgeClassName="bg-coordinator-error-container text-coordinator-error"
                    badge={lang === 'he' ? 'הגשה באיחור' : 'Late Submission'}
                    title={`${d.studentName ?? ''}${d.projectTitle ? ` — ${d.projectTitle}` : ''}`}
                  />
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

// One row in the Urgent Actions feed. `clickable` is false for
// administrative_secretary — see canQuickNavigate above for why.
function UrgentActionRow({
  href,
  clickable,
  accent,
  badge,
  badgeClassName,
  title,
}: {
  href: string;
  clickable: boolean;
  accent: 'error' | 'default';
  badge: string;
  badgeClassName: string;
  title: string;
}) {
  const borderClassName = accent === 'error' ? 'border-coordinator-error-container' : 'border-coordinator-outline-variant';
  const inner = (
    <>
      <span className={`mb-1 block w-fit rounded-coordinator-sm px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${badgeClassName}`}>
        {badge}
      </span>
      <p className="text-sm font-medium text-coordinator-on-surface">{title}</p>
    </>
  );
  return (
    <li>
      {clickable ? (
        <Link href={href} className={`block w-full rounded-coordinator border ${borderClassName} p-3 text-start transition-colors hover:bg-coordinator-surface-container-low`}>
          {inner}
        </Link>
      ) : (
        <div className={`block w-full rounded-coordinator border ${borderClassName} p-3 text-start`}>{inner}</div>
      )}
    </li>
  );
}
