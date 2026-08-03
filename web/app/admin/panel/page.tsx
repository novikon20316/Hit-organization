'use client';

// app/admin/panel/page.tsx
// Ported from mobile/app/admin/panel.tsx — Overview, Users, Projects,
// Milestones, Defense Access, and Feedback tabs, plus maintenance-mode/
// academic-calendar settings. Staff import lives in BulkImportModal
// (already wired into the Users tab toolbar below).

import { useCallback, useEffect, useMemo, useState } from 'react';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { PendingSignoffsWidget } from '@/components/dashboard/PendingSignoffsWidget';
import { ReportsLink } from '@/components/ReportsLink';
import { InfoFilesLink } from '@/components/InfoFilesLink';
import { AcademicYearLink } from '@/components/AcademicYearLink';
import { BulkPermissionsLink } from '@/components/BulkPermissionsLink';
import { WorkflowTemplatesLink } from '@/components/WorkflowTemplatesLink';
import { LiveTransportationLink } from '@/components/LiveTransportationLink';
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
import type { AdminUserRecord, AdminProjectRecord, AdminMilestoneRecord, StudentStatusConfig } from './types';

const ADMIN_ROLES: AppRole[] = ['system_admin'];
const DISPLAYED_FACULTIES = VALID_FACULTY_IDS.filter((id) => id !== 'all');
const selectCls = 'rounded-lg border border-line bg-surface px-3 py-1.5 text-sm text-ink focus:border-primary focus:outline-none';

type AdminTab = 'overview' | 'users' | 'projects' | 'milestones' | 'defenseAccess' | 'feedback' | 'studentRoster' | 'signoffs';

export default function AdminPanelPage() {
  const { loading: guardLoading, isAllowed } = useRequireRole(ADMIN_ROLES);
  const { lang, t } = useLanguage();

  const [tab, setTab] = useState<AdminTab>('overview');
  const [users, setUsers] = useState<AdminUserRecord[]>([]);
  const [projects, setProjects] = useState<AdminProjectRecord[]>([]);
  const [milestones, setMilestones] = useState<AdminMilestoneRecord[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | AppRole>('all');
  const [staffFilter, setStaffFilter] = useState<'all' | 'staff' | 'student'>('all');
  const [showNewUser, setShowNewUser] = useState(false);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [showMaintenance, setShowMaintenance] = useState(false);
  const [showAcademicCalendar, setShowAcademicCalendar] = useState(false);
  const [showStudentStatuses, setShowStudentStatuses] = useState(false);
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

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; fetchDashboard's setState calls all happen after its awaited network call resolves, not synchronously in this effect
    if (isAllowed) fetchDashboard();
    if (isAllowed) fetchStatusConfig();
  }, [isAllowed, fetchDashboard, fetchStatusConfig]);

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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-tab-open; setState calls happen after the awaited network call resolves
    if (isAllowed && tab === 'users') fetchLockedUsers();
  }, [isAllowed, tab, fetchLockedUsers]);

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
      return searchOk && roleOk && staffOk;
    });
  }, [users, search, roleFilter, staffFilter]);

  if (guardLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper">
        <p className="text-sm text-muted">…</p>
      </div>
    );
  }

  return (
    <DashboardShell
      title={lang === 'he' ? 'פאנל ניהול' : 'Admin Panel'}
      subtitle={lang === 'he' ? 'סטטיסטיקות מערכת וניהול משתמשים' : 'System stats and user management'}
      actions={
        <div className="flex items-center gap-2">
          <InfoFilesLink />
          <AcademicYearLink />
          <BulkPermissionsLink />
          <WorkflowTemplatesLink />
          <ReportsLink />
          <LiveTransportationLink />
          <button
            type="button"
            onClick={() => setShowAcademicCalendar(true)}
            className="rounded-full border border-line px-4 py-1.5 text-sm font-medium text-ink hover:border-primary hover:text-primary"
          >
            📅 {lang === 'he' ? 'לוח שנה' : 'Calendar'}
          </button>
          <button
            type="button"
            onClick={() => setShowMaintenance(true)}
            className="rounded-full border border-line px-4 py-1.5 text-sm font-medium text-ink hover:border-primary hover:text-primary"
          >
            🛠️ {lang === 'he' ? 'תחזוקה' : 'Maintenance'}
          </button>
          <button
            type="button"
            onClick={() => setShowStudentStatuses(true)}
            className="rounded-full border border-line px-4 py-1.5 text-sm font-medium text-ink hover:border-primary hover:text-primary"
          >
            🏷️ {lang === 'he' ? 'סטטוסי סטודנטים' : 'Student Statuses'}
          </button>
          {(tab === 'users' || tab === 'studentRoster') && (
            <>
              <button
                type="button"
                onClick={() => setShowBulkImport(true)}
                className="rounded-full border border-line px-4 py-1.5 text-sm font-medium text-ink hover:border-primary hover:text-primary"
              >
                📥 {lang === 'he' ? 'ייבוא/ייצוא' : 'Import/Export'}
              </button>
              {tab === 'users' && (
                <button
                  type="button"
                  onClick={() => setShowNewUser(true)}
                  className="rounded-full bg-primary px-4 py-1.5 text-sm font-semibold text-primary-ink hover:bg-primary-hover"
                >
                  + {lang === 'he' ? 'משתמש חדש' : 'New User'}
                </button>
              )}
            </>
          )}
        </div>
      }
    >
      <div className="mb-5 flex flex-wrap gap-1 border-b border-line">
        {(['overview', 'users', 'projects', 'milestones', 'defenseAccess', 'feedback', 'studentRoster', 'signoffs'] as const).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === key ? 'border-primary text-primary' : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            {TAB_LABELS[key][lang]}
          </button>
        ))}
      </div>

      {loadError && <p className="mb-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{loadError}</p>}

      {loadingData ? (
        <p className="text-sm text-muted">{t('loading')}</p>
      ) : tab === 'overview' ? (
        <OverviewTab stats={stats} projects={projects} lang={lang} />
      ) : tab === 'users' ? (
        <div>
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
      ) : (
        <FeedbackTab />
      )}

      <NewUserModal open={showNewUser} onClose={() => setShowNewUser(false)} onCreated={fetchDashboard} />
      {editingUser && (
        <EditUserModal key={editingUser.id} user={editingUser} onClose={() => setEditingUser(null)} onSaved={fetchDashboard} />
      )}
      {showBulkImport && (
        <BulkImportModal
          scope="admin"
          onClose={() => setShowBulkImport(false)}
          onImported={() => {
            fetchDashboard();
            setRosterRefreshKey((k) => k + 1);
          }}
        />
      )}
      {showMaintenance && <MaintenanceModal onClose={() => setShowMaintenance(false)} />}
      {showAcademicCalendar && <AcademicCalendarModal onClose={() => setShowAcademicCalendar(false)} />}
      {showStudentStatuses && (
        <StudentStatusesModal
          onClose={() => {
            setShowStudentStatuses(false);
            fetchStatusConfig();
          }}
        />
      )}
    </DashboardShell>
  );
}

const TAB_LABELS: Record<AdminTab, { he: string; en: string }> = {
  overview: { he: 'סקירה', en: 'Overview' },
  users: { he: 'משתמשים', en: 'Users' },
  projects: { he: 'פרויקטים', en: 'Projects' },
  milestones: { he: 'אבני דרך', en: 'Milestones' },
  defenseAccess: { he: 'גישת הגנה', en: 'Defense Access' },
  feedback: { he: 'משוב', en: 'Feedback' },
  studentRoster: { he: 'רשימת סטודנטים', en: 'Student Roster' },
  signoffs: { he: 'ממתין לאישורך', en: 'Awaiting Your Sign-off' },
};

function OverviewTab({
  stats,
  projects,
  lang,
}: {
  stats: { totalUsers: number; totalProjects: number; activeProjects: number; pendingMilestones: number };
  projects: AdminProjectRecord[];
  lang: 'he' | 'en';
}) {
  return (
    <div className="grid gap-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard emoji="👥" value={stats.totalUsers} label={lang === 'he' ? 'משתמשים' : 'Users'} />
        <StatCard emoji="📁" value={stats.totalProjects} label={lang === 'he' ? 'פרויקטים' : 'Projects'} />
        <StatCard emoji="🔥" value={stats.activeProjects} label={lang === 'he' ? 'פעילים' : 'Active'} />
        <StatCard emoji="⏳" value={stats.pendingMilestones} label={lang === 'he' ? 'ממתינים' : 'Pending'} />
      </div>

      <div className="rounded-[var(--radius)] border border-line bg-surface p-5">
        <h2 className="mb-4 text-sm font-semibold text-ink">🎨 {lang === 'he' ? 'פרויקטים לפי פקולטה' : 'Projects by Faculty'}</h2>
        <div className="grid gap-3">
          {DISPLAYED_FACULTIES.map((id) => {
            const count = projects.filter((p) => p.facultyId === id).length;
            if (!count) return null;
            const color = getFacultyColor(id);
            return (
              <div key={id} className="flex items-center gap-3">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                <span className="w-40 shrink-0 truncate text-sm text-ink">{facultyLabel(id as FacultyId, lang)}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-paper">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${(count / Math.max(projects.length, 1)) * 100}%`, backgroundColor: color }}
                  />
                </div>
                <span className="w-6 shrink-0 text-end text-sm text-muted">{count}</span>
              </div>
            );
          })}
          {projects.length === 0 && <p className="text-sm text-muted">{lang === 'he' ? 'אין פרויקטים עדיין' : 'No projects yet'}</p>}
        </div>
      </div>
    </div>
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
