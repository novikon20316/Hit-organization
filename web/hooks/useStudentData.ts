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
import type { StudentState, DegreeType, ProjectProposal, ActiveProject, Milestone, PendingApplication, MilestoneType } from '@/app/student/home/types';
import { MILESTONE_ORDER } from '@/app/student/home/types';

export function useStudentData() {
  const { loading: authLoading, firebaseUser } = useAuth();
  const [studentState, setStudentState] = useState<StudentState>('loading');
  const [proposals, setProposals] = useState<ProjectProposal[]>([]);
  const [activeProject, setActiveProject] = useState<ActiveProject | null>(null);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [pendingApplications, setPendingApplications] = useState<PendingApplication[]>([]);
  const [studentName, setStudentName] = useState('');
  const [studentDegree, setStudentDegree] = useState<DegreeType>('bachelors');
  const [studentFaculty, setStudentFaculty] = useState('');
  const [studentMajor, setStudentMajor] = useState('');
  const [studentYearOfStudy, setStudentYearOfStudy] = useState<number | null>(null);
  const [studentCompletedCourses, setStudentCompletedCourses] = useState<CompletedCourse[]>([]);
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
        isEligibleForProcess?: boolean;
      };

      const uid = userData.id || userData.uid || '';
      const degree = userData.degreeType || 'bachelors';

      setStudentName(userData.displayName || '');
      setStudentDegree(degree);
      setStudentFaculty(userData.facultyId || '');
      setStudentMajor(userData.major || '');
      setStudentYearOfStudy(userData.yearOfStudy ?? null);
      setStudentCompletedCourses(normalizeCompletedCourses(userData.completedCourses));

      // TEMP-MULTI-APPLY: when true, bypasses the "already has an active
      // project" gate below so an enrolled student can still browse/apply to
      // more projects — needed to live-test the auto-close-other-applications
      // flow (projectEnrollment.ts's closeOtherPendingApplications) without a
      // second throwaway account. Say "revert the temp multi-apply bypass" to
      // undo — flip this to false, or delete it and the `&& !TEMP_ALLOW_MULTI_APPLY`
      // condition below, restoring the original block exactly as it was.
      const TEMP_ALLOW_MULTI_APPLY = true;

      if (userData.hasActiveProject && userData.activeProjectId && !TEMP_ALLOW_MULTI_APPLY) {
        try {
          const project = (await apiClient.getStudentProject(userData.activeProjectId)) as unknown as ActiveProject;
          setActiveProject(project);

          const milestonesRes = await apiClient.getMilestones({ studentId: uid });
          const sorted = (milestonesRes?.milestones || []).sort(
            (a, b) =>
              MILESTONE_ORDER.indexOf((a as unknown as Milestone).type as MilestoneType) -
              MILESTONE_ORDER.indexOf((b as unknown as Milestone).type as MilestoneType)
          );
          setMilestones(sorted as unknown as Milestone[]);
          setStudentState('active');
        } catch (e) {
          console.error('Failed to load active project:', e);
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
        setStudentState('no_project');
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
        const rawProjects = snapshot.docs
          .map((d) => ({ id: d.id, ...d.data() }) as ProjectProposal)
          .filter((p) => !p.major || p.major === studentMajor);

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
  }, [studentState, studentFaculty, studentDegree, studentMajor]);

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

  // ── EFFECT 4: live milestones listener (only when active project loaded) ──
  useEffect(() => {
    cancel(unsubMilestones);
    if (studentState !== 'active' || !activeProject?.id) return;
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    const q = query(collection(db, 'milestones'), where('projectId', '==', activeProject.id), where('studentIds', 'array-contains', uid));

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const liveMilestones = snapshot.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            type: data.type,
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
          } as Milestone;
        });

        setMilestones(liveMilestones.sort((a, b) => MILESTONE_ORDER.indexOf(a.type) - MILESTONE_ORDER.indexOf(b.type)));
      },
      (err) => {
        if ((err as { code?: string }).code === 'permission-denied') return;
        console.error('Milestones snapshot error:', err);
      }
    );

    unsubMilestones.current = unsub;
    return () => cancel(unsubMilestones);
  }, [studentState, activeProject?.id]);

  const nextMilestone: Milestone | null =
    milestones.find((m) => m.status === 'submitted' || m.status === 'supervisor_graded') ?? milestones.find((m) => m.status === 'pending') ?? null;

  const completedCount = milestones.filter((m) => m.status === 'coordinator_approved').length;
  const progress = milestones.length > 0 ? Math.round((completedCount / milestones.length) * 100) : 0;

  return {
    studentState,
    studentName,
    studentYearOfStudy,
    studentCompletedCourses,
    studentDegree,
    proposals,
    activeProject,
    milestones,
    nextMilestone,
    progress,
    pendingApplications,
    error,
    refresh: fetchDashboardData,
    cancelAllListeners,
  };
}
