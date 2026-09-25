'use client';

// app/school_head/dashboard/page.tsx
// Dashboard for the school_head role — same shape/approach as
// app/grad_school_head/dashboard/page.tsx, but scoped to one or more
// specific majors (coordinatorScopes) instead of a whole faculty, and
// covering both bachelor's and master's students. Reuses grad_school_head's
// CSS namespace (--grad-school-head-*, rounded-grad-school-head, etc.)
// rather than a whole new per-role design-system token set — visually
// identical, just a narrower data scope.
//
// Deliberately narrower than grad_school_head's page: no staff-management
// tab (school_head isn't in DELEGATE_ADMIN_ROLES), no CS-masters-specific
// "ungraded" tab, no own-project posting — none of those were part of the
// "head of school" feature request; only the population it operates on is.
//
// useSearchParams() forces this static route into client-side rendering at
// the Suspense boundary during prerendering (Next.js requirement).

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { useRequireRole } from '@/hooks/useRequireRole';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/apiClient';
import type { AppRole } from '@/lib/roles';
import { majorsForFaculty } from '@/lib/permissions';
import { ExceptionalActionQueue } from '@/components/ExceptionalActionQueue';
import { ExaminerEscalationPanel } from '@/components/ExaminerEscalationPanel';
import { StudentsListTab } from '@/components/students/StudentsListTab';

const SCHOOL_HEAD_ROLES: AppRole[] = ['school_head', 'system_admin'];

type SchoolHeadTab = 'overview' | 'approvals' | 'stuck' | 'examiners' | 'grades' | 'students';
const SCHOOL_HEAD_TABS: SchoolHeadTab[] = ['overview', 'approvals', 'stuck', 'examiners', 'grades', 'students'];
const isSchoolHeadTab = (v: string | null): v is SchoolHeadTab => !!v && (SCHOOL_HEAD_TABS as string[]).includes(v);

type ApprovalType = 'examiners' | 'final_grade' | 'template';

interface PendingApproval {
  id: string;
  type: ApprovalType;
  studentName: string;
  major: string;
  title: string;
  submittedAt: string;
  urgency: 'low' | 'medium' | 'high';
}
interface ProcessSummary {
  major: string;
  majorNameHe: string;
  majorNameEn: string;
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
  major: string;
  title: string;
  finalGrade: number;
  approvedAt: string;
  michlolTransferStatus: string | null;
}

const APPROVAL_TYPE_LABEL: Record<ApprovalType, { he: string; en: string }> = {
  examiners: { he: 'אישור בוחנים', en: 'Examiner Approval' },
  final_grade: { he: 'אישור ציון סופי', en: 'Final Grade' },
  template: { he: 'אישור תבנית', en: 'Template' },
};

const URGENCY_COLOR: Record<PendingApproval['urgency'], string> = {
  high: 'var(--danger)',
  medium: 'var(--accent)',
  low: 'var(--success)',
};

// Best-effort major label lookup — majorsForFaculty needs a facultyId, and
// this dashboard only has the bare major slug, so scan every faculty for a
// match. Falls back to the raw slug if nothing matches (shouldn't happen for
// a real major, but avoids a blank label if it ever does).
const FACULTY_IDS_FOR_MAJOR_LOOKUP = ['sciences', 'electrical', 'industrial', 'learning_tech', 'medical_tech', 'design', 'data_science'];
function labelForMajor(major: string, lang: 'he' | 'en'): string {
  for (const facultyId of FACULTY_IDS_FOR_MAJOR_LOOKUP) {
    const match = majorsForFaculty(facultyId).find((m) => m.slug === major);
    if (match) return match.label[lang];
  }
  return major;
}

function SchoolHeadDashboardContent() {
  const { loading: guardLoading, isAllowed } = useRequireRole(SCHOOL_HEAD_ROLES);
  const { firebaseUser } = useAuth();
  const { lang, t } = useLanguage();
  const searchParams = useSearchParams();

  const paramTab = searchParams.get('tab');
  const tab: SchoolHeadTab = isSchoolHeadTab(paramTab) ? paramTab : 'overview';

  const [headName, setHeadName] = useState('');
  const [noScopeAssigned, setNoScopeAssigned] = useState(false);
  const [assignedMajors, setAssignedMajors] = useState<string[]>([]);
  const [approvals, setApprovals] = useState<PendingApproval[]>([]);
  const [processSummaries, setProcessSummaries] = useState<ProcessSummary[]>([]);
  const [stuckStudents, setStuckStudents] = useState<StuckStudent[]>([]);
  const [examinerLoad, setExaminerLoad] = useState<ExaminerLoad[]>([]);
  const [approvedFinalGrades, setApprovedFinalGrades] = useState<ApprovedFinalGrade[]>([]);
  const [stats, setStats] = useState({ totalStudents: 0, pendingCount: 0, stuckCount: 0, completedThisYear: 0 });
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

  const fetchDashboard = useCallback(async () => {
    if (!firebaseUser) return;
    try {
      const data = await apiClient.getSchoolHeadDashboard(firebaseUser.uid);
      setHeadName(data.headName ?? '');
      setNoScopeAssigned(!!data.noScopeAssigned);
      setAssignedMajors(data.assignedMajors ?? []);
      setApprovals(data.pendingApprovals ?? []);
      setProcessSummaries(data.processSummaries ?? []);
      setStuckStudents(data.stuckStudents ?? []);
      setExaminerLoad(data.examinerLoad ?? []);
      setApprovedFinalGrades(data.approvedFinalGrades ?? []);
      setStats(data.stats ?? { totalStudents: 0, pendingCount: 0, stuckCount: 0, completedThisYear: 0 });
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

  const handleApproveFinalGrade = async (item: PendingApproval) => {
    setApprovingId(item.id);
    try {
      await apiClient.schoolHeadApproveFinalGrade(item.id);
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
      await apiClient.schoolHeadRejectFinalGrade(id, finalGradeRejectReason.trim());
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
      await apiClient.schoolHeadApproveExaminerRecommendation(item.id);
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
      await apiClient.schoolHeadRejectExaminerRecommendation(id, examinerRejectReason.trim());
      setExaminerRejectTargetId(null);
      setExaminerRejectReason('');
      await fetchDashboard();
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : lang === 'he' ? 'דחיית רשימת הבוחנים נכשלה' : 'Failed to reject the examiner list');
    } finally {
      setApprovingId(null);
    }
  };

  const handleUnlockGrade = async (milestoneId: string) => {
    if (!unlockReason.trim()) return;
    setUnlockingId(milestoneId);
    try {
      await apiClient.schoolHeadUnlockFinalGrade(milestoneId, unlockReason.trim());
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

  const majorNames = assignedMajors.map((m) => labelForMajor(m, lang)).join(', ');

  return (
    <DashboardShell
      title={headName ? `${lang === 'he' ? 'שלום' : 'Hello'}, ${headName}` : lang === 'he' ? 'ראש בית ספר' : 'School Head'}
      subtitle={
        majorNames
          ? (lang === 'he' ? `אחראי/ת על: ${majorNames}` : `Responsible for: ${majorNames}`)
          : lang === 'he' ? 'אישורים, תקועים ועומס בוחנים' : 'Approvals, stuck students, and examiner load'
      }
      showBackButton={tab !== 'overview'}
    >
      {noScopeAssigned && (
        <p className="mb-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">
          {lang === 'he'
            ? 'לחשבון זה טרם הוקצתה מגמה. פנה/י למנהל המערכת כדי להקצות לך מגמה (או יותר) לניהול.'
            : 'No major is assigned to this account yet. Contact system_admin to assign one or more majors.'}
        </p>
      )}

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard value={stats.totalStudents} label={lang === 'he' ? 'סה"כ פרויקטים' : 'Total Projects'} color="#6E5A99" href="/school_head/dashboard?tab=overview" />
        <StatCard value={stats.pendingCount} label={lang === 'he' ? 'ממתינים לאישור' : 'Pending Approvals'} color="var(--accent)" href="/school_head/dashboard?tab=approvals" />
        <StatCard value={stats.stuckCount} label={lang === 'he' ? 'תקועים' : 'Stuck'} color="var(--danger)" href="/school_head/dashboard?tab=stuck" />
        <StatCard value={stats.completedThisYear} label={lang === 'he' ? 'סיימו השנה' : 'Completed'} color="var(--success)" href="/school_head/dashboard?tab=grades" />
      </div>

      {loadError && <p className="mb-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">{loadError}</p>}

      {loadingData ? (
        <p className="text-sm text-grad-school-head-on-surface-variant">{t('loading')}</p>
      ) : tab === 'approvals' ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <ExceptionalActionQueue />
          </div>
          {approvals.map((item) => (
            <div
              key={item.id}
              className="role-rail rounded-grad-school-head border border-grad-school-head-outline-variant bg-grad-school-head-surface-container-lowest p-4"
              style={{ '--rail-color': URGENCY_COLOR[item.urgency] } as React.CSSProperties}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="rounded-full px-2 py-0.5 text-xs font-medium" style={{ backgroundColor: `${URGENCY_COLOR[item.urgency] ?? '#8899BB'}22`, color: URGENCY_COLOR[item.urgency] ?? '#8899BB' }}>
                  {APPROVAL_TYPE_LABEL[item.type]?.[lang] ?? item.type}
                </span>
                {item.submittedAt && <span className="text-xs text-grad-school-head-on-surface-variant">{new Date(item.submittedAt).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-US')}</span>}
              </div>
              <p className="mt-1.5 text-sm font-semibold text-grad-school-head-on-surface">{item.studentName}</p>
              <p className="mt-0.5 text-xs text-grad-school-head-on-surface-variant">{item.title}</p>

              {item.type === 'final_grade' ? (
                <>
                  {finalGradeRejectTargetId === item.id && (
                    <input
                      value={finalGradeRejectReason}
                      onChange={(e) => setFinalGradeRejectReason(e.target.value)}
                      placeholder={lang === 'he' ? 'סיבת הדחייה' : 'Rejection reason'}
                      className="mt-2 w-full rounded-md border border-grad-school-head-outline-variant bg-grad-school-head-surface-container-low px-2.5 py-1.5 text-xs text-grad-school-head-on-surface"
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
                      {approvingId === item.id ? (lang === 'he' ? 'מאשר...' : 'Approving...') : `✅ ${lang === 'he' ? 'אשר' : 'Approve'}`}
                    </button>
                  </div>
                </>
              ) : item.type === 'examiners' ? (
                <>
                  {examinerRejectTargetId === item.id && (
                    <input
                      value={examinerRejectReason}
                      onChange={(e) => setExaminerRejectReason(e.target.value)}
                      placeholder={lang === 'he' ? 'סיבת הדחייה' : 'Rejection reason'}
                      className="mt-2 w-full rounded-md border border-grad-school-head-outline-variant bg-grad-school-head-surface-container-low px-2.5 py-1.5 text-xs text-grad-school-head-on-surface"
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
              ) : (
                <p className="mt-3 text-xs italic text-grad-school-head-on-surface-variant">
                  {lang === 'he' ? 'לצפייה ואישור, יש לפתוח את פאנל הניהול' : 'View and act on this from the admin panel'}
                </p>
              )}
            </div>
          ))}
          {approvals.length === 0 && <p className="text-sm text-grad-school-head-on-surface-variant">✅ {lang === 'he' ? 'אין פריטים הממתינים לאישורך' : 'Nothing pending your approval'}</p>}
        </div>
      ) : tab === 'overview' ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {processSummaries.map((m) => (
            <div key={m.major} className="role-rail rounded-grad-school-head border border-grad-school-head-outline-variant bg-grad-school-head-surface-container-lowest p-4" style={{ '--rail-color': '#6E5A99' } as React.CSSProperties}>
              <p className="text-sm font-semibold text-grad-school-head-on-surface">{labelForMajor(m.major, lang)}</p>
              <div className="mt-2 grid grid-cols-5 gap-1 text-center">
                <MiniStat value={m.total} label={lang === 'he' ? 'סה"כ' : 'Total'} />
                <MiniStat value={m.active} label={lang === 'he' ? 'פעילים' : 'Active'} color="#3E6C8C" />
                <MiniStat value={m.stuck} label={lang === 'he' ? 'תקועים' : 'Stuck'} color="var(--danger)" />
                <MiniStat value={m.completed} label={lang === 'he' ? 'סיימו' : 'Done'} color="var(--success)" />
                <MiniStat value={m.overdue} label={lang === 'he' ? 'באיחור' : 'Overdue'} color="var(--accent)" />
              </div>
            </div>
          ))}
          {processSummaries.length === 0 && <p className="text-sm text-grad-school-head-on-surface-variant">📊 {lang === 'he' ? 'אין נתונים' : 'No data'}</p>}
        </div>
      ) : tab === 'stuck' ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {stuckStudents.map((st, i) => (
            <div key={i} className="role-rail rounded-grad-school-head border border-grad-school-head-outline-variant bg-grad-school-head-surface-container-lowest p-4" style={{ '--rail-color': 'var(--danger)' } as React.CSSProperties}>
              <p className="text-sm font-semibold text-grad-school-head-on-surface">👤 {st.studentName}</p>
              <p className="mt-0.5 text-xs text-grad-school-head-on-surface-variant">👨‍🏫 {st.supervisorName}</p>
              <p className="mt-0.5 text-xs text-grad-school-head-on-surface-variant">
                📍 {lang === 'he' ? 'שלב נוכחי:' : 'Current stage:'} {st.currentMilestone}
              </p>
              <span className="mt-2 inline-block rounded-full bg-danger-bg px-2.5 py-1 text-xs font-medium text-danger">
                ⏱ {st.daysInStage} {lang === 'he' ? 'ימים בשלב' : 'days in stage'}
              </span>
            </div>
          ))}
          {stuckStudents.length === 0 && <p className="text-sm text-grad-school-head-on-surface-variant">🎉 {lang === 'he' ? 'אין סטודנטים תקועים' : 'No stuck students'}</p>}
        </div>
      ) : tab === 'examiners' ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <ExaminerEscalationPanel />
          </div>
          {examinerLoad.map((ex, i) => (
            <div
              key={i}
              className="role-rail rounded-grad-school-head border border-grad-school-head-outline-variant bg-grad-school-head-surface-container-lowest p-4"
              style={{ '--rail-color': ex.overdue > 0 ? 'var(--danger)' : 'var(--success)' } as React.CSSProperties}
            >
              <p className="text-sm font-semibold text-grad-school-head-on-surface">{ex.examinerName}</p>
              <p className="mt-0.5 text-xs text-grad-school-head-on-surface-variant">{ex.institution}</p>
              <div className="mt-2 grid grid-cols-3 gap-1 text-center">
                <MiniStat value={ex.activeReviews} label={lang === 'he' ? 'פעילים' : 'Active'} color="#3E6C8C" />
                <MiniStat value={ex.pending} label={lang === 'he' ? 'ממתינים' : 'Pending'} color="var(--accent)" />
                <MiniStat value={ex.overdue} label={lang === 'he' ? 'באיחור' : 'Overdue'} color="var(--danger)" />
              </div>
            </div>
          ))}
          {examinerLoad.length === 0 && <p className="text-sm text-grad-school-head-on-surface-variant">📭 {lang === 'he' ? 'אין בוחנים פעילים' : 'No active examiners'}</p>}
        </div>
      ) : tab === 'grades' ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {approvedFinalGrades.map((g) => (
            <div key={g.id} className="role-rail rounded-grad-school-head border border-grad-school-head-outline-variant bg-grad-school-head-surface-container-lowest p-4" style={{ '--rail-color': 'var(--success)' } as React.CSSProperties}>
              <p className="text-sm font-semibold text-grad-school-head-on-surface">{g.studentName}</p>
              <p className="mt-0.5 text-xs text-grad-school-head-on-surface-variant">{g.title}</p>
              <p className="mt-1 text-xs text-grad-school-head-on-surface-variant">
                {lang === 'he' ? 'ציון סופי:' : 'Final grade:'} <span className="font-semibold text-grad-school-head-on-surface">{g.finalGrade}</span>
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
                    className="w-full rounded-lg border border-grad-school-head-outline-variant bg-grad-school-head-surface-container-low px-3 py-2 text-sm text-grad-school-head-on-surface focus:border-grad-school-head-primary focus:bg-grad-school-head-surface-container-lowest focus:outline-none"
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
                      className="flex-1 rounded-lg border border-grad-school-head-outline-variant px-3 py-2 text-xs font-semibold text-grad-school-head-on-surface-variant hover:bg-grad-school-head-surface-container-low"
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
          {approvedFinalGrades.length === 0 && <p className="text-sm text-grad-school-head-on-surface-variant">📭 {lang === 'he' ? 'אין ציונים מאושרים' : 'No approved grades'}</p>}
        </div>
      ) : (
        <StudentsListTab canManageStudents={false} />
      )}
    </DashboardShell>
  );
}

export default function SchoolHeadDashboardPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">…</p>}>
      <SchoolHeadDashboardContent />
    </Suspense>
  );
}

function StatCard({ value, label, color, href }: { value: number; label: string; color: string; href?: string }) {
  const content = (
    <>
      <div className="text-2xl font-semibold" style={{ color }}>
        {value}
      </div>
      <div className="text-xs text-grad-school-head-on-surface-variant">{label}</div>
    </>
  );
  return href ? (
    <Link href={href} className="rounded-grad-school-head border border-grad-school-head-outline-variant bg-grad-school-head-surface-container-lowest p-4 transition-colors hover:border-grad-school-head-primary">
      {content}
    </Link>
  ) : (
    <div className="rounded-grad-school-head border border-grad-school-head-outline-variant bg-grad-school-head-surface-container-lowest p-4">{content}</div>
  );
}

function MiniStat({ value, label, color }: { value: number; label: string; color?: string }) {
  return (
    <div>
      <div className="text-sm font-semibold" style={{ color: color ?? 'var(--grad-school-head-on-surface)' }}>
        {value}
      </div>
      <div className="text-[10px] leading-tight text-grad-school-head-on-surface-variant">{label}</div>
    </div>
  );
}
