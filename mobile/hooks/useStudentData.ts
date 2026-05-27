// student/hooks/useStudentData.ts
import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../src/api/apiClient';
import { collection, query, where, onSnapshot, doc, getDoc } from 'firebase/firestore';
import  { db, auth } from '../src/firebase/firebase';
// ─── Types ────────────────────────────────────────────────────────────────────
export type StudentState = 'loading' | 'no_project' | 'pending' | 'active';

export type DegreeType  = 'bachelors' | 'masters' ;
export type ProjectType = 'project' | 'thesis';

export type MilestoneStatus =
  | 'pending'
  | 'submitted'
  | 'supervisor_graded'
  | 'graded'
  | 'coordinator_approved'
  | 'completed';

export type MilestoneType =
  | 'research_proposal'
  | 'progress_report'
  | 'final_report'
  | 'defense';

export interface ProjectProposal {
  id:            string;
  titleHe:       string;
  titleEn:       string;
  descriptionHe: string;
  descriptionEn: string;
  supervisorId:  string;
  supervisorName:string;
  facultyId:     string;
  degreeType:    DegreeType;
  projectType:   ProjectType;
  NumberOfStudents:   number;
  requiredSkills:string[];
  status:        string;
  academicYear:  string;
  projectFileUrl: string | null; 
}

export interface ActiveProject {
  id:            string;
  titleHe:       string;
  titleEn:       string;
  descriptionHe: string;  // ← was missing
  descriptionEn: string;  // ← was missing
  supervisorId:  string;
  supervisorName:string;
  academicYear:  string;
  semesterStart: string | null;
  status:        string;
}

export interface Milestone {
  id:          string;
  type:        MilestoneType;
  status:      MilestoneStatus;
  dueDate:     string;
  submittedAt: string | null;
  fileUrls:    string[];
  finalGrade:  number | null;
  defenseDate: string | null;
  defenseRoom: string | null;
  examinerNames: string[];
  supervisorScore?: number | null;
}

export interface PendingApplication {
  id:          string;
  projectId:   string;
  projectTitleHe: string;
  projectTitleEn: string;
  submittedAt: string;
  status:      'pending' | 'meeting_requested';
}

export interface AppNotification {
  id:        string;
  titleHe:   string;
  titleEn:   string;
  bodyHe:    string;
  bodyEn:    string;
  isRead:    boolean;
  createdAt: string;
  relatedProjectId: string | null;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useStudentData() {
  const [studentState,       setStudentState]       = useState<StudentState>('loading');
  const [proposals,          setProposals]          = useState<ProjectProposal[]>([]);
  const [activeProject,      setActiveProject]      = useState<ActiveProject | null>(null);
  const [milestones,         setMilestones]         = useState<Milestone[]>([]);
  const [pendingApplication, setPendingApplication] = useState<PendingApplication | null>(null);
  const [notifications,      setNotifications]      = useState<AppNotification[]>([]);
  const [unreadCount,        setUnreadCount]        = useState(0);
  const [studentName,        setStudentName]        = useState('');
  const [studentDegree,      setStudentDegree]      = useState<DegreeType>('bachelors');
  
  // NEW: Store faculty so the listener can use it
  const [studentFaculty,     setStudentFaculty]     = useState(''); 
  const [error,              setError]              = useState<string | null>(null);

  const fetchDashboardData = useCallback(async () => {
    try {
      setStudentState('loading');
      setError(null);

      // 1. Fetch User Profile to determine state
      const profileRes = await apiClient.get('/api/users/profile');
      const userData = profileRes.data; 
      
      const uid = userData.id || userData.uid;
      const degree = userData.degreeType || 'bachelors';
      
      setStudentName(userData.displayName || '');
      setStudentDegree(degree);
      setStudentFaculty(userData.facultyId || ''); // Save faculty to state
      // 2. Route based on User Data State
      if (userData.hasActiveProject && userData.activeProjectId) {
        // --- CASE A: Active Project ---
        try {
          console.log('🔍 Fetching active project:', userData.activeProjectId);
          const projectRes = await apiClient.get(`/api/student/projects/${userData.activeProjectId}`);
          console.log('✅ Project response:', JSON.stringify(projectRes.data));
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
          console.error("Failed to load active project:", e);
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
          // --- CASE C: Browsing Proposals ---
          // OPTIMIZATION: We deleted the apiClient fetch here! 
          // Setting state to 'no_project' will automatically trigger the onSnapshot useEffect below.
          setStudentState('no_project');
        }
      }

      // 3. Always fetch notifications
      try {
        const notifRes = await apiClient.get('/api/notifications/inbox');
        const items: AppNotification[] = notifRes.data?.notifications || [];
        setNotifications(items);
        setUnreadCount(items.filter((n) => !n.isRead).length);
      } catch (e) {
        console.error("Failed to fetch notifications:", e);
      }

    } catch (err: any) {
      console.error("Student Dashboard Fetch Error:", err);
      setError(err.message || "Failed to load dashboard data.");
      setStudentState('no_project'); 
    }
  }, []);

  // EFFECT 1: Run once on mount to fetch the profile and decide where the user belongs
  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);  

  // EFFECT 2: The Live Listener (Only runs if they are browsing proposals)
  useEffect(() => {
    if (studentState !== 'no_project' || !studentFaculty || !studentDegree) return;

    const q = query(
      collection(db, 'projects'),
      where('status', '==', 'active'),
      where('facultyId', '==', studentFaculty),
      where('degreeType', '==', studentDegree)
    );

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const rawProjects = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as ProjectProposal[];

      // Get unique supervisor IDs that don't already have a name on the project
      const supervisorIds = [...new Set(
        rawProjects
          .filter(p => p.supervisorId && !p.supervisorName)
          .map(p => p.supervisorId)
      )];

      // Fetch supervisor names in parallel
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

      // Merge names into projects
      const projectsWithNames = rawProjects.map(p => ({
        ...p,
        supervisorName: p.supervisorName || nameMap[p.supervisorId] || '',
      }));

      setProposals(projectsWithNames);
    });

    return () => unsubscribe();
  }, [studentState, studentFaculty, studentDegree]); 

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    const userRef = doc(db, 'users', uid);
    const unsubscribe = onSnapshot(userRef, (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();

      // If hasActiveProject just became true, re-fetch everything
      if (data?.hasActiveProject && data?.activeProjectId) {
        fetchDashboardData();
      }
    });

    return () => unsubscribe();
  }, [fetchDashboardData]);

  // ── EFFECT 3: Real-Time Milestones Listener ──────────────────────────────
  useEffect(() => {
    // Only listen if the student has an active project loaded
    if (studentState !== 'active' || !activeProject?.id) return;

    const uid = auth.currentUser?.uid;
    if (!uid) return;
    
    const q = query(
      collection(db, 'milestones'),
      where('projectId', '==', activeProject.id),
      where('studentIds', 'array-contains', uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const MILESTONE_ORDER: MilestoneType[] = [
        'research_proposal',
        'progress_report',
        'final_report',
        'defense'
      ];

      const liveMilestones = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          type: data.type,
          status: data.status,
          dueDate: data.dueDate ?? null,
          submittedAt: data.submittedAt ?? null,
          fileUrls: data.fileUrls ?? [],
          finalGrade: data.finalGrade ?? null,
          supervisorScore: data.supervisorScore ?? null, // 🔥 IMPORTANT
          defenseDate: data.defenseDate ?? null,
          defenseRoom: data.defenseRoom ?? null,
          examinerNames: data.examinerNames ?? [],
        } as Milestone;
      });

      // Sort them to maintain workflow order
      const sorted = liveMilestones.sort(
        (a, b) => MILESTONE_ORDER.indexOf(a.type) - MILESTONE_ORDER.indexOf(b.type)
      );

      // Instantly updates the entire dashboard whenever a supervisor/coordinator acts!
      setMilestones(sorted);
    });

    return () => unsubscribe();
  }, [studentState, activeProject?.id]);
  // ── Derived helpers ───────────────────────────────────────────────────────
  const nextMilestone: Milestone | null =
  milestones.find(m =>
    m.status === 'submitted' || m.status === 'supervisor_graded'
  ) ??
  milestones.find(m => m.status === 'pending') ??
  null;

  const completedCount = milestones.filter((m) => m.status === 'coordinator_approved').length;
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
    unreadCount,
    studentDegree,
    error,
    refresh: fetchDashboardData,
  };
}