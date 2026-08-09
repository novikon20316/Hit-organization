'use client';

// app/student/home/page.tsx
// Ported from mobile/app/student/home.tsx — same state-machine routing
// (ineligible / no_project / pending / active) delegating to the same four
// sub-screens. The delete-account flow isn't built yet; sign-out, the
// language toggle, and the notification bell all come from the shared
// DashboardShell instead of a bespoke top bar. ChatbotFab is mounted here
// specifically because mobile only shows it on this screen, not globally.

import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { ChatbotFab } from '@/components/ChatbotFab';
import { useRequireRole } from '@/hooks/useRequireRole';
import { useLanguage } from '@/contexts/LanguageContext';
import { useStudentData } from '@/hooks/useStudentData';
import { apiClient } from '@/lib/apiClient';
import type { AppRole } from '@/lib/roles';
import { BrowseProjects } from './BrowseProjects';
import { PendingScreen } from './PendingScreen';
import { ActiveDashboard } from './ActiveDashboard';
import { InfoScreen } from './InfoScreen';

const STUDENT_ROLES: AppRole[] = ['student'];

export default function StudentHomePage() {
  const { loading: guardLoading, isAllowed } = useRequireRole(STUDENT_ROLES);
  const { t } = useLanguage();
  const {
    studentState,
    proposals,
    activeProject,
    milestones,
    progress,
    pendingApplication,
    studentDegree,
    studentCompletedCourses,
    refresh,
    cancelAllListeners,
  } = useStudentData();

  // Mirrors mobile's handleSignOut: best-effort backend logout call, then
  // stop the live Firestore listeners before Firebase itself signs out —
  // both run via DashboardShell's onBeforeSignOut hook, ahead of the actual
  // signOut()+redirect it always performs.
  const handleBeforeSignOut = async () => {
    try {
      await apiClient.logout();
    } catch {
      // non-fatal — sign-out proceeds regardless, same as mobile
    }
    cancelAllListeners();
  };

  if (guardLoading || !isAllowed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper">
        <p className="text-sm text-muted">…</p>
      </div>
    );
  }

  return (
    <>
      <DashboardShell title={t('appName')} onBeforeSignOut={handleBeforeSignOut}>
        {studentState === 'loading' && (
          <div className="flex justify-center py-16">
            <p className="text-sm text-muted">{t('loading')}</p>
          </div>
        )}

        {studentState === 'ineligible' && <InfoScreen studentDegree={studentDegree} />}

        {studentState === 'no_project' && (
          <BrowseProjects
            proposals={proposals}
            studentDegree={studentDegree}
            appliedProjectIds={pendingApplication ? [pendingApplication.projectId] : []}
            completedCourses={studentCompletedCourses}
            onCompletedCoursesChanged={refresh}
          />
        )}

        {studentState === 'pending' && pendingApplication && <PendingScreen application={pendingApplication} onWithdrawn={refresh} />}

        {studentState === 'active' && activeProject && (
          <ActiveDashboard project={activeProject} milestones={milestones} progress={progress} onChanged={refresh} />
        )}
      </DashboardShell>
      <ChatbotFab />
    </>
  );
}