'use client';

// app/admin/panel/page.tsx
// Ported from mobile/app/admin/panel.tsx — Overview, Users, Projects,
// Milestones, Defense Access, and Feedback tabs, plus maintenance-mode/
// academic-calendar settings. Staff import lives in BulkImportModal
// (already wired into the Users tab toolbar below).

import { useCallback, useEffect, useMemo, useState } from 'react';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { ReportsLink } from '@/components/ReportsLink';
import { InfoFilesLink } from '@/components/InfoFilesLink';
import { useRequireRole } from '@/hooks/useRequireRole';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/apiClient';
import { facultyLabel, type FacultyId } from '@/lib/i18n';
import { getFacultyColor } from '@/lib/facultyColors';
import { VALID_FACULTY_IDS, type AppRole } from '@/lib/roles';
import { UserRow } from './UserRow';
import { NewUserModal } from './NewUserModal';
import { EditUserModal } from './EditUserModal';
import { BulkImportModal } from '@/components/BulkImportModal';
import { ProjectsTab } from './ProjectsTab';
import { MilestonesTab } from './MilestonesTab';
import { DefenseAccessTab } from './DefenseAccessTab';
import { FeedbackTab } from './FeedbackTab';
import { MaintenanceModal } from './MaintenanceModal';
import { AcademicCalendarModal } from './AcademicCalendarModal';
import type { AdminUserRecord, AdminProjectRecord, AdminMilestoneRecord } from './types';

const ADMIN_ROLES: AppRole[] = ['system_admin'];
const DISPLAYED_FACULTIES = VALID_FACULTY_IDS.filter((id) => id !== 'all');

type AdminTab = 'overview' | 'users' | 'projects' | 'milestones' | 'defenseAccess' | 'feedback';

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
  const [showNewUser, setShowNewUser] = useState(false);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [showMaintenance, setShowMaintenance] = useState(false);
  const [showAcademicCalendar, setShowAcademicCalendar] = useState(false);
  const [editingUser, setEditingUser] = useState<AdminUserRecord | null>(null);

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

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; fetchDashboard's setState calls all happen after its awaited network call resolves, not synchronously in this effect
    if (isAllowed) fetchDashboard();
  }, [isAllowed, fetchDashboard]);

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
    if (!q) return users;
    return users.filter(
      (u) => u.displayName?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q) || u.role?.toLowerCase().includes(q)
    );
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
      title={lang === 'he' ? 'פאנל ניהול' : 'Admin Panel'}
      subtitle={lang === 'he' ? 'סטטיסטיקות מערכת וניהול משתמשים' : 'System stats and user management'}
      actions={
        <div className="flex items-center gap-2">
          <InfoFilesLink />
          <ReportsLink />
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
          {tab === 'users' && (
            <>
              <button
                type="button"
                onClick={() => setShowBulkImport(true)}
                className="rounded-full border border-line px-4 py-1.5 text-sm font-medium text-ink hover:border-primary hover:text-primary"
              >
                📥 {lang === 'he' ? 'ייבוא/ייצוא' : 'Import/Export'}
              </button>
              <button
                type="button"
                onClick={() => setShowNewUser(true)}
                className="rounded-full bg-primary px-4 py-1.5 text-sm font-semibold text-primary-ink hover:bg-primary-hover"
              >
                + {lang === 'he' ? 'משתמש חדש' : 'New User'}
              </button>
            </>
          )}
        </div>
      }
    >
      <div className="mb-5 flex flex-wrap gap-1 border-b border-line">
        {(['overview', 'users', 'projects', 'milestones', 'defenseAccess', 'feedback'] as const).map((key) => (
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
        <ProjectsTab projects={projects} users={users} onChanged={fetchDashboard} />
      ) : tab === 'milestones' ? (
        <MilestonesTab projects={projects} milestones={milestones} users={users} onChanged={fetchDashboard} />
      ) : tab === 'defenseAccess' ? (
        <DefenseAccessTab />
      ) : (
        <FeedbackTab />
      )}

      <NewUserModal open={showNewUser} onClose={() => setShowNewUser(false)} onCreated={fetchDashboard} />
      {editingUser && (
        <EditUserModal key={editingUser.id} user={editingUser} onClose={() => setEditingUser(null)} onSaved={fetchDashboard} />
      )}
      {showBulkImport && <BulkImportModal scope="admin" onClose={() => setShowBulkImport(false)} onImported={fetchDashboard} />}
      {showMaintenance && <MaintenanceModal onClose={() => setShowMaintenance(false)} />}
      {showAcademicCalendar && <AcademicCalendarModal onClose={() => setShowAcademicCalendar(false)} />}
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
