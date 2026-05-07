// student/hooks/useStudentData.ts
import { useState, useEffect } from 'react';
import {
  collection, query, where, getDocs,
  doc, getDoc, onSnapshot, orderBy, Timestamp,
} from 'firebase/firestore';
import { db, auth } from '../src/firebase/firebase';

// ─── Types ────────────────────────────────────────────────────────────────────
export type StudentState = 'loading' | 'no_project' | 'pending' | 'active';

export type DegreeType  = 'bachelors' | 'masters' | 'both';
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
  semesterStart: Timestamp | null;
  status:        string;
}

export interface Milestone {
  id:          string;
  type:        MilestoneType;
  status:      MilestoneStatus;
  dueDate:     Timestamp;
  submittedAt: Timestamp | null;
  fileUrls:    string[];
  finalGrade:  number | null;
  defenseDate: Timestamp | null;
  defenseRoom: string | null;
  examinerNames: string[];
}

export interface PendingApplication {
  id:          string;
  projectId:   string;
  projectTitleHe: string;
  projectTitleEn: string;
  submittedAt: Timestamp;
  status:      'pending' | 'meeting_requested';
}

export interface AppNotification {
  id:        string;
  titleHe:   string;
  titleEn:   string;
  bodyHe:    string;
  bodyEn:    string;
  isRead:    boolean;
  createdAt: Timestamp;
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
  const [error,              setError]              = useState<string | null>(null);

  const uid = auth.currentUser?.uid;

  // ── 1. Determine student state ─────────────────────────────────────────────
  useEffect(() => {
    if (!uid) return;

    const init = async () => {
      try {
        // Fetch student profile
        const userSnap = await getDoc(doc(db, 'users', uid));
        if (userSnap.exists()) {
          const data = userSnap.data();
          setStudentName(data.displayName || data.email || '');
        }

        // Check for active project (enrolled)
        const projectsQ = query(
          collection(db, 'projects'),
          where('enrolledStudentIds', 'array-contains', uid),
          where('isArchived', '==', false)
        );
        const projectsSnap = await getDocs(projectsQ);

        if (!projectsSnap.empty) {
          // Student has an active project
          const projData = projectsSnap.docs[0].data();
          const supervisorSnap = await getDoc(doc(db, 'users', projData.supervisorId));
          const supervisorName = supervisorSnap.exists()
            ? supervisorSnap.data().displayName
            : projData.supervisorId;

          setActiveProject({
            id:            projectsSnap.docs[0].id,
            titleHe:       projData.titleHe,
            titleEn:       projData.titleEn,
            descriptionHe: projData.descriptionHe,
            descriptionEn: projData.descriptionEn,
            supervisorId:  projData.supervisorId,
            supervisorName,
            academicYear:  projData.academicYear,
            semesterStart: projData.semesterStart ?? null,
            status:        projData.status,
          });

          setStudentState('active');
          return;
        }

        // Check for pending application
        const appsQ = query(
          collection(db, 'applications'),
          where('studentId', '==', uid),
          where('status', 'in', ['pending', 'meeting_requested'])
        );
        const appsSnap = await getDocs(appsQ);

        if (!appsSnap.empty) {
          const appData = appsSnap.docs[0].data();
          const projSnap = await getDoc(doc(db, 'projects', appData.projectId));
          const projData = projSnap.exists() ? projSnap.data() : null;

          setPendingApplication({
            id:              appsSnap.docs[0].id,
            projectId:       appData.projectId,
            projectTitleHe:  projData?.titleHe ?? '',
            projectTitleEn:  projData?.titleEn ?? '',
            submittedAt:     appData.submittedAt,
            status:          appData.status,
          });

          setStudentState('pending');
          return;
        }

        // No project, no application → show browse
        setStudentState('no_project');

      } catch (e) {
        console.error('useStudentData init error:', e);
        setError('Failed to load student data');
        setStudentState('no_project');
      }
    };

    init();
  }, [uid]);

  // ── 2. Load milestones when active ────────────────────────────────────────
  useEffect(() => {
    if (studentState !== 'active' || !activeProject) return;

    const milestonesQ = query(
      collection(db, 'milestones'),
      where('projectId', '==', activeProject.id),
      orderBy('dueDate', 'asc')
    );

    const unsub = onSnapshot(milestonesQ, async (snap) => {
      const items: Milestone[] = [];
      for (const d of snap.docs) {
        const data = d.data();
        // Fetch examiner names for defense milestone
        let examinerNames: string[] = [];
        if (data.type === 'defense' && data.examinerIds?.length) {
          for (const eid of data.examinerIds) {
            const eSnap = await getDoc(doc(db, 'users', eid));
            if (eSnap.exists()) examinerNames.push(eSnap.data().displayName);
          }
        }
        items.push({
          id:           d.id,
          type:         data.type,
          status:       data.status,
          dueDate:      data.dueDate,
          submittedAt:  data.submittedAt ?? null,
          fileUrls:     data.fileUrls ?? [],
          finalGrade:   data.finalGrade ?? null,
          defenseDate:  data.defenseDate ?? null,
          defenseRoom:  data.defenseRoom ?? null,
          examinerNames,
        });
      }
      setMilestones(items);
    });

    return () => unsub();
  }, [studentState, activeProject]);

  // ── 3. Load published proposals when browsing ─────────────────────────────
  useEffect(() => {
    if (studentState !== 'no_project') return;

    const proposalsQ = query(
      collection(db, 'projects'),
      where('status', '==', 'published'),
      where('isArchived', '==', false),
      orderBy('createdAt', 'desc')
    );

    const unsub = onSnapshot(proposalsQ, async (snap) => {
      const items: ProjectProposal[] = [];
      for (const d of snap.docs) {
        const data = d.data();
        const supervisorSnap = await getDoc(doc(db, 'users', data.supervisorId));
        const supervisorName = supervisorSnap.exists()
          ? supervisorSnap.data().displayName
          : '';
        items.push({
          id:             d.id,
          titleHe:        data.titleHe,
          titleEn:        data.titleEn,
          descriptionHe:  data.descriptionHe,
          descriptionEn:  data.descriptionEn,
          supervisorId:   data.supervisorId,
          supervisorName,
          facultyId:      data.facultyId,
          degreeType:     data.degreeType,
          projectType:    data.projectType,
          maxStudents:    data.maxStudents,
          requiredSkills: data.requiredSkills ?? [],
          status:         data.status,
          academicYear:   data.academicYear,
        });
      }
      setProposals(items);
    });

    return () => unsub();
  }, [studentState]);

  // ── 4. Live notifications ─────────────────────────────────────────────────
  useEffect(() => {
    if (!uid) return;

    const notifQ = query(
      collection(db, 'notifications'),
      where('recipientId', '==', uid),
      orderBy('createdAt', 'desc')
    );

    const unsub = onSnapshot(notifQ, (snap) => {
      const items: AppNotification[] = snap.docs.map((d) => ({
        id:               d.id,
        titleHe:          d.data().titleHe,
        titleEn:          d.data().titleEn,
        bodyHe:           d.data().bodyHe,
        bodyEn:           d.data().bodyEn,
        isRead:           d.data().isRead,
        createdAt:        d.data().createdAt,
        relatedProjectId: d.data().relatedProjectId ?? null,
      }));
      setNotifications(items);
      setUnreadCount(items.filter((n) => !n.isRead).length);
    });

    return () => unsub();
  }, [uid]);

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
    error,
    // Allow external refresh
    refresh: () => setStudentState('loading'),
  };
}