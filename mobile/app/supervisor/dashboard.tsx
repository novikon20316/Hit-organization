// app/supervisor/home.tsx
import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet,
  SafeAreaView, ActivityIndicator, Modal, TextInput, Alert,
} from 'react-native';
import {
  collection, query, where, onSnapshot, doc,
  updateDoc, addDoc, serverTimestamp, getDoc, orderBy,
} from 'firebase/firestore';
import { db, auth } from '../../src/firebase/firebase';
import { useRouter } from 'expo-router';
import { tx, type Lang } from '../../components/i18n';
import { TopBar, StatCard, SectionHeader, FacultyBadge, StatusBadge, getFacultyColor } from '../../components/shared';
import { sendPushNotification } from '../../components/pushNotifications';

// ─── Types ────────────────────────────────────────────────────────────────────
interface MyProject {
  id: string; titleHe: string; titleEn: string;
  facultyId: string; status: string; degreeType: string;
  enrolledStudentIds: string[]; applicationIds: string[];
  academicYear: string; projectType: string;
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

  // ── Grade modal state ─────────────────────────────────────────────────────
  const [gradeModal,  setGradeModal]  = useState(false);
  const [gradeMilestone, setGradeMilestone] = useState<PendingMilestone | null>(null);
  const [gradeScore,  setGradeScore]  = useState('');
  const [gradeComment,setGradeComment]= useState('');
  const [submittingGrade, setSubmittingGrade] = useState(false);

  const uid = auth.currentUser?.uid;

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
    if (!uid) return;
    const q = query(
      collection(db, 'projects'),
      where('supervisorId', '==', uid),
      where('isArchived', '==', false),
      orderBy('createdAt', 'desc')
    );
    return onSnapshot(q, (snap) => {
      setMyProjects(snap.docs.map((d) => ({ id: d.id, ...d.data() } as MyProject)));
      setLoading(false);
    });
  }, [uid]);

  // Live: applications pending my review
  useEffect(() => {
    if (!uid) return;
    const q = query(
      collection(db, 'applications'),
      where('supervisorId', '==', uid),
      where('status', 'in', ['pending', 'meeting_requested'])
    );
    return onSnapshot(q, async (snap) => {
      const items: Application[] = [];
      for (const d of snap.docs) {
        const data = d.data();
        const [projSnap, studentSnap] = await Promise.all([
          getDoc(doc(db, 'projects', data.projectId)),
          getDoc(doc(db, 'users', data.studentId)),
        ]);
        items.push({
          id:              d.id,
          projectId:       data.projectId,
          projectTitleHe:  projSnap.data()?.titleHe ?? '',
          projectTitleEn:  projSnap.data()?.titleEn ?? '',
          studentId:       data.studentId,
          studentName:     studentSnap.data()?.displayName ?? '',
          studentEmail:    studentSnap.data()?.email ?? '',
          transcriptUrl:   data.transcriptUrl,
          cvUrl:           data.cvUrl,
          coverNote:       data.coverNote,
          status:          data.status,
          submittedAt:     data.submittedAt,
        });
      }
      setApplications(items);
    });
  }, [uid]);

  // Live: milestones I need to grade (submitted, awaiting supervisor)
  useEffect(() => {
    if (!uid) return;
    const q = query(
      collection(db, 'milestones'),
      where('status', '==', 'submitted'),
    );
    return onSnapshot(q, async (snap) => {
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
  }, [uid]);

  // Notifications unread count
  useEffect(() => {
    if (!uid) return;
    const q = query(
      collection(db, 'notifications'),
      where('recipientId', '==', uid),
      where('isRead', '==', false)
    );
    return onSnapshot(q, (snap) => setUnreadCount(snap.size));
  }, [uid]);

  // ── Create project ─────────────────────────────────────────────────────────
  const handleCreateProject = async () => {
    if (!newTitleHe.trim() || !newTitleEn.trim()) {
      Alert.alert(lang === 'he' ? 'שגיאה' : 'Error',
        lang === 'he' ? 'יש למלא כותרת בעברית ואנגלית' : 'Title in both languages is required');
      return;
    }
    setCreating(true);
    try {
      const projectRef = await addDoc(collection(db, 'projects'), {
        supervisorId:       uid,
        facultyId,
        titleHe:            newTitleHe.trim(),
        titleEn:            newTitleEn.trim(),
        descriptionHe:      newDescHe.trim(),
        descriptionEn:      newDescEn.trim(),
        degreeType:         newDegree,
        projectType:        newType,
        maxStudents:        1,
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
      Alert.alert('✅', lang === 'he' ? 'הפרויקט פורסם בהצלחה!' : 'Project published successfully!');
      const supervisorSnap = await getDoc(doc(db, 'users', uid!));
      const expoPushToken = supervisorSnap.data()?.expoPushToken;
      if (expoPushToken) {
        await sendPushNotification(
          expoPushToken,
          '📢 New Project Published!',
          'A new project is available. Check it now!',
          {
            projectId: projectRef.id,
            type: 'project_published',
          }
        );
      }
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
    if (!gradeMilestone || !gradeScore) return;
    const score = parseFloat(gradeScore);
    if (isNaN(score) || score < 0 || score > 100) {
      Alert.alert(lang === 'he' ? 'שגיאה' : 'Error',
        lang === 'he' ? 'ציון חייב להיות בין 0 ל-100' : 'Score must be between 0 and 100');
      return;
    }
    setSubmittingGrade(true);
    try {
      await addDoc(collection(db, 'grades'), {
        milestoneId:          gradeMilestone.id,
        projectId:            gradeMilestone.projectId,
        graderId:             uid,
        graderRole:           'supervisor',
        totalScore:           score,
        weightedContribution: score,
        comments:             gradeComment,
        formTemplate:         [],
        responses:            {},
        submittedAt:          serverTimestamp(),
        isFinalized:          true,
      });
      await updateDoc(doc(db, 'milestones', gradeMilestone.id), {
        status:            'supervisor_graded',
        supervisorGradeId: uid,
        finalGrade:        score,
      });
      setGradeModal(false);
      setGradeScore(''); setGradeComment('');
    } catch (e) {
      console.error(e);
    } finally {
      setSubmittingGrade(false);
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
        onBell={() => router.push('/(tabs)/Notificationsscreen')}
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
                          ? p.degreeType === 'bachelors' ? 'תואר ראשון' : p.degreeType === 'masters' ? 'תואר שני' : 'שני התארים'
                          : p.degreeType === 'bachelors' ? "Bachelor's" : p.degreeType === 'masters' ? "Master's" : 'Both degrees'}
                        {' · '}
                        {lang === 'he'
                          ? p.projectType === 'project' ? 'פרויקט' : 'תזה'
                          : p.projectType === 'project' ? 'Project' : 'Thesis'}
                        {' · '}
                        {lang === 'he' ? 'סטודנטים' : 'Students'}: {p.enrolledStudentIds.length}/{1}
                      </Text>
                    </View>
                    {p.applicationIds.length > 0 && (
                      <View style={styles.appCount}>
                        <Text style={styles.appCountText}>
                          📨 {p.applicationIds.length} {lang === 'he' ? 'מועמדויות' : 'applications'}
                        </Text>
                      </View>
                    )}
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
                      <View style={styles.docChip}>
                        <Text style={styles.docChipText}>📄 {lang === 'he' ? 'גיליון ציונים' : 'Transcript'}</Text>
                      </View>
                    ) : null}
                    {app.cvUrl ? (
                      <View style={styles.docChip}>
                        <Text style={styles.docChipText}>📋 {lang === 'he' ? 'קורות חיים' : 'CV'}</Text>
                      </View>
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
      <Modal visible={showNewProject} animationType="slide" presentationStyle="pageSheet">
        <ScrollView style={styles.modal} contentContainerStyle={styles.modalContent}>
          <View style={[styles.modalHeader, isRtl && styles.rowReverse]}>
            <Text style={styles.modalTitle}>
              {lang === 'he' ? 'פרסום פרויקט חדש' : 'Post New Project'}
            </Text>
            <Pressable onPress={() => setShowNewProject(false)}>
              <Text style={styles.modalClose}>✕</Text>
            </Pressable>
          </View>

          {[
            { label: lang === 'he' ? 'כותרת בעברית *' : 'Hebrew Title *', value: newTitleHe, set: setNewTitleHe, dir: 'rtl' },
            { label: lang === 'he' ? 'כותרת באנגלית *' : 'English Title *', value: newTitleEn, set: setNewTitleEn, dir: 'ltr' },
            { label: lang === 'he' ? 'תיאור בעברית' : 'Hebrew Description', value: newDescHe, set: setNewDescHe, dir: 'rtl', multi: true },
            { label: lang === 'he' ? 'תיאור באנגלית' : 'English Description', value: newDescEn, set: setNewDescEn, dir: 'ltr', multi: true },
            { label: lang === 'he' ? 'טכנולוגיות (מופרדות בפסיק)' : 'Technologies (comma separated)', value: newSkills, set: setNewSkills, dir: 'ltr' },
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

          {/* Degree type */}
          <Text style={[styles.fieldLabel, isRtl && styles.textRight]}>
            {lang === 'he' ? 'סוג תואר' : 'Degree Type'}
          </Text>
          <View style={[styles.toggleRow, isRtl && styles.rowReverse]}>
            {(['bachelors', 'masters', 'both'] as const).map((d) => (
              <Pressable
                key={d}
                style={[styles.toggleBtn, newDegree === d && styles.toggleBtnActive]}
                onPress={() => setNewDegree(d)}
              >
                <Text style={[styles.toggleText, newDegree === d && styles.toggleTextActive]}>
                  {d === 'bachelors' ? (lang === 'he' ? "תואר ראשון" : "B.Sc.")
                   : d === 'masters' ? (lang === 'he' ? "תואר שני" : "M.Sc.")
                   : (lang === 'he' ? "שניהם" : "Both")}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Project type */}
          <Text style={[styles.fieldLabel, isRtl && styles.textRight]}>
            {lang === 'he' ? 'סוג פרויקט' : 'Project Type'}
          </Text>
          <View style={[styles.toggleRow, isRtl && styles.rowReverse]}>
            {(['project', 'thesis'] as const).map((tp) => (
              <Pressable
                key={tp}
                style={[styles.toggleBtn, newType === tp && styles.toggleBtnActive]}
                onPress={() => setNewType(tp)}
              >
                <Text style={[styles.toggleText, newType === tp && styles.toggleTextActive]}>
                  {tp === 'project' ? (lang === 'he' ? 'פרויקט' : 'Project') : (lang === 'he' ? 'תזה' : 'Thesis')}
                </Text>
              </Pressable>
            ))}
          </View>

          <Pressable
            style={[styles.submitBtn, creating && { opacity: 0.6 }]}
            onPress={handleCreateProject}
            disabled={creating}
          >
            {creating
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.submitBtnText}>{lang === 'he' ? 'פרסם פרויקט' : 'Publish Project'}</Text>
            }
          </Pressable>
        </ScrollView>
      </Modal>

      {/* ── Grade Modal ── */}
      <Modal visible={gradeModal} animationType="slide" presentationStyle="formSheet">
        <View style={styles.modal}>
          <ScrollView contentContainerStyle={styles.modalContent}>
            <View style={[styles.modalHeader, isRtl && styles.rowReverse]}>
              <Text style={styles.modalTitle}>
                {lang === 'he' ? 'טופס ציון' : 'Grading Form'}
              </Text>
              <Pressable onPress={() => { setGradeModal(false); setGradeScore(''); setGradeComment(''); }}>
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
              {lang === 'he' ? 'ציון (0–100) *' : 'Score (0–100) *'}
            </Text>
            <TextInput
              style={[styles.input, styles.scoreInput]}
              value={gradeScore}
              onChangeText={setGradeScore}
              keyboardType="numeric"
              placeholder="85"
              placeholderTextColor="#9BA8C0"
              textAlign="center"
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
const styles = StyleSheet.create({
  root:        { flex: 1, backgroundColor: '#F0F4FF' },
  centered:    { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content:     { padding: 16 },
  row:         { flexDirection: 'row', alignItems: 'center' },
  rowReverse:  { flexDirection: 'row-reverse' },
  rowGap:      { flex: 1 },
  textRight:   { textAlign: 'right' },

  statsRow:    { flexDirection: 'row', padding: 14, gap: 8 },
  statGap:     { width: 0 },

  // Tabs
  tabBar: {
    flexDirection: 'row', backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#E0E8FF',
  },
  tab: {
    flex: 1, paddingVertical: 12, alignItems: 'center',
    flexDirection: 'row', justifyContent: 'center', gap: 5,
    borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  tabActive:      { borderBottomColor: '#2E86FF' },
  tabText:        { fontSize: 12, fontWeight: '600', color: '#8899BB' },
  tabTextActive:  { color: '#2E86FF' },
  tabBadge: {
    backgroundColor: '#E0E8FF', borderRadius: 8,
    minWidth: 18, height: 18,
    justifyContent: 'center', alignItems: 'center', paddingHorizontal: 4,
  },
  tabBadgeActive: { backgroundColor: '#2E86FF' },
  tabBadgeText:   { fontSize: 10, fontWeight: '800', color: '#2E86FF' },

  // Add project button
  addBtn: {
    backgroundColor: '#2E86FF', borderRadius: 14, paddingVertical: 14,
    alignItems: 'center', marginBottom: 16,
    shadowColor: '#2E86FF', shadowOpacity: 0.3, shadowRadius: 8, elevation: 3,
  },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  // Project card
  projectCard: {
    backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 12,
    borderLeftWidth: 4, borderWidth: 1, borderColor: '#E0E8FF',
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1,
  },
  cardTitle:  { fontSize: 15, fontWeight: '700', color: '#111' },
  cardMeta:   { fontSize: 11, color: '#8899BB' },
  appCount: {
    marginTop: 8, backgroundColor: '#FFFBEB', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start',
  },
  appCountText: { fontSize: 12, color: '#F59E0B', fontWeight: '600' },

  // Application card
  appCard: {
    backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: '#E0E8FF',
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1,
  },
  appProjectLabel: { fontSize: 12, color: '#8899BB', marginBottom: 4 },
  studentAvatar: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: '#E0E8FF', justifyContent: 'center', alignItems: 'center',
  },
  studentAvatarText: { fontWeight: '700', color: '#2E86FF', fontSize: 16 },
  studentName:       { fontSize: 14, fontWeight: '700', color: '#111' },
  studentEmail:      { fontSize: 12, color: '#8899BB' },
  coverNote: {
    backgroundColor: '#F8FAFC', borderRadius: 10, padding: 10, marginVertical: 8,
    borderLeftWidth: 3, borderLeftColor: '#D0DEFF',
  },
  coverNoteText: { fontSize: 13, color: '#445', fontStyle: 'italic', lineHeight: 18 },
  docsRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  docChip: {
    backgroundColor: '#EFF6FF', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1, borderColor: '#BFDBFE',
  },
  docChipText: { fontSize: 12, color: '#2E86FF', fontWeight: '500' },

  decisionRow: { flexDirection: 'row', gap: 8 },
  approveBtn: {
    flex: 1, backgroundColor: '#ECFDF5', borderRadius: 10, paddingVertical: 10,
    alignItems: 'center', borderWidth: 1, borderColor: '#A7F3D0',
  },
  approveBtnText: { color: '#10B981', fontWeight: '700', fontSize: 13 },
  meetingBtn: {
    flex: 1, backgroundColor: '#FFF7ED', borderRadius: 10, paddingVertical: 10,
    alignItems: 'center', borderWidth: 1, borderColor: '#FED7AA',
  },
  meetingBtnText: { color: '#F97316', fontWeight: '700', fontSize: 13 },
  rejectBtn: {
    flex: 1, backgroundColor: '#FEF2F2', borderRadius: 10, paddingVertical: 10,
    alignItems: 'center', borderWidth: 1, borderColor: '#FECACA',
  },
  rejectBtnText: { color: '#EF4444', fontWeight: '700', fontSize: 13 },

  // Grade card
  gradeCard: {
    backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 12,
    borderLeftWidth: 4, borderWidth: 1, borderColor: '#E0E8FF',
  },
  gradeMilestoneType: { fontSize: 13, fontWeight: '800', marginBottom: 4, letterSpacing: 0.3 },
  gradeProjectTitle:  { fontSize: 14, fontWeight: '600', color: '#111', marginBottom: 4 },
  gradeStudents:      { fontSize: 12, color: '#8899BB', marginBottom: 4 },
  gradeDate:          { fontSize: 12, color: '#8899BB', marginBottom: 4 },
  filesNote:          { fontSize: 12, color: '#5577AA', marginBottom: 4 },
  submissionNote:     { fontSize: 12, color: '#445', fontStyle: 'italic', marginBottom: 10 },
  gradeBtn: {
    borderRadius: 10, paddingVertical: 10, alignItems: 'center', marginTop: 4,
  },
  gradeBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  // Modal
  modal:        { flex: 1, backgroundColor: '#F0F4FF' },
  modalContent: { padding: 20, paddingBottom: 60 },
  modalHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle:   { fontSize: 18, fontWeight: '800', color: '#111' },
  modalClose:   { fontSize: 22, color: '#888', padding: 4 },
  fieldLabel:   { fontSize: 13, fontWeight: '600', color: '#445', marginBottom: 6, marginTop: 14 },
  input: {
    backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 14,
    paddingVertical: 12, fontSize: 14, color: '#111',
    borderWidth: 1, borderColor: '#E0E8FF',
  },
  textarea:    { textAlignVertical: 'top', minHeight: 90 },
  scoreInput:  { fontSize: 28, fontWeight: '900', height: 70, color: '#2E86FF' },
  toggleRow:   { flexDirection: 'row', gap: 8, marginBottom: 4 },
  toggleBtn: {
    flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center',
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#E0E8FF',
  },
  toggleBtnActive:  { backgroundColor: '#2E86FF', borderColor: '#2E86FF' },
  toggleText:       { fontSize: 13, fontWeight: '600', color: '#8899BB' },
  toggleTextActive: { color: '#fff' },
  gradeContext: {
    backgroundColor: '#EFF6FF', borderRadius: 12, padding: 14, marginBottom: 16,
    borderLeftWidth: 3, borderLeftColor: '#2E86FF',
  },
  gradeContextTitle: { fontSize: 15, fontWeight: '800', color: '#111', marginBottom: 4 },
  gradeContextSub:   { fontSize: 13, color: '#5577AA', marginBottom: 2 },
  submitBtn: {
    backgroundColor: '#2E86FF', borderRadius: 14, paddingVertical: 15,
    alignItems: 'center', marginTop: 20,
    shadowColor: '#2E86FF', shadowOpacity: 0.3, shadowRadius: 10, elevation: 4,
  },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});