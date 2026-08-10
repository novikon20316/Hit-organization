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
import { ActiveDashboard } from './ActiveDashboard';
import { InfoScreen } from './InfoScreen';

const STUDENT_ROLES: AppRole[] = ['student'];

export default function StudentHomePage() {
  const { loading: guardLoading, isAllowed } = useRequireRole(STUDENT_ROLES);
  const { t } = useLanguage();
  const {
    studentState,
    proposals,
    activeProjects,
    pendingApplications,
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
            pendingApplications={pendingApplications}
            completedCourses={studentCompletedCourses}
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
              <ActiveDashboard project={ap.project} milestones={ap.milestones} progress={ap.progress} onChanged={refresh} />
            </div>
          ))}
      </DashboardShell>
      <ChatbotFab />
    </>
  );
}