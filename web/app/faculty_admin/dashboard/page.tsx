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

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { ReportsLink } from '@/components/ReportsLink';
import { WorkflowTemplatesLink } from '@/components/WorkflowTemplatesLink';
import { useRequireRole } from '@/hooks/useRequireRole';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/apiClient';
import type { AppRole } from '@/lib/roles';
import type { FacultyId } from '@/lib/i18n';
import { UserRow } from './UserRow';
import { EditUserModal } from './EditUserModal';
import { ProjectCard } from './ProjectCard';
import { EnrollStudentModal } from './EnrollStudentModal';
import { NewProjectModal } from './NewProjectModal';
import { DeadlinesTab } from './DeadlinesTab';
import type { FacultyAdminUserRecord, FacultyAdminProjectRecord, FacultyAdminDeadline } from './types';

const FACULTY_ADMIN_ROLES: AppRole[] = ['faculty_admin', 'system_admin'];

type Tab = 'overview' | 'users' | 'projects' | 'deadlines';

export default function FacultyAdminDashboardPage() {
  const { loading: guardLoading, isAllowed, firebaseUser } = useRequireRole(FACULTY_ADMIN_ROLES);
  const { lang, t } = useLanguage();

  const [tab, setTab] = useState<Tab>('overview');
  const [users, setUsers] = useState<FacultyAdminUserRecord[]>([]);
  const [projects, setProjects] = useState<FacultyAdminProjectRecord[]>([]);
  const [availableStudents, setAvailableStudents] = useState<FacultyAdminUserRecord[]>([]);
  const [supervisorCount, setSupervisorCount] = useState(0);
  const [facultyId, setFacultyId] = useState<FacultyId>('all');
  const [deadlines, setDeadlines] = useState<FacultyAdminDeadline[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');

  const [editingUser, setEditingUser] = useState<FacultyAdminUserRecord | null>(null);
  const [enrollingProject, setEnrollingProject] = useState<FacultyAdminProjectRecord | null>(null);
  const [showNewProject, setShowNewProject] = useState(false);

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

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => u.displayName?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q) || u.role?.toLowerCase().includes(q));
  }, [users, search]);

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
      actions={
        <div className="flex items-center gap-2">
          {tab === 'projects' && (
            <button
              type="button"
              onClick={() => setShowNewProject(true)}
              className="rounded-full bg-primary px-4 py-1.5 text-sm font-semibold text-primary-ink hover:bg-primary-hover"
            >
              + {lang === 'he' ? 'פרסם פרויקט חדש' : 'Post New Project'}
            </button>
          )}
          <Link
            href="/faculty_admin/templates"
            className="rounded-full border border-line px-3.5 py-1.5 text-sm font-medium text-ink hover:border-primary hover:text-primary"
          >
            📋 {lang === 'he' ? 'תבניות פרויקט' : 'Project Templates'}
          </Link>
          <WorkflowTemplatesLink />
          <ReportsLink />
        </div>
      }
    >
      <div className="mb-5 flex gap-1 border-b border-line">
        {(['overview', 'users', 'projects', 'deadlines'] as const).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === key ? 'border-primary text-primary' : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            {key === 'overview'
              ? lang === 'he' ? 'סקירה' : 'Overview'
              : key === 'users'
                ? lang === 'he' ? 'משתמשים' : 'Users'
                : key === 'projects'
                  ? lang === 'he' ? 'פרויקטים' : 'Projects'
                  : lang === 'he' ? 'מועדי הגשה' : 'Deadlines'}
          </button>
        ))}
      </div>

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
        <div>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={lang === 'he' ? 'חפש משתמש...' : 'Search user...'}
            className="mb-4 w-full max-w-sm rounded-lg border border-line bg-surface px-3.5 py-2 text-sm text-ink focus:border-primary focus:outline-none"
          />
          <div className="grid gap-3 sm:grid-cols-2">
            {filteredUsers.map((u) => (
              <UserRow key={u.id} user={u} onChanged={fetchDashboard} onEdit={setEditingUser} />
            ))}
          </div>
          {filteredUsers.length === 0 && <p className="text-sm text-muted">{t('noData')}</p>}
        </div>
      ) : tab === 'projects' ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {projects.map((p) => (
            <ProjectCard key={p.id} project={p} onEnroll={setEnrollingProject} />
          ))}
          {projects.length === 0 && <p className="text-sm text-muted">📭 {lang === 'he' ? 'אין פרויקטים בפקולטה' : 'No projects in this faculty'}</p>}
        </div>
      ) : (
        <DeadlinesTab deadlines={deadlines} projects={projects} onSaved={fetchDashboard} />
      )}

      {editingUser && <EditUserModal key={editingUser.id} user={editingUser} onClose={() => setEditingUser(null)} onSaved={fetchDashboard} />}
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
        <NewProjectModal facultyId={facultyId} onClose={() => setShowNewProject(false)} onCreated={fetchDashboard} />
      )}
    </DashboardShell>
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
