'use client';

// hooks/useStudentData.ts
// Ported from mobile/hooks/useStudentData.ts. Firestore's onSnapshot works
// identically in the browser SDK, so this is close to a 1:1 port — same
// four effects, same derived state. Dropped: the notifications-inbox fetch,
// since nothing in this slice's UI (no NotificationBell yet) reads it.

import { useState, useEffect, useCallback, useRef } from 'react';
import { collection, query, where, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { apiClient } from '@/lib/apiClient';
import { normalizeCompletedCourses, type CompletedCourse } from '@/lib/prerequisites';
import { useAuth } from '@/contexts/AuthContext';
import type { StudentState, DegreeType, ProjectProposal, ActiveProject, Milestone, PendingApplication } from '@/app/student/home/types';
import { resolveMilestoneOrder } from '@/app/student/home/types';
import { resolveEffectiveTrack, type StudentTrack, type TrackPolicy } from '@/lib/studentTrack';

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

export function useStudentData() {
  const { loading: authLoading, firebaseUser } = useAuth();
  const [studentState, setStudentState] = useState<StudentState>('loading');
  const [proposals, setProposals] = useState<ProjectProposal[]>([]);
  const [activeProjects, setActiveProjects] = useState<ActiveProjectEntry[]>([]);
  const [pendingApplications, setPendingApplications] = useState<PendingApplication[]>([]);
  const [supervisorSelectionRequiresApproval, setSupervisorSelectionRequiresApproval] = useState(true);
  const [studentName, setStudentName] = useState('');
  const [studentDegree, setStudentDegree] = useState<DegreeType>('bachelors');
  const [studentFaculty, setStudentFaculty] = useState('');
  const [studentMajor, setStudentMajor] = useState('');
  const [studentYearOfStudy, setStudentYearOfStudy] = useState<number | null>(null);
  const [studentCompletedCourses, setStudentCompletedCourses] = useState<CompletedCourse[]>([]);
  const [studentTrack,          setStudentTrack]          = useState<StudentTrack | null>(null);
  const [studentTrackPolicy,    setStudentTrackPolicy]    = useState<TrackPolicy | null>(null);
  const [studentTrackLocked,    setStudentTrackLocked]    = useState(false);
  const [studentThesisEligible, setStudentThesisEligible] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const unsubProposals = useRef<(() => void) | null>(null);
  const unsubUserDoc = useRef<(() => void) | null>(null);
  const unsubMilestones = useRef<(() => void) | null>(null);

  const cancel = (ref: React.MutableRefObject<(() => void) | null>) => {
    if (ref.current) {
      ref.current();
      ref.current = null;
    }
  };

  const cancelAllListeners = useCallback(() => {
    cancel(unsubProposals);
    cancel(unsubUserDoc);
    cancel(unsubMilestones);
  }, []);

  const fetchDashboardData = useCallback(async () => {
    try {
      setStudentState('loading');
      setError(null);

      const userData = (await apiClient.getMyProfile()) as {
        id?: string;
        uid?: string;
        displayName?: string;
        degreeType?: DegreeType;
        facultyId?: string;
        major?: string | null;
        yearOfStudy?: number | null;
        completedCourses?: unknown;
        hasActiveProject?: boolean;
        activeProjectId?: string;
        activeProjectIds?: string[];
        isEligibleForProcess?: boolean;
        track?: StudentTrack | null;
        trackPolicy?: TrackPolicy | null;
        trackLocked?: boolean;
        thesisEligibility?: { eligible: boolean } | null;
      };

      const uid = userData.id || userData.uid || '';
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

      // activeProjectIds is the TEMP-2-ACTIVE-PROJECTS field — falls back to
      // the single scalar activeProjectId for any student not currently
      // seated in a 2nd project (i.e. everyone, with the bypass reverted).
      const activeIds: string[] = userData.activeProjectIds?.length
        ? userData.activeProjectIds
        : userData.hasActiveProject && userData.activeProjectId
          ? [userData.activeProjectId]
          : [];

      if (activeIds.length > 0) {
        // allSettled, not all — with several active projects (see
        // TEMP-2-ACTIVE-PROJECTS above), one project failing to load (stale
        // doc, transient error) used to reject the whole batch and drop
        // studentState to 'no_project', silently hiding every other active
        // project too and turning the sidebar's Milestones/Grades links into
        // no-ops (they're only meaningful when studentState === 'active' —
        // see app/student/layout.tsx). Now a single bad project is just
        // dropped, same "never block the student from seeing anything at
        // all" principle as getFirstStepMode's catch below.
        const results = await Promise.allSettled(
          activeIds.map(async (pid) => {
            const project = (await apiClient.getStudentProject(pid)) as unknown as ActiveProject;
            const milestonesRes = await apiClient.getMilestones({ studentId: uid, projectId: pid });
            const sorted = (milestonesRes?.milestones || []).sort(
              (a, b) => resolveMilestoneOrder(a as unknown as Milestone) - resolveMilestoneOrder(b as unknown as Milestone)
            ) as unknown as Milestone[];
            return { project, milestones: sorted };
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
        setStudentState('ineligible');
      } else {
        // A student can now hold several open applications at once — Browse
        // stays visible regardless of how many are pending; BrowseProjects
        // itself renders the "My Applications" panel from the full list.
        const appsRes = await apiClient.getPendingApplications();
        const pendingApps = appsRes?.applications || [];
        setPendingApplications(pendingApps as unknown as PendingApplication[]);

        // Which "no active project" screen to show is faculty/degree-driven
        // (see workflowTemplates.ts's resolveFirstStepMode) — defaults to
        // today's behavior (browse projects) if this call fails for any
        // reason, so a resolution hiccup never blocks the student from
        // seeing anything at all.
        const firstStep = await apiClient.getFirstStepMode().catch(
          () => ({ firstStepMode: 'browse_projects' as const, supervisorSelectionRequiresApproval: true })
        );
        setSupervisorSelectionRequiresApproval(firstStep.supervisorSelectionRequiresApproval);
        setStudentState(firstStep.firstStepMode === 'choose_supervisor' ? 'choose_supervisor' : 'no_project');
      }
    } catch (err) {
      console.error('Student Dashboard Fetch Error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load dashboard data.');
      setStudentState('no_project');
    }
  }, []);

  // ── EFFECT 1: fetch profile on mount ──────────────────────────────────────
  useEffect(() => {
    // Wait for AuthContext to resolve Firebase's restored session first — on
    // a hard reload auth.currentUser is briefly null while that restore is
    // in flight, so calling fetchDashboardData before authLoading flips
    // false sends every request with no Authorization header at all
    // (apiClient.ts's request() reads auth.currentUser synchronously). The
    // catch block below then sets studentState to 'no_project' on ANY
    // error, so this used to silently mask a real active project or pending
    // application as "no project" instead of surfacing an error or retrying.
    if (authLoading) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; fetchDashboardData's setState calls happen after its awaited network calls resolve, not synchronously in this effect
    fetchDashboardData();
  }, [authLoading, fetchDashboardData]);

  // ── EFFECT 2: live proposals listener (only when browsing) ────────────────
  useEffect(() => {
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
        // Client-side convenience filter only — the real enforcement is
        // server/rules-side (applicationController.ts's applyApplication and
        // firestore.rules's studentCanReadProjectByMajor already gate this
        // for real; a student could otherwise still reach a mismatched
        // project's data directly). No major on the project means open to
        // every major, unchanged from before this field existed.
        const effectiveTrack = resolveEffectiveTrack({ degreeType: studentDegree, major: studentMajor, track: studentTrack });
        const rawProjects = snapshot.docs
          .map((d) => ({ id: d.id, ...d.data() }) as ProjectProposal)
          .filter((p) => {
            if (p.major && p.major !== studentMajor) return false;
            const types = (p as { projectTypes?: string[]; projectType?: string }).projectTypes
              ?? ((p as { projectType?: string }).projectType ? [(p as { projectType?: string }).projectType as string] : []);
            return types.length === 0 || types.includes(effectiveTrack);
          });

        const supervisorIds = [...new Set(rawProjects.filter((p) => p.supervisorId && !p.supervisorName).map((p) => p.supervisorId))];

        const nameMap: Record<string, string> = {};
        if (supervisorIds.length > 0) {
          const supervisorDocs = await Promise.all(supervisorIds.map((uid) => getDoc(doc(db, 'users', uid))));
          supervisorDocs.forEach((snap) => {
            if (snap.exists()) {
              const data = snap.data();
              nameMap[snap.id] = data?.displayName || data?.displayNameHe || '';
            }
          });
        }

        setProposals(rawProjects.map((p) => ({ ...p, supervisorName: p.supervisorName || nameMap[p.supervisorId] || '' })));
      },
      (err) => {
        if ((err as { code?: string }).code === 'permission-denied') return;
        console.error('Proposals snapshot error:', err);
      }
    );

    unsubProposals.current = unsub;
    return () => cancel(unsubProposals);
  }, [studentState, studentFaculty, studentDegree, studentMajor, studentTrack]);

  // ── EFFECT 3: user-doc listener (watches hasActiveProject flag) ───────────
  useEffect(() => {
    cancel(unsubUserDoc);
    // Read the uid from AuthContext's reactive firebaseUser, not a
    // one-time auth.currentUser lookup — this effect previously only ran
    // once on mount (its only dependency, fetchDashboardData, never
    // changes), so if auth.currentUser was still null at that instant
    // (mid hard-reload, before Firebase finished restoring the session)
    // this listener would silently never attach for the rest of the
    // component's life. Depending on firebaseUser makes it re-run once
    // the session resolves.
    const uid = firebaseUser?.uid;
    if (!uid) return;

    const unsub = onSnapshot(
      doc(db, 'users', uid),
      (snap) => {
        if (!snap.exists()) return;
        const data = snap.data();
        if (data?.hasActiveProject && data?.activeProjectId) {
          fetchDashboardData();
        }
      },
      (err) => {
        if ((err as { code?: string }).code === 'permission-denied') return;
        console.error('User doc snapshot error:', err);
      }
    );

    unsubUserDoc.current = unsub;
    return () => cancel(unsubUserDoc);
  }, [firebaseUser, fetchDashboardData]);

  // ── EFFECT 4: live milestones listener (only when active project(s) loaded) ──
  // One listener covering every active project at once (studentIds
  // array-contains, no projectId filter), grouped back out by projectId
  // below — simpler than juggling one onSnapshot per project, and works
  // identically whether the student has 1 or 2 active projects.
  const activeProjectIdsKey = activeProjects.map((ap) => ap.project.id).sort().join(',');
  useEffect(() => {
    cancel(unsubMilestones);
    if (studentState !== 'active' || !activeProjectIdsKey) return;
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    const q = query(collection(db, 'milestones'), where('studentIds', 'array-contains', uid));

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const liveMilestones = snapshot.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            projectId: data.projectId,
            type: data.type,
            order: data.order,
            status: data.status,
            dueDate: data.dueDate?.toDate?.()?.toISOString() ?? null,
            submittedAt: data.submittedAt?.toDate?.()?.toISOString() ?? null,
            fileUrls: data.fileUrls ?? [],
            finalGrade: data.finalGrade ?? null,
            supervisorScore: data.supervisorScore ?? null,
            defenseDate: data.defenseDate?.toDate?.()?.toISOString() ?? null,
            defenseRoom: data.defenseRoom ?? null,
            defenseBuilding: data.defenseBuilding ?? null,
            defenseTime: data.defenseTime ?? null,
            examinerNames: data.examinerNames ?? [],
            examinerIds: data.examinerIds ?? [],
          } as Milestone & { projectId: string };
        });

        setActiveProjects((prev) =>
          prev.map((ap) => ({
            ...ap,
            milestones: liveMilestones
              .filter((m) => m.projectId === ap.project.id)
              .sort((a, b) => resolveMilestoneOrder(a) - resolveMilestoneOrder(b)),
          }))
        );
      },
      (err) => {
        if ((err as { code?: string }).code === 'permission-denied') return;
        console.error('Milestones snapshot error:', err);
      }
    );

    unsubMilestones.current = unsub;
    return () => cancel(unsubMilestones);
  }, [studentState, activeProjectIdsKey]);

  const withDerived = (milestones: Milestone[]) => ({
    nextMilestone:
      milestones.find((m) => m.status === 'submitted' || m.status === 'supervisor_graded') ?? milestones.find((m) => m.status === 'pending') ?? null,
    progress:
      milestones.length > 0
        ? Math.round((milestones.filter((m) => m.status === 'coordinator_approved').length / milestones.length) * 100)
        : 0,
  });

  const activeProjectsWithDerived = activeProjects.map((ap) => ({ ...ap, ...withDerived(ap.milestones) }));

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
  const activeProject = activeProjectsWithDerived[0]?.project ?? null;
  const milestones = activeProjectsWithDerived[0]?.milestones ?? [];
  const nextMilestone = activeProjectsWithDerived[0]?.nextMilestone ?? null;
  const progress = activeProjectsWithDerived[0]?.progress ?? 0;

  return {
    studentState,
    studentName,
    studentYearOfStudy,
    studentCompletedCourses,
    studentDegree,
    proposals,
    activeProjects: activeProjectsWithDerived,
    activeProject,
    milestones,
    nextMilestone,
    progress,
    pendingApplications,
    supervisorSelectionRequiresApproval,
    studentTrack,
    studentTrackPolicy,
    studentTrackLocked,
    studentThesisEligible,
    chooseTrack,
    error,
    refresh: fetchDashboardData,
    cancelAllListeners,
  };
}
