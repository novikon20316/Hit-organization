'use client';

// app/student/home/page.tsx
// Ported from mobile/app/student/home.tsx — same state-machine routing
// (ineligible / no_project / pending / active) delegating to the same four
// sub-screens. The delete-account flow isn't built yet; the notification
// bell comes from the shared DashboardShell — sign-out and the language
// toggle now live in the sidebar (SidebarShell) instead, shared across every
// role. ChatbotFab is mounted here specifically because mobile only shows
// it on this screen, not globally.

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { ChatbotFab } from '@/components/ChatbotFab';
import { useRequireRole } from '@/hooks/useRequireRole';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useStudentData } from '@/hooks/useStudentData';
import { apiClient } from '@/lib/apiClient';
import type { AppRole } from '@/lib/roles';
import { BrowseProjects } from './BrowseProjects';
import { BrowseSupervisors } from './BrowseSupervisors';
import { ActiveDashboard } from './ActiveDashboard';
import { InfoScreen } from './InfoScreen';

const STUDENT_ROLES: AppRole[] = ['student'];

type ActiveTab = 'overview' | 'milestones' | 'grades';
const isActiveTab = (v: string | null): v is ActiveTab => v === 'overview' || v === 'milestones' || v === 'grades';

function StudentHomeContent() {
  const { loading: guardLoading, isAllowed } = useRequireRole(STUDENT_ROLES);
  const { registerBeforeSignOut } = useAuth();
  const { t, lang } = useLanguage();
  const searchParams = useSearchParams();
  // The URL's `?tab=` is the single source of truth for ActiveDashboard's
  // Overview/Milestones/Grades tab — see app/student/layout.tsx's sidebar
  // entries. Mirrors app/admin/panel/page.tsx's identical pattern.
  const activeTab: ActiveTab = isActiveTab(searchParams.get('tab')) ? (searchParams.get('tab') as ActiveTab) : 'overview';
  const {
    studentState,
    proposals,
    activeProjects,
    pendingApplications,
    supervisorSelectionRequiresApproval,
    studentDegree,
    studentCompletedCourses,
    refresh,
    cancelAllListeners,
    studentTrackPolicy,
    studentTrackLocked,
    studentThesisEligible,
    chooseTrack,
  } = useStudentData();
  const [choosingTrack, setChoosingTrack] = useState(false);
  const showTrackChoice = studentTrackPolicy === 'coordinator_gated' && studentThesisEligible && !studentTrackLocked;

  const handleChooseTrack = async (track: 'thesis' | 'project') => {
    setChoosingTrack(true);
    try {
      await chooseTrack(track);
    } catch (e) {
      console.error('Failed to set track:', e);
    } finally {
      setChoosingTrack(false);
    }
  };

  // Mirrors mobile's handleSignOut: best-effort backend logout call, then
  // stop the live Firestore listeners before Firebase itself signs out —
  // both run via the sidebar's Sign Out button through the registered
  // AuthContext hook below, ahead of the actual signOut()+redirect it
  // always performs.
  const handleBeforeSignOut = useCallback(async () => {
    try {
      await apiClient.logout();
    } catch {
      // non-fatal — sign-out proceeds regardless, same as mobile
    }
    cancelAllListeners();
  }, [cancelAllListeners]);

  useEffect(() => {
    registerBeforeSignOut(handleBeforeSignOut);
    return () => registerBeforeSignOut(null);
  }, [registerBeforeSignOut, handleBeforeSignOut]);

  if (guardLoading || !isAllowed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper">
        <p className="text-sm text-muted">…</p>
      </div>
    );
  }

  return (
    <>
      <DashboardShell title={t('appName')} showBackButton={activeTab !== 'overview'}>
        {studentState === 'loading' && (
          <div className="flex justify-center py-16">
            <p className="text-sm text-muted">{t('loading')}</p>
          </div>
        )}

        {studentState === 'ineligible' && <InfoScreen studentDegree={studentDegree} />}

        {showTrackChoice && (studentState === 'no_project' || studentState === 'choose_supervisor') && (
          <div className="mb-4 rounded-[var(--radius)] border border-primary/30 bg-primary/5 p-4">
            <p className="text-sm font-semibold text-ink">
              {lang === 'he' ? 'הוכרת כזכאי/ת למסלול תזה 🎉' : "You're eligible for the thesis track 🎉"}
            </p>
            <p className="mt-1 text-sm text-muted">
              {lang === 'he' ? 'בחר/י את המסלול שברצונך להמשיך בו — בחירה זו סופית.' : 'Choose which track you want to continue on — this choice is final.'}
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                disabled={choosingTrack}
                onClick={() => handleChooseTrack('thesis')}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-ink hover:bg-primary-hover disabled:opacity-60"
              >
                {lang === 'he' ? 'תזה' : 'Thesis'}
              </button>
              <button
                type="button"
                disabled={choosingTrack}
                onClick={() => handleChooseTrack('project')}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-ink hover:bg-primary-hover disabled:opacity-60"
              >
                {lang === 'he' ? 'פרויקט' : 'Project'}
              </button>
            </div>
          </div>
        )}

        {studentState === 'no_project' && (
          <BrowseProjects
            proposals={proposals}
            studentDegree={studentDegree}
            pendingApplications={pendingApplications}
            completedCourses={studentCompletedCourses}
            onApplicationsChanged={refresh}
          />
        )}

        {studentState === 'choose_supervisor' && (
          <BrowseSupervisors
            pendingApplications={pendingApplications}
            supervisorSelectionRequiresApproval={supervisorSelectionRequiresApproval}
            onApplicationsChanged={refresh}
          />
        )}

        {/* TEMP-2-ACTIVE-PROJECTS: activeProjects can hold more than one
            entry while the server-side bypass is on (projectEnrollment.ts) —
            normally just the one. Say "revert the temp 2-active-projects
            bypass" to undo. */}
        {studentState === 'active' &&
          activeProjects.map((ap) => (
            <div key={ap.project.id} className="mb-6">
              <ActiveDashboard project={ap.project} milestones={ap.milestones} progress={ap.progress} onChanged={refresh} tab={activeTab} />
            </div>
          ))}
      </DashboardShell>
      <ChatbotFab />
    </>
  );
}

export default function StudentHomePage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">…</p>}>
      <StudentHomeContent />
    </Suspense>
  );
}