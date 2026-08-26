// app/supervisor/home.tsx
import React, { useState, useEffect, useRef, useMemo } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import {
  View, Text, ScrollView, Pressable,
  ActivityIndicator, Modal, TextInput, Alert, Linking,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context'
import { apiClient } from '@/src/api/apiClient';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { tx, type Lang } from '../../components/i18n';
import { TopBar, StatCard, FacultyBadge, StatusBadge, getFacultyColor, FACULTY_COLORS } from '../../components/shared';
import { sharedStyles } from '@/constants';
import { SupervisorExtraStyles } from '../../constants/styles';
import { NewProjectModal, RecommendedExaminerModal } from '@/components/modals';
import ProjectWorkflowSection from '@/components/ProjectWorkflowSection';
import type { PrerequisiteSpec } from '@/components/Prerequisites';
import { AppUser, MyProject, Application } from '@/types'
import { getProgramByKey } from '../../constants/faculties';
import { PendingSignoffsWidget } from '@/components/PendingSignoffsWidget';
import { milestonePalette } from '@/constants/milestoneTheme';

// Derives a human-readable file name from a Cloudinary/Storage URL for the
// grading-queue "Submitted Files" chips — same approach as web's
// components/MilestoneTimeline.tsx fileNameFromUrl / mobile's own
// components/MilestoneRoadmap.tsx, ported locally since this screen's
// pending-grades list predates that shared component.
function fileNameFromUrl(url: string, index: number, lang: 'he' | 'en'): string {
  try {
    const path = decodeURIComponent(new URL(url).pathname);
    const last = path.split('/').filter(Boolean).pop();
    if (last) return last;
  } catch {
    // fall through to generic label below
  }
  return lang === 'he' ? `קובץ ${index + 1}` : `File ${index + 1}`;
}

// ── Firebase ──────────────────────────────────────────────────────────────────
// Adjust this import path to match your firebase config file location
import { db } from '@/src/firebase/firebase';
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  getDoc,
} from 'firebase/firestore';

// Label for the reviewedAt date, tailored to which decision it records.
const REVIEWED_LABEL: Record<string, { he: string; en: string }> = {
  approved: { he: 'אושר בתאריך:', en: 'Approved:' },
  rejected: { he: 'נדחה בתאריך:', en: 'Rejected:' },
  meeting_requested: { he: 'פגישה נקבעה בתאריך:', en: 'Meeting requested:' },
};

// Due-date urgency border color for a project card — green: more than a
// week left, orange: 1-7 days left, red: due today or already past due.
// Matches the thresholds the server computes for currentMilestone.urgency.
const URGENCY_COLOR: Record<'green' | 'orange' | 'red', string> = {
  green: '#3F6B4C',
  orange: '#B8862E',
  red: '#A8433A',
};

// ─── Types ────────────────────────────────────────────────────────────────────

// Mirrors GradingComponentSpec in server/src/services/workflowTemplates.ts.
interface GradingComponentSpec {
  key: string; labelHe: string; labelEn: string;
  maxScore: number; weight: number; hasComment: boolean; visibleToStudent: boolean;
}

interface PendingMilestone {
  id: string; projectId: string; projectTitleHe: string; projectTitleEn: string;
  type: string; status: string; studentNames: string[]; studentIds: string[]; dueDate: any; submittedAt: any;
  fileUrls: string[]; submissionNote: string; facultyId: string;
  // Per-milestone configured grading rubric — empty means the grading modal
  // falls back to the hardcoded default rubric below.
  gradingComponents?: GradingComponentSpec[];
}

interface Examiner {
  type: 'internal' | 'external';
  internalUserId?: string;
  name: string;
  email: string;
  institution: string;
  expertise: string;
  priority: 1 | 2 | 3;
  notes: string;
}

// ─── Milestone type labels ────────────────────────────────────────────────────
const MILESTONE_LABEL: Record<string, { he: string; en: string }> = {
  research_proposal: { he: 'הצעת מחקר',    en: 'Research Proposal' },
  progress_report:   { he: 'דו"ח התקדמות', en: 'Progress Report'   },
  final_report:      { he: 'דו"ח מסכם',    en: 'Final Report'      },
  defense:           { he: 'הגנה',          en: 'Defense'           },
  poster:            { he: 'פוסטר',        en: 'Poster Session'    },
};

// ─── Grading rubric ───────────────────────────────────────────────────────────
// A unified {key, max, weight, he, en} shape covers both this hardcoded
// legacy rubric and a milestone's configured gradingComponents — for the
// legacy rubric, weight === max, which makes the shared weighted-total
// formula ((score/max)*weight) collapse to a plain sum, exactly matching
// today's behavior. See server/src/services/milestoneRouting.ts's
// computeGradingComponentsScore for the server-side twin of this formula,
// and web/app/supervisor/dashboard/GradeMilestoneModal.tsx for the same
// pattern there.
interface ActiveGradingField { key: string; max: number; weight: number; he: string; en: string }

const DEFAULT_GRADING_FIELDS: ActiveGradingField[] = [
  { key: 'clarity',     max: 20, weight: 20, he: 'בהירות המחקר (0–20)', en: 'Research Clarity (0–20)' },
  { key: 'methodology', max: 25, weight: 25, he: 'מתודולוגיה (0–25)',   en: 'Methodology (0–25)'      },
  { key: 'feasibility', max: 20, weight: 20, he: 'ישימות (0–20)',       en: 'Feasibility (0–20)'      },
  { key: 'innovation',  max: 15, weight: 15, he: 'חדשנות (0–15)',       en: 'Innovation (0–15)'       },
  { key: 'writing',     max: 20, weight: 20, he: 'כתיבה (0–20)',        en: 'Writing Quality (0–20)'  },
];

function activeGradingFields(m: PendingMilestone | null): ActiveGradingField[] {
  if (m?.gradingComponents?.length) {
    return m.gradingComponents.map((c) => ({
      key: c.key, max: c.maxScore, weight: c.weight,
      he: `${c.labelHe} (0–${c.maxScore})`, en: `${c.labelEn} (0–${c.maxScore})`,
    }));
  }
  return DEFAULT_GRADING_FIELDS;
}

// Clamps to [0, max] on every keystroke — mirrors web's identical
// GradeMilestoneModal.tsx helper — so a supervisor can never type/leave a
// criterion above its configured max.
function clampScoreInput(raw: string, max: number): string {
  if (raw === '') return raw;
  const n = Number(raw);
  if (!Number.isFinite(n)) return raw;
  return String(Math.min(Math.max(n, 0), max));
}

export default function SupervisorHome() {
  const router = useRouter();
  const [lang, setLang] = useState<Lang>('he');
  const isRtl = lang === 'he';
  // projectFile holds the hosted Cloudinary URL once pickFile's upload
  // resolves — never the raw local device URI (see pickFile's own comment
  // for why that was the bug: a project's info PDF was silently discarded).
  const [projectFile, setProjectFile] = useState<string | null>(null);
  const [projectName, setProjectName] = useState<string | null>(null);
  const [uploadingProjectFile, setUploadingProjectFile] = useState(false);
  // Separate from projectFile/projectName above so opening the Edit modal
  // never shows leftover state from a previous New Project session (or
  // vice versa) — the two modals used to share one pair of state variables.
  const [editProjectFile, setEditProjectFile] = useState<string | null>(null);
  const [editProjectFileName, setEditProjectFileName] = useState<string | null>(null);
  const [myProjects,     setMyProjects]     = useState<MyProject[]>([]);
  const [applications,   setApplications]   = useState<Application[]>([]);
  const [pendingGrades,  setPendingGrades]  = useState<PendingMilestone[]>([]);
  const [supervisorName, setSupervisorName] = useState('');
  const [facultyId,      setFacultyId]      = useState('');
  const [supervisorId,   setSupervisorId]   = useState('');  
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const [loading,        setLoading]        = useState(true);
  // 'projects' listed last — this tab bar's ScrollView doesn't mirror for
  // RTL (no isRtl row-reverse, unlike the rest of this file's rows), so the
  // last array item is what ends up rightmost/last-scrolled-to.
  //
  // Lets a notification's "Go to dashboard" deep-link land on a specific tab
  // (?tab=...) instead of always opening on Projects — same convention the
  // web dashboard already supports.
  type SupervisorTab = 'applications' | 'grading' | 'recommend' | 'signoffs' | 'projects';
  const SUPERVISOR_TABS: SupervisorTab[] = ['applications', 'grading', 'recommend', 'signoffs', 'projects'];
  const { tab: tabParam } = useLocalSearchParams<{ tab?: string }>();
  const [activeTab,      setActiveTab]      = useState<SupervisorTab>(
    SUPERVISOR_TABS.includes(tabParam as SupervisorTab) ? (tabParam as SupervisorTab) : 'projects'
  );
  const [applicationFilter, setApplicationFilter] = useState<'all' | 'applied' | 'approved' | 'meeting_requested' | 'rejected'>('all');
  const [projectFilter, setProjectFilter] = useState<'all' | 'active' | 'offered'>('all');
  const [unreadCount,    setUnreadCount]    = useState(0);
  const [submitting,     setSubmitting]     = useState(false);

  // ── New project modal ─────────────────────────────────────────────────────
  const [selectedProgram, setSelectedProgram] = React.useState<string | null>(null);
  // This supervisor's own majors restriction (assignedMajors, set by
  // system_admin) — empty means unrestricted (every major of their
  // faculty). Fetched from their own profile alongside the dashboard data.
  const [supervisorAssignedMajors, setSupervisorAssignedMajors] = useState<string[]>([]);
  const [showNewProject, setShowNewProject] = useState(false);
  const [newTitleHe,  setNewTitleHe]  = useState('');
  const [newTitleEn,  setNewTitleEn]  = useState('');
  const [newDescHe,   setNewDescHe]   = useState('');
  const [newDescEn,   setNewDescEn]   = useState('');
  const [newDegreeTypes, setNewDegreeTypes] = useState<('bachelors' | 'masters')[]>(['bachelors']);
  const [newProjectTypes, setNewProjectTypes] = useState<('project' | 'thesis')[]>(['project']);
  const [newSkills,   setNewSkills]   = useState('');
  const [newPrerequisites, setNewPrerequisites] = useState<PrerequisiteSpec[]>([]);
  const [creating,    setCreating]    = useState(false);
  const [maxStudents, setMaxStudents] = useState<number>(1);
  // ── Grade modal ───────────────────────────────────────────────────────────
  const [gradeModal,      setGradeModal]      = useState(false);
  const [gradeMilestone,  setGradeMilestone]  = useState<PendingMilestone | null>(null);
  const [activeMilestone, setActiveMilestone] = useState<any | null>(null);
  const [expandedCards,   setExpandedCards]   = useState<Record<string, boolean>>({});
  const [criteria, setCriteria] = useState<Record<string, string>>({
    clarity: '', methodology: '', feasibility: '', innovation: '', writing: '',
  });
  const [gradeComment, setGradeComment] = useState('');
  // Group projects only: per-student personal component (e.g. individual oral-exam
  // impression), entered alongside the shared group score — keyed by studentId.
  const [individualScores, setIndividualScores] = useState<Record<string, string>>({});

  // ── Edit project modal ────────────────────────────────────────────────────
  const [projectModal,    setProjectModal]    = useState(false);
  const [saving,          setSaving]          = useState(false);
  const [editFaculty,     setEditFaculty]     = useState('');
  const [editProject,     setEditProject]     = useState<MyProject | null>(null);
  const [editDegree,      setEditDegree]      = useState<'bachelors' | 'masters' | ''>('');
  const [editProjectType, setEditProjectType] = useState<'project' | 'thesis'>('project');
  const [editTitleHe,     setEditTitleHe]     = useState('');
  const [editTitleEn,     setEditTitleEn]     = useState('');
  const [editDescHe,      setEditDescHe]      = useState('');
  const [editDescEn,      setEditDescEn]      = useState('');
  const [editSkills,      setEditSkills]      = useState('');
  // ── Recommend examiners modal ─────────────────────────────────────────────
  const [recommendModal, setRecommendModal]   = useState(false);
  const [selectedProjectForRec, setSelectedProjectForRec] = useState<MyProject | null>(null);
  const [recExaminers, setRecExaminers]       = useState<[] | Examiner[]>([]);
  const [extName,        setExtName]        = useState('');
  const [extEmail,       setExtEmail]       = useState('');
  const [extInstitution, setExtInstitution] = useState('');
  const [extExpertise,   setExtExpertise]   = useState('');
  const [internalUsers, setInternalUsers]     = useState<AppUser[]>([]);
  const [recSubmitting, setRecSubmitting]     = useState(false);
  const [recommendations, setRecommendations] = useState<any[]>([]);
  // ── Firestore unsubscribe refs (cleanup on unmount) ───────────────────────
  const unsubNotificationsRef = useRef<(() => void) | null>(null);
  const unsubApplicationsRef  = useRef<(() => void) | null>(null);
  const unsubProjectsRef      = useRef<(() => void) | null>(null);
  const unsubGradingRef = useRef<(() => void) | null>(null);
  const toggleCardExpansion = (milestoneId: string) => {
    setExpandedCards((prev) => ({ ...prev, [milestoneId]: !prev[milestoneId] }));
  };

  const activeFields = activeGradingFields(gradeMilestone);
  const totalScore = Math.round(
    activeFields.reduce((sum, f) => sum + ((Number(criteria[f.key]) || 0) / f.max) * f.weight, 0)
  );

  // ── Fetch dashboard (projects + grading stay on API) ─────────────────────
  const fetchDashboardData = async () => {
    try {
      const res = await apiClient.get('/api/supervisor/dashboard');
      setSupervisorName(res.data.supervisorName);
      setFacultyId(res.data.facultyId);
      setSupervisorId(res.data.supervisorId);
      setCurrentUser({
        id:          res.data.supervisorId,
        displayName: res.data.supervisorName,
        facultyId:   res.data.facultyId,
        role:        res.data.role  ?? 'supervisor',
        roles:       res.data.roles ?? ['supervisor'],
      });
      setMyProjects(res.data.myProjects ?? []);
      setPendingGrades(res.data.pendingGrades ?? []);
      // Only use API applications as fallback if Firestore listener isn't up yet
      if (!unsubApplicationsRef.current) {
        setApplications(res.data.applications ?? []);
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to load dashboard data.');
    }try {
      const recRes = await apiClient.get('/api/supervisor/examiner-recommendations');
      setRecommendations(recRes.data.recommendations ?? []);
    } catch (_) { /* non-fatal */ }
    try {
      // Own profile doc — carries assignedMajors when system_admin has
      // restricted this supervisor to specific majors (see NewUserModal /
      // EditUserModal). Not returned by /api/supervisor/dashboard itself.
      const profileRes = await apiClient.get('/api/users/profile');
      setSupervisorAssignedMajors(profileRes.data?.assignedMajors ?? []);
    } catch (_) { /* non-fatal */ }
     finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
    // Cleanup Firestore listeners when component unmounts
    return () => {
      unsubNotificationsRef.current?.();
      unsubApplicationsRef.current?.();
      unsubProjectsRef.current?.();
      unsubGradingRef.current?.();
    };
  }, []);

  useEffect(() => {
    if (!supervisorId) return;
    apiClient.get('/api/examiner/get-list')
      .then(res => setInternalUsers(res.data ?? []))
      .catch(() => {});
  }, [supervisorId]);


  // ── Firestore: real-time notifications unread count ───────────────────────
  // Starts listening once we have the supervisorId from the API response
  useEffect(() => {
    if (!supervisorId) return;

    // Unsubscribe any previous listener
    unsubNotificationsRef.current?.();

    // ─────────────────────────────────────────────────────────────────────────
    // Adjust the collection name and field names below to match YOUR Firestore
    // structure. This assumes a top-level "notifications" collection with:
    //   - recipientId: string  (the supervisor's user ID)
    //   - read: boolean
    // ─────────────────────────────────────────────────────────────────────────
    const notifQuery = query(
      collection(db, 'notifications'),
      where('recipientId', '==', supervisorId),
      where('read', '==', false),
    );

    unsubNotificationsRef.current = onSnapshot(
      notifQuery,
      (snapshot) => {
        setUnreadCount(snapshot.size);
      },
      (error) => {
        console.warn('Notifications listener error:', error);
      },
    );
  }, [supervisorId]);


  // ── Firestore: real-time projects listener ────────────────────────────────
  // CRITICAL FIX: this used to query `supervisorId == uid` only, so a
  // secondary_supervisor's entire dashboard (projects, applications, grading
  // below) was permanently empty — none of those collections ever get
  // filtered by secondarySupervisorId in Firestore rules or elsewhere, only
  // the project doc itself carries that field. Two listeners now (primary +
  // secondary), merged and deduped by id.
  useEffect(() => {
    if (!supervisorId) return;

    unsubProjectsRef.current?.();

    const toProject = (d: any): MyProject => {
      const data = d.data();
      return {
        id:                 d.id,
        titleHe:            data.titleHe            ?? '',
        titleEn:            data.titleEn            ?? '',
        descriptionHe:      data.descriptionHe      ?? '',
        descriptionEn:      data.descriptionEn      ?? '',
        facultyId:          data.facultyId          ?? '',
        status:             data.status             ?? '',
        degreeType:         data.degreeType         ?? '',
        projectType:        data.projectType        ?? '',
        academicYear:       data.academicYear       ?? '',
        applicationIds:     data.applicationIds     ?? [],
        enrolledStudentIds: data.enrolledStudentIds ?? [],
        NumberOfStudents:   data.maxStudents        ?? data.NumberOfStudents ?? 1,
        requiredSkills:     data.requiredSkills     ?? [],
        projectFileUrl:     data.projectFileUrl     ?? null,
      };
    };

    let latestPrimary: MyProject[] = [];
    let latestSecondary: MyProject[] = [];
    const mergeAndSet = () => {
      const seen = new Set<string>();
      const merged = [...latestPrimary, ...latestSecondary].filter((p) => {
        if (seen.has(p.id)) return false;
        seen.add(p.id);
        return true;
      });
      setMyProjects(merged);
    };

    const unsubPrimary = onSnapshot(
      query(collection(db, 'projects'), where('supervisorId', '==', supervisorId), where('facultyId', '==', facultyId)),
      (snapshot) => { latestPrimary = snapshot.docs.map(toProject); mergeAndSet(); },
      (error) => console.warn('❌ Projects listener (primary) error:', error),
    );
    const unsubSecondary = onSnapshot(
      query(collection(db, 'projects'), where('secondarySupervisorId', '==', supervisorId), where('facultyId', '==', facultyId)),
      (snapshot) => { latestSecondary = snapshot.docs.map(toProject); mergeAndSet(); },
      (error) => console.warn('❌ Projects listener (secondary) error:', error),
    );

    const unsub = () => { unsubPrimary(); unsubSecondary(); };
    unsubProjectsRef.current = unsub;
    return unsub;
  }, [supervisorId, facultyId]); // ✅ re-runs only when supervisorId/facultyId changes

  // ── Firestore: real-time applications listener ────────────────────────────
  // CRITICAL FIX: applications never carry a secondarySupervisorId field —
  // only `projectId`. Now keyed off the merged project-id list above
  // (chunked at Firestore's 30-value `in` cap) instead of supervisorId, so a
  // co-supervised project's applications show up regardless of which of the
  // two supervisors is viewing. Status is filtered in JS since Firestore
  // only allows one `in`/array clause per query and projectId already needs it.
  const myProjectIds = useMemo(() => myProjects.map((p) => p.id), [myProjects]);
  const myProjectIdsKey = myProjectIds.join(',');

  useEffect(() => {
    unsubApplicationsRef.current?.();
    if (myProjectIds.length === 0) { setApplications([]); return; }

    const idChunks: string[][] = [];
    for (let i = 0; i < myProjectIds.length; i += 30) idChunks.push(myProjectIds.slice(i, i + 30));

    const chunkResults: Application[][] = idChunks.map(() => []);
    const applyAndSet = () => setApplications(chunkResults.flat());

    const unsubs = idChunks.map((ids, i) =>
      onSnapshot(
        query(collection(db, 'applications'), where('projectId', 'in', ids)),
        (snapshot) => {
          chunkResults[i] = snapshot.docs
            .map((d) => {
              const data = d.data();
              return {
                id:             d.id,
                projectId:      data.projectId      ?? '',
                projectTitleHe: data.projectTitleHe ?? '',
                projectTitleEn: data.projectTitleEn ?? '',
                studentId:      data.studentId      ?? '',
                studentName:    data.studentName ?? data.displayName ?? data.displayNameHe ?? data.name ?? '',
                studentEmail:   data.studentEmail ?? data.email ?? '',
                transcriptUrl:  data.transcriptUrl  ?? '',
                cvUrl:          data.cvUrl          ?? '',
                coverNote:      data.coverNote      ?? '',
                status:         data.status         ?? '',
                submittedAt:    data.submittedAt    ?? null,
                reviewedAt:     data.reviewedAt     ?? null,
                degreeType:     data.degreeType     ?? '',
                autoClosedReason: data.autoClosedReason ?? undefined,
                aiScreening:    data.aiScreening    ?? undefined,
                aiReview:       data.aiReview       ?? undefined,
              } as Application;
            });
          // Not filtered to a single status here — the Applications tab's
          // status filter (Approved / Set-Meeting / Rejected / All) needs
          // every application for this project, not just open ones.
          applyAndSet();
        },
        (error) => console.error('❌ Applications listener error:', error.code, error.message),
      )
    );

    const unsub = () => unsubs.forEach((u) => u());
    unsubApplicationsRef.current = unsub;
    return unsub;
  }, [myProjectIdsKey]);

  // ── Firestore: real-time grading listener ─────────────────────────────────
  // CRITICAL FIX: same issue as applications — milestones only ever carry
  // the primary supervisor's uid, never secondarySupervisorId. Keyed off the
  // same project-id list instead.
  useEffect(() => {
    unsubGradingRef.current?.();
    if (myProjectIds.length === 0) { setPendingGrades([]); return; }

    const idChunks: string[][] = [];
    for (let i = 0; i < myProjectIds.length; i += 30) idChunks.push(myProjectIds.slice(i, i + 30));

    const chunkResults: PendingMilestone[][] = idChunks.map(() => []);
    const applyAndSet = () => setPendingGrades(chunkResults.flat());

    const unsubs = idChunks.map((ids, i) =>
      onSnapshot(query(collection(db, 'milestones'), where('projectId', 'in', ids)), async (snapshot) => {
        const submitted = snapshot.docs.filter((d) => d.data().status === 'submitted');
        const grades: PendingMilestone[] = await Promise.all(
          submitted.map(async (d) => {
            const data = d.data();
            const studentIds: string[] = data.studentIds ?? [];

            const studentNames = await Promise.all(
              studentIds.map(async (sid) => {
                const snap = await getDoc(doc(db, 'users', sid));
                return snap.data()?.displayName ?? snap.data()?.displayNameHe ?? '';
              })
            );

            return {
              id:             d.id,
              projectId:      data.projectId      ?? '',
              projectTitleHe: data.projectTitleHe ?? '',
              projectTitleEn: data.projectTitleEn ?? '',
              type:           data.type           ?? '',
              status:         data.status         ?? '',
              studentNames,
              studentIds,
              fileUrls:       data.fileUrls       ?? [],
              submissionNote: data.submissionNote ?? '',
              facultyId:      data.facultyId      ?? '',
              dueDate:        data.dueDate?.toDate?.()?.toISOString()     ?? null,
              submittedAt:    data.submittedAt?.toDate?.()?.toISOString() ?? null,
              gradingComponents: data.gradingComponents ?? [],
            };
          })
        );
        chunkResults[i] = grades;
        applyAndSet();
      })
    );

    const unsub = () => unsubs.forEach((u) => u());
    unsubGradingRef.current = unsub;
    return unsub;
  }, [myProjectIdsKey]);

  // ── Create project ────────────────────────────────────────────────────────
  const handleCreateProject = async () => {
    if (!newTitleHe.trim() || !newTitleEn.trim()) {
      Alert.alert('Error', 'Title in both languages is required');
      return;
    }
    // selectedProgram holds a level-specific program *key* (e.g. "bsc_cs");
    // the backend's `major` field expects the canonical subject *slug*
    // (e.g. "computer_science") — resolve through getProgramByKey.
    const major = selectedProgram ? getProgramByKey(selectedProgram)?.slug : undefined;
    // A supervisor restricted to specific majors must pick one of them —
    // an unrestricted supervisor may leave it blank (open to all majors).
    if (supervisorAssignedMajors.length > 0 && !major) {
      Alert.alert(
        lang === 'he' ? 'שגיאה' : 'Error',
        lang === 'he'
          ? 'יש לבחור מגמה מתוך המגמות המשויכות אליך'
          : 'You must select one of your assigned majors'
      );
      return;
    }
    if (newDegreeTypes.length === 0 || newProjectTypes.length === 0) {
      Alert.alert(lang === 'he' ? 'שגיאה' : 'Error', lang === 'he' ? 'יש לבחור לפחות סוג תואר אחד וסוג פרויקט אחד' : 'Select at least one degree type and one project type');
      return;
    }
    setCreating(true);
    try {
      await apiClient.post('/api/supervisor/projects', {
        titleHe: newTitleHe,
        titleEn: newTitleEn,
        descriptionHe: newDescHe,
        descriptionEn: newDescEn,
        degreeTypes: newDegreeTypes,
        projectTypes: newProjectTypes,
        projectFileUrl: projectFile,
        NumberOfStudents: maxStudents,
        requiredSkills: newSkills.split(',').map(s => s.trim()).filter(Boolean),
        prerequisites: newPrerequisites.filter((p) => p.subject.trim()).map((p) => ({ subject: p.subject.trim(), ...(p.minGrade != null ? { minGrade: p.minGrade } : {}) })),
        facultyId,
        // Optional single-major restriction — omitted means open to every
        // major in the faculty (today's default, unchanged).
        ...(major ? { major } : {}),
      });
      setShowNewProject(false);
      setNewPrerequisites([]);
      setSelectedProgram(null);
      setProjectFile(null);
      setProjectName(null);
      fetchDashboardData();
      Alert.alert('✅', 'Project published successfully!');
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.message || 'Failed to create project.');
    } finally {
      setCreating(false);
    }
  };

  const handleSubmitRecommendation = async () => {
    if (!selectedProjectForRec || recExaminers.length === 0) {
      Alert.alert(
        lang === 'he' ? 'שגיאה' : 'Error',
        lang === 'he' ? 'יש לבחור פרויקט ולהוסיף לפחות בוחן אחד' : 'Select a project and add at least one examiner'
      );
      return;
    }
    setRecSubmitting(true);
    try {
      await apiClient.post('/api/supervisor/examiner-recommendations', {
        projectId: selectedProjectForRec.id,
        projectTitleHe: selectedProjectForRec.titleHe,
        projectTitleEn: selectedProjectForRec.titleEn,
        recommendedExaminers: recExaminers,
      });
      Alert.alert('✅', tx('examinerRecommendSent', lang));
      setRecommendModal(false);
      setRecExaminers([]);
      setSelectedProjectForRec(null);
      fetchDashboardData();
    } catch (err) {
      Alert.alert(lang === 'he' ? 'שגיאה' : 'Error', 'Failed to send recommendation.');
    } finally {
      setRecSubmitting(false);
    }
  };

  // ── Application decision ──────────────────────────────────────────────────
  // Still goes through the API (backend handles the business logic + updates Firestore)
  // The Firestore listener will automatically reflect the status change in real-time
  const handleDecision = async (appId: string, projectId: string, decision: string, studentId: string) => {
    try {
      await apiClient.post('/api/supervisor/applications/decision', {
        applicationId: appId,
        projectId,
        decision,
        studentId,
        facultyId,
      });
      // No need to call fetchDashboardData() for applications —
      // the Firestore onSnapshot listener updates the list automatically
      Alert.alert('✅', 'Decision saved successfully.');
    } catch (e: any) {
      // Surface the server's actual reason (e.g. the student having already
      // been accepted into another project) instead of a generic failure —
      // see handleApplicationDecision's 409 branches in supervisorController.ts.
      Alert.alert('Error', e?.response?.data?.message || 'Failed to process decision.');
    }
  };

  // ── Grade submission ──────────────────────────────────────────────────────
  const handleGrade = async () => {
    if (!activeMilestone) return;
    setSubmitting(true);
    try {
      const res = await apiClient.post(`/api/projects/milestones/${activeMilestone.id}/grade`, {
        givenScore: totalScore, // Map your calculated total score
        comments: gradeComment, // Map your text input comment
        projectId: activeMilestone.projectId,
        criteria: Object.fromEntries(activeFields.map((f) => [f.key, Number(criteria[f.key]) || 0])),
      });
      // Group projects: layer each student's individual component on top of
      // the shared group score just submitted above (see
      // submitIndividualGrade). Each student's submission is tried
      // independently — a failure here must not be reported as "the whole
      // grade failed" (via the outer catch below) when the group grade
      // above already saved successfully; that used to be exactly what
      // happened, since this loop had no try/catch of its own.
      const groupStudentIds = (activeMilestone as PendingMilestone).studentIds ?? [];
      const individualFailures: string[] = [];
      for (const sid of groupStudentIds) {
        const raw = individualScores[sid];
        if (raw === undefined || raw.trim() === '') continue;
        try {
          await apiClient.post(`/api/projects/milestones/${activeMilestone.id}/individual-grade`, {
            studentId: sid,
            score: Number(raw),
          });
        } catch (individualError) {
          console.error(`Failed to submit individual grade for ${sid}:`, individualError);
          const idx = groupStudentIds.indexOf(sid);
          individualFailures.push((activeMilestone as PendingMilestone).studentNames?.[idx] ?? sid);
        }
      }

      if (res.status === 200 || res.status === 201 || res.data?.success) {
        if (individualFailures.length > 0) {
          Alert.alert(
            lang === 'he' ? 'הצלחה חלקית' : 'Partial success',
            lang === 'he'
              ? `הציון הקבוצתי נשמר, אך הציון האישי נכשל עבור: ${individualFailures.join(', ')}`
              : `Group grade saved, but the individual score failed for: ${individualFailures.join(', ')}`,
          );
        } else {
          Alert.alert(lang === 'he' ? 'הצלחה' : 'Success', lang === 'he' ? 'הציון נשמר!' : 'Grade submitted!');
        }
        setGradeModal(false);
        setPendingGrades(prev => prev.filter(m => m.id !== activeMilestone.id));
      }
      setGradeModal(false);
      setGradeComment('');
      setIndividualScores({});
      fetchDashboardData(); // refresh grading list from API
    } catch (error: any) {
      console.error("❌ Network or Execution catch block error:", error);
      console.error("❌ Response Details:", error?.response?.data || "No response data available");
      Alert.alert(
        lang === 'he' ? 'שגיאה' : 'Error',
        // Surfaces the server's message when there is one — in particular the
        // post-approval grade lock (see projectController.ts submitMilestoneGrade)
        // returns a specific 409 explaining an authorized unlock is needed first,
        // which a generic fallback here would otherwise hide.
        error?.response?.data?.message || (lang === 'he' ? 'שגיאה בשמירת הציון' : 'Failed to submit grade.')
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenEditModal = (project: MyProject | null) => {
    if (!project) return;
    setEditProject(project);
    setEditTitleHe(project.titleHe);
    setEditTitleEn(project.titleEn);
    setEditDegree(project.degreeType as 'bachelors' | 'masters' | '');
    setEditProjectType(project.projectType as 'project' | 'thesis');
    setEditFaculty(project.facultyId);
    setEditDescHe(project.descriptionHe);
    setEditDescEn(project.descriptionEn);
    // Previously never reset — editing project A then B without touching
    // this field silently carried A's skills/file over onto B's save.
    setEditSkills((project.requiredSkills ?? []).join(', '));
    setEditProjectFile(project.projectFileUrl ?? null);
    setEditProjectFileName(project.projectFileUrl ? (lang === 'he' ? 'קובץ קיים' : 'Existing file') : null);
    setProjectModal(true);
  };

  // ── Edit project ──────────────────────────────────────────────────────────
  const handleEditProject = async (project: MyProject | null) => {
    if (!project) return;
    if (!editTitleHe.trim() || !editTitleEn.trim()) {
      Alert.alert(
        lang === 'he' ? 'שגיאה' : 'Error',
        lang === 'he' ? 'כותרת הפרויקט (עברית ואנגלית) לא יכולה להיות ריקה' : 'Project title (Hebrew and English) cannot be empty'
      );
      return;
    }
    setSaving(true);
    try {
      await apiClient.put(`/api/supervisor/projects/${project.id}`, {
        titleHe:       editTitleHe,
        titleEn:       editTitleEn,
        descriptionHe: editDescHe,
        descriptionEn: editDescEn,
        degreeType:    editDegree,
        projectType:   editProjectType,
        requiredSkills: editSkills.split(',').map(s => s.trim()).filter(Boolean),
        ...(editProjectFile ? { projectFileUrl: editProjectFile } : {}),
      });
      Alert.alert('Success', 'Project updated!');
      setProjectModal(false);
      fetchDashboardData();
    } catch (e) {
      Alert.alert('Error', 'Update failed.');
    } finally {
      setSaving(false);
    }
  };

  // ── Request project erasure ───────────────────────────────────────────────
  // Supervisors can no longer erase a project directly — only ask the
  // coordinator to. See server/src/services/projectErasure.ts.
  const [erasureProject, setErasureProject] = useState<MyProject | null>(null);
  const [erasureReason, setErasureReason] = useState('');
  const [submittingErasure, setSubmittingErasure] = useState(false);

  const submitErasureRequest = async () => {
    if (!erasureProject) return;
    if (!erasureReason.trim()) {
      Alert.alert(lang === 'he' ? 'שגיאה' : 'Error', lang === 'he' ? 'יש להזין סיבה' : 'A reason is required');
      return;
    }
    setSubmittingErasure(true);
    try {
      await apiClient.requestProjectErasure(erasureProject.id, erasureReason.trim());
      setErasureProject(null);
      setErasureReason('');
      Alert.alert(lang === 'he' ? 'נשלח' : 'Sent', tx('requestErasureSent', lang));
      fetchDashboardData();
    } catch (e) {
      Alert.alert(lang === 'he' ? 'שגיאה' : 'Error', lang === 'he' ? 'שליחת הבקשה נכשלה' : 'Failed to send request');
    } finally {
      setSubmittingErasure(false);
    }
  };

  const handleOpenDocument = async (url: string) => {
    if (!url) { Alert.alert(lang === 'he' ? 'לא נמצא מסמך' : 'Document not found'); return; }
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) await Linking.openURL(url);
      else Alert.alert(lang === 'he' ? 'לא ניתן לפתוח' : 'Unable to open link');
    } catch (e) {
      Alert.alert(lang === 'he' ? 'שגיאה' : 'Error opening document');
    }
  };

  // CRITICAL FIX: this used to set projectFile to the raw LOCAL device URI
  // and stop there — never actually uploaded anywhere, so publishing a
  // project silently discarded whatever PDF was picked, with no error. Now
  // uploads to the same Cloudinary cloud/preset already used elsewhere in
  // this app (Browseprojects.tsx's CV/transcript upload) and stores the
  // returned hosted URL — the only thing createSupervisorProject/
  // updateSupervisorProject can actually persist as projectFileUrl. The
  // isNew=false (edit) branch was a complete no-op before; it now uploads
  // into its own editProjectFile/editProjectFileName state so it can never
  // leak into (or be leaked into by) the New Project modal's state.
  const pickFile = async (isNew: boolean) => {
    const result = await DocumentPicker.getDocumentAsync({ type: 'application/pdf' });
    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];

    setUploadingProjectFile(true);
    try {
      const formData = new FormData();
      formData.append('file', { uri: asset.uri, type: 'application/pdf', name: asset.name } as any);
      formData.append('upload_preset', 'student_uploads');
      const response = await fetch('https://api.cloudinary.com/v1_1/dp7stlfas/raw/upload', {
        method: 'POST',
        body: formData,
      });
      if (!response.ok) throw new Error(`Upload failed — HTTP ${response.status}`);
      const data = await response.json();

      if (isNew) {
        setProjectFile(data.secure_url);
        setProjectName(asset.name);
      } else {
        setEditProjectFile(data.secure_url);
        setEditProjectFileName(asset.name);
      }
    } catch (e) {
      console.error('Project file upload error:', e);
      Alert.alert(
        lang === 'he' ? 'שגיאה' : 'Error',
        lang === 'he' ? 'העלאת הקובץ נכשלה. נסה שוב.' : 'File upload failed. Please try again.'
      );
    } finally {
      setUploadingProjectFile(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#2E86FF" />
      </View>
    );
  }

  const pendingApplicationsCount = applications.filter((app) => app.status === 'applied').length;
  const filteredApplications =
    applicationFilter === 'all' ? applications : applications.filter((app) => app.status === applicationFilter);

  const APPLICATION_FILTERS: { key: 'all' | 'applied' | 'approved' | 'meeting_requested' | 'rejected'; he: string; en: string }[] = [
    { key: 'all', he: 'הכל', en: 'All' },
    { key: 'applied', he: 'ממתין לטיפול', en: 'Awaiting Response' },
    { key: 'approved', he: 'אושרו', en: 'Approved' },
    { key: 'meeting_requested', he: 'תואמה פגישה', en: 'Set-Meeting' },
    { key: 'rejected', he: 'נדחו', en: 'Rejected' },
  ];

  // "active" = has at least one enrolled student; "offered" = posted but no
  // student has been accepted into it yet. Keyed off enrolledStudentIds
  // rather than the project doc's own `status` field — that field is
  // literally 'active' for a freshly-posted, student-less project (see
  // createSupervisorProject) and only flips to 'in_progress' once a
  // student enrolls, the opposite of what "active" means here.
  const PROJECT_FILTERS: { key: 'all' | 'active' | 'offered'; he: string; en: string }[] = [
    { key: 'all', he: 'הכל', en: 'All' },
    { key: 'active', he: 'פעילים', en: 'Active' },
    { key: 'offered', he: 'מוצעים', en: 'Offered' },
  ];
  const filteredProjects =
    projectFilter === 'all'
      ? myProjects
      : myProjects.filter((p) =>
          projectFilter === 'active' ? (p.enrolledStudentIds?.length ?? 0) > 0 : (p.enrolledStudentIds?.length ?? 0) === 0
        );

  return (
    <SafeAreaView style={styles.root}>
      <TopBar
        name={supervisorName}
        role="supervisor"
        lang={lang}
        isRtl={isRtl}
        onToggleLang={() => setLang(lang === 'he' ? 'en' : 'he')}
        extraMenuItems={[
          {
            key: 'project-records', icon: '📜',
            label: lang === 'he' ? 'רישומי פרויקטים' : 'Project Records',
            onPress: () => router.push({ pathname: '/supervisor/records', params: { lang } } as any),
          },
        ]}
      />

      {/* Stats row */}
      <View style={[styles.statsRow, isRtl && styles.rowReverse]}>
        <StatCard emoji="📁" value={myProjects.length}
          label={lang === 'he' ? 'הפרויקטים שלי' : 'My Projects'} color="#2E86FF" isRtl={isRtl} />
        <View style={styles.statGap} />
        <StatCard emoji="📨" value={pendingApplicationsCount}
          label={lang === 'he' ? 'מועמדויות ממתינות' : 'Pending Applications'} color="#F59E0B" isRtl={isRtl} />
        <View style={styles.statGap} />
        <StatCard emoji="✏️" value={pendingGrades.length}
          label={lang === 'he' ? 'ממתינות לציון' : 'Need Grading'} color="#8B5CF6" isRtl={isRtl} />
      </View>

      {/* Tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabBar}>
        {([
          { key: 'applications', heLabel: 'מועמדויות',  enLabel: 'Applications', badge: pendingApplicationsCount  },
          { key: 'grading',      heLabel: 'מתן ציונים', enLabel: 'Grading',      badge: pendingGrades.length },
          { key: 'recommend', heLabel: 'המלצת בוחנים', enLabel: 'Recommend Examiners', badge: 0 },
        ] as const).map((tab) => (
          <Pressable
            key={tab.key}
            style={[styles.tab, activeTab === tab.key && styles.tabActive]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]} numberOfLines={1}>
              {lang === 'he' ? tab.heLabel : tab.enLabel}
            </Text>
            {tab.badge > 0 && (
              <View style={[styles.tabBadge, activeTab === tab.key && styles.tabBadgeActive]}>
                <Text style={styles.tabBadgeText}>{tab.badge}</Text>
              </View>
            )}
          </Pressable>
        ))}
        <Pressable
          style={[styles.tab, activeTab === 'signoffs' && styles.tabActive]}
          onPress={() => setActiveTab('signoffs')}
        >
          <Text style={[styles.tabText, activeTab === 'signoffs' && styles.tabTextActive]} numberOfLines={1}>
            {lang === 'he' ? 'ממתין לאישור ציונים ובוחנים' : 'Awaiting Grade/Examiner Approval'}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tab, activeTab === 'projects' && styles.tabActive]}
          onPress={() => setActiveTab('projects')}
        >
          <Text style={[styles.tabText, activeTab === 'projects' && styles.tabTextActive]} numberOfLines={1}>
            {lang === 'he' ? 'פרויקטים' : 'Projects'}
          </Text>
          {myProjects.length > 0 && (
            <View style={[styles.tabBadge, activeTab === 'projects' && styles.tabBadgeActive]}>
              <Text style={styles.tabBadgeText}>{myProjects.length}</Text>
            </View>
          )}
        </Pressable>
      </ScrollView>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* ════ PROJECTS TAB ════ */}
        {activeTab === 'projects' && (
          <>
            <View style={[{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }, isRtl && styles.rowReverse]}>
              {PROJECT_FILTERS.map((f) => (
                <Pressable
                  key={f.key}
                  onPress={() => setProjectFilter(f.key)}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: 20,
                    backgroundColor: projectFilter === f.key ? '#2E86FF' : '#F0F4FF',
                    borderWidth: 1,
                    borderColor: projectFilter === f.key ? '#2E86FF' : '#D0DEFF',
                  }}
                >
                  <Text style={{ fontSize: 12, fontWeight: '600', color: projectFilter === f.key ? '#fff' : '#475569' }}>
                    {lang === 'he' ? f.he : f.en}
                  </Text>
                </Pressable>
              ))}
            </View>
            {!filteredProjects || filteredProjects.length === 0 ? (
              <EmptyState
                emoji="📭"
                text={
                  myProjects.length === 0
                    ? lang === 'he' ? 'טרם פרסמת פרויקטים' : 'No projects posted yet'
                    : lang === 'he' ? 'אין פרויקטים התואמים את הסינון' : 'No projects match this filter'
                }
              />
            ) : (
              filteredProjects.map((p) => {
                const fc = getFacultyColor(p.facultyId);
                const urgencyColor = p.currentMilestone?.urgency ? URGENCY_COLOR[p.currentMilestone.urgency] : 'transparent';
                return (
                  <View key={p.id} style={{ borderWidth: 3, borderColor: urgencyColor, borderRadius: 22, padding: 3, marginBottom: 14 }}>
                  <View style={[styles.projectCard, { marginBottom: 0 }, isRtl ? { borderRightColor: fc.primary, borderRightWidth: 4 } : { borderLeftColor: fc.primary, borderLeftWidth: 4 }]}>
                    <View style={[styles.row, isRtl && styles.rowReverse, { marginBottom: 8 }]}>
                      <FacultyBadge facultyId={p.facultyId} lang={lang} />
                      <View style={styles.rowGap} />
                      <StatusBadge status={p.status} lang={lang} />
                    </View>
                    <Text style={[styles.cardTitle, isRtl && styles.textRight]}>
                      {lang === 'he' ? p.titleHe : p.titleEn}
                    </Text>
                    <View style={[styles.row, isRtl && styles.rowReverse, { marginTop: 6 }]}>
                      <Text style={[styles.cardMeta, isRtl && styles.textRight]}>
                        {lang === 'he'
                          ? p.degreeType === 'bachelors' ? 'תואר ראשון' : 'תואר שני'
                          : p.degreeType === 'bachelors' ? "Bachelor's" : "Master's"}
                        {' · '}
                        {lang === 'he'
                          ? p.projectType === 'project' ? 'פרויקט' : 'תזה'
                          : p.projectType === 'project' ? 'Project' : 'Thesis'}
                        {' · '}
                        {lang === 'he' ? 'סטודנטים' : 'Students'}: {(p.enrolledStudentIds?.length ?? 0)}/{(p.NumberOfStudents ?? 1)}
                      </Text>
                    </View>

                    {(p.enrolledStudents?.length ?? 0) > 0 && (
                      <View style={{ marginTop: 6 }}>
                        {p.enrolledStudents!.map((s) => (
                          <Text key={s.id} style={[styles.cardMeta, isRtl && styles.textRight]}>
                            👤 {s.name || (lang === 'he' ? 'שם לא זמין' : 'Name unavailable')}
                            {s.degreeType ? ` · ${s.degreeType === 'bachelors' ? (lang === 'he' ? 'תואר ראשון' : "Bachelor's") : (lang === 'he' ? 'תואר שני' : "Master's")}` : ''}
                            {s.yearOfStudy ? ` · ${lang === 'he' ? 'שנה' : 'Year'} ${s.yearOfStudy}` : ''}
                          </Text>
                        ))}
                      </View>
                    )}

                    {p.currentMilestone && (
                      <Text style={[styles.cardMeta, isRtl && styles.textRight, { marginTop: 6, fontWeight: '700', color: urgencyColor }]}>
                        🗓 {lang === 'he' ? p.currentMilestone.nameHe : p.currentMilestone.nameEn}
                        {p.currentMilestone.daysLeft !== null &&
                          ` — ${
                            p.currentMilestone.daysLeft < 0
                              ? lang === 'he'
                                ? `באיחור של ${Math.abs(p.currentMilestone.daysLeft)} ימים`
                                : `${Math.abs(p.currentMilestone.daysLeft)}d overdue`
                              : lang === 'he'
                                ? `${p.currentMilestone.daysLeft} ימים נותרו`
                                : `${p.currentMilestone.daysLeft}d left`
                          }`}
                      </Text>
                    )}

                    {(p.applicationIds?.length ?? 0) > 0 && (
                      <View style={styles.appCount}>
                        <Text style={styles.appCountText}>
                          📨 {p.applicationIds?.length ?? 0}{' '}
                          {lang === 'he' ? 'מועמדויות' : 'applications'}
                        </Text>
                      </View>
                    )}
                    <View style={[styles.actionRow, isRtl && styles.rowReverse]}>
                      <Pressable style={[styles.actionBtn, styles.editBtn]} onPress={() => handleOpenEditModal(p)}>
                        <Text style={styles.actionBtnText}>{lang === 'he' ? 'עריכה' : 'Edit'}</Text>
                      </Pressable>
                      <Pressable style={[styles.actionBtn, styles.deleteBtn]} onPress={() => setErasureProject(p)}>
                        <Text style={styles.actionBtnText}>{tx('requestErasure', lang)}</Text>
                      </Pressable>
                    </View>

                    <ProjectWorkflowSection lang={lang} projectId={p.id} />
                  </View>
                  </View>
                );
              })
            )}
          </>
        )}
        {/* ════ APPLICATIONS TAB ════ */}
        {activeTab === 'applications' && (
          <>
            <View style={[{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }, isRtl && styles.rowReverse]}>
              {APPLICATION_FILTERS.map((f) => (
                <Pressable
                  key={f.key}
                  onPress={() => setApplicationFilter(f.key)}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: 20,
                    backgroundColor: applicationFilter === f.key ? '#2E86FF' : '#F0F4FF',
                    borderWidth: 1,
                    borderColor: applicationFilter === f.key ? '#2E86FF' : '#D0DEFF',
                  }}
                >
                  <Text style={{ fontSize: 12, fontWeight: '600', color: applicationFilter === f.key ? '#fff' : '#475569' }}>
                    {lang === 'he' ? f.he : f.en}
                  </Text>
                </Pressable>
              ))}
            </View>
            {filteredApplications.length === 0 ? (
              <EmptyState
                emoji="📬"
                text={
                  applicationFilter === 'all'
                    ? lang === 'he' ? 'אין מועמדויות חדשות' : 'No pending applications'
                    : lang === 'he' ? 'אין מועמדויות התואמות את הסינון' : 'No applications match this filter'
                }
              />
            ) : (
              filteredApplications.map((app) => {
                const isExpanded = expandedCards[app.id] ?? false;
                return (
                  <Pressable
                    key={app.id}
                    style={styles.appCard}
                    onPress={() => toggleCardExpansion(app.id)}
                  >
                    {/* ── Always visible header ── */}
                    <View style={[styles.row, isRtl && styles.rowReverse, { justifyContent: 'space-between' }]}>
                      <Text style={[styles.appProjectLabel, isRtl && styles.textRight, { flex: 1 }]}>
                        📁 {lang === 'he' ? app.projectTitleHe : app.projectTitleEn}
                      </Text>
                      <Text style={{ fontSize: 18, color: '#8899BB' }}>{isExpanded ? '▲' : '▼'}</Text>
                    </View>

                    <View style={[styles.row, isRtl && styles.rowReverse, { marginVertical: 8 }]}>
                      <View style={styles.studentAvatar}>
                        <Text style={styles.studentAvatarText}>
                          {app.studentName?.charAt(0)?.toUpperCase() ?? 'S'}
                        </Text>
                      </View>
                      <View style={{ marginLeft: isRtl ? 0 : 10, marginRight: isRtl ? 10 : 0, flex: 1 }}>
                        <Text style={[styles.studentName, isRtl && styles.textRight]}>
                          {app.studentName || (lang === 'he' ? 'שם לא זמין' : 'Name unavailable')}
                        </Text>
                        <Text style={[styles.studentEmail, isRtl && styles.textRight]}>
                          {app.studentEmail}
                        </Text>
                        {/* ← Degree shown here, always visible */}
                        {app.degreeType ? (
                          <Text style={[styles.cardMeta, isRtl && styles.textRight]}>
                            🎓 {lang === 'he'
                              ? app.degreeType === 'bachelors' ? 'תואר ראשון' : 'תואר שני'
                              : app.degreeType === 'bachelors' ? "Bachelor's" : "Master's"}
                          </Text>
                        ) : null}
                      </View>
                      <StatusBadge status={app.status} lang={lang} />
                    </View>

                    {app.autoClosedReason === 'accepted_elsewhere' && (
                      <View style={{ marginTop: 8, backgroundColor: '#FFF8E1', borderRadius: 10, paddingVertical: 6, paddingHorizontal: 10 }}>
                        <Text style={[{ fontSize: 12, color: '#6D4C00' }, isRtl && styles.textRight]}>
                          🔒 {lang === 'he'
                            ? 'נסגר אוטומטית — הסטודנט/ית התקבל/ה לפרויקט אחר'
                            : 'Auto-closed — the student was accepted into another project'}
                        </Text>
                      </View>
                    )}

                    {/* ── Expanded content ── */}
                    {isExpanded && (
                      <>
                        {/* Submitted date */}
                        {app.submittedAt && (
                          <Text style={[styles.cardMeta, isRtl && styles.textRight, { marginBottom: 8 }]}>
                            🗓 {lang === 'he' ? 'הוגש ב:' : 'Submitted:'}{' '}
                            {new Date(
                              app.submittedAt?.seconds
                                ? app.submittedAt.seconds * 1000
                                : app.submittedAt
                            ).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-US')}
                          </Text>
                        )}

                        {/* Date the supervisor answered (approve/reject/meeting) */}
                        {app.reviewedAt && REVIEWED_LABEL[app.status] && app.autoClosedReason !== 'accepted_elsewhere' && (
                          <Text style={[styles.cardMeta, isRtl && styles.textRight, { marginBottom: 8 }]}>
                            ✅ {REVIEWED_LABEL[app.status][lang]}{' '}
                            {new Date(
                              app.reviewedAt?.seconds
                                ? app.reviewedAt.seconds * 1000
                                : app.reviewedAt
                            ).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-US')}
                          </Text>
                        )}

                        {/* Cover note */}
                        {app.coverNote ? (
                          <View style={styles.coverNote}>
                            <Text style={[styles.coverNoteText, isRtl && styles.textRight]}>
                              {app.coverNote}
                            </Text>
                          </View>
                        ) : (
                          <Text style={[styles.cardMeta, isRtl && styles.textRight, { marginBottom: 8, fontStyle: 'italic' }]}>
                            {lang === 'he' ? 'אין מכתב מוטיבציה' : 'No cover note provided'}
                          </Text>
                        )}

                        {/* Documents */}
                        <View style={[styles.docsRow, isRtl && styles.rowReverse]}>
                          {app.transcriptUrl ? (
                            <Pressable
                              style={styles.docChip}
                              onPress={(e) => { e.stopPropagation?.(); handleOpenDocument(app.transcriptUrl); }}
                            >
                              <Text style={styles.docChipText}>📄 {lang === 'he' ? 'גיליון ציונים' : 'Transcript'}</Text>
                            </Pressable>
                          ) : null}
                          {app.cvUrl ? (
                            <Pressable
                              style={styles.docChip}
                              onPress={(e) => { e.stopPropagation?.(); handleOpenDocument(app.cvUrl); }}
                            >
                              <Text style={styles.docChipText}>📋 {lang === 'he' ? 'קורות חיים' : 'CV'}</Text>
                            </Pressable>
                          ) : null}
                        </View>

                        {/* AI CV-vs-prerequisites screening */}
                        {app.aiScreening && (
                          <View style={[
                            styles.coverNote,
                            {
                              backgroundColor: app.aiScreening.verdict === 'strong_fit' ? '#ECFDF5'
                                : app.aiScreening.verdict === 'partial_fit' ? '#FFFBEB'
                                : app.aiScreening.verdict === 'weak_fit' ? '#FEF2F2'
                                : '#F1F5F9',
                            },
                          ]}>
                            <Text style={[styles.cardMeta, isRtl && styles.textRight, { fontWeight: '700', marginBottom: 4 }]}>
                              🤖 {lang === 'he' ? 'התאמת קורות חיים לדרישות:' : 'CV-vs-prerequisites fit:'}{' '}
                              {app.aiScreening.verdict === 'strong_fit' ? (lang === 'he' ? 'התאמה גבוהה' : 'Strong fit')
                                : app.aiScreening.verdict === 'partial_fit' ? (lang === 'he' ? 'התאמה חלקית' : 'Partial fit')
                                : app.aiScreening.verdict === 'weak_fit' ? (lang === 'he' ? 'התאמה חלשה' : 'Weak fit')
                                : (lang === 'he' ? 'לא ניתן להעריך' : 'Unable to assess')}
                            </Text>
                            <Text style={[styles.coverNoteText, isRtl && styles.textRight]}>
                              {app.aiScreening.reasoning}
                            </Text>
                          </View>
                        )}

                        {/* AI review — independent pass/fail checks rolled into one recommendation */}
                        {app.aiReview && (
                          <View style={[
                            styles.coverNote,
                            {
                              backgroundColor: app.aiReview.recommendation === 'approve' ? '#ECFDF5'
                                : app.aiReview.recommendation === 'meeting' ? '#FFFBEB'
                                : '#FEF2F2',
                            },
                          ]}>
                            <Text style={[styles.cardMeta, isRtl && styles.textRight, { fontWeight: '700', marginBottom: 4 }]}>
                              🤖 {lang === 'he' ? 'בדיקת AI:' : 'AI review:'}{' '}
                              {app.aiReview.recommendation === 'approve' ? (lang === 'he' ? '✓ מומלץ לאשר' : '✓ Recommend approving')
                                : app.aiReview.recommendation === 'meeting' ? (lang === 'he' ? '📅 מומלץ לתאם פגישה' : '📅 Recommend a meeting')
                                : (lang === 'he' ? '✕ מומלץ לדחות' : '✕ Recommend rejecting')}
                            </Text>
                            {app.aiReview.checks.map((c) => (
                              <Text key={c.id} style={[styles.coverNoteText, isRtl && styles.textRight]}>
                                {c.passed === true ? '✅' : c.passed === false ? '❌' : '❓'} {lang === 'he' ? c.labelHe : c.labelEn}
                                {c.reasoning ? ` — ${c.reasoning}` : ''}
                              </Text>
                            ))}
                          </View>
                        )}

                        {/* Decision buttons — hidden once a final decision (approved/rejected) is made */}
                        {(app.status === 'applied' || app.status === 'meeting_requested') && (
                          <View style={[styles.decisionRow, isRtl && styles.rowReverse]}>
                            <Pressable
                              style={styles.approveBtn}
                              onPress={(e) => { e.stopPropagation?.(); handleDecision(app.id, app.projectId, 'approved', app.studentId); }}
                            >
                              <Text style={styles.approveBtnText}>✓ {lang === 'he' ? 'אשר' : 'Approve'}</Text>
                            </Pressable>
                            <Pressable
                              style={styles.meetingBtn}
                              onPress={(e) => { e.stopPropagation?.(); handleDecision(app.id, app.projectId, 'meeting_requested', app.studentId); }}
                            >
                              <Text style={styles.meetingBtnText}>📅 {lang === 'he' ? 'בקש פגישה' : 'Request Meeting'}</Text>
                            </Pressable>
                            <Pressable
                              style={styles.rejectBtn}
                              onPress={(e) => { e.stopPropagation?.(); handleDecision(app.id, app.projectId, 'rejected', app.studentId); }}
                            >
                              <Text style={styles.rejectBtnText}>✕ {lang === 'he' ? 'דחה' : 'Reject'}</Text>
                            </Pressable>
                          </View>
                        )}
                      </>
                    )}
                  </Pressable>
                );
              })
            )}
          </>
        )}
        {/* ════ GRADING TAB ════ */}
        {activeTab === 'grading' && (
          <>
            {pendingGrades.length === 0 ? (
              <EmptyState emoji="✅" text={lang === 'he' ? 'אין הגשות הממתינות לציון' : 'No submissions awaiting grading'} />
            ) : (
              pendingGrades.map((m) => {
                const fc    = getFacultyColor(m.facultyId);
                const isExpanded = expandedCards[m.id] ?? false;
                const label = lang === 'he' ? MILESTONE_LABEL[m.type]?.he ?? m.type : MILESTONE_LABEL[m.type]?.en ?? m.type;
                // Calculate timing metadata
                const dueTime = m.dueDate ? new Date(m.dueDate).getTime() : null;
                const submitTime = m.submittedAt ? new Date(m.submittedAt).getTime() : null;
                
                let targetDaysText = '';
                let targetDaysColor = '#8899BB';

                if (dueTime && submitTime) {
                  const diffMs = dueTime - submitTime;
                  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
                  
                  if (diffDays > 0) {
                    targetDaysText = lang === 'he' ? `✅ הוגש בזמן (${diffDays} ${tx('daysLeft', lang)})` : `✅ Submitted on time (${diffDays} ${tx('daysLeft', lang)})`;
                    targetDaysColor = '#10B981';
                  } else if (diffDays === 0) {
                    targetDaysText = lang === 'he' ? '✅ הוגש ביום היעד' : '✅ Submitted today on due date';
                    targetDaysColor = '#F59E0B';
                  } else {
                    targetDaysText = lang === 'he' ? `⚠️ איחור של ${Math.abs(diffDays)} ימים` : `⚠️ ${Math.abs(diffDays)} ${tx('daysOverdue', lang)}`;
                    targetDaysColor = '#D32F2F';
                  }
                }
                return (
                  <Pressable 
                    key={m.id} 
                    style={[styles.gradeCard, isRtl ? { borderRightColor: fc.primary, borderRightWidth: 4 } : { borderLeftColor: fc.primary, borderLeftWidth: 4 }]}
                    onPress={() => toggleCardExpansion(m.id)}
                  >
                    {/* Header Content Info */}
                    <View style={[styles.row, isRtl && styles.rowReverse, { justifyContent: 'space-between', alignItems: 'center' }]}>
                      <Text style={[styles.gradeMilestoneType, { color: fc.primary, marginBottom: 0, flexShrink: 1 }, isRtl && styles.textRight]}>
                        {label}
                      </Text>
                      <View style={{ flexDirection: isRtl ? 'row-reverse' : 'row', alignItems: 'center', gap: 8 }}>
                        <View style={{ backgroundColor: '#fbf3e3', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
                          <Text style={{ fontSize: 10, fontWeight: '700', color: '#b8862e', textTransform: 'uppercase' }}>
                            📤 {lang === 'he' ? 'הוגש' : 'Submitted'}
                          </Text>
                        </View>
                        <Text style={{ fontSize: 16, color: '#8899BB' }}>{isExpanded ? '▲' : '▼'}</Text>
                      </View>
                    </View>

                    <Text style={[styles.gradeProjectTitle, isRtl && styles.textRight, { marginTop: 6 }]}>
                      📁 {(() => {
                          // Milestone doc may have empty title — fall back to myProjects lookup
                          const titleHe = m.projectTitleHe || myProjects.find(p => p.id === m.projectId)?.titleHe || '';
                          const titleEn = m.projectTitleEn || myProjects.find(p => p.id === m.projectId)?.titleEn || '';
                          return lang === 'he' ? titleHe : titleEn;
                        })()}
                    </Text>
                    <Text style={[styles.gradeStudents, isRtl && styles.textRight]}>
                      👤 {m.studentNames.join(', ')}
                    </Text>

                    {/* ── Collapsed vs Expanded Area ── */}
                    {!isExpanded ? (
                      m.fileUrls.length > 0 && (
                        <Text style={styles.filesNote}>
                          📎 {m.fileUrls.length} {lang === 'he' ? 'קבצים מצורפים' : 'files attached'}
                        </Text>
                      )
                    ) : (
                      <View style={{ marginTop: 10, borderTopWidth: 1, borderTopColor: '#E2E8F0', paddingTop: 10 }}>
                        {/* 1. Days info / Status logic */}
                        {targetDaysText ? (
                          <Text style={[isRtl && styles.textRight, { color: targetDaysColor, fontWeight: '600', marginBottom: 8, fontSize: 13 }]}>
                            {targetDaysText}
                          </Text>
                        ) : null}

                        {/* Submission note if it exists */}
                        {m.submissionNote ? (
                          <Text style={[styles.submissionNote, isRtl && styles.textRight, { marginBottom: 12 }]}>
                            💬 {m.submissionNote}
                          </Text>
                        ) : null}

                        {/* 2. Submitted Files — icon + real filename chips,
                            matching the "Mobile Milestone Tracker with Files"
                            card design (components/MilestoneRoadmap.tsx). */}
                        {m.fileUrls.length > 0 ? (
                          <View>
                            <Text style={{ fontSize: 9, fontWeight: '700', color: milestonePalette.onSurfaceVariant, textTransform: 'uppercase', marginBottom: 6 }}>
                              {lang === 'he' ? 'קבצים שהוגשו' : 'Submitted Files'}
                            </Text>
                            <View style={[styles.docsRow, isRtl && styles.rowReverse, { marginBottom: 12, flexWrap: 'wrap' }]}>
                              {m.fileUrls.map((url, uIdx) => (
                                <Pressable
                                  key={uIdx}
                                  style={[styles.docChip, { backgroundColor: milestonePalette.surfaceContainerLow, borderColor: milestonePalette.outlineVariant, borderWidth: 1, maxWidth: 220 }]}
                                  onPress={(e) => {
                                    e.stopPropagation();
                                    // Submitted milestone files' Cloudinary URLs carry no
                                    // file extension, so handing the raw URL to the OS via
                                    // Linking.openURL (like handleOpenDocument does for CVs/
                                    // transcripts below) can't be viewed reliably — same web
                                    // bug just fixed for the supervisor/coordinator dashboards.
                                    // coordinator/home.tsx and examinor/home.tsx already route
                                    // milestone files through /pdfViewer instead, which
                                    // downloads the file locally and re-tags it as a .pdf
                                    // before opening it — do the same here.
                                    router.push({ pathname: '/pdfViewer', params: { url } });
                                  }}
                                >
                                  <Text style={[styles.docChipText, { color: milestonePalette.onSurface }]} numberOfLines={1}>
                                    📄 {fileNameFromUrl(url, uIdx, lang)}
                                  </Text>
                                </Pressable>
                              ))}
                            </View>
                          </View>
                        ) : (
                          <Text style={[isRtl && styles.textRight, { fontStyle: 'italic', color: '#8899BB', marginBottom: 12, fontSize: 12 }]}>
                            {lang === 'he' ? 'אין קבצים מצורפים להורדה' : 'No attached files available'}
                          </Text>
                        )}

                        {/* Execution Grade Button Action Form */}
                        <Pressable
                          style={[styles.gradeBtn, { backgroundColor: fc.primary, marginTop: 4 }]}
                          onPress={(e) => {
                            e.stopPropagation(); // prevent collapsing layout card
                            setActiveMilestone(m);
                            setGradeComment('');
                            setCriteria(Object.fromEntries(activeGradingFields(m).map((f) => [f.key, ''])));
                            setIndividualScores({});
                            setGradeMilestone(m);
                            setGradeModal(true);
                          }}
                        >
                          <Text style={styles.gradeBtnText}>✏️ {lang === 'he' ? 'תן ציון' : 'Grade'}</Text>
                        </Pressable>
                      </View>
                    )}
                  </Pressable>
                );
              })
            )}
          </>
        )}
        {/* ════ RECOMMENDED EXAMINERS TAB ════ */}
        {activeTab === 'recommend' && (
          <>
            {/* Button to open new recommendation modal */}
            <Pressable
              style={styles.addBtn}
              onPress={() => {
                if (myProjects.length === 0) {
                  Alert.alert(
                    lang === 'he' ? 'אין פרויקטים' : 'No Projects',
                    lang === 'he' ? 'אין לך פרויקטים פעילים להמלצת בוחנים' : 'You have no active projects to recommend examiners for'
                  );
                  return;
                }
                setRecommendModal(true);
              }}
            >
              <Text style={styles.addBtnText}>
                + {tx('recommendExaminers', lang)}
              </Text>
            </Pressable>

            {/* Existing recommendations list */}
            {recommendations.length === 0 ? (
              <EmptyState emoji="👥" text={lang === 'he' ? 'טרם שלחת המלצות בוחנים' : 'No examiner recommendations sent yet'} />
            ) : (
              recommendations.map((rec: any) => (
                <View key={rec.id} style={styles.appCard}>
                  <Text style={[styles.appProjectLabel, isRtl && styles.textRight]}>
                    📁 {lang === 'he' ? rec.projectTitleHe : rec.projectTitleEn}
                  </Text>
                  <View style={{
                    alignSelf: isRtl ? 'flex-end' : 'flex-start',
                    backgroundColor:
                      rec.status === 'approved' ? '#ECFDF5' :
                      rec.status === 'rejected' ? '#FEF2F2' : '#FFF7ED',
                    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, marginTop: 6,
                  }}>
                    <Text style={{
                      fontSize: 12, fontWeight: '700',
                      color:
                        rec.status === 'approved' ? '#10B981' :
                        rec.status === 'rejected' ? '#EF4444' : '#F59E0B',
                    }}>
                      {rec.status === 'approved' ? tx('examinerRecommendApproved', lang) :
                      rec.status === 'rejected' ? tx('examinerRecommendRejected', lang) :
                      tx('examinerRecommendPending', lang)}
                    </Text>
                  </View>
                  <Text style={[styles.cardMeta, isRtl && styles.textRight, { marginTop: 6 }]}>
                    👥 {rec.recommendedExaminers?.length ?? 0}{' '}
                    {lang === 'he' ? 'בוחנים הומלצו' : 'examiners recommended'}
                  </Text>
                  {rec.coordinatorNote ? (
                    <Text style={[styles.cardMeta, isRtl && styles.textRight]}>
                      💬 {rec.coordinatorNote}
                    </Text>
                  ) : null}
                </View>
              ))
            )}
          </>
        )}

        {activeTab === 'signoffs' && <PendingSignoffsWidget lang={lang} showEmptyState />}

        <View style={{ height: activeTab === 'projects' ? 90 : 40 }} />
      </ScrollView>

      {activeTab === 'projects' && (
        <View style={{
          position: 'absolute', left: 0, right: 0, bottom: 0,
          backgroundColor: '#fff', padding: 16,
          borderTopWidth: 1, borderTopColor: '#E5E7EB',
        }}>
          <Pressable style={styles.addBtn} onPress={() => setShowNewProject(true)}>
            <Text style={styles.addBtnText}>
              + {lang === 'he' ? 'פרסם פרויקט חדש' : 'Post New Project'}
            </Text>
          </Pressable>
        </View>
      )}

      {/* ── New Project Modal ── */}
      <NewProjectModal
        visible={showNewProject}
        setVisible={setShowNewProject}
        mode="supervisor"
        lang={lang}
        isRtl={isRtl}
        titleHe={newTitleHe}   setTitleHe={setNewTitleHe}
        titleEn={newTitleEn}   setTitleEn={setNewTitleEn}
        descHe={newDescHe}     setDescHe={setNewDescHe}
        descEn={newDescEn}     setDescEn={setNewDescEn}
        skills={newSkills}     setSkills={setNewSkills}
        prerequisites={newPrerequisites} setPrerequisites={setNewPrerequisites}
        faculty={facultyId}    setFaculty={setFacultyId}
        degreeTypes={newDegreeTypes}     setDegreeTypes={setNewDegreeTypes}
        projectTypes={newProjectTypes}   setProjectTypes={setNewProjectTypes}
        onCreate={handleCreateProject}
        creating={creating}
        maxStudents={maxStudents}
        setMaxStudents={setMaxStudents}
        facultyColors={FACULTY_COLORS}
        projectName={projectName}
        setProjectName={setProjectName}
        projectFile={projectFile}
        setProjectFile={setProjectFile}
        uploadingFile={uploadingProjectFile}
        selectedProgram={selectedProgram}
        setSelectedProgram={setSelectedProgram}
        restrictedMajors={supervisorAssignedMajors}
        currentUser={currentUser ?? undefined}
        pickFile={(b) => pickFile(b)}
        styles={styles}
      />

      {/* ── Grade Modal ── */}
      <Modal visible={gradeModal} animationType="slide" presentationStyle="formSheet">
        <View style={styles.modal}>
          <ScrollView contentContainerStyle={styles.modalContent}>
            <View style={[styles.modalHeader, isRtl && styles.rowReverse]}>
              <Text style={styles.modalTitle}>{lang === 'he' ? 'טופס ציון' : 'Grading Form'}</Text>
              <Pressable onPress={() => { setGradeModal(false); setGradeComment(''); }}>
                <Text style={styles.modalClose}>✕</Text>
              </Pressable>
            </View>

            {gradeMilestone && (
              <View style={styles.gradeContext}>
                <Text style={[styles.gradeContextTitle, isRtl && styles.textRight]}>
                  {lang === 'he' ? MILESTONE_LABEL[gradeMilestone.type]?.he : MILESTONE_LABEL[gradeMilestone.type]?.en}
                </Text>
                <Text style={[styles.gradeContextSub, isRtl && styles.textRight]}>
                  {lang === 'he' ? gradeMilestone.projectTitleHe : gradeMilestone.projectTitleEn}
                </Text>
                <Text style={[styles.gradeContextSub, isRtl && styles.textRight]}>
                  👤 {gradeMilestone.studentNames.join(', ')}
                </Text>
              </View>
            )}

            {activeFields.map((field) => (
              <View key={field.key}>
                <Text style={[styles.fieldLabel, isRtl && styles.textRight]}>
                  {lang === 'he' ? field.he : field.en}
                </Text>
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  value={criteria[field.key]}
                  onChangeText={(v) => setCriteria({ ...criteria, [field.key]: clampScoreInput(v, field.max) })}
                />
              </View>
            ))}

            {/* Group projects only: personal component per student, on top of the
                shared group score above — final grades can differ within the group. */}
            {gradeMilestone && gradeMilestone.studentIds.length > 1 && (
              <View style={{ marginTop: 12 }}>
                <Text style={[styles.fieldLabel, isRtl && styles.textRight]}>
                  {lang === 'he' ? 'ציון אישי (לצד הציון הקבוצתי)' : 'Individual grade (on top of the group score)'}
                </Text>
                {gradeMilestone.studentIds.map((sid, idx) => (
                  <View key={sid} style={{ marginBottom: 8 }}>
                    <Text style={[styles.gradeStudents, isRtl && styles.textRight]}>
                      👤 {gradeMilestone.studentNames[idx] ?? sid}
                    </Text>
                    <TextInput
                      style={styles.input}
                      keyboardType="numeric"
                      placeholder={lang === 'he' ? 'ציון אישי 0–100 (אופציונלי)' : 'Individual score 0–100 (optional)'}
                      placeholderTextColor="#9BA8C0"
                      value={individualScores[sid] ?? ''}
                      onChangeText={(v) => setIndividualScores({ ...individualScores, [sid]: clampScoreInput(v, 100) })}
                    />
                  </View>
                ))}
              </View>
            )}

            <Text style={[styles.fieldLabel, isRtl && styles.textRight]}>
              {lang === 'he' ? 'הערות לסטודנט' : 'Comments to Student'}
            </Text>
            <TextInput
              style={[styles.input, styles.textarea, isRtl && styles.textRight]}
              value={gradeComment}
              onChangeText={setGradeComment}
              multiline
              numberOfLines={5}
              placeholder={lang === 'he' ? 'הערות...' : 'Comments...'}
              placeholderTextColor="#9BA8C0"
              textAlign={isRtl ? 'right' : 'left'}
            />

            <Text style={{ marginTop: 10, fontWeight: '700' }}>Total: {totalScore}/100</Text>

            <Pressable
              style={[styles.submitBtn, submitting && { opacity: 0.6 }]}
              onPress={handleGrade}
              disabled={submitting}
            >
              {submitting
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.submitBtnText}>{lang === 'he' ? 'שלח ציון' : 'Submit Grade'}</Text>
              }
            </Pressable>
          </ScrollView>
        </View>
      </Modal>

      {/* ── Edit Project Modal ── */}
      <Modal visible={projectModal} animationType="slide">
        <View style={styles.modalRoot}>
          <ScrollView contentContainerStyle={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{lang === 'he' ? 'עריכת פרויקט' : 'Edit Project'}</Text>
              <Pressable onPress={() => setProjectModal(false)}>
                <Text style={styles.close}>✕</Text>
              </Pressable>
            </View>

            {[
              { label: lang === 'he' ? 'כותרת בעברית *'   : 'Hebrew Title *',        value: editTitleHe, set: setEditTitleHe, dir: 'rtl' },
              { label: lang === 'he' ? 'כותרת באנגלית *'  : 'English Title *',       value: editTitleEn, set: setEditTitleEn, dir: 'ltr' },
              { label: lang === 'he' ? 'תיאור בעברית'     : 'Hebrew Description',    value: editDescHe,  set: setEditDescHe,  dir: 'rtl', multi: true },
              { label: lang === 'he' ? 'תיאור באנגלית'    : 'English Description',   value: editDescEn,  set: setEditDescEn,  dir: 'ltr', multi: true },
            ].map((field) => (
              <View key={field.label}>
                <Text style={[styles.fieldLabel, isRtl && styles.textRight]}>{field.label}</Text>
                <TextInput
                  style={[styles.input, field.multi && styles.textarea, { textAlign: field.dir === 'rtl' ? 'right' : 'left' }]}
                  value={field.value}
                  onChangeText={field.set}
                  multiline={field.multi}
                  numberOfLines={field.multi ? 4 : 1}
                />
              </View>
            ))}
            <Text style={[styles.fieldLabel, isRtl && styles.textRight]}>
                        {tx('uploadProjectInfo', lang)} 
            </Text>
            <Pressable
              style={[styles.uploadBtn, editProjectFile && styles.uploadBtnDone]}
              onPress={() => pickFile(false)}
              disabled={uploadingProjectFile}
            >
              {uploadingProjectFile ? (
                <ActivityIndicator color="#2E86FF" />
              ) : (
                <Text style={styles.uploadBtnText}>
                  {editProjectFile
                    ? `✓ ${editProjectFileName}`
                    : `📄 ${tx('tapToUpload', lang)}`}
                </Text>
              )}
            </Pressable>
            <Pressable style={styles.submitBtn} onPress={() => handleEditProject(editProject)} disabled={saving}>
              {saving
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.submitBtnText}>{lang === 'he' ? 'שמור שינויים' : 'Save Changes'}</Text>
              }
            </Pressable>
          </ScrollView>
        </View>
      </Modal>

      <RecommendedExaminerModal
        recommendModal={recommendModal}
        setRecommendModal={setRecommendModal}
        lang={lang}
        isRtl={isRtl}
        extName={extName} setExtName={setExtName}
        extEmail={extEmail} setExtEmail={setExtEmail}
        extInstitution={extInstitution} setExtInstitution={setExtInstitution}
        extExpertise={extExpertise} setExtExpertise={setExtExpertise} 
        selectedProjectForRec={selectedProjectForRec} setSelectedProjectForRec={setSelectedProjectForRec}
        recExaminers={recExaminers} setRecExaminers={setRecExaminers}
        internalUsers={internalUsers} 
        myProjects={myProjects}
        recSubmitting={recSubmitting} 
        handleSubmitRecommendation={handleSubmitRecommendation}
        styles={styles}
      />

      <Modal visible={!!erasureProject} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setErasureProject(null)}>
        <View style={{ flex: 1, padding: 20, backgroundColor: '#fff' }}>
          <Text style={{ fontSize: 17, fontWeight: '700', color: '#111' }}>{tx('requestErasureTitle', lang)}</Text>
          {erasureProject && (
            <Text style={{ fontSize: 14, fontWeight: '600', color: '#111', marginTop: 6 }}>
              {lang === 'he' ? erasureProject.titleHe : erasureProject.titleEn}
            </Text>
          )}
          <Text style={{ fontSize: 13, color: '#8899BB', marginTop: 8 }}>{tx('requestErasureMessage', lang)}</Text>

          <TextInput
            value={erasureReason}
            onChangeText={setErasureReason}
            placeholder={tx('requestErasureReason', lang)}
            placeholderTextColor="#9CA3AF"
            multiline
            numberOfLines={3}
            style={{ borderWidth: 1, borderColor: '#D0DEFF', borderRadius: 8, padding: 10, marginTop: 16, fontSize: 14, minHeight: 80, textAlignVertical: 'top' }}
          />

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
            <Pressable
              onPress={() => { setErasureProject(null); setErasureReason(''); }}
              disabled={submittingErasure}
              style={{ flex: 1, borderWidth: 1, borderColor: '#D0DEFF', borderRadius: 8, paddingVertical: 12, alignItems: 'center' }}
            >
              <Text style={{ fontSize: 14, fontWeight: '600', color: '#111' }}>{tx('cancel', lang)}</Text>
            </Pressable>
            <Pressable
              onPress={submitErasureRequest}
              disabled={submittingErasure}
              style={{ flex: 1, backgroundColor: '#A8433A', borderRadius: 8, paddingVertical: 12, alignItems: 'center', opacity: submittingErasure ? 0.6 : 1 }}
            >
              {submittingErasure
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff' }}>{tx('requestErasure', lang)}</Text>}
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function EmptyState({ emoji, text }: { emoji: string; text: string }) {
  return (
    <View style={es.wrap}>
      <Text style={es.emoji}>{emoji}</Text>
      <Text style={es.text}>{text}</Text>
    </View>
  );
}

const es = SupervisorExtraStyles;

const styles = sharedStyles;