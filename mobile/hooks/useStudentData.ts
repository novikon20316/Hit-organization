// student/hooks/useStudentData.ts
import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../src/api/apiClient';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import  { db } from '../src/firebase/firebase';
// ─── Types ────────────────────────────────────────────────────────────────────
export type StudentState = 'loading' | 'no_project' | 'pending' | 'active';

export type DegreeType  = 'bachelors' | 'masters' ;
export type ProjectType = 'project' | 'thesis';

export type MilestoneStatus =
  | 'pending'
  | 'submitted'
  | 'supervisor_graded'
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
  maxStudents:   number;
  requiredSkills:string[];
  status:        string;
  academicYear:  string;
}

export interface ActiveProject {
  id:            string;
  titleHe:       string;
  titleEn:       string;
  descriptionHe: string;
  descriptionEn: string;
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
          const projectRes = await apiClient.get(`/api/student/projects/${userData.activeProjectId}`);
          setActiveProject(projectRes.data);
          
          const milestonesRes = await apiClient.getMilestones({ studentId: uid });
          setMilestones(milestonesRes?.milestones || []);
          
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
    // Wait until we are sure they don't have a project AND we know their faculty/degree
    if (studentState !== 'no_project' || !studentFaculty || !studentDegree) return;

    const q = query(
      collection(db, 'projects'),
      where('status', '==', 'published'),
      where('facultyId', '==', studentFaculty), // Now uses actual facultyId
      where('degreeType', '==', studentDegree)
    );

    // Opens a live connection to Firestore
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const liveProjects = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as ProjectProposal[];
      
      setProposals(liveProjects);
    });

    // Close listener when screen unmounts or state changes
    return () => unsubscribe(); 
  }, [studentState, studentFaculty, studentDegree]);  

  // ── Derived helpers ───────────────────────────────────────────────────────
  const nextMilestone = milestones.find(
    (m) => m.status === 'pending' || m.status === 'submitted'
  ) ?? null;

  const completedCount = milestones.filter((m) => m.status === 'completed').length;
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