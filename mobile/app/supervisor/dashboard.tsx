// app/supervisor/home.tsx
import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet,
  SafeAreaView, ActivityIndicator, Modal, TextInput, Alert, Linking,
} from 'react-native';
import {
  collection, query, where, onSnapshot, doc,
  updateDoc, addDoc, serverTimestamp, getDoc, orderBy,
} from 'firebase/firestore';
import { db, auth } from '../../src/firebase/firebase';
import { useRouter } from 'expo-router';
import { type Lang } from '../../components/i18n';
import { TopBar, StatCard, FacultyBadge, StatusBadge, getFacultyColor, FACULTY_COLORS } from '../../components/shared';
import { sendPushNotification } from '../../components/pushNotifications';
import { createMilestonesOnApproval } from '@/components/Milestoneservice';
import { sharedStyles } from '@/constants';
import {NewProjectModal } from '@/components/modals';
// ─── Types ────────────────────────────────────────────────────────────────────

interface MyProject {
  id: string; titleHe: string; titleEn: string;
  facultyId: string; status: string; degreeType: string;
  enrolledStudentIds: string[]; applicationIds: string[];
  academicYear: string; projectType: string;
  descriptionHe: string; descriptionEn: string;
}

interface Application {
  id: string; projectId: string; projectTitleHe: string; projectTitleEn: string;
  studentId: string; studentName: string; studentEmail: string;
  transcriptUrl: string; cvUrl: string; coverNote: string;
  status: string; submittedAt: any;
}

interface PendingMilestone {
  id: string; projectId: string; projectTitleHe: string; projectTitleEn: string;
  type: string; status: string; studentNames: string[]; dueDate: any; submittedAt: any;
  fileUrls: string[]; submissionNote: string; facultyId: string;
}

// ─── Milestone type labels ────────────────────────────────────────────────────
const MILESTONE_LABEL: Record<string, { he: string; en: string }> = {
  research_proposal: { he: 'הצעת מחקר',    en: 'Research Proposal' },
  progress_report:   { he: 'דו"ח התקדמות', en: 'Progress Report' },
  final_report:      { he: 'דו"ח מסכם',    en: 'Final Report' },
  defense:           { he: 'הגנה',          en: 'Defense' },
};

export default function SupervisorHome() {
  const router = useRouter();
  const [lang, setLang] = useState<Lang>('he');
  const isRtl = lang === 'he';

  const [myProjects,    setMyProjects]    = useState<MyProject[]>([]);
  const [applications,  setApplications]  = useState<Application[]>([]);
  const [pendingGrades, setPendingGrades] = useState<PendingMilestone[]>([]);
  const [supervisorName, setSupervisorName] = useState('');
  const [facultyId,     setFacultyId]     = useState('');
  const [loading,       setLoading]       = useState(true);
  const [activeTab,     setActiveTab]     = useState<'projects' | 'applications' | 'grading'>('projects');
  const [unreadCount,   setUnreadCount]   = useState(0);

  // ── New project modal state ───────────────────────────────────────────────
  const [showNewProject, setShowNewProject] = useState(false);
  const [newTitleHe,  setNewTitleHe]  = useState('');
  const [newTitleEn,  setNewTitleEn]  = useState('');
  const [newDescHe,   setNewDescHe]   = useState('');
  const [newDescEn,   setNewDescEn]   = useState('');
  const [newDegree,   setNewDegree]   = useState<'bachelors' | 'masters' | 'both'>('bachelors');
  const [newType,     setNewType]     = useState<'project' | 'thesis'>('project');
  const [newSkills,   setNewSkills]   = useState('');
  const [creating,    setCreating]    = useState(false);
  const [maxStudents, setMaxStudents] = useState<number>(1);
  // ── Grade modal state ─────────────────────────────────────────────────────
  const [gradeModal,  setGradeModal]  = useState(false);
  const [gradeMilestone, setGradeMilestone] = useState<PendingMilestone | null>(null);
  //________________________________NEED TO UPDATE BASED ON THE DEMANDS OF hit____________________________________
  const [criteria, setCriteria] = useState({
    clarity: '',
    methodology: '',
    feasibility: '',
    innovation: '',
    writing: '',
  });
  const totalScore =
  Number(criteria.clarity || 0) +
  Number(criteria.methodology || 0) +
  Number(criteria.feasibility || 0) +
  Number(criteria.innovation || 0) +
  Number(criteria.writing || 0);
  //_____________________________________UNTILL HERE____________________________________
  const [gradeComment,setGradeComment]= useState('');
  const [submittingGrade, setSubmittingGrade] = useState(false);
// ── project editing modal state ─────────────────────────────────────────────────────
  const [projectModal, setProjectModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editFaculty, setEditFaculty] = useState('');
  const [editProject, setEditProject] = useState<MyProject | null>(null);
  const [editDegree, setEditDegree] = useState<'bachelors' | 'masters' | ''>('');
  const [editProjectType, setEditProjectType] = useState<'project' | 'thesis'>('project');
  const [editTitleHe, setEditTitleHe] = useState('');
  const [editTitleEn, setEditTitleEn] = useState('');
  const [editDescHe, setEditDescHe] = useState('');
  const [editDescEn, setEditDescEn] = useState('');
  const [editSkills, setEditSkills] = useState('');
  //-----------------------------------------------------
  const unsubProjectsRef     = useRef<(() => void) | null>(null);
  const unsubApplicationsRef = useRef<(() => void) | null>(null);
  const unsubGradesRef       = useRef<(() => void) | null>(null);
  const unsubNotifsRef       = useRef<(() => void) | null>(null);
  const uid = auth.currentUser?.uid;
  const isHebrew = (text: string) => {
    return /^[\u0590-\u05FF\s.,!?'"()-]*$/.test(text);
  };
  const isEnglish = (text: string) => {
    return /^[A-Za-z\s.,!?'"()-]*$/.test(text);
  };

  // ── Load data ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!uid) return;
    const init = async () => {
      const userSnap = await getDoc(doc(db, 'users', uid));
      if (userSnap.exists()) {
        setSupervisorName(userSnap.data().displayName ?? '');
        setFacultyId(userSnap.data().facultyId ?? '');
      }
    };
    init();
  }, [uid]);

  // Live: my projects
  useEffect(() => {
    if (!uid || !facultyId) return;
    const q = query(
      collection(db, 'projects'),
      where('facultyId', '==', facultyId),
      where('supervisorId', '==', uid),
      where('isArchived', '==', false),
      orderBy('createdAt', 'desc')
    );
    unsubProjectsRef.current = onSnapshot(q, (snap) => {
      setMyProjects(snap.docs.map((d) => ({ id: d.id, ...d.data() } as MyProject)));
      setLoading(false);
    }, (err) => {
      console.error("Projects listener error:", err);
    });;
    return () => unsubProjectsRef.current?.();
  }, [uid, facultyId]);

  // Live: applications pending my review
  useEffect(() => {
    if (!uid || !facultyId) return;
    const q = query(
      collection(db, 'applications'),
      where('supervisorId', '==', uid),
      where('status', 'in', ['pending', 'meeting_requested'])
    );
    unsubApplicationsRef.current = onSnapshot(q, async (snap) => {
      const items: Application[] = [];
      for (const d of snap.docs) {
        const data = d.data();
        
        // Wrap these in try-catch because if one project is in a different faculty, 
        // the rule will block the getDoc call.
        try {
          const [projSnap, studentSnap] = await Promise.all([
            getDoc(doc(db, 'projects', data.projectId)),
            getDoc(doc(db, 'users', data.studentId)),
          ]);

          items.push({
            id: d.id,
            projectId: data.projectId,
            projectTitleHe: projSnap.data()?.titleHe ?? '',
            projectTitleEn: projSnap.data()?.titleEn ?? '',
            studentId: data.studentId,
            studentName: studentSnap.data()?.displayName ?? '',
            studentEmail: studentSnap.data()?.email ?? '',
            transcriptUrl: data.transcriptUrl,
            cvUrl: data.cvUrl,
            coverNote: data.coverNote,
            status: data.status,
            submittedAt: data.submittedAt,
          });
        } catch (e) {
          console.warn("Could not fetch details for application:", d.id, e);
        }
      }
      setApplications(items);
    });
    return () => unsubApplicationsRef.current?.();
  }, [uid, facultyId]);

  // Live: milestones I need to grade (submitted, awaiting supervisor)
  useEffect(() => {
    if (!uid) return;
    const q = query(
      collection(db, 'milestones'),
      where('supervisorId', '==', uid),
      where('status', '==', 'submitted'),
    );
    unsubGradesRef.current = onSnapshot(q, async (snap) => {
      const items: PendingMilestone[] = [];
      for (const d of snap.docs) {
        const data = d.data();
        const projSnap = await getDoc(doc(db, 'projects', data.projectId));
        if (projSnap.data()?.supervisorId !== uid) continue;
        const studentNames: string[] = [];
        for (const sid of (data.studentIds ?? [])) {
          const sSnap = await getDoc(doc(db, 'users', sid));
          if (sSnap.exists()) studentNames.push(sSnap.data().displayName);
        }
        items.push({
          id:              d.id,
          projectId:       data.projectId,
          projectTitleHe:  projSnap.data()?.titleHe ?? '',
          projectTitleEn:  projSnap.data()?.titleEn ?? '',
          type:            data.type,
          status:          data.status,
          studentNames,
          dueDate:         data.dueDate,
          submittedAt:     data.submittedAt,
          fileUrls:        data.fileUrls ?? [],
          submissionNote:  data.submissionNote ?? '',
          facultyId:       projSnap.data()?.facultyId ?? '',
        });
      }
      setPendingGrades(items);
    });
    return () => unsubGradesRef.current?.();
  }, [uid]);

  // Notifications unread count
  useEffect(() => {
    if (!uid) return;
    const q = query(
      collection(db, 'notifications'),
      where('recipientId', '==', uid),
      where('isRead', '==', false)
    );
    unsubNotifsRef.current = onSnapshot(q, (snap) => setUnreadCount(snap.size));
    return () => unsubNotifsRef.current?.();
  }, [uid]);

  // ── Create project ─────────────────────────────────────────────────────────
  const handleCreateProject = async () => {
    if (!newTitleHe.trim() || !newTitleEn.trim()) {
      Alert.alert(lang === 'he' ? 'שגיאה' : 'Error',
        lang === 'he' ? 'יש למלא כותרת בעברית ואנגלית' : 'Title in both languages is required');
      return;
    }
    else if(!isHebrew(newTitleHe) || !isHebrew(newDescHe)){
      Alert.alert(
        lang === 'he' ? 'שגיאה' : 'Error',
        lang === 'he' ? 'אתה יכול לכתוב רק בעברית בשדה זה' : 'You can only write in Hebrew in this field'
      );
      return;          
    }else if(!isEnglish(newTitleEn) || !isEnglish(newDescEn)){
      Alert.alert(
        lang === 'he' ? 'שגיאה' : 'Error',
        lang === 'he' ? 'אתה יכול לכתוב רק באנגלית בשדה זה' : 'You can only write in English in this field'
      );
      return;
    }
    setCreating(true);
    try {
      // ✅ facultyId already loaded in state from the init useEffect — use it directly
      const projectRef = await addDoc(collection(db, 'projects'), {
        supervisorId:       uid,        // ✅ uid is already the supervisor's UID
        facultyId,                      // ✅ already in state
        titleHe:            newTitleHe.trim(),
        titleEn:            newTitleEn.trim(),
        descriptionHe:      newDescHe.trim(),
        descriptionEn:      newDescEn.trim(),
        degreeType:         newDegree,
        projectType:        newType,
        maxStudents:        maxStudents,
        requiredSkills:     newSkills.split(',').map((s) => s.trim()).filter(Boolean),
        status:             'published',
        enrolledStudentIds: [],
        applicationIds:     [],
        semesterStart:      null,
        academicYear:       new Date().getFullYear() + '-' + (new Date().getFullYear() + 1),
        isArchived:         false,
        createdAt:          serverTimestamp(),
        updatedAt:          serverTimestamp(),
      });

      setShowNewProject(false);
      setNewTitleHe(''); setNewTitleEn('');
      setNewDescHe('');  setNewDescEn('');
      setNewSkills('');

      // ✅ Push notification using already-loaded supervisor data (no extra fetch needed)
      const supervisorSnap = await getDoc(doc(db, 'users', uid!));
      const expoPushToken = supervisorSnap.data()?.expoPushToken;
      if (expoPushToken) {
        await sendPushNotification(expoPushToken, '📢 New Project Published!',
          'A new project is available. Check it now!',
          { projectId: projectRef.id, type: 'project_published' }
        );
      }

      // ✅ Don't create milestones on publish — only on student approval
      Alert.alert('✅', lang === 'he' ? 'הפרויקט פורסם בהצלחה!' : 'Project published successfully!');
      await createMilestonesOnApproval({
          projectId: projectRef.id,
          studentIds: [], // No students yet at this stage
          facultyId,      // ✅ already in state
          supervisorId: uid!, // ✅ uid IS the supervisor ID
        });
    } catch (e) {
      console.error(e);
    } finally {
      setCreating(false);
    }
  };

  // ── Application decision ───────────────────────────────────────────────────
  const handleDecision = async (
    appId: string, 
    projectId: string,
    decision: 'approved' | 'rejected' | 'meeting_requested',
    studentId: string
  ) => {
    try {
      // Update application status
      await updateDoc(doc(db, 'applications', appId), {
        status: decision,
        reviewedAt: serverTimestamp(),
      });

      // If approved -> enroll student
      if (decision === 'approved') {
        await updateDoc(doc(db, 'projects', projectId), {
          enrolledStudentIds: [studentId],
          status: 'in_progress',
          updatedAt: serverTimestamp(),
        });
        await updateDoc(doc(db, 'users', studentId), {
          hasActiveProject: true,
          activeProjectId: projectId,
          supervisorId: uid,
          updatedAt: serverTimestamp(),
        });
        await createMilestonesOnApproval({
          projectId,
          studentIds: [studentId],
          facultyId,      // ✅ already in state
          supervisorId: uid!, // ✅ uid IS the supervisor ID
        });
      }
      // ─────────────────────────────────────────────
      // GET STUDENT TOKEN (FIX FOR YOUR ERROR)
      // ─────────────────────────────────────────────
      const studentSnap = await getDoc(doc(db, 'users', studentId));

      const studentData = studentSnap.exists()
        ? (studentSnap.data() as { expoPushToken?: string })
        : null;

      const token = studentData?.expoPushToken;
      // ─────────────────────────────────────────────
      // CREATE NOTIFICATION FOR THE STUDENT
      // ─────────────────────────────────────────────

      let titleHe = '';
      let titleEn = '';
      let bodyHe = '';
      let bodyEn = '';

      if (decision === 'approved') {
        titleHe = 'המועמדות אושרה';
        titleEn = 'Application Approved';

        bodyHe = 'המנחה אישר את המועמדות שלך לפרויקט.';
        bodyEn = 'Your application for the project was approved.';
      }

      if (decision === 'rejected') {
        titleHe = 'המועמדות נדחתה';
        titleEn = 'Application Rejected';

        bodyHe = 'המנחה דחה את המועמדות שלך לפרויקט.';
        bodyEn = 'Your application for the project was rejected.';
      }

      if (decision === 'meeting_requested') {
        titleHe = 'נקבעה פגישה';
        titleEn = 'Meeting Requested';

        bodyHe = 'המנחה ביקש לקבוע פגישה לגבי המועמדות שלך.';
        bodyEn = 'The supervisor requested a meeting regarding your application.';
      }

      await addDoc(collection(db, 'notifications'), {
        recipientId: studentId,

        type: decision, // application_approved / rejected / meeting_requested

        titleHe,
        titleEn,

        bodyHe,
        bodyEn,

        isRead: false,

        createdAt: serverTimestamp(),

        relatedProjectId: projectId,
        relatedMilestoneId: null,
      });

      // ─────────────────────────────────────────────
      // SEND PUSH NOTIFICATION (FIXED)
      // ─────────────────────────────────────────────

      if (token) {
        await sendPushNotification(
          token,
          titleEn,
          bodyEn,
          {
            type: decision,
            relatedProjectId: projectId,
          }
        );
      }

      Alert.alert(
        '✅',
        lang === 'he'
          ? 'הפעולה בוצעה בהצלחה'
          : 'Action completed successfully'
      );

    } catch (e) {
      console.error('Decision error:', e);

      Alert.alert(
        'Error',
        lang === 'he'
          ? 'אירעה שגיאה'
          : 'Something went wrong'
      );
    }
  };
  // ── Grade submission ───────────────────────────────────────────────────────
  const handleGrade = async () => {
  if (!gradeMilestone) return;

  if (totalScore < 0 || totalScore > 100) {
    Alert.alert(
      lang === 'he' ? 'שגיאה' : 'Error',
      lang === 'he'
        ? 'ציון כולל חייב להיות בין 0 ל-100'
        : 'Total score must be between 0 and 100'
    );
    return;
  }

  setSubmittingGrade(true);

  try {
    const gradeRef = await addDoc(collection(db, 'grades'), {
      milestoneId: gradeMilestone.id,
      projectId: gradeMilestone.projectId,
      graderId: uid,
      graderRole: 'supervisor',

      // 🔥 NEW STRUCTURED DATA
      grading: {
        clarity: Number(criteria.clarity || 0),
        methodology: Number(criteria.methodology || 0),
        feasibility: Number(criteria.feasibility || 0),
        innovation: Number(criteria.innovation || 0),
        writing: Number(criteria.writing || 0),
        total: totalScore,
      },

      comments: gradeComment,

      submittedAt: serverTimestamp(),
      isFinalized: true,
    });

    await updateDoc(doc(db, 'milestones', gradeMilestone.id), {
      status: 'supervisor_graded',

      // store reference to grade doc
      supervisorGradeId: gradeRef.id,

      finalGrade: totalScore,
    });

    setGradeModal(false);
    setCriteria({
      clarity: '',
      methodology: '',
      feasibility: '',
      innovation: '',
      writing: '',
    });
    setGradeComment('');
  } catch (e) {
    console.error(e);
  } finally {
    setSubmittingGrade(false);
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
    setProjectModal(true);
  };

  const handleEditProject = async (project: MyProject | null) => {
    if (!project) return;
    else if(!isHebrew(editTitleHe) || !isHebrew(editDescHe)){
      Alert.alert(
        lang === 'he' ? 'שגיאה' : 'Error',
        lang === 'he' ? 'אתה יכול לכתוב רק בעברית בשדה זה' : 'You can only write in Hebrew in this field'
      );
      return;          
    }else if(!isEnglish(editTitleEn) || !isEnglish(editDescEn)){
      Alert.alert(
        lang === 'he' ? 'שגיאה' : 'Error',
        lang === 'he' ? 'אתה יכול לכתוב רק באנגלית בשדה זה' : 'You can only write in English in this field'
      );
      return;
    }
      try {
        setSaving(true);
    
        await updateDoc(doc(db, 'projects', project.id), {
          titleHe: editTitleHe.trim(),
          titleEn: editTitleEn.trim(),
          descriptionHe: editDescHe.trim(),
          descriptionEn: editDescEn.trim(),
          degreeType: editDegree,
          projectType: editProjectType,
          facultyId: editFaculty,
          requiredSkills: editSkills
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
          updatedAt: serverTimestamp(),
        });
    
        Alert.alert(
          lang === 'he' ? 'הצלחה' : 'Success',
          lang === 'he'
            ? 'הפרויקט עודכן בהצלחה'
            : 'Project updated successfully'
        );
    
        setProjectModal(false);

      } catch (e) {
        console.log(e);
      } finally {
        setSaving(false);
      }
    };


  const handleDeleteProject = async (projectId: string) => {
    Alert.alert(
          lang === 'he' ? 'מחק פרויקט' : 'Delete Project',
          lang === 'he' ? 'האם אתה בטוח?' : 'Are you sure?',
          [
            { text: lang === 'he' ? 'ביטול' : 'Cancel', style: 'cancel' },
            {
              text: lang === 'he' ? 'מחק' : 'Delete',
              style: 'destructive',
              onPress: async () => {
                try {
                  await updateDoc(doc(db, 'projects', projectId), {
                    isArchived: true,
                    deletedAt: serverTimestamp(),
                  });
                } catch (e) {
                  console.log(e);
                }
              },
            },
          ]
        );
  };

  const handleOpenDocument = async (url: string) => {
    if (!url) {
      Alert.alert(lang === 'he' ? 'לא נמצא מסמך' : 'Document not found');
      return;
    }

    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        Alert.alert(lang === 'he' ? 'לא ניתן לפתוח את הקישור' : 'Unable to open link');
      }
    } catch (e) {
      console.error('handleOpenDocument:', e);
      Alert.alert(lang === 'he' ? 'שגיאה בפתיחת המסמך' : 'Error opening document');
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#2E86FF" />
      </View>
    );
  }

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.root}>
      <TopBar
        name={supervisorName}
        role="supervisor"
        lang={lang}
        isRtl={isRtl}
        unreadCount={unreadCount}
        onToggleLang={() => setLang(lang === 'he' ? 'en' : 'he')}
        onBell={() => router.push('/(tabs)/notifications')}
        onBeforeSignOut={() => {         // ← add this
          unsubProjectsRef.current?.();
          unsubApplicationsRef.current?.();
          unsubGradesRef.current?.();
          unsubNotifsRef.current?.();
        }}
      />

      {/* Stats row */}
      <View style={[styles.statsRow, isRtl && styles.rowReverse]}>
        <StatCard emoji="📁" value={myProjects.length}
          label={lang === 'he' ? 'הפרויקטים שלי' : 'My Projects'} color="#2E86FF" />
        <View style={styles.statGap} />
        <StatCard emoji="📨" value={applications.length}
          label={lang === 'he' ? 'מועמדויות ממתינות' : 'Pending Applications'} color="#F59E0B" />
        <View style={styles.statGap} />
        <StatCard emoji="✏️" value={pendingGrades.length}
          label={lang === 'he' ? 'ממתינות לציון' : 'Need Grading'} color="#8B5CF6" />
      </View>

      {/* Tabs */}
      <View style={styles.tabBar}>
        {([
          { key: 'projects',     heLabel: 'פרויקטים',   enLabel: 'Projects',     badge: myProjects.length },
          { key: 'applications', heLabel: 'מועמדויות',  enLabel: 'Applications', badge: applications.length },
          { key: 'grading',      heLabel: 'מתן ציונים', enLabel: 'Grading',      badge: pendingGrades.length },
        ] as const).map((tab) => (
          <Pressable
            key={tab.key}
            style={[styles.tab, activeTab === tab.key && styles.tabActive]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
              {lang === 'he' ? tab.heLabel : tab.enLabel}
            </Text>
            {tab.badge > 0 && (
              <View style={[styles.tabBadge, activeTab === tab.key && styles.tabBadgeActive]}>
                <Text style={styles.tabBadgeText}>{tab.badge}</Text>
              </View>
            )}
          </Pressable>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* ════ PROJECTS TAB ════ */}
        {activeTab === 'projects' && (
          <>
            <Pressable style={styles.addBtn} onPress={() => setShowNewProject(true)}>
              <Text style={styles.addBtnText}>
                + {lang === 'he' ? 'פרסם פרויקט חדש' : 'Post New Project'}
              </Text>
            </Pressable>

            {myProjects.length === 0 ? (
              <EmptyState emoji="📭" text={lang === 'he' ? 'טרם פרסמת פרויקטים' : 'No projects posted yet'} />
            ) : (
              myProjects.map((p) => {
                const fc = getFacultyColor(p.facultyId);
                return (
                  <View key={p.id} style={[styles.projectCard, { borderLeftColor: fc.primary }]}>
                    <View style={[styles.row, isRtl && styles.rowReverse, { marginBottom: 8 }]}>
                      <FacultyBadge facultyId={p.facultyId} lang={lang} />
                      <View style={styles.rowGap} />
                      <StatusBadge status={p.status} lang={lang} />
                    </View>
                    <Text style={[styles.cardTitle, isRtl && styles.textRight]}>
                      {lang === 'he' ? p.titleHe : p.titleEn}
                    </Text>
                    <View style={[styles.row, isRtl && styles.rowReverse, { marginTop: 6 }]}>
                      <Text style={styles.cardMeta}>
                        {lang === 'he'
                          ? p.degreeType === 'bachelors' ? 'תואר ראשון' : 'תואר שני' 
                          : p.degreeType === 'bachelors' ? "Bachelor's" : "Master's" }
                        {' · '}
                        {lang === 'he'
                          ? p.projectType === 'project' ? 'פרויקט' : 'תזה'
                          : p.projectType === 'project' ? 'Project' : 'Thesis'}
                        {' · '}
                        {lang === 'he' ? 'סטודנטים' : 'Students'}: {p.enrolledStudentIds.length}/{1}
                      </Text>
                    </View>
                    {(p.applicationIds?.length ?? 0) > 0 && (
                      <View style={styles.appCount}>
                        <Text style={styles.appCountText}>
                          📨 {p.applicationIds?.length ?? 0} {lang === 'he' ? 'מועמדויות' : 'applications'}
                        </Text>
                      </View>
                    )}
                    <View style={[styles.actionRow, isRtl && styles.rowReverse]}>
                      <Pressable
                        style={[styles.actionBtn, styles.editBtn]}
                        onPress={() => handleOpenEditModal(p)}
                      >
                        <Text style={styles.actionBtnText}>
                          {lang === 'he' ? 'עריכה' : 'Edit'}
                        </Text>
                      </Pressable>

                      <Pressable
                        style={[styles.actionBtn, styles.deleteBtn]}
                        onPress={() => handleDeleteProject(p.id)}
                      >
                        <Text style={styles.actionBtnText}>
                          {lang === 'he' ? 'מחיקה' : 'Delete'}
                        </Text>
                      </Pressable>
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
            {applications.length === 0 ? (
              <EmptyState emoji="📬" text={lang === 'he' ? 'אין מועמדויות חדשות' : 'No pending applications'} />
            ) : (
              applications.map((app) => (
                <View key={app.id} style={styles.appCard}>
                  {/* Project */}
                  <Text style={[styles.appProjectLabel, isRtl && styles.textRight]}>
                    📁 {lang === 'he' ? app.projectTitleHe : app.projectTitleEn}
                  </Text>

                  {/* Student info */}
                  <View style={[styles.row, isRtl && styles.rowReverse, { marginVertical: 8 }]}>
                    <View style={styles.studentAvatar}>
                      <Text style={styles.studentAvatarText}>
                        {app.studentName?.charAt(0)?.toUpperCase() ?? 'S'}
                      </Text>
                    </View>
                    <View style={{ marginLeft: isRtl ? 0 : 10, marginRight: isRtl ? 10 : 0 }}>
                      <Text style={[styles.studentName, isRtl && styles.textRight]}>{app.studentName}</Text>
                      <Text style={[styles.studentEmail, isRtl && styles.textRight]}>{app.studentEmail}</Text>
                    </View>
                    <View style={styles.rowGap} />
                    <StatusBadge status={app.status} lang={lang} />
                  </View>

                  {/* Cover note */}
                  {app.coverNote ? (
                    <View style={styles.coverNote}>
                      <Text style={[styles.coverNoteText, isRtl && styles.textRight]} numberOfLines={3}>
                        {app.coverNote}
                      </Text>
                    </View>
                  ) : null}

                  {/* Document links */}
                  <View style={[styles.docsRow, isRtl && styles.rowReverse]}>
                    {app.transcriptUrl ? (
                      <Pressable
                        style={styles.docChip}
                        onPress={() => handleOpenDocument(app.transcriptUrl)}
                      >
                        <Text style={styles.docChipText}>📄 {lang === 'he' ? 'גיליון ציונים' : 'Transcript'}</Text>
                      </Pressable>
                    ) : null}
                    {app.cvUrl ? (
                      <Pressable
                        style={styles.docChip}
                        onPress={() => handleOpenDocument(app.cvUrl)}
                      >
                        <Text style={styles.docChipText}>📋 {lang === 'he' ? 'קורות חיים' : 'CV'}</Text>
                      </Pressable>
                    ) : null}
                  </View>

                  {/* Decision buttons */}
                  <View style={[styles.decisionRow, isRtl && styles.rowReverse]}>
                    <Pressable
                      style={styles.approveBtn}
                      onPress={() => handleDecision(app.id, app.projectId, 'approved', app.studentId)}
                    >
                      <Text style={styles.approveBtnText}>
                        ✓ {lang === 'he' ? 'אשר' : 'Approve'}
                      </Text>
                    </Pressable>
                    <Pressable
                      style={styles.meetingBtn}
                      onPress={() => handleDecision(app.id, app.projectId, 'meeting_requested', app.studentId)}
                    >
                      <Text style={styles.meetingBtnText}>
                        📅 {lang === 'he' ? 'בקש פגישה' : 'Request Meeting'}
                      </Text>
                    </Pressable>
                    <Pressable
                      style={styles.rejectBtn}
                      onPress={() => handleDecision(app.id, app.projectId, 'rejected', app.studentId)}
                    >
                      <Text style={styles.rejectBtnText}>
                        ✕ {lang === 'he' ? 'דחה' : 'Reject'}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              ))
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
                const fc = getFacultyColor(m.facultyId);
                const label = lang === 'he'
                  ? MILESTONE_LABEL[m.type]?.he ?? m.type
                  : MILESTONE_LABEL[m.type]?.en ?? m.type;
                return (
                  <View key={m.id} style={[styles.gradeCard, { borderLeftColor: fc.primary }]}>
                    <Text style={[styles.gradeMilestoneType, { color: fc.primary }, isRtl && styles.textRight]}>
                      {label}
                    </Text>
                    <Text style={[styles.gradeProjectTitle, isRtl && styles.textRight]}>
                      📁 {lang === 'he' ? m.projectTitleHe : m.projectTitleEn}
                    </Text>
                    <Text style={[styles.gradeStudents, isRtl && styles.textRight]}>
                      👤 {m.studentNames.join(', ')}
                    </Text>
                    {m.submittedAt && (
                      <Text style={[styles.gradeDate, isRtl && styles.textRight]}>
                        📅 {lang === 'he' ? 'הוגש:' : 'Submitted:'}{' '}
                        {m.submittedAt?.toDate?.().toLocaleDateString(
                          lang === 'he' ? 'he-IL' : 'en-GB',
                          { day: 'numeric', month: 'short', year: 'numeric' }
                        )}
                      </Text>
                    )}
                    {m.fileUrls.length > 0 && (
                      <Text style={styles.filesNote}>
                        📎 {m.fileUrls.length} {lang === 'he' ? 'קבצים מצורפים' : 'files attached'}
                      </Text>
                    )}
                    {m.submissionNote ? (
                      <Text style={[styles.submissionNote, isRtl && styles.textRight]} numberOfLines={2}>
                        💬 {m.submissionNote}
                      </Text>
                    ) : null}
                    <Pressable
                      style={[styles.gradeBtn, { backgroundColor: fc.primary }]}
                      onPress={() => { setGradeMilestone(m); setGradeModal(true); }}
                    >
                      <Text style={styles.gradeBtnText}>
                        ✏️ {lang === 'he' ? 'תן ציון' : 'Grade'}
                      </Text>
                    </Pressable>
                  </View>
                );
              })
            )}
          </>
        )}
        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ── New Project Modal ── */}
      <NewProjectModal
        visible={showNewProject}
        setVisible={setShowNewProject}
        mode="supervisor"
        lang={lang}
        isRtl={isRtl}

        titleHe={newTitleHe}
        setTitleHe={setNewTitleHe}
        titleEn={newTitleEn}
        setTitleEn={setNewTitleEn}

        descHe={newDescHe}
        setDescHe={setNewDescHe}
        descEn={newDescEn}
        setDescEn={setNewDescEn}

        skills={newSkills}
        setSkills={setNewSkills}

        faculty={facultyId}
        setFaculty={setFacultyId}

        degree={newDegree}
        setDegree={setNewDegree}

        type={newType}
        setType={setNewType}

        onCreate={handleCreateProject}
        creating={creating}

        maxStudents={maxStudents}
        setMaxStudents={setMaxStudents}

        facultyColors={FACULTY_COLORS}
        styles={styles}

      />

      {/* ── Grade Modal ── */}
      <Modal visible={gradeModal} animationType="slide" presentationStyle="formSheet">
        <View style={styles.modal}>
          <ScrollView contentContainerStyle={styles.modalContent}>
            <View style={[styles.modalHeader, isRtl && styles.rowReverse]}>
              <Text style={styles.modalTitle}>
                {lang === 'he' ? 'טופס ציון' : 'Grading Form'}
              </Text>
              <Pressable onPress={() => { setGradeModal(false); setGradeComment(''); }}>
                <Text style={styles.modalClose}>✕</Text>
              </Pressable>
            </View>

            {gradeMilestone && (
              <View style={styles.gradeContext}>
                <Text style={[styles.gradeContextTitle, isRtl && styles.textRight]}>
                  {lang === 'he'
                    ? MILESTONE_LABEL[gradeMilestone.type]?.he
                    : MILESTONE_LABEL[gradeMilestone.type]?.en}
                </Text>
                <Text style={[styles.gradeContextSub, isRtl && styles.textRight]}>
                  {lang === 'he' ? gradeMilestone.projectTitleHe : gradeMilestone.projectTitleEn}
                </Text>
                <Text style={[styles.gradeContextSub, isRtl && styles.textRight]}>
                  👤 {gradeMilestone.studentNames.join(', ')}
                </Text>
              </View>
            )}

            <Text style={[styles.fieldLabel, isRtl && styles.textRight]}>
              {lang === 'he' ? 'בהירות המחקר (0–20)' : 'Research Clarity (0–20)'}
            </Text>
              <TextInput
                style={styles.input}
                keyboardType="numeric"
                value={criteria.clarity}
                onChangeText={(v) => setCriteria({ ...criteria, clarity: v })}
              />

              <Text style={[styles.fieldLabel, isRtl && styles.textRight]}>
                {lang === 'he' ? 'מתודולוגיה (0–25)' : 'Methodology (0–25)'}
              </Text>
              <TextInput
                style={styles.input}
                keyboardType="numeric"
                value={criteria.methodology}
                onChangeText={(v) => setCriteria({ ...criteria, methodology: v })}
              />

              <Text style={[styles.fieldLabel, isRtl && styles.textRight]}>
                {lang === 'he' ? 'ישימות (0–20)' : 'Feasibility (0–20)'}
              </Text>
              <TextInput
                style={styles.input}
                keyboardType="numeric"
                value={criteria.feasibility}
                onChangeText={(v) => setCriteria({ ...criteria, feasibility: v })}
              />

              <Text style={[styles.fieldLabel, isRtl && styles.textRight]}>
                {lang === 'he' ? 'חדשנות (0–15)' : 'Innovation (0–15)'}
              </Text>
              <TextInput
                style={styles.input}
                keyboardType="numeric"
                value={criteria.innovation}
                onChangeText={(v) => setCriteria({ ...criteria, innovation: v })}
              />

              <Text style={[styles.fieldLabel, isRtl && styles.textRight]}>
                {lang === 'he' ? 'כתיבה (0–20)' : 'Writing Quality (0–20)'}
              </Text>
              <TextInput
                style={styles.input}
                keyboardType="numeric"
                value={criteria.writing}
                onChangeText={(v) => setCriteria({ ...criteria, writing: v })}
              />

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

            <Text style={{ marginTop: 10, fontWeight: '700' }}>
              Total: {totalScore}/100
            </Text>
            <Pressable
              style={[styles.submitBtn, submittingGrade && { opacity: 0.6 }]}
              onPress={handleGrade}
              disabled={submittingGrade}
            >
              {submittingGrade
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.submitBtnText}>{lang === 'he' ? 'שלח ציון' : 'Submit Grade'}</Text>
              }
            </Pressable>
          </ScrollView>
        </View>
      </Modal>
      <Modal visible={projectModal} animationType="slide">
        <View style={styles.modalRoot}>
          <ScrollView contentContainerStyle={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {lang === 'he' ? 'עריכת פרויקט' : 'Edit Project'}
              </Text>

              <Pressable onPress={() => setProjectModal(false)}>
                <Text style={styles.close}>✕</Text>
              </Pressable>
            </View>

            {[
              { label: lang === 'he' ? 'כותרת בעברית *' : 'Hebrew Title *', value: editTitleHe, set: setEditTitleHe, dir: 'rtl' },
              { label: lang === 'he' ? 'כותרת באנגלית *' : 'English Title *', value: editTitleEn, set: setEditTitleEn, dir: 'ltr' },
              { label: lang === 'he' ? 'תיאור בעברית' : 'Hebrew Description', value: editDescHe, set: setEditDescHe, dir: 'rtl', multi: true },
              { label: lang === 'he' ? 'תיאור באנגלית' : 'English Description', value: editDescEn, set: setEditDescEn, dir: 'ltr', multi: true },
              { label: lang === 'he' ? 'טכנולוגיות (מופרדות בפסיק)' : 'Technologies (comma separated)', value: editSkills, set: setEditSkills, dir: 'ltr' },
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

            {/* Degree */}
            <Text style={styles.fieldLabel}>
              {lang === 'he' ? 'תואר' : 'Degree'}
            </Text>

            <View style={[styles.toggleRow, isRtl && styles.rowReverse]}>
              {(['bachelors', 'masters'] as const).map((d) => (
                <Pressable
                  key={d}
                  style={[
                    styles.toggleBtn,
                    editDegree === d && styles.toggleBtnActive,
                  ]}
                  onPress={() => {
                    setEditDegree(d);

                    if (d === 'bachelors') {
                      setEditProjectType('project');
                    }
                  }}
                >
                  <Text
                    style={[
                      styles.toggleText,
                      editDegree === d && styles.toggleTextActive,
                    ]}
                  >
                    {d === 'bachelors'
                      ? (lang === 'he' ? 'תואר ראשון' : 'B.Sc.')
                      : (lang === 'he' ? 'תואר שני' : 'M.Sc.')}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Project Type */}
            <Text style={styles.fieldLabel}>
              {lang === 'he' ? 'סוג' : 'Type'}
            </Text>

            <View style={[styles.toggleRow, isRtl && styles.rowReverse]}>
              {(['project', 'thesis'] as const).map((tp) => {
                const isDisabled =
                  tp === 'thesis' && editDegree === 'bachelors';

                return (
                  <Pressable
                    key={tp}
                    style={[
                      styles.toggleBtn,
                      editProjectType === tp && styles.toggleBtnActive,
                      isDisabled && styles.toggleBtnDisabled,
                    ]}
                    onPress={() => {
                      if (!isDisabled) {
                        setEditProjectType(tp);
                      }
                    }}
                    disabled={isDisabled}
                  >
                    <Text
                      style={[
                        styles.toggleText,
                        editProjectType === tp &&
                          styles.toggleTextActive,
                      ]}
                    >
                      {tp === 'project'
                        ? (lang === 'he' ? 'פרויקט' : 'Project')
                        : (lang === 'he' ? 'תזה' : 'Thesis')}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {/* Save */}
            <Pressable
              style={styles.submitBtn}
              onPress={() => {
                handleEditProject(editProject)
              }}
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.submitBtnText}>
                  {lang === 'he' ? 'שמור שינויים' : 'Save Changes'}
                </Text>
              )}
            </Pressable>
          </ScrollView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────
function EmptyState({ emoji, text }: { emoji: string; text: string }) {
  return (
    <View style={es.wrap}>
      <Text style={es.emoji}>{emoji}</Text>
      <Text style={es.text}>{text}</Text>
    </View>
  );
}

const es = StyleSheet.create({
  wrap:  { alignItems: 'center', paddingTop: 50 },
  emoji: { fontSize: 44, marginBottom: 12 },
  text:  { fontSize: 15, color: '#8899BB' },
});

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = sharedStyles;
