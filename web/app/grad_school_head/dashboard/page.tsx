'use client';

// app/grad_school_head/dashboard/page.tsx
// Ported from mobile/app/grad_school_head/grad_school_head_dashboard.tsx.
// final_grade, examiners, and template all have real endpoints now
// (POST /api/grad-school-head/milestones/:id/approve-grade,
// .../examiner-recommendations/:id/approve, and facultyTemplateController.ts's
// approveTemplateProposal, which grad_school_head was added to). The
// remaining three types — supervisor/proposal/thesis — have no schema or
// status of their own anywhere in the backend (getGradSchoolHeadDashboard
// never actually produces one), so those Approve/Return buttons stay
// informational only rather than as dead links, same as before.
//
// useSearchParams() forces this static route into client-side rendering at
// the Suspense boundary during prerendering (Next.js requirement) — wrapped
// below so the rest of the app shell can still be prerendered.

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { useRequireRole } from '@/hooks/useRequireRole';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/apiClient';
import { DELEGATE_MANAGEABLE_ROLES, type AppRole } from '@/lib/roles';
import { ExceptionalActionQueue } from '@/components/ExceptionalActionQueue';
import { ExaminerEscalationPanel } from '@/components/ExaminerEscalationPanel';
import { ManagedStaffTab } from '@/components/staff/ManagedStaffTab';
import { NewProjectModal } from './NewProjectModal';
import { CreateOwnProjectButton } from '@/components/CreateOwnProjectButton';
import { MyApplicationsWidget } from '@/components/MyApplicationsWidget';
import { MyProjectsWidget } from '@/components/MyProjectsWidget';
import type { AdminUserRecord } from '@/app/admin/panel/types';

const GRAD_SCHOOL_HEAD_ROLES: AppRole[] = ['grad_school_head', 'system_admin'];

type GradSchoolHeadTab = 'approvals' | 'overview' | 'stuck' | 'examiners' | 'grades' | 'staff';
const GRAD_SCHOOL_HEAD_TABS: GradSchoolHeadTab[] = ['approvals', 'overview', 'stuck', 'examiners', 'grades', 'staff'];
const isGradSchoolHeadTab = (v: string | null): v is GradSchoolHeadTab => !!v && (GRAD_SCHOOL_HEAD_TABS as string[]).includes(v);

type ApprovalType = 'supervisor' | 'proposal' | 'thesis' | 'examiners' | 'final_grade' | 'template';

interface PendingApproval {
  id: string;
  type: ApprovalType;
  studentName: string;
  facultyId: string;
  title: string;
  submittedAt: string;
  urgency: 'low' | 'medium' | 'high';
}
interface ProcessSummary {
  facultyId: string;
  facultyNameHe: string;
  facultyNameEn: string;
  total: number;
  active: number;
  stuck: number;
  completed: number;
  overdue: number;
}
interface StuckStudent {
  studentName: string;
  supervisorName: string;
  currentMilestone: string;
  daysInStage: number;
}
interface ExaminerLoad {
  examinerName: string;
  institution: string;
  activeReviews: number;
  pending: number;
  overdue: number;
}
interface ApprovedFinalGrade {
  id: string;
  studentName: string;
  facultyId: string;
  title: string;
  finalGrade: number;
  approvedAt: string;
  michlolTransferStatus: string | null;
}

const APPROVAL_TYPE_LABEL: Record<ApprovalType, { he: string; en: string }> = {
  supervisor: { he: 'אישור מנחה', en: 'Supervisor Approval' },
  proposal: { he: 'אישור הצעת מחקר', en: 'Research Proposal' },
  thesis: { he: 'אישור תזה לשיפוט', en: 'Thesis for Judgment' },
  examiners: { he: 'אישור בוחנים', en: 'Examiner Approval' },
  final_grade: { he: 'אישור ציון סופי', en: 'Final Grade' },
  template: { he: 'אישור תבנית פקולטית', en: 'Faculty Template' },
};

const URGENCY_COLOR: Record<PendingApproval['urgency'], string> = {
  high: 'var(--danger)',
  medium: 'var(--accent)',
  low: 'var(--success)',
};

function GradSchoolHeadDashboardContent() {
  const { loading: guardLoading, isAllowed } = useRequireRole(GRAD_SCHOOL_HEAD_ROLES);
  const { firebaseUser } = useAuth();
  const { lang, t } = useLanguage();
  const router = useRouter();
  const searchParams = useSearchParams();

  // "Post New Project" used to be a DashboardShell hamburger action — it
  // now lives in the sidebar (app/grad_school_head/layout.tsx) and opens
  // via this ?modal= param instead, same "URL is the source of truth"
  // pattern as app/admin/panel/page.tsx.
  const showNewProject = searchParams.get('modal') === 'newProject';
  const closeNewProject = useCallback(() => {
    const qs = new URLSearchParams(searchParams);
    qs.delete('modal');
    const query = qs.toString();
    router.replace(query ? `/grad_school_head/dashboard?${query}` : '/grad_school_head/dashboard', { scroll: false });
  }, [router, searchParams]);

  // The URL's `?tab=` is the single source of truth for which tab is open —
  // no separate mirrored state — same pattern as app/admin/panel/page.tsx.
  // Tab switching now happens via GradSchoolHeadLayout's sidebar links.
  const paramTab = searchParams.get('tab');
  const tab: GradSchoolHeadTab = isGradSchoolHeadTab(paramTab) ? paramTab : 'approvals';
  const [headName, setHeadName] = useState('');
  const [approvals, setApprovals] = useState<PendingApproval[]>([]);
  const [processSummaries, setProcessSummaries] = useState<ProcessSummary[]>([]);
  const [stuckStudents, setStuckStudents] = useState<StuckStudent[]>([]);
  const [examinerLoad, setExaminerLoad] = useState<ExaminerLoad[]>([]);
  const [approvedFinalGrades, setApprovedFinalGrades] = useState<ApprovedFinalGrade[]>([]);
  const [staff, setStaff] = useState<AdminUserRecord[]>([]);
  const [stats, setStats] = useState({ totalMasters: 0, pendingCount: 0, stuckCount: 0, completedThisYear: 0 });
  const [loadingData, setLoadingData] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [unlockTargetId, setUnlockTargetId] = useState<string | null>(null);
  const [unlockReason, setUnlockReason] = useState('');
  const [unlockingId, setUnlockingId] = useState<string | null>(null);
  const [examinerRejectTargetId, setExaminerRejectTargetId] = useState<string | null>(null);
  const [examinerRejectReason, setExaminerRejectReason] = useState('');
  const [finalGradeRejectTargetId, setFinalGradeRejectTargetId] = useState<string | null>(null);
  const [finalGradeRejectReason, setFinalGradeRejectReason] = useState('');
  const [templateRejectTargetId, setTemplateRejectTargetId] = useState<string | null>(null);
  const [templateRejectReason, setTemplateRejectReason] = useState('');

  // Thesis-eligibility student lookup — same search box/flow as
  // app/program_head/dashboard/page.tsx's students tab, reused here since a
  // grad_school_head can now also enter a coordinator_gated student's
  // average (studentTrackController.ts's THESIS_ELIGIBILITY_ROLES;
  // server-side scoped to this head's own facultyId via
  // withinCoordinatorScope, same as program_head).
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
      const data = await apiClient.getGradSchoolHeadDashboard(firebaseUser.uid);
      setHeadName(data.headName ?? '');
      setApprovals(data.pendingApprovals ?? []);
      setProcessSummaries(data.processSummaries ?? []);
      setStuckStudents(data.stuckStudents ?? []);
      setExaminerLoad(data.examinerLoad ?? []);
      setApprovedFinalGrades(data.approvedFinalGrades ?? []);
      setStats(data.stats ?? { totalMasters: 0, pendingCount: 0, stuckCount: 0, completedThisYear: 0 });
      setLoadError('');
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : lang === 'he' ? 'לא ניתן לטעון נתונים' : 'Could not load data');
    } finally {
      setLoadingData(false);
    }
  }, [firebaseUser, lang]);

  // Cross-faculty staff this role can now manage directly (see
  // server/src/config/permissionScopes.ts's DELEGATE_ADMIN_ROLES) —
  // grad_school_head had zero user-management endpoints of any kind before
  // this.
  const fetchStaff = useCallback(async () => {
    try {
      const res = await apiClient.listManagedStaff();
      setStaff((res.staff ?? []) as unknown as AdminUserRecord[]);
    } catch {
      // Non-fatal — the Staff tab just shows an empty list if this fails.
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; setState calls happen after the awaited network call resolves, not synchronously in this effect
    if (isAllowed) fetchDashboard();
    if (isAllowed) fetchStaff();
  }, [isAllowed, fetchDashboard, fetchStaff]);

  const handleApproveFinalGrade = async (item: PendingApproval) => {
    setApprovingId(item.id);
    try {
      await apiClient.approveFinalGrade(item.id);
      await fetchDashboard();
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : lang === 'he' ? 'אישור הציון נכשל' : 'Failed to approve the grade');
    } finally {
      setApprovingId(null);
    }
  };

  const handleRejectFinalGrade = async (id: string) => {
    if (!finalGradeRejectReason.trim()) return;
    setApprovingId(id);
    try {
      await apiClient.rejectFinalGrade(id, finalGradeRejectReason.trim());
      setFinalGradeRejectTargetId(null);
      setFinalGradeRejectReason('');
      await fetchDashboard();
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : lang === 'he' ? 'דחיית הציון נכשלה' : 'Failed to reject the grade');
    } finally {
      setApprovingId(null);
    }
  };

  const handleApproveExaminers = async (item: PendingApproval) => {
    setApprovingId(item.id);
    try {
      await apiClient.approveExaminerRecommendationFinal(item.id);
      await fetchDashboard();
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : lang === 'he' ? 'אישור רשימת הבוחנים נכשל' : 'Failed to approve the examiner list');
    } finally {
      setApprovingId(null);
    }
  };

  const handleRejectExaminers = async (id: string) => {
    if (!examinerRejectReason.trim()) return;
    setApprovingId(id);
    try {
      await apiClient.rejectExaminerRecommendationFinal(id, examinerRejectReason.trim());
      setExaminerRejectTargetId(null);
      setExaminerRejectReason('');
      await fetchDashboard();
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : lang === 'he' ? 'דחיית רשימת הבוחנים נכשלה' : 'Failed to reject the examiner list');
    } finally {
      setApprovingId(null);
    }
  };

  // 'template' has real backing data (facultyTemplates docs, pending
  // status) and a real endpoint (facultyTemplateController.ts's
  // approveTemplateProposal/rejectTemplateProposal, which grad_school_head
  // was just added to) — unlike supervisor/proposal/thesis, which have no
  // schema of their own and stay informational-only below.
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

  const handleUnlockGrade = async (milestoneId: string) => {
    if (!unlockReason.trim()) return;
    setUnlockingId(milestoneId);
    try {
      await apiClient.unlockFinalGrade(milestoneId, unlockReason.trim());
      setUnlockTargetId(null);
      setUnlockReason('');
      await fetchDashboard();
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : lang === 'he' ? 'פתיחת הציון נכשלה' : 'Failed to unlock the grade');
    } finally {
      setUnlockingId(null);
    }
  };

  if (guardLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper">
        <p className="text-sm text-muted">…</p>
      </div>
    );
  }

  return (
    <DashboardShell
      title={headName ? `${lang === 'he' ? 'שלום' : 'Hello'}, ${headName}` : lang === 'he' ? 'ראש בית הספר ללימודי מוסמכים' : 'Graduate School Head'}
      subtitle={lang === 'he' ? 'אישורים, תקועים ועומס בוחנים' : 'Approvals, stuck students, and examiner load'}
      showBackButton={tab !== 'approvals'}
    >
      <div className="mb-5">
        <CreateOwnProjectButton onCreated={fetchDashboard} />
      </div>
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard value={stats.totalMasters} label={t('gradSchoolMastersOverview')} color="#6E5A99" href="/grad_school_head/dashboard?tab=overview" />
        <StatCard value={stats.pendingCount} label={t('gradSchoolPendingApprovals')} color="var(--accent)" href="/grad_school_head/dashboard?tab=approvals" />
        <StatCard value={stats.stuckCount} label={t('gradSchoolStuckStudents')} color="var(--danger)" href="/grad_school_head/dashboard?tab=stuck" />
        <StatCard value={stats.completedThisYear} label={lang === 'he' ? 'סיימו השנה' : 'Completed'} color="var(--success)" href="/grad_school_head/dashboard?tab=grades" />
      </div>

      {loadError && <p className="mb-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{loadError}</p>}

      {loadingData ? (
        <p className="text-sm text-muted">{t('loading')}</p>
      ) : tab === 'approvals' ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <ExceptionalActionQueue />
          </div>
          {approvals.map((item) => (
            <div
              key={item.id}
              className="role-rail rounded-[var(--radius)] border border-line bg-surface p-4"
              style={{ '--rail-color': URGENCY_COLOR[item.urgency] } as React.CSSProperties}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="rounded-full px-2 py-0.5 text-xs font-medium" style={{ backgroundColor: `${URGENCY_COLOR[item.urgency] ?? '#8899BB'}22`, color: URGENCY_COLOR[item.urgency] ?? '#8899BB' }}>
                  {APPROVAL_TYPE_LABEL[item.type]?.[lang] ?? item.type}
                </span>
                {item.submittedAt && <span className="text-xs text-muted">{new Date(item.submittedAt).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-US')}</span>}
              </div>
              <p className="mt-1.5 text-sm font-semibold text-ink">{item.studentName}</p>
              <p className="mt-0.5 text-xs text-muted">{item.title}</p>

              {item.type === 'final_grade' ? (
                <>
                  {finalGradeRejectTargetId === item.id && (
                    <input
                      value={finalGradeRejectReason}
                      onChange={(e) => setFinalGradeRejectReason(e.target.value)}
                      placeholder={lang === 'he' ? 'סיבת הדחייה' : 'Rejection reason'}
                      className="mt-2 w-full rounded-md border border-line bg-paper px-2.5 py-1.5 text-xs text-ink"
                    />
                  )}
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => (finalGradeRejectTargetId === item.id ? handleRejectFinalGrade(item.id) : setFinalGradeRejectTargetId(item.id))}
                      disabled={approvingId === item.id}
                      className="flex-1 rounded-lg border border-danger px-3 py-2 text-xs font-semibold text-danger disabled:opacity-60"
                    >
                      {finalGradeRejectTargetId === item.id ? (lang === 'he' ? 'שלח דחייה' : 'Submit rejection') : (lang === 'he' ? 'דחה' : 'Reject')}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleApproveFinalGrade(item)}
                      disabled={approvingId === item.id}
                      className="flex-1 rounded-lg bg-success px-3 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60"
                    >
                      {approvingId === item.id ? (lang === 'he' ? 'מאשר...' : 'Approving...') : `✅ ${t('gradeApproved')}`}
                    </button>
                  </div>
                </>
              ) : item.type === 'examiners' ? (
                <>
                  <p className="mt-2 text-xs text-muted">
                    {lang === 'he' ? 'רשימת בוחנים לתזת מוסמכים — אושרה ע"י הרכז, ממתינה לאישורך' : 'Master\'s thesis examiner list — coordinator-approved, awaiting your sign-off'}
                  </p>
                  {examinerRejectTargetId === item.id && (
                    <input
                      value={examinerRejectReason}
                      onChange={(e) => setExaminerRejectReason(e.target.value)}
                      placeholder={lang === 'he' ? 'סיבת הדחייה' : 'Rejection reason'}
                      className="mt-2 w-full rounded-md border border-line bg-paper px-2.5 py-1.5 text-xs text-ink"
                    />
                  )}
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => (examinerRejectTargetId === item.id ? handleRejectExaminers(item.id) : setExaminerRejectTargetId(item.id))}
                      disabled={approvingId === item.id}
                      className="flex-1 rounded-lg border border-danger px-3 py-2 text-xs font-semibold text-danger disabled:opacity-60"
                    >
                      {examinerRejectTargetId === item.id ? (lang === 'he' ? 'שלח דחייה' : 'Submit rejection') : (lang === 'he' ? 'דחה' : 'Reject')}
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
                </>
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
                  <div className="mt-2 flex gap-2">
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
              ) : (
                <p className="mt-3 text-xs italic text-muted">
                  {lang === 'he' ? 'לצפייה ואישור, יש לפתוח את פאנל הניהול' : 'View and act on this from the admin panel'}
                </p>
              )}
            </div>
          ))}
          {approvals.length === 0 && <p className="text-sm text-muted">✅ {lang === 'he' ? 'אין פריטים הממתינים לאישורך' : 'Nothing pending your approval'}</p>}
        </div>
      ) : tab === 'overview' ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2 rounded-[var(--radius)] border border-line bg-surface p-4">
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
          <div className="sm:col-span-2">
            <MyApplicationsWidget />
          </div>
          <div className="sm:col-span-2">
            <MyProjectsWidget />
          </div>
          {processSummaries.map((f) => (
            <div key={f.facultyId} className="role-rail rounded-[var(--radius)] border border-line bg-surface p-4" style={{ '--rail-color': '#6E5A99' } as React.CSSProperties}>
              <p className="text-sm font-semibold text-ink">{lang === 'he' ? f.facultyNameHe : f.facultyNameEn}</p>
              <div className="mt-2 grid grid-cols-5 gap-1 text-center">
                <MiniStat value={f.total} label={lang === 'he' ? 'סה"כ' : 'Total'} />
                <MiniStat value={f.active} label={lang === 'he' ? 'פעילים' : 'Active'} color="#3E6C8C" />
                <MiniStat value={f.stuck} label={lang === 'he' ? 'תקועים' : 'Stuck'} color="var(--danger)" />
                <MiniStat value={f.completed} label={lang === 'he' ? 'סיימו' : 'Done'} color="var(--success)" />
                <MiniStat value={f.overdue} label={lang === 'he' ? 'באיחור' : 'Overdue'} color="var(--accent)" />
              </div>
            </div>
          ))}
          {processSummaries.length === 0 && <p className="text-sm text-muted">📊 {lang === 'he' ? 'אין נתוני פקולטות' : 'No faculty data'}</p>}
        </div>
      ) : tab === 'stuck' ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {stuckStudents.map((st, i) => (
            <div key={i} className="role-rail rounded-[var(--radius)] border border-line bg-surface p-4" style={{ '--rail-color': 'var(--danger)' } as React.CSSProperties}>
              <p className="text-sm font-semibold text-ink">👤 {st.studentName}</p>
              <p className="mt-0.5 text-xs text-muted">👨‍🏫 {st.supervisorName}</p>
              <p className="mt-0.5 text-xs text-muted">
                📍 {lang === 'he' ? 'שלב נוכחי:' : 'Current stage:'} {st.currentMilestone}
              </p>
              <span className="mt-2 inline-block rounded-full bg-danger-bg px-2.5 py-1 text-xs font-medium text-danger">
                ⏱ {st.daysInStage} {lang === 'he' ? 'ימים בשלב' : 'days in stage'}
              </span>
            </div>
          ))}
          {stuckStudents.length === 0 && <p className="text-sm text-muted">🎉 {lang === 'he' ? 'אין סטודנטים תקועים' : 'No stuck students'}</p>}
        </div>
      ) : tab === 'examiners' ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <ExaminerEscalationPanel />
          </div>
          {examinerLoad.map((ex, i) => (
            <div
              key={i}
              className="role-rail rounded-[var(--radius)] border border-line bg-surface p-4"
              style={{ '--rail-color': ex.overdue > 0 ? 'var(--danger)' : 'var(--success)' } as React.CSSProperties}
            >
              <p className="text-sm font-semibold text-ink">{ex.examinerName}</p>
              <p className="mt-0.5 text-xs text-muted">{ex.institution}</p>
              <div className="mt-2 grid grid-cols-3 gap-1 text-center">
                <MiniStat value={ex.activeReviews} label={lang === 'he' ? 'פעילים' : 'Active'} color="#3E6C8C" />
                <MiniStat value={ex.pending} label={lang === 'he' ? 'ממתינים' : 'Pending'} color="var(--accent)" />
                <MiniStat value={ex.overdue} label={lang === 'he' ? 'באיחור' : 'Overdue'} color="var(--danger)" />
              </div>
            </div>
          ))}
          {examinerLoad.length === 0 && <p className="text-sm text-muted">📭 {lang === 'he' ? 'אין בוחנים פעילים' : 'No active examiners'}</p>}
        </div>
      ) : tab === 'grades' ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {approvedFinalGrades.map((g) => (
            <div key={g.id} className="role-rail rounded-[var(--radius)] border border-line bg-surface p-4" style={{ '--rail-color': 'var(--success)' } as React.CSSProperties}>
              <p className="text-sm font-semibold text-ink">{g.studentName}</p>
              <p className="mt-0.5 text-xs text-muted">{g.title}</p>
              <p className="mt-1 text-xs text-muted">
                {lang === 'he' ? 'ציון סופי:' : 'Final grade:'} <span className="font-semibold text-ink">{g.finalGrade}</span>
                {g.approvedAt && ` · ${new Date(g.approvedAt).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-US')}`}
              </p>
              {g.michlolTransferStatus === 'transferred' && (
                <p className="mt-0.5 text-xs text-success">✅ {lang === 'he' ? 'הועבר למכלול' : 'Transferred to Michlol'}</p>
              )}

              {unlockTargetId === g.id ? (
                <div className="mt-3 grid gap-2">
                  <textarea
                    rows={2}
                    value={unlockReason}
                    onChange={(e) => setUnlockReason(e.target.value)}
                    placeholder={lang === 'he' ? 'סיבת פתיחת הציון לתיקון (חובה)' : 'Reason for unlocking this grade (required)'}
                    className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink focus:border-primary focus:bg-surface focus:outline-none"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleUnlockGrade(g.id)}
                      disabled={!unlockReason.trim() || unlockingId === g.id}
                      className="flex-1 rounded-lg bg-danger px-3 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60"
                    >
                      {unlockingId === g.id ? (lang === 'he' ? 'פותח...' : 'Unlocking...') : lang === 'he' ? 'אשר פתיחה' : 'Confirm Unlock'}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setUnlockTargetId(null); setUnlockReason(''); }}
                      className="flex-1 rounded-lg border border-line px-3 py-2 text-xs font-semibold text-muted hover:bg-paper"
                    >
                      {lang === 'he' ? 'ביטול' : 'Cancel'}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setUnlockTargetId(g.id)}
                  className="mt-3 w-full rounded-lg border border-danger px-3 py-2 text-xs font-semibold text-danger hover:bg-danger-bg"
                >
                  🔓 {lang === 'he' ? 'פתח לתיקון' : 'Unlock for Correction'}
                </button>
              )}
            </div>
          ))}
          {approvedFinalGrades.length === 0 && <p className="text-sm text-muted">📭 {lang === 'he' ? 'אין ציונים מאושרים' : 'No approved grades'}</p>}
        </div>
      ) : (
        <ManagedStaffTab staff={staff} onRefresh={fetchStaff} scope={{ selectableRoles: DELEGATE_MANAGEABLE_ROLES }} />
      )}
      <NewProjectModal open={showNewProject} onClose={closeNewProject} onCreated={fetchDashboard} />
    </DashboardShell>
  );
}

export default function GradSchoolHeadDashboardPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">…</p>}>
      <GradSchoolHeadDashboardContent />
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

function MiniStat({ value, label, color }: { value: number; label: string; color?: string }) {
  return (
    <div>
      <div className="text-sm font-semibold" style={{ color: color ?? 'var(--ink)' }}>
        {value}
      </div>
      <div className="text-[10px] leading-tight text-muted">{label}</div>
    </div>
  );
}
