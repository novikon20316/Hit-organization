'use client';

// app/program_head/dashboard/page.tsx
// Ported from mobile/app/program_head/program_head_dashboard.tsx. The whole
// screen is backed by a single read-only endpoint (GET /api/program-head/:uid/dashboard) —
// there's no approve/return/write endpoint anywhere in programHeadController.ts,
// and mobile's own Approve/Return buttons on the Approvals tab have no
// onPress at all. So this is a faithful, complete port: nothing is missing
// relative to mobile, since mobile itself only ever displays this data.

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { useRequireRole } from '@/hooks/useRequireRole';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/apiClient';
import { getFacultyColor } from '@/lib/facultyColors';
import { DELEGATE_MANAGEABLE_ROLES, type AppRole } from '@/lib/roles';
import { ClockPauseControl } from '@/components/ClockPauseControl';
import { TrackChangeControl } from '@/components/TrackChangeControl';
import { ExceptionalActionQueue } from '@/components/ExceptionalActionQueue';
import { PendingSignoffsWidget } from '@/components/dashboard/PendingSignoffsWidget';
import { ManagedStaffTab } from '@/components/staff/ManagedStaffTab';
import { CreateOwnProjectButton } from '@/components/CreateOwnProjectButton';
import { MyApplicationsWidget } from '@/components/MyApplicationsWidget';
import { ProjectCard } from '@/app/supervisor/dashboard/ProjectCard';
import { EditProjectModal } from '@/app/supervisor/dashboard/EditProjectModal';
import { GradeMilestoneModal } from '@/app/supervisor/dashboard/GradeMilestoneModal';
import type { AdminUserRecord } from '@/app/admin/panel/types';
import type { MyProject, SupervisorPendingMilestone } from '@/app/supervisor/dashboard/types';

const PROGRAM_HEAD_ROLES: AppRole[] = ['program_head', 'system_admin'];

type ProgramHeadTab = 'students' | 'approvals' | 'supervisors' | 'staff' | 'myProjects';
const PROGRAM_HEAD_TABS: ProgramHeadTab[] = ['students', 'approvals', 'supervisors', 'staff', 'myProjects'];
const isProgramHeadTab = (v: string | null): v is ProgramHeadTab => !!v && (PROGRAM_HEAD_TABS as string[]).includes(v);

interface StudentRow {
  uid: string;
  projectId: string;
  studentName: string;
  trackType: 'thesis' | 'masters_project';
  supervisorName: string;
  currentMilestone: string;
  daysInStage: number;
  deadline: string | null;
  isOverdue: boolean;
  isActivelyPaused: boolean;
  facultyId: string;
}

interface PendingApproval {
  id: string;
  type: string;
  studentName: string;
  description: string;
  submittedAt: string;
}

interface SupervisorLoad {
  supervisorName: string;
  supervisorEmail: string;
  activeStudents: number;
}

function ProgramHeadDashboardContent() {
  const { loading: guardLoading, isAllowed } = useRequireRole(PROGRAM_HEAD_ROLES);
  const { firebaseUser, roles } = useAuth();
  const { lang, t } = useLanguage();
  const searchParams = useSearchParams();

  // A program_head who's ALSO a supervisor/secondary_supervisor otherwise
  // has no way to reach /supervisor/dashboard's own "New Project" button —
  // program_head always outranks supervisor, so that's never their landing
  // dashboard (see lib/roles.ts's resolveActiveRole). This tab exists only
  // for that overlap; a plain program_head never sees it.
  const canCreateOwnProject = roles.includes('supervisor') || roles.includes('secondary_supervisor');

  // The URL's `?tab=` is the single source of truth for which tab is open —
  // no separate mirrored state — so the sidebar's links actually switch
  // tabs even when this page is already mounted. Guards against someone
  // hand-editing the URL to `myProjects` when they're not eligible for it.
  const paramTab = searchParams.get('tab');
  const tab: ProgramHeadTab = isProgramHeadTab(paramTab) && (paramTab !== 'myProjects' || canCreateOwnProject) ? paramTab : 'students';
  const [myProjects, setMyProjects] = useState<MyProject[]>([]);
  const [pendingGrades, setPendingGrades] = useState<SupervisorPendingMilestone[]>([]);
  const [editingProject, setEditingProject] = useState<MyProject | null>(null);
  const [gradingTarget, setGradingTarget] = useState<SupervisorPendingMilestone | null>(null);
  const [headName, setHeadName] = useState('');
  const [facultyId, setFacultyId] = useState('');
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [approvals, setApprovals] = useState<PendingApproval[]>([]);
  const [supervisorLoads, setSupervisorLoads] = useState<SupervisorLoad[]>([]);
  const [stats, setStats] = useState({ totalStudents: 0, activeStudents: 0, overdueCount: 0, pendingCount: 0 });
  const [staff, setStaff] = useState<AdminUserRecord[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [search, setSearch] = useState('');
  const [filterOverdue, setFilterOverdue] = useState(false);
  const [filterTrack, setFilterTrack] = useState<'all' | 'thesis' | 'masters_project'>('all');

  const fetchDashboard = useCallback(async () => {
    if (!firebaseUser) return;
    try {
      const data = await apiClient.getProgramHeadDashboard(firebaseUser.uid);
      setHeadName(data.headName ?? '');
      setFacultyId(data.facultyId ?? '');
      setStudents((data.students ?? []) as StudentRow[]);
      setApprovals(data.pendingApprovals ?? []);
      setSupervisorLoads(data.supervisorLoads ?? []);
      setStats(data.stats ?? { totalStudents: 0, activeStudents: 0, overdueCount: 0, pendingCount: 0 });
      setLoadError('');
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : lang === 'he' ? 'לא ניתן לטעון נתונים' : 'Could not load data');
    } finally {
      setLoadingData(false);
    }
  }, [firebaseUser, lang]);

  // Own-faculty staff this role can now manage directly (see
  // server/src/config/permissionScopes.ts's DELEGATE_ADMIN_ROLES) — a
  // separate endpoint from the read-only dashboard data above, since
  // program_head never had a user-listing endpoint of any kind before this.
  const fetchStaff = useCallback(async () => {
    try {
      const res = await apiClient.listManagedStaff();
      setStaff((res.staff ?? []) as unknown as AdminUserRecord[]);
    } catch {
      // Non-fatal — the Staff tab just shows an empty list if this fails;
      // the rest of the dashboard doesn't depend on it.
    }
  }, []);

  // Only relevant to the overlap this tab exists for (see
  // canCreateOwnProject above) — a plain program_head skips this fetch.
  const fetchMyProjects = useCallback(async () => {
    try {
      const data = await apiClient.getSupervisorDashboard();
      setMyProjects(data.myProjects as unknown as MyProject[]);
      setPendingGrades((data.pendingGrades ?? []) as unknown as SupervisorPendingMilestone[]);
    } catch {
      // Non-fatal — the tab just shows an empty list if this fails.
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; setState calls happen after the awaited network call resolves, not synchronously in this effect
    if (isAllowed) fetchDashboard();
    if (isAllowed) fetchStaff();
    if (isAllowed && canCreateOwnProject) fetchMyProjects();
  }, [isAllowed, fetchDashboard, fetchStaff, canCreateOwnProject, fetchMyProjects]);

  const filteredStudents = useMemo(() => {
    const q = search.trim().toLowerCase();
    return students.filter((st) => {
      const matchesSearch = !q || st.studentName.toLowerCase().includes(q) || st.supervisorName.toLowerCase().includes(q) || st.currentMilestone.toLowerCase().includes(q);
      const matchesOverdue = !filterOverdue || st.isOverdue;
      const matchesTrack = filterTrack === 'all' || st.trackType === filterTrack;
      return matchesSearch && matchesOverdue && matchesTrack;
    });
  }, [students, search, filterOverdue, filterTrack]);

  const facultyColor = getFacultyColor(facultyId);

  if (guardLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper">
        <p className="text-sm text-muted">…</p>
      </div>
    );
  }

  return (
    <DashboardShell
      title={headName ? `${lang === 'he' ? 'שלום' : 'Hello'}, ${headName}` : lang === 'he' ? 'ראש תוכנית תואר שני' : "Master's Program Head"}
      subtitle={lang === 'he' ? 'סטודנטים, אישורים ועומס הנחיה' : 'Students, approvals, and supervision load'}
      showBackButton={tab !== 'students'}
    >
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard value={stats.totalStudents} label={lang === 'he' ? 'סה"כ' : 'Total'} color={facultyColor} href="/program_head/dashboard?tab=students" />
        <StatCard value={stats.activeStudents} label={lang === 'he' ? 'פעילים' : 'Active'} color="var(--success)" href="/program_head/dashboard?tab=students" />
        <StatCard value={stats.overdueCount} label={lang === 'he' ? 'באיחור' : 'Overdue'} color="var(--danger)" href="/program_head/dashboard?tab=students" />
        <StatCard value={stats.pendingCount} label={lang === 'he' ? 'ממתינים' : 'Pending'} color="var(--accent)" href="/program_head/dashboard?tab=approvals" />
      </div>

      {loadError && <p className="mb-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{loadError}</p>}

      {loadingData ? (
        <p className="text-sm text-muted">{t('loading')}</p>
      ) : tab === 'students' ? (
        <div>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('searchPlaceholder')}
            className="mb-3 w-full max-w-sm rounded-lg border border-line bg-surface px-3.5 py-2 text-sm text-ink focus:border-primary focus:outline-none"
          />
          <div className="mb-4 flex flex-wrap gap-1.5">
            {(['all', 'thesis', 'masters_project'] as const).map((track) => (
              <button
                key={track}
                type="button"
                onClick={() => setFilterTrack(track)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                  filterTrack === track ? 'border-primary bg-primary text-primary-ink' : 'border-line bg-surface text-ink'
                }`}
              >
                {track === 'all' ? t('all') : track === 'thesis' ? t('trackThesis') : t('trackMastersProject')}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setFilterOverdue((v) => !v)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                filterOverdue ? 'border-danger bg-danger text-white' : 'border-line bg-surface text-ink'
              }`}
            >
              ⚠️ {lang === 'he' ? 'באיחור' : 'Overdue'}
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {filteredStudents.map((st) => (
              <div
                key={st.uid}
                className="role-rail rounded-[var(--radius)] border border-line bg-surface p-4"
                style={{ '--rail-color': st.isOverdue ? 'var(--danger)' : facultyColor } as React.CSSProperties}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-ink">👤 {st.studentName}</p>
                  {st.isOverdue && (
                    <span className="rounded-full bg-danger-bg px-2 py-0.5 text-xs font-medium text-danger">⚠️ {t('overdue')}</span>
                  )}
                </div>
                <p className="mt-1 text-xs text-muted">👨‍🏫 {st.supervisorName}</p>
                <p className="mt-0.5 text-xs text-muted">
                  📍 {lang === 'he' ? 'שלב:' : 'Stage:'} {st.currentMilestone} · {st.daysInStage} {lang === 'he' ? 'ימים' : 'days'}
                </p>
                <div className="mt-2 flex items-center justify-between">
                  <span className="rounded-full bg-paper px-2 py-0.5 text-xs text-ink">
                    {st.trackType === 'thesis' ? t('trackThesis') : t('trackMastersProject')}
                  </span>
                  {st.deadline && (
                    <span className="text-xs text-muted">
                      📅 {t('deadline')}: {new Date(st.deadline).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-US')}
                    </span>
                  )}
                </div>
                <ClockPauseControl projectId={st.projectId} />
                <TrackChangeControl projectId={st.projectId} />
              </div>
            ))}
            {filteredStudents.length === 0 && <p className="text-sm text-muted">🎓 {lang === 'he' ? 'אין סטודנטים להצגה' : 'No students to show'}</p>}
          </div>
        </div>
      ) : tab === 'approvals' ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <PendingSignoffsWidget showEmptyState />
          </div>
          <div className="sm:col-span-2">
            <ExceptionalActionQueue />
          </div>
          {approvals.map((item) => (
            <div key={item.id} className="role-rail rounded-[var(--radius)] border border-line bg-surface p-4" style={{ '--rail-color': 'var(--accent)' } as React.CSSProperties}>
              <p className="text-sm font-semibold text-ink">{item.studentName}</p>
              <p className="mt-0.5 text-xs font-semibold text-accent">{item.type}</p>
              <p className="mt-0.5 text-xs text-muted">{item.description}</p>
              {item.submittedAt && (
                <p className="mt-1 text-xs text-muted">{new Date(item.submittedAt).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-US')}</p>
              )}
            </div>
          ))}
          {approvals.length === 0 && <p className="text-sm text-muted">✅ {lang === 'he' ? 'אין פריטים ממתינים' : 'Nothing pending'}</p>}
        </div>
      ) : tab === 'supervisors' ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {supervisorLoads.map((sv, i) => (
            <div key={i} className="role-rail rounded-[var(--radius)] border border-line bg-surface p-4" style={{ '--rail-color': facultyColor } as React.CSSProperties}>
              <p className="text-sm font-semibold text-ink">👨‍🏫 {sv.supervisorName}</p>
              <p className="mt-0.5 text-xs text-muted" dir="ltr">
                {sv.supervisorEmail}
              </p>
              <div className="mt-2">
                <p className="text-xl font-semibold" style={{ color: facultyColor }}>
                  {sv.activeStudents}
                </p>
                <p className="text-xs text-muted">{lang === 'he' ? 'מונחים פעילים' : 'Active advisees'}</p>
              </div>
            </div>
          ))}
          {supervisorLoads.length === 0 && <p className="text-sm text-muted">👨‍🏫 {lang === 'he' ? 'אין מנחים' : 'No supervisors'}</p>}
        </div>
      ) : tab === 'staff' ? (
        <ManagedStaffTab staff={staff} onRefresh={fetchStaff} scope={{ selectableRoles: DELEGATE_MANAGEABLE_ROLES, lockedFacultyId: facultyId }} />
      ) : (
        <div>
          <div className="mb-4">
            <CreateOwnProjectButton onCreated={fetchMyProjects} />
          </div>
          <div className="mb-4">
            <MyApplicationsWidget />
          </div>
          <div className="grid gap-3">
            {myProjects.map((p) => (
              <ProjectCard
                key={p.id}
                project={p}
                onEdit={setEditingProject}
                onChanged={fetchMyProjects}
                pendingGrades={pendingGrades}
                onGrade={setGradingTarget}
              />
            ))}
            {myProjects.length === 0 && (
              <p className="text-sm text-muted">{lang === 'he' ? 'טרם פרסמת פרויקטים' : 'No projects posted yet'}</p>
            )}
          </div>
          {editingProject && (
            <EditProjectModal project={editingProject} onClose={() => setEditingProject(null)} onSaved={fetchMyProjects} />
          )}
          {gradingTarget && (
            <GradeMilestoneModal
              key={gradingTarget.id}
              milestone={gradingTarget}
              onClose={() => setGradingTarget(null)}
              onGraded={fetchMyProjects}
            />
          )}
        </div>
      )}
    </DashboardShell>
  );
}

export default function ProgramHeadDashboardPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">…</p>}>
      <ProgramHeadDashboardContent />
    </Suspense>
  );
}

function StatCard({ value, label, color, href }: { value: number; label: string; color: string; href?: string }) {
  const content = (
    <>
      <div className="text-2xl font-semibold" style={{ color }}>
        {value}
      </div>
      <div className="text-xs text-muted">{label}</div>
    </>
  );
  return href ? (
    <Link href={href} className="rounded-[var(--radius)] border border-line bg-surface p-4 transition-colors hover:border-primary">
      {content}
    </Link>
  ) : (
    <div className="rounded-[var(--radius)] border border-line bg-surface p-4">{content}</div>
  );
}
