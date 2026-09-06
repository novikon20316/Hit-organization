// student/hooks/useStudentData.ts
import { useState, useEffect, useCallback, useRef } from 'react';
import { apiClient } from '../src/api/apiClient';
import { collection, query, where, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { db, auth } from '../src/firebase/firebase';
import {
  StudentState, DegreeType, ProjectType, MilestoneStatus,
  ProjectProposal, ActiveProject, Milestone,
  PendingApplication, AppNotification
} from '@/types';
import { normalizeCompletedCourses, type CompletedCourse } from '@/components/Prerequisites';
import { resolveEffectiveTrack, type StudentTrack, type TrackPolicy } from '@/constants/studentTrack';

// TEMP-2-ACTIVE-PROJECTS: one entry per project the student is currently
// enrolled in — normally just one, but the server-side bypass in
// projectEnrollment.ts can seat a student in up to two at once. Say "revert
// the temp 2-active-projects bypass" to undo — once the server side is
// reverted, activeProjectIds is always a single-element array again and
// this just renders one dashboard, same as before this existed.
export interface ActiveProjectEntry {
  project: ActiveProject;
  milestones: Milestone[];
}

// Legacy fallback — the milestone TYPE ordering every faculty used before a
// milestone doc carried its own `order` (see server/src/services/
// projectEnrollment.ts). Mirrors the server's own resolveMilestoneOrder
// (workflowTemplates.ts) — only ever consulted for a milestone doc that
// predates that field; a faculty's template can define its milestones in any
// order (including custom_xxxxx types this list has never heard of), so an
// unrecognized type sorts LAST here, never first.
const LEGACY_MILESTONE_TYPE_ORDER = ['research_proposal', 'progress_report', 'final_report', 'defense', 'poster'];
function resolveMilestoneOrder(m: { type?: string; order?: number }): number {
  if (typeof m.order === 'number') return m.order;
  const idx = m.type ? LEGACY_MILESTONE_TYPE_ORDER.indexOf(m.type) : -1;
  return idx === -1 ? Number.MAX_SAFE_INTEGER : idx;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useStudentData() {
  const [studentState,       setStudentState]       = useState<StudentState>('loading');
  const [proposals,          setProposals]          = useState<ProjectProposal[]>([]);
  const [activeProjects,     setActiveProjects]     = useState<ActiveProjectEntry[]>([]);
  const [pendingApplications, setPendingApplications] = useState<PendingApplication[]>([]);
  const [supervisorSelectionRequiresApproval, setSupervisorSelectionRequiresApproval] = useState(true);
  const [notifications,      setNotifications]      = useState<AppNotification[]>([]);
  const [studentName,        setStudentName]        = useState('');
  const [studentDegree,      setStudentDegree]      = useState<DegreeType>('bachelors');
  const [studentFaculty,     setStudentFaculty]     = useState('');
  const [studentMajor,       setStudentMajor]       = useState('');
  const [error,              setError]              = useState<string | null>(null);
  const [studentYearOfStudy, setStudentYearOfStudy] = useState<number | null>(null);
  const [studentCompletedCourses, setStudentCompletedCourses] = useState<CompletedCourse[]>([]);
  const [studentTrack,           setStudentTrack]           = useState<StudentTrack | null>(null);
  const [studentTrackPolicy,     setStudentTrackPolicy]     = useState<TrackPolicy | null>(null);
  const [studentTrackLocked,     setStudentTrackLocked]     = useState(false);
  const [studentThesisEligible,  setStudentThesisEligible]  = useState(false);
  const [studentHasGradeRecord,  setStudentHasGradeRecord]  = useState(false);

  // ── Track all active unsubscribe functions in a ref so they survive re-renders
  const unsubProposals  = useRef<(() => void) | null>(null);
  const unsubUserDoc    = useRef<(() => void) | null>(null);
  const unsubMilestones = useRef<(() => void) | null>(null);

  // ── Helper: cancel a single listener safely
  const cancel = (ref: React.MutableRefObject<(() => void) | null>) => {
    if (ref.current) {
      ref.current();
      ref.current = null;
    }
  };

  // ── Cancel ALL listeners (call this before/during logout)
  const cancelAllListeners = useCallback(() => {
    cancel(unsubProposals);
    cancel(unsubUserDoc);
    cancel(unsubMilestones);
  }, []);

  const fetchDashboardData = useCallback(async () => {
    try {
      setStudentState('loading');
      setError(null);

      const profileRes = await apiClient.get('/api/users/profile');
      const userData = profileRes.data;

      const uid = userData.id || userData.uid;
      const degree = userData.degreeType || 'bachelors';

      setStudentName(userData.displayName || '');
      setStudentDegree(degree);
      setStudentFaculty(userData.facultyId || '');
      setStudentMajor(userData.major || '');
      setStudentYearOfStudy(userData.yearOfStudy ?? null);
      setStudentCompletedCourses(normalizeCompletedCourses(userData.completedCourses));
      setStudentTrack(userData.track ?? null);
      setStudentTrackPolicy(userData.trackPolicy ?? null);
      setStudentTrackLocked(!!userData.trackLocked);
      setStudentThesisEligible(userData.thesisEligibility?.eligible === true);
      setStudentHasGradeRecord(!!userData.thesisEligibility);
      // The eligibility gate (based on current year-of-study) decides whether
      // a student may BROWSE/APPLY to new projects — it must never block a
      // student who already has an active project. isEligibleForProcess is
      // computed once at signup and can go stale as a student progresses
      // into a later year (e.g. a master's student moving from year 1 to
      // year 2 while still finishing their thesis), so check hasActiveProject
      // first and only fall back to the eligibility gate when there's
      // nothing already in progress to show.
      // activeProjectIds is the TEMP-2-ACTIVE-PROJECTS field — falls back to
      // the single scalar activeProjectId for any student not currently
      // seated in a 2nd project (i.e. everyone, with the bypass reverted).
      const activeIds: string[] = userData.activeProjectIds?.length
        ? userData.activeProjectIds
        : userData.hasActiveProject && userData.activeProjectId
          ? [userData.activeProjectId]
          : [];

      if (activeIds.length > 0) {
        // --- CASE A: Active Project(s) ---
        // allSettled, not all — with several active projects (see
        // TEMP-2-ACTIVE-PROJECTS above), one project failing to load (stale
        // doc, transient error) used to reject the whole batch and drop
        // studentState to 'no_project', silently hiding every other active
        // project too. Now a single bad project is just dropped instead of
        // taking the rest down with it.
        const results = await Promise.allSettled(
          activeIds.map(async (pid: string) => {
            const projectRes = await apiClient.get(`/api/student/projects/${pid}`);
            const milestonesRes = await apiClient.getMilestones({ studentId: uid, projectId: pid });
            const sorted = (milestonesRes?.milestones || []).sort(
              (a: Milestone, b: Milestone) =>
                resolveMilestoneOrder(a) - resolveMilestoneOrder(b)
            );
            return { project: projectRes.data as ActiveProject, milestones: sorted as Milestone[] };
          })
        );
        results.filter((r) => r.status === 'rejected').forEach((r) => console.error('Failed to load an active project:', (r as PromiseRejectedResult).reason));
        const loaded = results.filter((r): r is PromiseFulfilledResult<ActiveProjectEntry> => r.status === 'fulfilled').map((r) => r.value);
        if (loaded.length > 0) {
          setActiveProjects(loaded);
          setStudentState('active');
        } else {
          setStudentState('no_project');
        }
      } else if (!userData.isEligibleForProcess) {
        // No active project, and not yet in the eligible year — show the
        // "not eligible yet" info screen rather than an empty browse list.
        setStudentState('ineligible');
      } else if (userData.trackPolicy === 'coordinator_gated' && !userData.thesisEligibility) {
        // computer_science masters student, no grade average entered yet —
        // nothing to browse until a coordinator/program_head/administrative
        // coordinator enters one (see server's config/studentTrack.ts's
        // coordinator_gated policy). Distinct from "average entered but
        // below the thesis threshold", which falls through to the normal
        // browse UI below on the project track.
        setStudentState('awaiting_grade');
      } else {
        // --- CASE B: Browsing Proposals (triggers the snapshot effect below) ---
        // A student can now hold several open applications at once — Browse
        // stays visible regardless of how many are pending; BrowseProjects
        // itself renders the "My Applications" panel from the full list.
        const appsRes = await apiClient.get('/api/applications/pending');
        const pendingApps = appsRes.data?.applications || [];
        setPendingApplications(pendingApps);

        // Which "no active project" screen to show is faculty/degree-driven
        // (see server's workflowTemplates.ts's resolveFirstStepMode) —
        // defaults to today's behavior (browse projects) if this call fails
        // for any reason, so a resolution hiccup never blocks the student
        // from seeing anything at all.
        try {
          const firstStepRes = await apiClient.get('/api/student/first-step-mode');
          const firstStep = firstStepRes.data ?? { firstStepMode: 'browse_projects', supervisorSelectionRequiresApproval: true };
          setSupervisorSelectionRequiresApproval(firstStep.supervisorSelectionRequiresApproval);
          setStudentState(firstStep.firstStepMode === 'choose_supervisor' ? 'choose_supervisor' : 'no_project');
        } catch (e) {
          setStudentState('no_project');
        }
      }

      // Always fetch notifications
      try {
        const notifRes = await apiClient.get('/api/notifications/inbox');
        setNotifications(notifRes.data?.notifications || []);
      } catch (e) {
        console.error('Failed to fetch notifications:', e);
      }

    } catch (err: any) {
      console.error('Student Dashboard Fetch Error:', err);
      setError(err.message || 'Failed to load dashboard data.');
      setStudentState('no_project');
    }
  }, []);

  // ── EFFECT 1: Fetch profile on mount ──────────────────────────────────────
  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  // ── EFFECT 2: Live proposals listener (only when browsing) ────────────────
  useEffect(() => {
    // Always cancel the previous proposals listener before deciding to re-attach
    cancel(unsubProposals);

    if (studentState !== 'no_project' || !studentFaculty || !studentDegree) return;

    // array-contains, not equality, on degreeTypes — a project can now be
    // open to more than one degree type. facultyId stays a plain equality
    // filter (Firestore only allows one array-contains clause per query).
    const q = query(
      collection(db, 'projects'),
      where('status', '==', 'active'),
      where('facultyId', '==', studentFaculty),
      where('degreeTypes', 'array-contains', studentDegree)
    );

    const unsub = onSnapshot(
      q,
      async (snapshot) => {
        const allProjects = snapshot.docs.map(d => ({
          id: d.id,
          ...d.data()
        })) as ProjectProposal[];

        // A project's major (if set) restricts it to students of that exact
        // major — empty/missing major stays open to everyone in the faculty,
        // unchanged from today's default. This mirrors firestore.rules'
        // studentCanReadProjectByMajor (the real enforcement boundary); this
        // filter is just the client-side browse-list UX on top of it.
        const effectiveTrack = resolveEffectiveTrack({ degreeType: studentDegree, major: studentMajor, track: studentTrack });
        const rawProjects = allProjects.filter(p => {
          if (p.major && p.major !== studentMajor) return false;
          const types = p.projectTypes ?? (p.projectType ? [p.projectType] : []);
          return types.length === 0 || types.includes(effectiveTrack);
        });

        const supervisorIds = [...new Set(
          rawProjects
            .filter(p => p.supervisorId && !p.supervisorName)
            .map(p => p.supervisorId)
        )];

        const nameMap: Record<string, string> = {};
        if (supervisorIds.length > 0) {
          const supervisorDocs = await Promise.all(
            supervisorIds.map(uid => getDoc(doc(db, 'users', uid)))
          );
          supervisorDocs.forEach(snap => {
            if (snap.exists()) {
              const data = snap.data();
              nameMap[snap.id] = data?.displayName || data?.displayNameHe || '';
            }
          });
        }

        setProposals(rawProjects.map(p => ({
          ...p,
          supervisorName: p.supervisorName || nameMap[p.supervisorId] || '',
        })));
      },
      (error) => {
        // Ignore permission errors — this fires during logout when auth is revoked
        if (error.code === 'permission-denied') return;
        console.error('Proposals snapshot error:', error);
      }
    );

    unsubProposals.current = unsub;

    return () => cancel(unsubProposals);
  }, [studentState, studentFaculty, studentDegree, studentMajor, studentTrack]);

  // ── EFFECT 3: User doc listener (watches hasActiveProject flag) ───────────
  useEffect(() => {
    cancel(unsubUserDoc);

    const uid = auth.currentUser?.uid;
    if (!uid) return;

    const userRef = doc(db, 'users', uid);

    const unsub = onSnapshot(
      userRef,
      (snap) => {
        if (!snap.exists()) return;
        const data = snap.data();

        if (data?.hasActiveProject && data?.activeProjectId) {
          fetchDashboardData();
        }
      },
      (error) => {
        if (error.code === 'permission-denied') return;
        console.error('User doc snapshot error:', error);
      }
    );

    unsubUserDoc.current = unsub;

    return () => cancel(unsubUserDoc);
  }, [fetchDashboardData]);

  // ── EFFECT 4: Live milestones listener (only when active project(s) loaded) ──
  // One listener covering every active project at once (studentIds
  // array-contains, no projectId filter), grouped back out by projectId
  // below — simpler than juggling one onSnapshot per project, and works
  // identically whether the student has 1 or 2 active projects.
  const activeProjectIdsKey = activeProjects.map(ap => ap.project.id).sort().join(',');
  useEffect(() => {
    cancel(unsubMilestones);

    if (studentState !== 'active' || !activeProjectIdsKey) return;

    const uid = auth.currentUser?.uid;
    if (!uid) return;

    const q = query(
      collection(db, 'milestones'),
      where('studentIds', 'array-contains', uid)
    );

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const liveMilestones = snapshot.docs.map(d => {
          const data = d.data();
          return {
            id: d.id,
            projectId: data.projectId,
            type: data.type,
            order: data.order,
            status: data.status,
            dueDate:        data.dueDate?.toDate?.()?.toISOString()     ?? null,
            submittedAt:    data.submittedAt?.toDate?.()?.toISOString() ?? null,
            fileUrls:       data.fileUrls        ?? [],
            finalGrade:     data.finalGrade      ?? null,
            supervisorScore:data.supervisorScore ?? null,
            // CRITICAL FIX: was reading data.defenseDate, a field that has
            // never actually existed on a milestone doc — the real
            // confirmed defense date lives in `dueDate` (defenseScheduling.ts's
            // finalizeMatchedDate writes it there, same field every other
            // milestone type's due date lives in). See web/hooks/useStudentData.ts's
            // identical fix.
            defenseDate:    data.dueDate?.toDate?.()?.toISOString() ?? null,
            defenseRoom:    data.defenseRoom     ?? null,
            defenseBuilding:data.defenseBuilding ?? null,
            defenseTime:    data.defenseTime     ?? null,
            examinerNames:  data.examinerNames   ?? [],
            examinerIds:    data.examinerIds     ?? [],
            rejectionReason: data.rejectionReason ?? null,
            coordinatorComment: data.coordinatorComment ?? null,
            staffRecord: data.staffRecord ?? null,
            staffFormFields: data.staffFormFields ?? undefined,
            submissionRequirement: data.submissionRequirement ?? undefined,
            studentIds: data.studentIds ?? [],
            studentFormFields: data.studentFormFields ?? undefined,
            studentFormData: data.studentFormData ?? null,
            coordinatorRecommendation: data.coordinatorRecommendation ?? null,
            supervisorSignedAt: data.supervisorSignedAt?.toDate?.()?.toISOString() ?? null,
            supervisorSignedByName: data.supervisorSignedByName ?? null,
            coordinatorSignedAt: data.coordinatorSignedAt?.toDate?.()?.toISOString() ?? null,
            coordinatorSignedByName: data.coordinatorSignedByName ?? null,
          } as Milestone & { projectId: string };
        });

        setActiveProjects(prev => prev.map(ap => ({
          ...ap,
          milestones: liveMilestones
            .filter(m => m.projectId === ap.project.id)
            .sort((a, b) => resolveMilestoneOrder(a) - resolveMilestoneOrder(b)),
        })));
      },
      (error) => {
        if (error.code === 'permission-denied') return;
        console.error('Milestones snapshot error:', error);
      }
    );

    unsubMilestones.current = unsub;

    return () => cancel(unsubMilestones);
  }, [studentState, activeProjectIdsKey]);

  // ── Derived helpers ───────────────────────────────────────────────────────
  const withDerived = (milestones: Milestone[]) => ({
    nextMilestone:
      milestones.find(m => m.status === 'submitted' || m.status === 'supervisor_graded') ??
      milestones.find(m => m.status === 'pending') ??
      null,
    progress:
      milestones.length > 0
        ? Math.round((milestones.filter(m => m.status === 'coordinator_approved').length / milestones.length) * 100)
        : 0,
  });

  const activeProjectsWithDerived = activeProjects.map(ap => ({ ...ap, ...withDerived(ap.milestones) }));

  // Self-service track choice — used by a coordinator_gated student (e.g.
  // M.Sc Computer Science) once their coordinator has marked them thesis-
  // eligible. Refreshes the dashboard on success so the browse listener's
  // effectiveTrack filter above picks up the new choice immediately.
  const chooseTrack = useCallback(async (track: StudentTrack) => {
    await apiClient.post('/api/student/track/choose', { track });
    await fetchDashboardData();
  }, [fetchDashboardData]);

  // Back-compat single-project view for any code not yet updated to the
  // activeProjects array — the first entry, same as the only entry when the
  // TEMP-2-ACTIVE-PROJECTS bypass isn't in effect.
  const activeProject  = activeProjectsWithDerived[0]?.project ?? null;
  const milestones     = activeProjectsWithDerived[0]?.milestones ?? [];
  const nextMilestone  = activeProjectsWithDerived[0]?.nextMilestone ?? null;
  const progress       = activeProjectsWithDerived[0]?.progress ?? 0;

  return {
    studentState,
    studentName,
    studentYearOfStudy,
    studentCompletedCourses,
    proposals,
    activeProjects: activeProjectsWithDerived,
    activeProject,
    milestones,
    nextMilestone,
    progress,
    pendingApplications,
    supervisorSelectionRequiresApproval,
    notifications,
    studentDegree,
    studentTrack,
    studentTrackPolicy,
    studentTrackLocked,
    studentThesisEligible,
    studentHasGradeRecord,
    chooseTrack,
    error,
    refresh: fetchDashboardData,
    cancelAllListeners, // ← export so home.tsx can call it on logout
  };
}