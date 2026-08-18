'use client';

// app/faculty_admin/dashboard/page.tsx
// Ported from mobile/app/faculty_admin/dashboard.tsx — Overview, Users,
// Projects, and Deadlines tabs, plus "Post New Project".
//
// The latter two were originally left unbuilt because two server-side bugs
// made them non-functional for this role: createAdminProject
// (server/src/controllers/adminController.ts) gated POST /api/admin/projects
// to system_admin only, and getDeadLines (server/src/controllers/
// staffController.ts) excluded faculty_admin from GET /api/staff/:uid/deadlines'
// role check. Both are now fixed — createAdminProject accepts faculty_admin
// (via req.user.role or req.user.roles[]), and getDeadLines's role check
// includes faculty_admin and returns faculty-wide deadlines for that role.
//
// useSearchParams() forces this static route into client-side rendering at
// the Suspense boundary during prerendering (Next.js requirement) — wrapped
// below so the rest of the app shell can still be prerendered.

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { useRequireRole } from '@/hooks/useRequireRole';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/apiClient';
import { DELEGATE_MANAGEABLE_ROLES, type AppRole } from '@/lib/roles';
import type { FacultyId } from '@/lib/i18n';
import { ManagedStaffTab } from '@/components/staff/ManagedStaffTab';
import type { AdminUserRecord } from '@/app/admin/panel/types';
import { ProjectCard } from './ProjectCard';
import { EnrollStudentModal } from './EnrollStudentModal';
import { NewProjectModal } from './NewProjectModal';
import { CreateOwnProjectButton } from '@/components/CreateOwnProjectButton';
import { MyApplicationsWidget } from '@/components/MyApplicationsWidget';
import { MyProjectsWidget } from '@/components/MyProjectsWidget';
import { DeadlinesTab } from './DeadlinesTab';
import { PendingSignoffsWidget } from '@/components/dashboard/PendingSignoffsWidget';
import type { FacultyAdminUserRecord, FacultyAdminProjectRecord, FacultyAdminDeadline } from './types';

const FACULTY_ADMIN_ROLES: AppRole[] = ['faculty_admin', 'system_admin'];

type Tab = 'overview' | 'users' | 'projects' | 'deadlines' | 'signoffs';

const FACULTY_ADMIN_TABS: Tab[] = ['overview', 'users', 'projects', 'deadlines', 'signoffs'];
const isFacultyAdminTab = (v: string | null): v is Tab => !!v && (FACULTY_ADMIN_TABS as string[]).includes(v);

function FacultyAdminDashboardContent() {
  const { loading: guardLoading, isAllowed, firebaseUser } = useRequireRole(FACULTY_ADMIN_ROLES);
  const { lang, t } = useLanguage();
  const router = useRouter();
  const searchParams = useSearchParams();

  // The URL's `?tab=` is the single source of truth for which tab is open —
  // no separate mirrored state — so that the sidebar's links (e.g.
  // /faculty_admin/dashboard?tab=users) actually switch tabs even when this
  // page is already mounted, and browser back/forward works too. Same
  // pattern as app/admin/panel/page.tsx.
  const paramTab = searchParams.get('tab');
  const tab: Tab = isFacultyAdminTab(paramTab) ? paramTab : 'overview';

  // "Post New Project" used to be a DashboardShell hamburger action, shown
  // only on the projects tab — it now lives in the sidebar
  // (app/faculty_admin/layout.tsx) and opens via this ?modal= param
  // instead, same "URL is the source of truth" pattern as
  // app/admin/panel/page.tsx.
  const showNewProject = searchParams.get('modal') === 'newProject';
  const closeNewProject = useCallback(() => {
    const qs = new URLSearchParams(searchParams);
    qs.delete('modal');
    const query = qs.toString();
    router.replace(query ? `/faculty_admin/dashboard?${query}` : '/faculty_admin/dashboard', { scroll: false });
  }, [router, searchParams]);

  const [users, setUsers] = useState<FacultyAdminUserRecord[]>([]);
  const [projects, setProjects] = useState<FacultyAdminProjectRecord[]>([]);
  const [availableStudents, setAvailableStudents] = useState<FacultyAdminUserRecord[]>([]);
  const [supervisorCount, setSupervisorCount] = useState(0);
  const [facultyId, setFacultyId] = useState<FacultyId>('all');
  const [deadlines, setDeadlines] = useState<FacultyAdminDeadline[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [enrollingProject, setEnrollingProject] = useState<FacultyAdminProjectRecord | null>(null);

  const fetchDashboard = useCallback(async () => {
    try {
      const data = await apiClient.getFacultyAdminDashboard();
      setUsers((data.users ?? []) as unknown as FacultyAdminUserRecord[]);
      setProjects((data.projects ?? []) as unknown as FacultyAdminProjectRecord[]);
      setAvailableStudents((data.availableStudents ?? []) as unknown as FacultyAdminUserRecord[]);
      setSupervisorCount((data.supervisors ?? []).length);
      if (data.facultyId) setFacultyId(data.facultyId as FacultyId);
      setLoadError('');

      // Non-fatal — deadlines failing to load shouldn't block the rest of
      // the dashboard, same treatment as coordinator/supervisor's dashboards.
      try {
        if (firebaseUser) {
          const dl = await apiClient.getStaffDeadlines(firebaseUser.uid);
          setDeadlines((dl.deadlines ?? []) as unknown as FacultyAdminDeadline[]);
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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; fetchDashboard's setState calls happen after its awaited network call resolves, not synchronously in this effect
    if (isAllowed) fetchDashboard();
  }, [isAllowed, fetchDashboard]);

  if (guardLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper">
        <p className="text-sm text-muted">…</p>
      </div>
    );
  }

  return (
    <DashboardShell
      title={lang === 'he' ? 'לוח בקרה — ראש מנהל פקולטה' : 'Faculty Admin Dashboard'}
      subtitle={lang === 'he' ? 'ניהול משתמשים ופרויקטים בפקולטה' : 'Managing users and projects in your faculty'}
    >
      {loadError && <p className="mb-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{loadError}</p>}

      {loadingData ? (
        <p className="text-sm text-muted">{t('loading')}</p>
      ) : tab === 'overview' ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard emoji="👥" value={users.length} label={lang === 'he' ? 'משתמשים' : 'Users'} />
          <StatCard emoji="📁" value={projects.length} label={lang === 'he' ? 'פרויקטים' : 'Projects'} />
          <StatCard emoji="👨‍🏫" value={supervisorCount} label={lang === 'he' ? 'מנחים' : 'Supervisors'} />
          <StatCard emoji="🎓" value={availableStudents.length} label={lang === 'he' ? 'סטודנטים ללא פרויקט' : 'Students w/o Project'} />
        </div>
      ) : tab === 'users' ? (
        <ManagedStaffTab
          staff={users as unknown as AdminUserRecord[]}
          onRefresh={fetchDashboard}
          scope={{ selectableRoles: DELEGATE_MANAGEABLE_ROLES, lockedFacultyId: facultyId }}
        />
      ) : tab === 'projects' ? (
        <div>
          <div className="mb-3">
            <CreateOwnProjectButton onCreated={fetchDashboard} />
          </div>
          <div className="mb-3">
            <MyApplicationsWidget />
          </div>
          <div className="mb-3">
            <MyProjectsWidget />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {projects.map((p) => (
              <ProjectCard key={p.id} project={p} onEnroll={setEnrollingProject} />
            ))}
            {projects.length === 0 && <p className="text-sm text-muted">📭 {lang === 'he' ? 'אין פרויקטים בפקולטה' : 'No projects in this faculty'}</p>}
          </div>
        </div>
      ) : tab === 'deadlines' ? (
        <DeadlinesTab deadlines={deadlines} projects={projects} users={users} onSaved={fetchDashboard} />
      ) : (
        <PendingSignoffsWidget showEmptyState />
      )}

      {enrollingProject && (
        <EnrollStudentModal
          key={enrollingProject.id}
          project={enrollingProject}
          availableStudents={availableStudents}
          onClose={() => setEnrollingProject(null)}
          onEnrolled={fetchDashboard}
        />
      )}
      {showNewProject && (
        <NewProjectModal facultyId={facultyId} onClose={closeNewProject} onCreated={fetchDashboard} />
      )}
    </DashboardShell>
  );
}

export default function FacultyAdminDashboardPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">…</p>}>
      <FacultyAdminDashboardContent />
    </Suspense>
  );
}

function StatCard({ emoji, value, label }: { emoji: string; value: number; label: string }) {
  return (
    <div className="rounded-[var(--radius)] border border-line bg-surface p-4">
      <div className="text-2xl">{emoji}</div>
      <div className="mt-1 text-2xl font-semibold text-ink">{value}</div>
      <div className="text-xs text-muted">{label}</div>
    </div>
  );
}
