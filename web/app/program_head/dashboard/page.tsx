'use client';

// app/program_head/dashboard/page.tsx
// Ported from mobile/app/program_head/program_head_dashboard.tsx. The
// dashboard data itself still comes from one read-only endpoint (GET
// /api/program-head/:uid/dashboard), but the Approvals tab's two real item
// types ('examiners', 'template') now actually act — program_head was added
// to the same first-tier approveExaminerRecommendation/approveTemplateProposal
// endpoints coordinator/faculty_admin already use (coordinatorController.ts,
// facultyTemplateController.ts) instead of staying a read-only display with
// no onPress at all, as it was on mobile.

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

// The only two types getProgramHeadDashboard's pendingApprovals ever
// contains (programHeadController.ts) — mirrors grad_school_head/
// dashboard/page.tsx's own APPROVAL_TYPE_LABEL, restricted to these two.
const APPROVAL_TYPE_LABEL: Record<string, { he: string; en: string }> = {
  examiners: { he: 'אישור בוחנים', en: 'Examiner Approval' },
  template: { he: 'אישור תבנית פקולטית', en: 'Faculty Template' },
};

interface SupervisorLoad {
  supervisorName: string;
  supervisorEmail: string;
  activeStudents: number;
}

function ProgramHeadDashboardContent() {
  const { loading: guardLoading, isAllowed } = useRequireRole(PROGRAM_HEAD_ROLES);
  const { firebaseUser, roles, activeRole } = useAuth();
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

  // Approvals tab. Server-side, program_head is now allowed onto the same
  // first-tier approveExaminerRecommendation/approveTemplateProposal
  // endpoints coordinator/faculty_admin already use (see
  // coordinatorController.ts and facultyTemplateController.ts) — this
  // dashboard's own pendingApprovals only ever surfaces 'examiners' and
  // 'template' items (programHeadController.ts), so those are the only two
  // types handled below. Examiner rejection needs no reason — same
  // no-reason convention coordinator/home/RecommendationCard.tsx's own
  // reject button already uses for this exact endpoint; template rejection
  // does require one (rejectTemplateProposal 400s without it), so that one
  // gets the reason-input step grad_school_head/dashboard/page.tsx already
  // established for its own reject-with-reason flows.
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [templateRejectTargetId, setTemplateRejectTargetId] = useState<string | null>(null);
  const [templateRejectReason, setTemplateRejectReason] = useState('');

  const [search, setSearch] = useState('');
  const [filterOverdue, setFilterOverdue] = useState(false);
  const [filterTrack, setFilterTrack] = useState<'all' | 'thesis' | 'masters_project'>('all');

  // Separate from the enrolled-students list/search above — that list only
  // covers students already on an active project, but a coordinator_gated
  // (CS) student needs their thesis eligibility set BEFORE they're ever
  // enrolled in one. Reuses apiClient.searchStudents, already scoped
  // server-side to this program_head's own assignment (see
  // adminController.ts's STUDENT_SEARCH_ROLES).
  const [eligibilityQuery, setEligibilityQuery] = useState('');
  const [eligibilityResults, setEligibilityResults] = useState<Awaited<ReturnType<typeof apiClient.searchStudents>>['students']>([]);
  const [eligibilitySearching, setEligibilitySearching] = useState(false);
  const [eligibilityError, setEligibilityError] = useState('');

  const runEligibilitySearch = async () => {
    const q = eligibilityQuery.trim();
    if (q.length < 2) {
      setEligibilityError(lang === 'he' ? 'יש להזין לפחות 2 תווים' : 'Enter at least 2 characters');
      return;
    }
    setEligibilitySearching(true);
    setEligibilityError('');
    try {
      const res = await apiClient.searchStudents(q);
      setEligibilityResults(res.students.filter((s) => s.trackPolicy === 'coordinator_gated'));
    } catch (err) {
      setEligibilityError(err instanceof Error ? err.message : lang === 'he' ? 'החיפוש נכשל' : 'Search failed');
    } finally {
      setEligibilitySearching(false);
    }
  };

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

  const handleApproveExaminers = async (item: PendingApproval) => {
    setApprovingId(item.id);
    try {
      await apiClient.approveExaminerRecommendation(item.id);
      await fetchDashboard();
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : lang === 'he' ? 'אישור רשימת הבוחנים נכשל' : 'Failed to approve the examiner list');
    } finally {
      setApprovingId(null);
    }
  };

  const handleRejectExaminers = async (id: string) => {
    setApprovingId(id);
    try {
      await apiClient.rejectExaminerRecommendation(id);
      await fetchDashboard();
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : lang === 'he' ? 'דחיית רשימת הבוחנים נכשלה' : 'Failed to reject the examiner list');
    } finally {
      setApprovingId(null);
    }
  };

  const handleApproveTemplate = async (item: PendingApproval) => {
    setApprovingId(item.id);
    try {
      await apiClient.approveTemplateProposal(item.id);
      await fetchDashboard();
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : lang === 'he' ? 'אישור התבנית נכשל' : 'Failed to approve the template');
    } finally {
      setApprovingId(null);
    }
  };

  const handleRejectTemplate = async (id: string) => {
    if (!templateRejectReason.trim()) return;
    setApprovingId(id);
    try {
      await apiClient.rejectTemplateProposal(id, templateRejectReason.trim());
      setTemplateRejectTargetId(null);
      setTemplateRejectReason('');
      await fetchDashboard();
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : lang === 'he' ? 'דחיית התבנית נכשלה' : 'Failed to reject the template');
    } finally {
      setApprovingId(null);
    }
  };

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
      // PROGRAM_HEAD_ROLES above is only program_head + system_admin — the
      // fallback title must say which one is actually looking, not always
      // claim "Program Head" (that misled a system_admin into thinking
      // their own role had changed — same class of bug fixed on the
      // sidebar in app/administrative_coordinator/layout.tsx).
      title={
        headName
          ? `${lang === 'he' ? 'שלום' : 'Hello'}, ${headName}`
          : activeRole === 'system_admin'
            ? (lang === 'he' ? 'ראש תוכנית — תצוגת מנהל מערכת' : 'Program Head View (System Admin)')
            : (lang === 'he' ? 'ראש תוכנית תואר שני' : "Master's Program Head")
      }
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
          <div className="mb-4 rounded-[var(--radius)] border border-line bg-surface p-4">
            <p className="text-sm font-semibold text-ink">
              🎓 {lang === 'he' ? 'בדיקת זכאות לתזה' : 'Thesis Eligibility Lookup'}
            </p>
            <p className="mt-0.5 text-xs text-muted">
              {lang === 'he'
                ? 'חיפוש סטודנט/ית (גם ללא פרויקט פעיל עדיין) כדי להזין ממוצע או לעדכן זכאות לתזה.'
                : "Search for a student (even one without an active project yet) to enter an average or update thesis eligibility."}
            </p>
            <div className="mt-2 flex gap-2">
              <input
                value={eligibilityQuery}
                onChange={(e) => setEligibilityQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && runEligibilitySearch()}
                placeholder={lang === 'he' ? 'שם, אימייל או מספר סטודנט...' : 'Name, email, or student ID...'}
                className="w-full max-w-sm rounded-lg border border-line bg-paper px-3.5 py-2 text-sm text-ink focus:border-primary focus:outline-none"
              />
              <button
                type="button"
                onClick={runEligibilitySearch}
                disabled={eligibilitySearching}
                className="shrink-0 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-ink hover:bg-primary-hover disabled:opacity-60"
              >
                {eligibilitySearching ? '…' : lang === 'he' ? 'חפש' : 'Search'}
              </button>
            </div>
            {eligibilityError && <p className="mt-2 text-xs text-danger">{eligibilityError}</p>}
            {eligibilityResults.length > 0 && (
              <div className="mt-3 grid gap-1.5">
                {eligibilityResults.map((s) => (
                  <Link
                    key={s.id}
                    href={`/administrative_coordinator/dashboard/students/${s.id}`}
                    className="flex items-center justify-between gap-2 rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink hover:border-primary hover:text-primary"
                  >
                    <span>{s.displayName || s.email}</span>
                    <span className="text-xs text-muted">
                      {s.thesisEligibility?.eligible ? (lang === 'he' ? '✓ זכאי/ת לתזה' : '✓ Thesis-eligible') : (lang === 'he' ? 'פרויקט בלבד' : 'Project only')}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>

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
              <p className="mt-0.5 text-xs font-semibold text-accent">{APPROVAL_TYPE_LABEL[item.type]?.[lang] ?? item.type}</p>
              <p className="mt-0.5 text-xs text-muted">{item.description}</p>
              {item.submittedAt && (
                <p className="mt-1 text-xs text-muted">{new Date(item.submittedAt).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-US')}</p>
              )}

              {item.type === 'examiners' ? (
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleRejectExaminers(item.id)}
                    disabled={approvingId === item.id}
                    className="flex-1 rounded-lg border border-danger px-3 py-2 text-xs font-semibold text-danger disabled:opacity-60"
                  >
                    {lang === 'he' ? 'דחה' : 'Reject'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleApproveExaminers(item)}
                    disabled={approvingId === item.id}
                    className="flex-1 rounded-lg bg-success px-3 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60"
                  >
                    {approvingId === item.id ? (lang === 'he' ? 'מאשר...' : 'Approving...') : `✅ ${lang === 'he' ? 'אשר' : 'Approve'}`}
                  </button>
                </div>
              ) : item.type === 'template' ? (
                <>
                  {templateRejectTargetId === item.id && (
                    <input
                      value={templateRejectReason}
                      onChange={(e) => setTemplateRejectReason(e.target.value)}
                      placeholder={lang === 'he' ? 'סיבת הדחייה' : 'Rejection reason'}
                      className="mt-2 w-full rounded-md border border-line bg-paper px-2.5 py-1.5 text-xs text-ink"
                    />
                  )}
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => (templateRejectTargetId === item.id ? handleRejectTemplate(item.id) : setTemplateRejectTargetId(item.id))}
                      disabled={approvingId === item.id}
                      className="flex-1 rounded-lg border border-danger px-3 py-2 text-xs font-semibold text-danger disabled:opacity-60"
                    >
                      {templateRejectTargetId === item.id ? (lang === 'he' ? 'שלח דחייה' : 'Submit rejection') : (lang === 'he' ? 'דחה' : 'Reject')}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleApproveTemplate(item)}
                      disabled={approvingId === item.id}
                      className="flex-1 rounded-lg bg-success px-3 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60"
                    >
                      {approvingId === item.id ? (lang === 'he' ? 'מאשר...' : 'Approving...') : `✅ ${lang === 'he' ? 'אשר' : 'Approve'}`}
                    </button>
                  </div>
                </>
              ) : null}
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
