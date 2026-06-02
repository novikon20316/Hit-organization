// student/hooks/useStudentData.ts
import { useState, useEffect, useCallback, useRef } from 'react';
import { apiClient } from '../src/api/apiClient';
import { collection, query, where, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { db, auth } from '../src/firebase/firebase';
import {
  StudentState, DegreeType, ProjectType, MilestoneStatus,
  MilestoneType, ProjectProposal, ActiveProject, Milestone,
  PendingApplication, AppNotification
} from '@/types';

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useStudentData() {
  const [studentState,       setStudentState]       = useState<StudentState>('loading');
  const [proposals,          setProposals]          = useState<ProjectProposal[]>([]);
  const [activeProject,      setActiveProject]      = useState<ActiveProject | null>(null);
  const [milestones,         setMilestones]         = useState<Milestone[]>([]);
  const [pendingApplication, setPendingApplication] = useState<PendingApplication | null>(null);
  const [notifications,      setNotifications]      = useState<AppNotification[]>([]);
  const [studentName,        setStudentName]        = useState('');
  const [studentDegree,      setStudentDegree]      = useState<DegreeType>('bachelors');
  const [studentFaculty,     setStudentFaculty]     = useState('');
  const [error,              setError]              = useState<string | null>(null);

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

      if (userData.hasActiveProject && userData.activeProjectId) {
        // --- CASE A: Active Project ---
        try {
          const projectRes = await apiClient.get(`/api/student/projects/${userData.activeProjectId}`);
          setActiveProject(projectRes.data);

          const MILESTONE_ORDER = ['research_proposal', 'progress_report', 'final_report', 'defense'];
          const milestonesRes = await apiClient.getMilestones({ studentId: uid });
          const sorted = (milestonesRes?.milestones || []).sort(
            (a: Milestone, b: Milestone) =>
              MILESTONE_ORDER.indexOf(a.type) - MILESTONE_ORDER.indexOf(b.type)
          );
          setMilestones(sorted);
          setStudentState('active');
        } catch (e) {
          console.error('Failed to load active project:', e);
          setStudentState('no_project');
        }
      } else {
        // --- CASE B: Check for Pending Applications ---
        const appsRes = await apiClient.get('/api/applications/pending');
        const pendingApps = appsRes.data?.applications || [];

        if (pendingApps.length > 0) {
          setPendingApplication(pendingApps[0]);
          setStudentState('pending');
        } else {
          // --- CASE C: Browsing Proposals (triggers the snapshot effect below) ---
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

    const q = query(
      collection(db, 'projects'),
      where('status', '==', 'active'),
      where('facultyId', '==', studentFaculty),
      where('degreeType', '==', studentDegree)
    );

    const unsub = onSnapshot(
      q,
      async (snapshot) => {
        const rawProjects = snapshot.docs.map(d => ({
          id: d.id,
          ...d.data()
        })) as ProjectProposal[];

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
  }, [studentState, studentFaculty, studentDegree]);

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

  // ── EFFECT 4: Live milestones listener (only when active project loaded) ──
  useEffect(() => {
    cancel(unsubMilestones);

    if (studentState !== 'active' || !activeProject?.id) return;

    const uid = auth.currentUser?.uid;
    if (!uid) return;

    const q = query(
      collection(db, 'milestones'),
      where('projectId', '==', activeProject.id),
      where('studentIds', 'array-contains', uid)
    );

    const MILESTONE_ORDER: MilestoneType[] = [
      'research_proposal',
      'progress_report',
      'final_report',
      'defense',
    ];

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const liveMilestones = snapshot.docs.map(d => {
          const data = d.data();
          return {
            id: d.id,
            type: data.type,
            status: data.status,
            dueDate:        data.dueDate?.toDate?.()?.toISOString()     ?? null,
            submittedAt:    data.submittedAt?.toDate?.()?.toISOString() ?? null,
            fileUrls:       data.fileUrls        ?? [],
            finalGrade:     data.finalGrade      ?? null,
            supervisorScore:data.supervisorScore ?? null,
            defenseDate:    data.defenseDate?.toDate?.()?.toISOString() ?? null,
            defenseRoom:    data.defenseRoom     ?? null,
            examinerNames:  data.examinerNames   ?? [],
          } as Milestone;
        });

        setMilestones(
          liveMilestones.sort(
            (a, b) => MILESTONE_ORDER.indexOf(a.type) - MILESTONE_ORDER.indexOf(b.type)
          )
        );
      },
      (error) => {
        if (error.code === 'permission-denied') return;
        console.error('Milestones snapshot error:', error);
      }
    );

    unsubMilestones.current = unsub;

    return () => cancel(unsubMilestones);
  }, [studentState, activeProject?.id]);

  // ── Derived helpers ───────────────────────────────────────────────────────
  const nextMilestone: Milestone | null =
    milestones.find(m => m.status === 'submitted' || m.status === 'supervisor_graded') ??
    milestones.find(m => m.status === 'pending') ??
    null;

  const completedCount = milestones.filter(m => m.status === 'coordinator_approved').length;
  const progress = milestones.length > 0
    ? Math.round((completedCount / milestones.length) * 100)
    : 0;

  return {
    studentState,
    studentName,
    proposals,
    activeProject,
    milestones,
    nextMilestone,
    progress,
    pendingApplication,
    notifications,
    studentDegree,
    error,
    refresh: fetchDashboardData,
    cancelAllListeners, // ← export so home.tsx can call it on logout
  };
}