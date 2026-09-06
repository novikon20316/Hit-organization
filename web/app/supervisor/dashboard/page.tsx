'use client';

// app/supervisor/dashboard/page.tsx
// Ported from mobile/app/supervisor/dashboard.tsx — Applications, Projects,
// and Deadlines tabs. Grading lives inline on each milestone row inside the
// Projects tab (see ProjectWorkflowSection.tsx), not its own tab — and
// examiner recommendation now happens right after project creation (or via
// a project card's own button), not its own tab either.
//
// useSearchParams() forces this static route into client-side rendering at
// the Suspense boundary during prerendering (Next.js requirement) — wrapped
// below so the rest of the app shell can still be prerendered.

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { collection, query, where, onSnapshot, type Unsubscribe } from 'firebase/firestore';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { PendingSignoffsWidget } from '@/components/dashboard/PendingSignoffsWidget';
import { useRequireRole } from '@/hooks/useRequireRole';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/apiClient';
import { db } from '@/lib/firebase';
import type { AppRole } from '@/lib/roles';
import type { FacultyId } from '@/lib/i18n';
import type { ExaminerUser } from '@/app/coordinator/home/types';
import { ApplicationCard } from './ApplicationCard';
import { GradeMilestoneModal } from './GradeMilestoneModal';
import { ProjectCard } from './ProjectCard';
import { EditProjectModal } from './EditProjectModal';
import { NewProjectModal } from './NewProjectModal';
import { RecommendExaminersModal, type RecommendExaminersTarget } from './RecommendExaminersModal';
import { QuickTasksPanel } from './QuickTasksPanel';
import type { MyProject, Application, SupervisorPendingMilestone } from './types';

const SUPERVISOR_ROLES: AppRole[] = ['supervisor', 'secondary_supervisor'];

// No standalone 'grading' tab — grading (and the file preview/download it
// needs) lives inline on each milestone row inside the Projects tab now, see
// ProjectWorkflowSection.tsx. Likewise, no standalone 'recommend' tab either
// — examiner recommendation now happens right after project creation (or,
// as a fallback, from a "Recommend Examiners" button on the project's own
// card), never a separate surface. See RecommendExaminersModal.tsx.
type Tab = 'projects' | 'applications' | 'signoffs';
const SUPERVISOR_TABS: Tab[] = ['projects', 'applications', 'signoffs'];
const isSupervisorTab = (v: string | null): v is Tab => !!v && (SUPERVISOR_TABS as string[]).includes(v);
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

function SupervisorDashboardContent() {
  const { loading: guardLoading, isAllowed, firebaseUser } = useRequireRole(SUPERVISOR_ROLES);
  const { lang, t } = useLanguage();
  const searchParams = useSearchParams();

  // Same URL-as-source-of-truth pattern as app/admin/panel/page.tsx's `tab`
  // — the sidebar (app/supervisor/layout.tsx) links to
  // /supervisor/dashboard?tab=... for each top-level tab, so there's no
  // local state to keep in sync.
  const paramTab = searchParams.get('tab');
  const tab: Tab = isSupervisorTab(paramTab) ? paramTab : 'projects';
  const [applicationFilter, setApplicationFilter] = useState<ApplicationFilter>('all');
  const [projectFilter, setProjectFilter] = useState<ProjectFilter>('all');
  const [myProjects, setMyProjects] = useState<MyProject[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [pendingGrades, setPendingGrades] = useState<SupervisorPendingMilestone[]>([]);
  const [internalExaminers, setInternalExaminers] = useState<ExaminerUser[]>([]);
  const [facultyId, setFacultyId] = useState<FacultyId>('all');
  const [loadingData, setLoadingData] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [gradingTarget, setGradingTarget] = useState<SupervisorPendingMilestone | null>(null);
  const [editingProject, setEditingProject] = useState<MyProject | null>(null);
  const [showNewProject, setShowNewProject] = useState(false);
  // Opened either right after creating a project (NewProjectModal's
  // onCreated) or via a project card's own "Recommend Examiners" button —
  // never a standalone tab anymore, see RecommendExaminersModal.tsx.
  const [recommendExaminersTarget, setRecommendExaminersTarget] = useState<RecommendExaminersTarget | null>(null);

  const fetchDashboard = useCallback(async () => {
    try {
      const data = await apiClient.getSupervisorDashboard();
      setMyProjects((data.myProjects ?? []) as unknown as MyProject[]);
      setApplications((data.applications ?? []) as unknown as Application[]);
      setPendingGrades((data.pendingGrades ?? []) as unknown as SupervisorPendingMilestone[]);
      if (data.facultyId) setFacultyId(data.facultyId as FacultyId);
      setLoadError('');
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : lang === 'he' ? 'טעינת לוח הבקרה נכשלה' : 'Failed to load the dashboard');
    } finally {
      setLoadingData(false);
    }
  }, [lang]);

  // Only the internal-examiner list is needed now — the RecommendExaminersModal
  // picker uses it; the (now-removed) recommend tab used to also fetch the
  // supervisor's own past recommendations to list them, which nothing
  // renders anymore.
  const fetchInternalExaminers = useCallback(async () => {
    try {
      const examiners = await apiClient.getInternalExaminerList();
      setInternalExaminers((examiners ?? []) as unknown as ExaminerUser[]);
    } catch {
      // non-fatal — the modal just shows an empty internal-examiner list
    }
  }, []);

  useEffect(() => {
    if (isAllowed) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; setState calls happen after the awaited network call resolves, not synchronously in this effect
      fetchDashboard();
      fetchInternalExaminers();
    }
  }, [isAllowed, fetchDashboard, fetchInternalExaminers]);

  // Live milestone listener for pendingGrades. Unlike the coordinator/
  // examiner dashboards' overlay-by-id (which only ever patches fields onto
  // milestones already present), pendingGrades is itself defined as "every
  // milestone with status === 'submitted'" (see supervisorController.ts's
  // getSupervisorDashboard) — set membership changes over time (a grade
  // gets submitted, or gets graded and should drop off), not just field
  // values on a fixed set of rows. So each snapshot rebuilds the array from
  // scratch off the raw milestone docs, using the exact same field mapping
  // and status filter as the REST endpoint (milestone docs are already
  // denormalized with projectTitleHe/studentNames/etc, so this needs no
  // extra join). Two separate queries (supervisorId / secondarySupervisorId)
  // since a milestone doc carries either field, mirroring mobile/app/
  // supervisor/dashboard.tsx's identical primary+secondary split for
  // projects.
  const unsubPrimary = useRef<Unsubscribe | null>(null);
  const unsubSecondary = useRef<Unsubscribe | null>(null);
  const liveMilestonesRef = useRef<Map<string, any>>(new Map());
  useEffect(() => {
    if (unsubPrimary.current) { unsubPrimary.current(); unsubPrimary.current = null; }
    if (unsubSecondary.current) { unsubSecondary.current(); unsubSecondary.current = null; }
    liveMilestonesRef.current = new Map();
    const uid = firebaseUser?.uid;
    if (!isAllowed || !uid) return;

    const applyOverlay = () => {
      const rows = Array.from(liveMilestonesRef.current.entries())
        .filter(([, data]) => data.status === 'submitted')
        .map(([id, data]) => ({
          id,
          projectId: data.projectId ?? '',
          projectTitleHe: data.projectTitleHe ?? '',
          projectTitleEn: data.projectTitleEn ?? '',
          type: data.type ?? '',
          status: data.status ?? '',
          studentNames: data.studentNames ?? [],
          studentIds: data.studentIds ?? [],
          fileUrls: data.fileUrls ?? [],
          submissionNote: data.submissionNote ?? '',
          facultyId: data.facultyId ?? '',
          gradingComponents: data.gradingComponents ?? [],
          dueDate: data.dueDate?.toDate?.()?.toISOString() ?? null,
          submittedAt: data.submittedAt?.toDate?.()?.toISOString() ?? null,
        }));
      setPendingGrades(rows);
    };

    const onSnap = (snapshot: any) => {
      snapshot.docChanges().forEach((change: any) => {
        if (change.type === 'removed') liveMilestonesRef.current.delete(change.doc.id);
        else liveMilestonesRef.current.set(change.doc.id, change.doc.data());
      });
      applyOverlay();
    };
    const onErr = (err: any) => {
      if (err?.code === 'permission-denied') return; // expected during sign-out
      console.warn('supervisor/dashboard: live milestones listener error', err);
    };

    unsubPrimary.current = onSnapshot(query(collection(db, 'milestones'), where('supervisorId', '==', uid)), onSnap, onErr);
    unsubSecondary.current = onSnapshot(query(collection(db, 'milestones'), where('secondarySupervisorId', '==', uid)), onSnap, onErr);

    return () => {
      if (unsubPrimary.current) { unsubPrimary.current(); unsubPrimary.current = null; }
      if (unsubSecondary.current) { unsubSecondary.current(); unsubSecondary.current = null; }
    };
  }, [isAllowed, firebaseUser?.uid]);

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

  return (
    <DashboardShell
      title={lang === 'he' ? 'לוח בקרה — מנחה' : 'Supervisor Dashboard'}
      subtitle={lang === 'he' ? 'מועמדויות, ציונים ופרויקטים' : 'Applications, grading, and projects'}
      showBackButton={tab !== 'projects'}
    >
      {/* Academic Precision overview strip — real counts, no new fetches */}
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Link href="/supervisor/dashboard?tab=projects" className="rounded-supervisor-lg border border-supervisor-outline-variant bg-supervisor-surface-container-lowest p-4 transition-colors hover:border-supervisor-primary">
          <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-supervisor-secondary">
            {lang === 'he' ? 'הפרויקטים שלי' : 'Active Projects'}
          </h4>
          <div className="flex items-end justify-between">
            <span className="text-4xl font-bold leading-none text-supervisor-on-surface">{myProjects.length}</span>
            <span className="text-2xl">📁</span>
          </div>
        </Link>
        <Link href="/supervisor/dashboard?tab=applications" className="rounded-supervisor-lg border border-supervisor-outline-variant bg-supervisor-surface-container-lowest p-4 transition-colors hover:border-supervisor-primary">
          <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-supervisor-secondary">
            {lang === 'he' ? 'מועמדויות ממתינות' : 'Pending Applications'}
          </h4>
          <div className="flex items-end justify-between">
            <span className="text-4xl font-bold leading-none text-supervisor-on-surface">{pendingApplicationsCount}</span>
            <span className="text-2xl">📨</span>
          </div>
        </Link>
        {/* Pending grades render inline inside each project's card on the
            Projects tab (see ProjectCard's pendingGrades/onGrade props
            below) — there's no separate grading tab, so this must route
            there, not to `signoffs` (an unrelated final-grade-signoff
            widget) — that mismatch was why clicking this card never took a
            supervisor anywhere they could actually grade something. */}
        <Link href="/supervisor/dashboard?tab=projects" className="rounded-supervisor-lg border border-l-4 border-supervisor-outline-variant border-l-supervisor-primary bg-supervisor-surface-container-lowest p-4 transition-colors hover:border-supervisor-primary">
          <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-supervisor-primary">
            {lang === 'he' ? 'ציונים לבדיקה' : 'Milestones to Review'}
          </h4>
          <div className="flex items-end justify-between">
            <span className="text-4xl font-bold leading-none text-supervisor-on-surface">{pendingGrades.length}</span>
            <span className="text-2xl">⏰</span>
          </div>
        </Link>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row">
      <div className="flex-1">
      {loadError && <p className="mb-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">{loadError}</p>}

      {loadingData ? (
        <p className="text-sm text-supervisor-on-surface-variant">{t('loading')}</p>
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
                    className={`shrink-0 rounded-supervisor px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition-colors ${
                      applicationFilter === key
                        ? 'bg-supervisor-primary text-supervisor-on-primary'
                        : 'bg-supervisor-surface-container text-supervisor-secondary hover:text-supervisor-on-surface'
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
                  <p className="text-sm text-supervisor-on-surface-variant">
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

          {tab === 'projects' && (
            <>
              <div className="mb-4 flex gap-1 overflow-x-auto">
                {PROJECT_FILTERS.map(({ key, he, en }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setProjectFilter(key)}
                    className={`shrink-0 rounded-supervisor px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition-colors ${
                      projectFilter === key
                        ? 'bg-supervisor-primary text-supervisor-on-primary'
                        : 'bg-supervisor-surface-container text-supervisor-secondary hover:text-supervisor-on-surface'
                    }`}
                  >
                    {lang === 'he' ? he : en}
                  </button>
                ))}
              </div>
              <div className="grid gap-3 pb-20">
                {filteredProjects.map((p) => (
                  <ProjectCard
                    key={p.id}
                    project={p}
                    onEdit={setEditingProject}
                    onChanged={fetchDashboard}
                    pendingGrades={pendingGrades}
                    onGrade={setGradingTarget}
                    onRecommendExaminers={(project) => setRecommendExaminersTarget(project)}
                  />
                ))}
                {filteredProjects.length === 0 && (
                  <p className="text-sm text-supervisor-on-surface-variant">
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

          {tab === 'signoffs' && <PendingSignoffsWidget showEmptyState />}
        </>
      )}
      </div>

      <div className="w-full shrink-0 lg:w-80">
        <QuickTasksPanel myProjects={myProjects} applications={applications} pendingGrades={pendingGrades} onGrade={setGradingTarget} />
      </div>
      </div>

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
        <NewProjectModal
          facultyId={facultyId}
          onClose={() => setShowNewProject(false)}
          onCreated={(project) => {
            fetchDashboard();
            setRecommendExaminersTarget(project);
          }}
        />
      )}

      {tab === 'projects' && (
        <div className="fixed start-0 end-0 bottom-0 z-30 border-t border-supervisor-outline-variant bg-supervisor-surface-container-lowest px-4 py-3 lg:start-64">
          <div className="mx-auto max-w-6xl">
            <button
              type="button"
              onClick={() => setShowNewProject(true)}
              className="w-full rounded-supervisor bg-supervisor-primary py-3 text-sm font-semibold uppercase tracking-wide text-supervisor-on-primary hover:opacity-90"
            >
              + {lang === 'he' ? 'פרסם פרויקט חדש' : 'Post New Project'}
            </button>
          </div>
        </div>
      )}

      {recommendExaminersTarget && (
        <RecommendExaminersModal
          key={recommendExaminersTarget.id}
          project={recommendExaminersTarget}
          internalExaminers={internalExaminers}
          onClose={() => setRecommendExaminersTarget(null)}
          onSubmitted={() => setRecommendExaminersTarget(null)}
        />
      )}
    </DashboardShell>
  );
}

export default function SupervisorDashboardPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">…</p>}>
      <SupervisorDashboardContent />
    </Suspense>
  );
}
