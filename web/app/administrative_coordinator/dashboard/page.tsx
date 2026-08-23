'use client';

// app/administrative_coordinator/dashboard/page.tsx
// Ported from mobile/app/administrative_coordinator/administrative_coordinator_dashboard.tsx.
// Dropped: the "View" button that routed to /admin/panel?groupId=... — that
// page is system_admin-gated (this role would just get redirected away) and
// never reads a groupId param anyway, so it was a dead link on mobile too.
//
// useSearchParams() forces this static route into client-side rendering at
// the Suspense boundary during prerendering (Next.js requirement) — wrapped
// below so the rest of the app shell can still be prerendered (see the same
// fix applied to coordinator/home, faculty_admin/dashboard, etc.).

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { useRequireRole } from '@/hooks/useRequireRole';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/apiClient';
import { getFacultyColor } from '@/lib/facultyColors';
import type { AppRole } from '@/lib/roles';
import { BulkDueDateModal } from '@/components/BulkDueDateModal';
import { PendingSignoffsWidget } from '@/components/dashboard/PendingSignoffsWidget';
import { SendExaminerModal } from './SendExaminerModal';
import { DefenseLogisticsModal } from './DefenseLogisticsModal';
import { NewProjectModal } from './NewProjectModal';
import { CreateOwnProjectButton } from '@/components/CreateOwnProjectButton';
import { MyApplicationsWidget } from '@/components/MyApplicationsWidget';
import { MyProjectsWidget } from '@/components/MyProjectsWidget';
import { StudentsReportTab } from './StudentsReportTab';
import { GradeOverridesTab } from './GradeOverridesTab';
import { CoordinatorStatisticsTab } from '@/components/dashboard/CoordinatorStatisticsTab';
import { StudentContactModal, type ContactMember } from './StudentContactModal';
import type { ProjectGroup, MemberMilestoneGrade } from './types';
import { MILESTONE_LABEL as MILESTONE_TYPE_LABEL } from '@/app/coordinator/home/types';

const ADMIN_COORDINATOR_ROLES: AppRole[] = ['administrative_secretary', 'system_admin'];

// Mirrors InProgressTab.tsx's statusColor/statusLabel (coordinator/home) —
// same milestone status taxonomy, just keyed off finalGrade instead of the
// legacy per-role supervisorScore field.
function gradeStatusColor(m: MemberMilestoneGrade): string {
  if (m.status === 'coordinator_approved' || m.status === 'completed') return '#10B981';
  if (m.status === 'submitted' || m.status === 'supervisor_graded' || m.status === 'graded') return '#F59E0B';
  return '#8899BB';
}

function gradeStatusLabel(m: MemberMilestoneGrade, lang: 'he' | 'en'): string {
  if (m.finalGrade !== null) {
    const approved = m.gradeApproved ? (lang === 'he' ? 'מאושר' : 'Approved') : lang === 'he' ? 'טרם אושר' : 'Not yet approved';
    return `${m.finalGrade}/100 · ${approved}`;
  }
  if (m.status === 'submitted' || m.status === 'supervisor_graded' || m.status === 'graded') {
    return lang === 'he' ? 'הוגש, בבדיקה' : 'Submitted, grading';
  }
  return lang === 'he' ? 'טרם הוגש' : 'Not submitted yet';
}

function AdministrativeCoordinatorDashboardContent() {
  const { loading: guardLoading, isAllowed } = useRequireRole(ADMIN_COORDINATOR_ROLES);
  const { firebaseUser, activeRole } = useAuth();
  const { lang, t } = useLanguage();
  const searchParams = useSearchParams();

  // The URL's `?tab=` is the single source of truth for which tab is open —
  // no separate mirrored state — so that the sidebar's links (e.g.
  // /administrative_coordinator/dashboard?tab=students) actually switch
  // tabs even when this page is already mounted, and browser back/forward
  // works too. Also lets the student-detail page's back link (?tab=students)
  // land back on the Students Report tab instead of always resetting to
  // Groups.
  const paramTab = searchParams.get('tab');
  const activeTab: 'groups' | 'students' | 'overrides' | 'statistics' =
    paramTab === 'students' || paramTab === 'overrides' || paramTab === 'statistics' ? paramTab : 'groups';
  const [facultyId, setFacultyId] = useState('');
  const [groups, setGroups] = useState<ProjectGroup[]>([]);
  const [stats, setStats] = useState({ totalGroups: 0, activeGroups: 0, scheduledDefenses: 0, overdueGroups: 0 });
  const [loadingData, setLoadingData] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [noScopeAssigned, setNoScopeAssigned] = useState(false);

  const [search, setSearch] = useState('');
  const [filterTrack, setFilterTrack] = useState<'all' | 'bachelor_project' | 'masters_project'>('all');
  const [filterOverdue, setFilterOverdue] = useState(false);
  const [expandedGrades, setExpandedGrades] = useState<Record<string, boolean>>({});
  // Project Groups tab: supervisor list → drill into that supervisor's own
  // groups, instead of one flat list of every project at once. Grouped by
  // supervisorId when present (two supervisors can share a display name);
  // falls back to a name-keyed bucket for legacy/unassigned projects with
  // no supervisorId at all.
  const [viewingSupervisorKey, setViewingSupervisorKey] = useState<string | null>(null);
  const [supervisorSearch, setSupervisorSearch] = useState('');

  const [examinerModalGroup, setExaminerModalGroup] = useState<ProjectGroup | null>(null);
  const [defenseModalGroup, setDefenseModalGroup] = useState<ProjectGroup | null>(null);
  const [showBulkDueDate, setShowBulkDueDate] = useState(false);
  const [showNewProject, setShowNewProject] = useState(false);
  const [contactMember, setContactMember] = useState<ContactMember | null>(null);

  const fetchDashboard = useCallback(async () => {
    if (!firebaseUser) return;
    try {
      const data = await apiClient.getProjectCoordinatorDashboard(firebaseUser.uid);
      setFacultyId(data.facultyId ?? '');
      setGroups((data.groups ?? []) as ProjectGroup[]);
      setStats(data.stats ?? { totalGroups: 0, activeGroups: 0, scheduledDefenses: 0, overdueGroups: 0 });
      setNoScopeAssigned(!!data.noScopeAssigned);
      setLoadError('');
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : lang === 'he' ? 'לא ניתן לטעון נתונים' : 'Could not load data');
    } finally {
      setLoadingData(false);
    }
  }, [firebaseUser, lang]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; setState calls happen after the awaited network call resolves, not synchronously in this effect
    if (isAllowed) fetchDashboard();
  }, [isAllowed, fetchDashboard]);

  const supervisorKey = (g: ProjectGroup) => g.supervisorId ?? `name:${g.supervisorName}`;

  const supervisorSummaries = useMemo(() => {
    const map = new Map<string, { key: string; name: string; projectCount: number; overdueCount: number }>();
    groups.forEach((g) => {
      const key = supervisorKey(g);
      const existing = map.get(key);
      if (existing) {
        existing.projectCount++;
        if (g.isOverdue) existing.overdueCount++;
      } else {
        map.set(key, { key, name: g.supervisorName, projectCount: 1, overdueCount: g.isOverdue ? 1 : 0 });
      }
    });
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [groups]);

  const filteredSupervisors = useMemo(() => {
    const q = supervisorSearch.trim().toLowerCase();
    return !q ? supervisorSummaries : supervisorSummaries.filter((s) => s.name.toLowerCase().includes(q));
  }, [supervisorSummaries, supervisorSearch]);

  const viewingSupervisor = supervisorSummaries.find((s) => s.key === viewingSupervisorKey) ?? null;

  const filteredGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    return groups
      .filter((g) => !viewingSupervisorKey || supervisorKey(g) === viewingSupervisorKey)
      .filter((g) => {
        const matchesSearch = !q || g.projectTitle.toLowerCase().includes(q) || g.supervisorName.toLowerCase().includes(q) || g.members.some((m) => m.name.toLowerCase().includes(q));
        const matchesTrack = filterTrack === 'all' || g.trackType === filterTrack;
        const matchesOverdue = !filterOverdue || g.isOverdue;
        return matchesSearch && matchesTrack && matchesOverdue;
      });
  }, [groups, search, filterTrack, filterOverdue, viewingSupervisorKey]);

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
      // ADMIN_COORDINATOR_ROLES above is only administrative_secretary +
      // system_admin — the title must say which one is actually looking,
      // not always claim "Administrative Coordinator" (that misled a
      // system_admin into thinking their own role had changed — same class
      // of bug fixed on the sidebar in app/administrative_coordinator/layout.tsx).
      title={
        activeRole === 'system_admin'
          ? (lang === 'he' ? 'לוח בקרה — תצוגת רכזת אדמיניסטרטיבית (מנהל מערכת)' : 'Administrative Coordinator View (System Admin)')
          : (lang === 'he' ? 'לוח בקרה — רכזת אדמיניסטרטיבית' : 'Administrative Coordinator Dashboard')
      }
      subtitle={lang === 'he' ? 'קבוצות פרויקט, הגנות ובוחנים חיצוניים' : 'Project groups, defenses, and external examiners'}
      showBackButton={activeTab !== 'groups'}
    >
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard value={stats.totalGroups} label={lang === 'he' ? 'קבוצות' : 'Groups'} color={facultyColor} href="/administrative_coordinator/dashboard?tab=groups" />
        <StatCard value={stats.activeGroups} label={lang === 'he' ? 'פעילות' : 'Active'} color="var(--success)" href="/administrative_coordinator/dashboard?tab=groups" />
        <StatCard value={stats.scheduledDefenses} label={lang === 'he' ? 'הגנות מתוכננות' : 'Defenses'} color="#3E6C8C" href="/administrative_coordinator/dashboard?tab=groups" />
        <StatCard value={stats.overdueGroups} label={lang === 'he' ? 'באיחור' : 'Overdue'} color="var(--danger)" href="/administrative_coordinator/dashboard?tab=groups" />
      </div>

      <PendingSignoffsWidget />

      {activeTab === 'overrides' ? (
        <GradeOverridesTab />
      ) : activeTab === 'students' ? (
        <StudentsReportTab />
      ) : activeTab === 'statistics' ? (
        <CoordinatorStatisticsTab />
      ) : (
        <>
      {loadError && <p className="mb-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{loadError}</p>}

      {!loadingData && noScopeAssigned && (
        <p className="mb-4 rounded-md bg-[#FBF3E3] px-3 py-2 text-sm text-accent">
          {lang === 'he'
            ? 'לא הוקצה לך עדיין תחום אחריות (פקולטה/תואר). פנה/י למנהל המערכת כדי להקצות לך תואר.'
            : 'No degree has been assigned to your account yet — ask your system_admin to assign one via Coordinator Scope.'}
        </p>
      )}

      {loadingData ? (
        <p className="text-sm text-muted">{t('loading')}</p>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setShowNewProject(true)}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-ink hover:bg-primary-hover"
            >
              📁 {lang === 'he' ? 'פרסום פרויקט חדש' : 'Post New Project'}
            </button>
            <CreateOwnProjectButton onCreated={fetchDashboard} />
            <button
              type="button"
              onClick={() => setShowBulkDueDate(true)}
              className="rounded-lg border border-accent bg-[#FBF3E3] px-4 py-2 text-sm font-semibold text-accent"
            >
              📅 {lang === 'he' ? 'עדכון תאריכי יעד מרוכז' : 'Bulk Update Due Dates'}
            </button>
          </div>

          <div className="mb-4">
            <MyApplicationsWidget />
          </div>
          <div className="mb-4">
            <MyProjectsWidget />
          </div>

          {!viewingSupervisorKey ? (
            <>
              <input
                value={supervisorSearch}
                onChange={(e) => setSupervisorSearch(e.target.value)}
                placeholder={lang === 'he' ? 'חיפוש מנחה...' : 'Search supervisor...'}
                className="mb-3 w-full max-w-sm rounded-lg border border-line bg-surface px-3.5 py-2 text-sm text-ink focus:border-primary focus:outline-none"
              />

              {/* Supervisor list — click a supervisor to drill into their
                  own project groups below, instead of one flat list of
                  everyone's. */}
              <div className="grid gap-3 sm:grid-cols-2">
                {filteredSupervisors.map((sv) => (
                  <button
                    key={sv.key}
                    type="button"
                    onClick={() => setViewingSupervisorKey(sv.key)}
                    className="role-rail rounded-[var(--radius)] border border-line bg-surface p-4 text-start hover:border-primary"
                    style={{ '--rail-color': sv.overdueCount > 0 ? 'var(--danger)' : facultyColor } as React.CSSProperties}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold text-ink">👨‍🏫 {sv.name}</p>
                      {sv.overdueCount > 0 && <span className="shrink-0 rounded-full bg-danger-bg px-2 py-0.5 text-xs font-medium text-danger">⚠️ {sv.overdueCount}</span>}
                    </div>
                    <p className="mt-1 text-xs text-muted">
                      📁 {sv.projectCount} {lang === 'he' ? 'פרויקטים/תזות' : sv.projectCount === 1 ? 'project/thesis' : 'projects/theses'}
                    </p>
                  </button>
                ))}
                {filteredSupervisors.length === 0 && <p className="text-sm text-muted">📭 {lang === 'he' ? 'אין מנחים להצגה' : 'No supervisors to show'}</p>}
              </div>
            </>
          ) : (
          <>
          <button
            type="button"
            onClick={() => setViewingSupervisorKey(null)}
            className="mb-3 rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink hover:border-primary hover:text-primary"
          >
            {lang === 'he' ? '← חזרה למנחים' : '← Back to supervisors'}
          </button>
          <p className="mb-3 text-sm font-semibold text-ink">👨‍🏫 {viewingSupervisor?.name}</p>

          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('searchPlaceholder')}
            className="mb-3 w-full max-w-sm rounded-lg border border-line bg-surface px-3.5 py-2 text-sm text-ink focus:border-primary focus:outline-none"
          />
          <div className="mb-4 flex flex-wrap gap-1.5">
            {(['all', 'bachelor_project', 'masters_project'] as const).map((track) => (
              <button
                key={track}
                type="button"
                onClick={() => setFilterTrack(track)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                  filterTrack === track ? 'border-primary bg-primary text-primary-ink' : 'border-line bg-surface text-ink'
                }`}
              >
                {track === 'all' ? t('all') : track === 'bachelor_project' ? t('trackBachelorProject') : t('trackMastersProject')}
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

          <div className="grid gap-3">
            {filteredGroups.map((group) => (
              <div
                key={group.id}
                className="role-rail rounded-[var(--radius)] border border-line bg-surface p-4"
                style={{ '--rail-color': group.isOverdue ? 'var(--danger)' : facultyColor } as React.CSSProperties}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-ink">{group.projectTitle}</p>
                  {group.isOverdue && <span className="shrink-0 rounded-full bg-danger-bg px-2 py-0.5 text-xs font-medium text-danger">⚠️ {t('overdue')}</span>}
                </div>
                <p className="mt-1 text-xs text-muted">👨‍🏫 {group.supervisorName}</p>
                <p className="mt-0.5 text-xs text-muted">
                  👥{' '}
                  {group.members.map((m, i) => (
                    <span key={m.uid}>
                      {i > 0 && ' · '}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setContactMember({ name: m.name, email: m.email, phoneNumber: m.phoneNumber });
                        }}
                        className="underline hover:text-primary"
                      >
                        {m.name}
                      </button>
                    </span>
                  ))}
                </p>

                <div className="mt-2 flex items-center justify-between">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${group.trackType === 'bachelor_project' ? 'bg-[#E9F0F5] text-[#3E6C8C]' : 'bg-[#EFEBF6] text-[#6E5A99]'}`}>
                    {group.trackType === 'bachelor_project' ? t('trackBachelorProject') : t('trackMastersProject')}
                  </span>
                  <span className="text-xs text-muted">📍 {group.currentMilestone}</span>
                </div>

                {group.defenseDate ? (
                  <p className="mt-2 rounded-lg bg-paper px-2.5 py-1.5 text-xs font-medium text-ink">
                    🛡 {t('defenseDate')} {new Date(group.defenseDate).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-US')}
                    {group.defenseRoom ? ` · ${group.defenseRoom}` : ''}
                  </p>
                ) : (
                  <p className="mt-2 text-xs text-muted">📅 {t('defenseNotScheduled')}</p>
                )}

                <button
                  type="button"
                  onClick={() => setExpandedGrades((prev) => ({ ...prev, [group.id]: !prev[group.id] }))}
                  className="mt-2 flex w-full items-center justify-between rounded-lg bg-paper px-2.5 py-1.5 text-xs font-medium text-ink"
                >
                  <span>🎓 {lang === 'he' ? 'ציונים' : 'Grades'}</span>
                  <span className="text-muted">{expandedGrades[group.id] ? '▲' : '▼'}</span>
                </button>

                {expandedGrades[group.id] && (
                  <div className="mt-1.5 grid gap-2 rounded-lg bg-paper p-2.5">
                    {group.members.length === 0 && (
                      <p className="text-xs text-muted">{lang === 'he' ? 'אין סטודנטים בקבוצה זו' : 'No students in this group'}</p>
                    )}
                    {group.members.map((member) => (
                      <div key={member.uid}>
                        <p className="text-xs font-semibold text-ink">{member.name}</p>
                        {member.milestones.length === 0 ? (
                          <p className="text-xs text-muted">{lang === 'he' ? 'לא נוצרו אבני דרך' : 'No milestones yet'}</p>
                        ) : (
                          member.milestones.map((m, mIdx) => (
                            <div
                              key={mIdx}
                              className={`flex items-center justify-between py-1 text-xs ${mIdx < member.milestones.length - 1 ? 'border-b border-line' : ''}`}
                            >
                              <span className="text-muted">{MILESTONE_TYPE_LABEL[m.type]?.[lang] ?? m.type}</span>
                              <span className="font-semibold" style={{ color: gradeStatusColor(m) }}>
                                {gradeStatusLabel(m, lang)}
                              </span>
                            </div>
                          ))
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <div className="mt-3 flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => setDefenseModalGroup(group)}
                    className="flex-1 rounded-lg border border-success px-2.5 py-1.5 text-xs font-medium text-success hover:bg-success-bg"
                  >
                    🛡 {t('scheduleDefense')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setExaminerModalGroup(group)}
                    className="flex-1 rounded-lg border border-accent px-2.5 py-1.5 text-xs font-medium text-accent hover:bg-[#FBF3E3]"
                  >
                    📧 {t('externalExaminer')}
                  </button>
                </div>
              </div>
            ))}
            {filteredGroups.length === 0 && <p className="text-sm text-muted">📭 {lang === 'he' ? 'אין קבוצות להצגה' : 'No groups to show'}</p>}
          </div>
          </>
          )}
        </>
      )}
        </>
      )}

      {examinerModalGroup && (
        <SendExaminerModal
          key={examinerModalGroup.id}
          group={examinerModalGroup}
          onClose={() => setExaminerModalGroup(null)}
        />
      )}
      {defenseModalGroup && (
        <DefenseLogisticsModal key={defenseModalGroup.id} group={defenseModalGroup} onClose={() => setDefenseModalGroup(null)} onSaved={fetchDashboard} />
      )}
      {showBulkDueDate && (
        <BulkDueDateModal
          projects={groups.map((g) => ({ id: g.id, label: g.projectTitle, sublabel: g.members.map((m) => m.name).join(', ') || undefined }))}
          onClose={() => setShowBulkDueDate(false)}
          onSaved={fetchDashboard}
        />
      )}
      <NewProjectModal open={showNewProject} onClose={() => setShowNewProject(false)} onCreated={fetchDashboard} />
      <StudentContactModal member={contactMember} onClose={() => setContactMember(null)} />
    </DashboardShell>
  );
}

export default function AdministrativeCoordinatorDashboardPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">…</p>}>
      <AdministrativeCoordinatorDashboardContent />
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
