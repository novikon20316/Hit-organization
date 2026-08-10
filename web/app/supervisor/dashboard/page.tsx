'use client';

// app/supervisor/dashboard/page.tsx
// Ported from mobile/app/supervisor/dashboard.tsx — Applications, Grading,
// Projects, Deadlines, and Recommend tabs.

import { useCallback, useEffect, useState } from 'react';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { PendingSignoffsWidget } from '@/components/dashboard/PendingSignoffsWidget';
import { useRequireRole } from '@/hooks/useRequireRole';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/apiClient';
import type { AppRole } from '@/lib/roles';
import type { FacultyId } from '@/lib/i18n';
import type { ExaminerUser, ExaminerRecommendation } from '@/app/coordinator/home/types';
import { ApplicationCard } from './ApplicationCard';
import { GradingCard } from './GradingCard';
import { GradeMilestoneModal } from './GradeMilestoneModal';
import { ProjectCard } from './ProjectCard';
import { EditProjectModal } from './EditProjectModal';
import { NewProjectModal } from './NewProjectModal';
import { RecommendExaminersModal } from './RecommendExaminersModal';
import { DeadlinesTab } from './DeadlinesTab';
import type { MyProject, Application, SupervisorPendingMilestone, SupervisorDeadline } from './types';

const SUPERVISOR_ROLES: AppRole[] = ['supervisor', 'secondary_supervisor'];

type Tab = 'applications' | 'grading' | 'projects' | 'deadlines' | 'recommend' | 'signoffs';
type ApplicationFilter = 'all' | 'applied' | 'approved' | 'meeting_requested' | 'rejected';
type ProjectFilter = 'all' | 'active' | 'offered';

const APPLICATION_FILTERS: { key: ApplicationFilter; he: string; en: string }[] = [
  { key: 'all', he: 'הכל', en: 'All' },
  { key: 'applied', he: 'ממתין לטיפול', en: 'Awaiting Response' },
  { key: 'approved', he: 'אושרו', en: 'Approved' },
  { key: 'meeting_requested', he: 'תואמה פגישה', en: 'Set-Meeting' },
  { key: 'rejected', he: 'נדחו', en: 'Rejected' },
];

// "active" = has at least one enrolled student; "offered" = posted but no
// student has been accepted into it yet. Deliberately keyed off
// enrolledStudentIds rather than the project doc's own `status` field —
// that field is literally 'active' for a freshly-posted, student-less
// project (see createSupervisorProject) and only flips to 'in_progress'
// once a student enrolls, the opposite of what "active" means here.
const PROJECT_FILTERS: { key: ProjectFilter; he: string; en: string }[] = [
  { key: 'all', he: 'הכל', en: 'All' },
  { key: 'active', he: 'פעילים', en: 'Active' },
  { key: 'offered', he: 'מוצעים', en: 'Offered' },
];

export default function SupervisorDashboardPage() {
  const { loading: guardLoading, isAllowed, firebaseUser } = useRequireRole(SUPERVISOR_ROLES);
  const { lang, t } = useLanguage();

  const [tab, setTab] = useState<Tab>('applications');
  const [applicationFilter, setApplicationFilter] = useState<ApplicationFilter>('all');
  const [projectFilter, setProjectFilter] = useState<ProjectFilter>('all');
  const [myProjects, setMyProjects] = useState<MyProject[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [pendingGrades, setPendingGrades] = useState<SupervisorPendingMilestone[]>([]);
  const [recommendations, setRecommendations] = useState<ExaminerRecommendation[]>([]);
  const [internalExaminers, setInternalExaminers] = useState<ExaminerUser[]>([]);
  const [deadlines, setDeadlines] = useState<SupervisorDeadline[]>([]);
  const [facultyId, setFacultyId] = useState<FacultyId>('all');
  const [loadingData, setLoadingData] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [gradingTarget, setGradingTarget] = useState<SupervisorPendingMilestone | null>(null);
  const [editingProject, setEditingProject] = useState<MyProject | null>(null);
  const [showRecommendModal, setShowRecommendModal] = useState(false);
  const [showNewProject, setShowNewProject] = useState(false);

  const fetchDashboard = useCallback(async () => {
    try {
      const data = await apiClient.getSupervisorDashboard();
      setMyProjects((data.myProjects ?? []) as unknown as MyProject[]);
      setApplications((data.applications ?? []) as unknown as Application[]);
      setPendingGrades((data.pendingGrades ?? []) as unknown as SupervisorPendingMilestone[]);
      if (data.facultyId) setFacultyId(data.facultyId as FacultyId);
      setLoadError('');

      // Non-fatal — deadlines failing to load shouldn't block the rest of
      // the dashboard, same treatment as the recommendations fetch below.
      try {
        if (firebaseUser) {
          const dl = await apiClient.getStaffDeadlines(firebaseUser.uid);
          setDeadlines((dl.deadlines ?? []) as unknown as SupervisorDeadline[]);
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

  const fetchRecommendationsData = useCallback(async () => {
    try {
      const [recs, examiners] = await Promise.all([apiClient.getSupervisorExaminerRecommendations(), apiClient.getInternalExaminerList()]);
      setRecommendations((recs.recommendations ?? []) as unknown as ExaminerRecommendation[]);
      setInternalExaminers((examiners ?? []) as unknown as ExaminerUser[]);
    } catch {
      // non-fatal — recommend tab just shows empty state
    }
  }, []);

  useEffect(() => {
    if (isAllowed) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; setState calls happen after the awaited network call resolves, not synchronously in this effect
      fetchDashboard();
      fetchRecommendationsData();
    }
  }, [isAllowed, fetchDashboard, fetchRecommendationsData]);

  if (guardLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper">
        <p className="text-sm text-muted">…</p>
      </div>
    );
  }

  const pendingApplicationsCount = applications.filter((app) => app.status === 'applied').length;
  const filteredApplications =
    applicationFilter === 'all' ? applications : applications.filter((app) => app.status === applicationFilter);

  const filteredProjects =
    projectFilter === 'all'
      ? myProjects
      : myProjects.filter((p) =>
          projectFilter === 'active' ? (p.enrolledStudentIds?.length ?? 0) > 0 : (p.enrolledStudentIds?.length ?? 0) === 0
        );

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: 'applications', label: lang === 'he' ? 'מועמדויות' : 'Applications', count: pendingApplicationsCount },
    { key: 'grading', label: lang === 'he' ? 'ציונים' : 'Grading', count: pendingGrades.length },
    { key: 'projects', label: lang === 'he' ? 'הפרויקטים שלי' : 'My Projects' },
    { key: 'deadlines', label: lang === 'he' ? 'מועדי הגשה' : 'Deadlines' },
    { key: 'recommend', label: lang === 'he' ? 'המלצת בוחנים' : 'Recommend Examiners' },
    { key: 'signoffs', label: lang === 'he' ? 'ממתין לאישורך' : 'Awaiting Your Sign-off' },
  ];

  return (
    <DashboardShell
      title={lang === 'he' ? 'לוח בקרה — מנחה' : 'Supervisor Dashboard'}
      subtitle={lang === 'he' ? 'מועמדויות, ציונים ופרויקטים' : 'Applications, grading, and projects'}
      actions={
        tab === 'recommend' ? (
          <button
            type="button"
            onClick={() => setShowRecommendModal(true)}
            className="rounded-full bg-primary px-4 py-1.5 text-sm font-semibold text-primary-ink hover:bg-primary-hover"
          >
            + {lang === 'he' ? 'המלצה חדשה' : 'New Recommendation'}
          </button>
        ) : undefined
      }
    >
      <div className="mb-5 flex gap-1 overflow-x-auto border-b border-line">
        {tabs.map(({ key, label, count }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`shrink-0 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === key ? 'border-primary text-primary' : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            {label}
            {count !== undefined ? ` (${count})` : ''}
          </button>
        ))}
      </div>

      {loadError && <p className="mb-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{loadError}</p>}

      {loadingData ? (
        <p className="text-sm text-muted">{t('loading')}</p>
      ) : (
        <>
          {tab === 'applications' && (
            <>
              <div className="mb-4 flex gap-1 overflow-x-auto">
                {APPLICATION_FILTERS.map(({ key, he, en }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setApplicationFilter(key)}
                    className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                      applicationFilter === key
                        ? 'bg-primary text-primary-ink'
                        : 'bg-paper text-muted hover:text-ink'
                    }`}
                  >
                    {lang === 'he' ? he : en}
                  </button>
                ))}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {filteredApplications.map((app) => (
                  <ApplicationCard key={app.id} application={app} onDecided={fetchDashboard} />
                ))}
                {filteredApplications.length === 0 && (
                  <p className="text-sm text-muted">
                    📬{' '}
                    {applicationFilter === 'all'
                      ? lang === 'he'
                        ? 'אין מועמדויות חדשות'
                        : 'No pending applications'
                      : lang === 'he'
                        ? 'אין מועמדויות התואמות את הסינון'
                        : 'No applications match this filter'}
                  </p>
                )}
              </div>
            </>
          )}

          {tab === 'grading' && (
            <div className="grid gap-3 sm:grid-cols-2">
              {pendingGrades.map((m) => (
                <GradingCard key={m.id} milestone={m} onGrade={setGradingTarget} />
              ))}
              {pendingGrades.length === 0 && (
                <p className="text-sm text-muted">✅ {lang === 'he' ? 'אין הגשות הממתינות לציון' : 'No submissions awaiting grading'}</p>
              )}
            </div>
          )}

          {tab === 'projects' && (
            <>
              <div className="mb-4 flex gap-1 overflow-x-auto">
                {PROJECT_FILTERS.map(({ key, he, en }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setProjectFilter(key)}
                    className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                      projectFilter === key
                        ? 'bg-primary text-primary-ink'
                        : 'bg-paper text-muted hover:text-ink'
                    }`}
                  >
                    {lang === 'he' ? he : en}
                  </button>
                ))}
              </div>
              <div className="grid gap-3 pb-20 sm:grid-cols-2">
                {filteredProjects.map((p) => (
                  <ProjectCard key={p.id} project={p} onEdit={setEditingProject} onChanged={fetchDashboard} />
                ))}
                {filteredProjects.length === 0 && (
                  <p className="text-sm text-muted">
                    📭{' '}
                    {myProjects.length === 0
                      ? lang === 'he'
                        ? 'טרם פרסמת פרויקטים'
                        : 'No projects posted yet'
                      : lang === 'he'
                        ? 'אין פרויקטים התואמים את הסינון'
                        : 'No projects match this filter'}
                  </p>
                )}
              </div>
            </>
          )}

          {tab === 'deadlines' && <DeadlinesTab deadlines={deadlines} />}

          {tab === 'recommend' && (
            <div className="grid gap-3 sm:grid-cols-2">
              {recommendations.map((rec) => (
                <div key={rec.id} className="rounded-[var(--radius)] border border-line bg-surface p-4">
                  <p className="text-sm font-semibold text-ink">{lang === 'he' ? rec.projectTitleHe : rec.projectTitleEn}</p>
                  <p className="mt-1 text-xs text-muted">
                    👥 {rec.recommendedExaminers?.length ?? 0} {lang === 'he' ? 'בוחנים הומלצו' : 'examiners recommended'}
                  </p>
                </div>
              ))}
              {recommendations.length === 0 && (
                <p className="text-sm text-muted">👥 {lang === 'he' ? 'לא נשלחו המלצות בוחנים' : 'No examiner recommendations sent yet'}</p>
              )}
            </div>
          )}

          {tab === 'signoffs' && <PendingSignoffsWidget showEmptyState />}
        </>
      )}

      {gradingTarget && (
        <GradeMilestoneModal
          key={gradingTarget.id}
          milestone={gradingTarget}
          onClose={() => setGradingTarget(null)}
          onGraded={fetchDashboard}
        />
      )}

      {editingProject && (
        <EditProjectModal key={editingProject.id} project={editingProject} onClose={() => setEditingProject(null)} onSaved={fetchDashboard} />
      )}

      {showNewProject && (
        <NewProjectModal facultyId={facultyId} onClose={() => setShowNewProject(false)} onCreated={fetchDashboard} />
      )}

      {tab === 'projects' && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface px-4 py-3">
          <div className="mx-auto max-w-6xl">
            <button
              type="button"
              onClick={() => setShowNewProject(true)}
              className="w-full rounded-lg bg-primary py-3 text-sm font-semibold text-primary-ink hover:bg-primary-hover"
            >
              + {lang === 'he' ? 'פרסם פרויקט חדש' : 'Post New Project'}
            </button>
          </div>
        </div>
      )}

      {showRecommendModal && (
        <RecommendExaminersModal
          myProjects={myProjects}
          internalExaminers={internalExaminers}
          onClose={() => setShowRecommendModal(false)}
          onSubmitted={fetchRecommendationsData}
        />
      )}
    </DashboardShell>
  );
}
