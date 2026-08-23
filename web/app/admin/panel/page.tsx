'use client';

// app/admin/panel/page.tsx
// Ported from mobile/app/admin/panel.tsx — Overview, Users, Projects,
// Milestones, Defense Access, and Feedback tabs, plus maintenance-mode/
// academic-calendar settings. Staff import lives in BulkImportModal
// (already wired into the Users tab toolbar below).
//
// useSearchParams() forces this static route into client-side rendering at
// the Suspense boundary during prerendering (Next.js requirement) — wrapped
// below so the rest of the app shell can still be prerendered.

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { PendingSignoffsWidget } from '@/components/dashboard/PendingSignoffsWidget';
import { useRequireRole } from '@/hooks/useRequireRole';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/apiClient';
import { facultyLabel, roleLabel, type FacultyId } from '@/lib/i18n';
import { getFacultyColor } from '@/lib/facultyColors';
import { VALID_FACULTY_IDS, VALID_ROLES, isStaff, type AppRole } from '@/lib/roles';
import { UserRow } from './UserRow';
import { NewUserModal } from './NewUserModal';
import { EditUserModal } from './EditUserModal';
import { BulkImportModal } from '@/components/BulkImportModal';
import { ProjectsTab } from './ProjectsTab';
import { MilestonesTab } from './MilestonesTab';
import { DefenseAccessTab } from './DefenseAccessTab';
import { FeedbackTab } from './FeedbackTab';
import { StudentRosterTab } from './StudentRosterTab';
import { MaintenanceModal } from './MaintenanceModal';
import { AcademicCalendarModal } from './AcademicCalendarModal';
import { StudentStatusesModal } from './StudentStatusesModal';
import { CoordinatorStatisticsTab } from '@/components/dashboard/CoordinatorStatisticsTab';
import { ArchivedProjectsTab } from '@/components/ArchivedProjectsTab';
import { RolePermissionsCard } from './RolePermissionsCard';
import type { AdminUserRecord, AdminProjectRecord, AdminMilestoneRecord, StudentStatusConfig } from './types';

const ADMIN_ROLES: AppRole[] = ['system_admin'];
const DISPLAYED_FACULTIES = VALID_FACULTY_IDS.filter((id) => id !== 'all');
const selectCls = 'rounded-lg border border-line bg-surface px-3 py-1.5 text-sm text-ink focus:border-primary focus:outline-none';

type AdminTab = 'overview' | 'users' | 'projects' | 'milestones' | 'defenseAccess' | 'feedback' | 'studentRoster' | 'signoffs' | 'statistics' | 'archived';

const ADMIN_TABS: AdminTab[] = ['overview', 'users', 'projects', 'milestones', 'defenseAccess', 'feedback', 'studentRoster', 'signoffs', 'statistics', 'archived'];
const isAdminTab = (v: string | null): v is AdminTab => !!v && (ADMIN_TABS as string[]).includes(v);

// Every quick-action modal that used to live in this page's own
// DashboardShell hamburger menu — now triggered from AdminSidebarNav
// instead, via this same "URL is the source of truth" pattern as `tab`
// above, so they open correctly from any admin page, not just when this
// one happens to already be mounted.
type AdminModal = 'maintenance' | 'academicCalendar' | 'studentStatuses' | 'bulkImport';
const ADMIN_MODALS: AdminModal[] = ['maintenance', 'academicCalendar', 'studentStatuses', 'bulkImport'];
const isAdminModal = (v: string | null): v is AdminModal => !!v && (ADMIN_MODALS as string[]).includes(v);

function AdminPanelContent() {
  const { loading: guardLoading, isAllowed } = useRequireRole(ADMIN_ROLES);
  const { lang, t } = useLanguage();
  const router = useRouter();
  const searchParams = useSearchParams();

  // The URL's `?tab=` is the single source of truth for which tab is open —
  // no separate mirrored state — so that AdminSidebarNav's "User
  // Management" link (/admin/panel?tab=users) actually switches tabs even
  // when this page is already mounted (a same-page client-side navigation
  // doesn't remount the component), and browser back/forward works too.
  // useSearchParams() re-renders this Client Component on every such
  // navigation, so this stays in sync automatically.
  const paramTab = searchParams.get('tab');
  const tab: AdminTab = isAdminTab(paramTab) ? paramTab : 'overview';
  // Same URL-as-source-of-truth idea as `tab` — AdminSidebarNav links to
  // /admin/panel?modal=maintenance (etc.), preserving whatever `tab` is
  // already in the URL. Closing a modal just strips `modal` back out.
  const paramModal = searchParams.get('modal');
  const activeModal: AdminModal | null = isAdminModal(paramModal) ? paramModal : null;
  const closeModal = useCallback(() => {
    const qs = new URLSearchParams(searchParams);
    qs.delete('modal');
    const query = qs.toString();
    router.replace(query ? `/admin/panel?${query}` : '/admin/panel', { scroll: false });
  }, [router, searchParams]);
  const [users, setUsers] = useState<AdminUserRecord[]>([]);
  const [projects, setProjects] = useState<AdminProjectRecord[]>([]);
  const [milestones, setMilestones] = useState<AdminMilestoneRecord[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | AppRole>('all');
  const [staffFilter, setStaffFilter] = useState<'all' | 'staff' | 'student'>('all');
  const [facultyFilter, setFacultyFilter] = useState<'all' | FacultyId>('all');
  const [showNewUser, setShowNewUser] = useState(false);
  const [editingUser, setEditingUser] = useState<AdminUserRecord | null>(null);
  const [statusConfig, setStatusConfig] = useState<StudentStatusConfig>({ primary: [], secondary: [] });
  // Accounts currently disabled by the 3-strikes failed-login flow.
  const [lockedUsers, setLockedUsers] = useState<Array<{ code: string; uid: string; email: string; displayName: string; ip: string; location: string; createdAt: string }>>([]);
  const [loadingLocked, setLoadingLocked] = useState(false);
  const [liftingCode, setLiftingCode] = useState<string | null>(null);
  // Bumped after a roster import so StudentRosterTab (which fetches its own
  // data independently of fetchDashboard) remounts and refetches — otherwise
  // an import while already on that tab wouldn't show up until the next
  // filter change.
  const [rosterRefreshKey, setRosterRefreshKey] = useState(0);

  const fetchDashboard = useCallback(async () => {
    try {
      const data = await apiClient.getAdminDashboardSummary();
      setUsers((data.users ?? []) as unknown as AdminUserRecord[]);
      setProjects((data.projects ?? []) as unknown as AdminProjectRecord[]);
      setMilestones((data.milestones ?? []) as unknown as AdminMilestoneRecord[]);
      setLoadError('');
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : lang === 'he' ? 'טעינת לוח הבקרה נכשלה' : 'Failed to load the dashboard');
    } finally {
      setLoadingData(false);
    }
  }, [lang]);

  const fetchStatusConfig = useCallback(async () => {
    try {
      const res = await apiClient.getStudentStatusOptions();
      setStatusConfig(res);
    } catch {
      // Non-fatal — student-status badges just stay hidden if this fails.
    }
  }, []);

  const fetchLockedUsers = useCallback(async () => {
    try {
      setLoadingLocked(true);
      const res = await apiClient.getLockedUsers();
      setLockedUsers(res.lockouts ?? []);
    } catch (err) {
      console.error('Failed to load locked accounts:', err);
    } finally {
      setLoadingLocked(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; fetchDashboard's setState calls all happen after its awaited network call resolves, not synchronously in this effect
    if (isAllowed) fetchDashboard();
    if (isAllowed) fetchStatusConfig();
    // Also needed on the Overview tab's stat tiles (Locked Accounts), not
    // just when the Users tab is opened — see fetchDashboard above.
    if (isAllowed) fetchLockedUsers();
  }, [isAllowed, fetchDashboard, fetchStatusConfig, fetchLockedUsers]);

  const handleLiftLockout = async (code: string) => {
    if (liftingCode) return;
    setLiftingCode(code);
    try {
      await apiClient.liftLoginLockout(code);
      setLockedUsers((prev) => prev.filter((l) => l.code !== code));
    } catch (err) {
      console.error('Failed to lift lockout:', err);
    } finally {
      setLiftingCode(null);
    }
  };

  const stats = useMemo(
    () => ({
      totalUsers: users.length,
      activeUsers: users.filter((u) => u.isActive).length,
      inactiveUsers: users.filter((u) => !u.isActive).length,
      totalProjects: projects.length,
      activeProjects: projects.filter((p) => p.status === 'in_progress').length,
      pendingMilestones: milestones.filter((m) => m.status === 'submitted').length,
    }),
    [users, projects, milestones]
  );

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      const searchOk =
        !q || u.displayName?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q) || u.role?.toLowerCase().includes(q);
      const roleOk = roleFilter === 'all' || u.role === roleFilter || (u.roles ?? []).includes(roleFilter);
      const staffOk = staffFilter === 'all' || (staffFilter === 'staff' ? isStaff(u.role) : u.role === 'student');
      const facultyOk = facultyFilter === 'all' || u.facultyId === facultyFilter;
      return searchOk && roleOk && staffOk && facultyOk;
    });
  }, [users, search, roleFilter, staffFilter, facultyFilter]);

  if (guardLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-admin-surface">
        <p className="text-sm text-admin-on-surface-variant">…</p>
      </div>
    );
  }

  return (
    <DashboardShell
      title={lang === 'he' ? 'פאנל ניהול' : 'Admin Panel'}
      subtitle={lang === 'he' ? 'סטטיסטיקות מערכת וניהול משתמשים' : 'System stats and user management'}
      showBackButton={false}
    >
      {loadError && <p className="mb-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{loadError}</p>}

      {loadingData ? (
        <p className="text-sm text-muted">{t('loading')}</p>
      ) : tab === 'overview' ? (
        <OverviewTab stats={stats} projects={projects} users={users} lockedUsers={lockedUsers} lang={lang} />
      ) : tab === 'users' ? (
        <div className="pb-20">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={lang === 'he' ? 'חפש משתמש...' : 'Search user...'}
              className="w-full max-w-sm rounded-lg border border-line bg-surface px-3.5 py-2 text-sm text-ink focus:border-primary focus:outline-none"
            />
            <select value={staffFilter} onChange={(e) => setStaffFilter(e.target.value as typeof staffFilter)} className={selectCls}>
              <option value="all">{lang === 'he' ? 'הכל' : 'All'}</option>
              <option value="staff">{lang === 'he' ? 'צוות בלבד' : 'Staff only'}</option>
              <option value="student">{lang === 'he' ? 'סטודנטים בלבד' : 'Students only'}</option>
            </select>
            <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as typeof roleFilter)} className={selectCls}>
              <option value="all">{lang === 'he' ? 'כל התפקידים' : 'All roles'}</option>
              {VALID_ROLES.map((r) => (
                <option key={r} value={r}>
                  {roleLabel(r, lang)}
                </option>
              ))}
            </select>
            <select value={facultyFilter} onChange={(e) => setFacultyFilter(e.target.value as typeof facultyFilter)} className={selectCls}>
              <option value="all">{lang === 'he' ? 'כל הפקולטות' : 'All faculties'}</option>
              {DISPLAYED_FACULTIES.map((id) => (
                <option key={id} value={id}>
                  {facultyLabel(id, lang)}
                </option>
              ))}
            </select>
          </div>

          {(loadingLocked || lockedUsers.length > 0) && (
            <div className="mb-4 rounded-lg border border-danger/30 bg-danger-bg p-4">
              <p className="mb-2 text-sm font-semibold text-danger">
                🔒 {lang === 'he' ? 'חשבונות נעולים (3 סיסמאות שגויות)' : 'Locked accounts (3 wrong-password attempts)'}
              </p>
              {loadingLocked ? (
                <p className="text-sm text-muted">{t('loading')}</p>
              ) : (
                <div className="grid gap-2">
                  {lockedUsers.map((l) => (
                    <div key={l.code} className="flex items-center justify-between gap-3 rounded-md bg-surface px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-ink">{l.displayName || l.email}</p>
                        <p className="truncate text-xs text-muted">
                          {l.email} · {new Date(l.createdAt).toLocaleString()}{l.location ? ` · ${l.location}` : ''}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleLiftLockout(l.code)}
                        disabled={liftingCode === l.code}
                        className="shrink-0 rounded-md bg-danger px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                      >
                        {liftingCode === l.code ? '…' : lang === 'he' ? 'הסר נעילה' : 'Lift lockout'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            {filteredUsers.map((u) => (
              <UserRow key={u.id} user={u} statusConfig={statusConfig} onChanged={fetchDashboard} onEdit={setEditingUser} />
            ))}
          </div>
          {filteredUsers.length === 0 && <p className="text-sm text-muted">{t('noData')}</p>}
        </div>
      ) : tab === 'projects' ? (
        <ProjectsTab projects={projects} users={users} onChanged={fetchDashboard} />
      ) : tab === 'milestones' ? (
        <MilestonesTab projects={projects} milestones={milestones} users={users} onChanged={fetchDashboard} />
      ) : tab === 'defenseAccess' ? (
        <DefenseAccessTab />
      ) : tab === 'studentRoster' ? (
        <StudentRosterTab key={rosterRefreshKey} />
      ) : tab === 'signoffs' ? (
        <PendingSignoffsWidget showEmptyState />
      ) : tab === 'statistics' ? (
        <CoordinatorStatisticsTab />
      ) : tab === 'archived' ? (
        <ArchivedProjectsTab />
      ) : (
        <FeedbackTab />
      )}

      <NewUserModal open={showNewUser} onClose={() => setShowNewUser(false)} onCreated={fetchDashboard} />
      {editingUser && (
        <EditUserModal key={editingUser.id} user={editingUser} onClose={() => setEditingUser(null)} onSaved={fetchDashboard} />
      )}
      {activeModal === 'bulkImport' && (
        <BulkImportModal
          scope="admin"
          onClose={closeModal}
          onImported={() => {
            fetchDashboard();
            setRosterRefreshKey((k) => k + 1);
          }}
        />
      )}
      {activeModal === 'maintenance' && <MaintenanceModal onClose={closeModal} />}
      {activeModal === 'academicCalendar' && <AcademicCalendarModal onClose={closeModal} />}
      {activeModal === 'studentStatuses' && (
        <StudentStatusesModal
          onClose={() => {
            closeModal();
            fetchStatusConfig();
          }}
        />
      )}

      {tab === 'users' && (
        <div className="fixed start-0 end-0 bottom-0 z-30 border-t border-line bg-surface px-4 py-3 lg:start-64">
          <div className="mx-auto max-w-6xl">
            <button
              type="button"
              onClick={() => setShowNewUser(true)}
              className="w-full rounded-lg bg-primary py-3 text-sm font-semibold text-primary-ink hover:bg-primary-hover"
            >
              + {lang === 'he' ? 'משתמש חדש' : 'New User'}
            </button>
          </div>
        </div>
      )}
    </DashboardShell>
  );
}

export default function AdminPanelPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">…</p>}>
      <AdminPanelContent />
    </Suspense>
  );
}


function OverviewTab({
  stats,
  projects,
  users,
  lockedUsers,
  lang,
}: {
  stats: { totalUsers: number; activeUsers: number; inactiveUsers: number; totalProjects: number; activeProjects: number; pendingMilestones: number };
  projects: AdminProjectRecord[];
  users: AdminUserRecord[];
  lockedUsers: Array<{ code: string; uid: string; email: string; displayName: string; ip: string; location: string; createdAt: string }>;
  lang: 'he' | 'en';
}) {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      <div className="flex flex-col gap-6 lg:col-span-9">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard icon="👥" value={stats.totalUsers} label={lang === 'he' ? 'סה"כ משתמשים' : 'Total Users'} />
          <StatCard icon="✅" value={stats.activeUsers} label={lang === 'he' ? 'פעילים' : 'Active'} tone="success" />
          <StatCard icon="💤" value={stats.inactiveUsers} label={lang === 'he' ? 'לא פעילים' : 'Inactive'} />
          <StatCard icon="🔒" value={lockedUsers.length} label={lang === 'he' ? 'חשבונות נעולים' : 'Locked Accounts'} tone={lockedUsers.length > 0 ? 'danger' : undefined} />
        </div>

        <div className="rounded-admin-lg border border-admin-outline-variant bg-admin-surface p-5">
          <h2 className="mb-4 text-sm font-semibold text-admin-on-surface">🎨 {lang === 'he' ? 'פרויקטים לפי פקולטה' : 'Projects by Faculty'}</h2>
          <div className="grid gap-3">
            {DISPLAYED_FACULTIES.map((id) => {
              const count = projects.filter((p) => p.facultyId === id).length;
              if (!count) return null;
              const color = getFacultyColor(id);
              return (
                <div key={id} className="flex items-center gap-3">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                  <span className="w-40 shrink-0 truncate text-sm text-admin-on-surface">{facultyLabel(id as FacultyId, lang)}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-admin-surface-container">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${(count / Math.max(projects.length, 1)) * 100}%`, backgroundColor: color }}
                    />
                  </div>
                  <span className="w-6 shrink-0 text-end text-sm text-admin-on-surface-variant">{count}</span>
                </div>
              );
            })}
            {projects.length === 0 && <p className="text-sm text-admin-on-surface-variant">{lang === 'he' ? 'אין פרויקטים עדיין' : 'No projects yet'}</p>}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
          <StatCard icon="📁" value={stats.totalProjects} label={lang === 'he' ? 'פרויקטים' : 'Projects'} />
          <StatCard icon="🔥" value={stats.activeProjects} label={lang === 'he' ? 'פעילים' : 'In Progress'} />
        </div>
      </div>

      <div className="lg:col-span-3">
        <RolePermissionsCard users={users} lockedUsers={lockedUsers} lang={lang} />
      </div>
    </div>
  );
}

function StatCard({ icon, value, label, tone }: { icon: string; value: number; label: string; tone?: 'success' | 'danger' }) {
  const valueCls = tone === 'success' ? 'text-[#059669]' : tone === 'danger' ? 'text-admin-error' : 'text-admin-on-surface';
  return (
    <div className="flex flex-col items-center justify-center rounded-admin-lg border border-admin-outline-variant bg-admin-surface p-4 text-center transition-colors hover:border-admin-primary-container">
      <span className="mb-2 text-[28px] leading-none">{icon}</span>
      <span className={`text-3xl font-semibold leading-none ${valueCls}`}>{value}</span>
      <span className="mt-1 text-[11px] font-medium uppercase tracking-wider text-admin-on-surface-variant">{label}</span>
    </div>
  );
}
