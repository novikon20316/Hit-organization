import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, Pressable,
  SafeAreaView, ActivityIndicator, Modal, TextInput, Alert, Switch,
} from 'react-native';
import {
  collection, query, where, onSnapshot, doc, Timestamp,
  updateDoc, serverTimestamp, getDoc, addDoc, getDocs, arrayUnion
} from 'firebase/firestore';
import { db, auth } from '../../src/firebase/firebase';
import { useRouter } from 'expo-router';
import type { Lang } from '../../components/i18n';
import { TopBar, FacultyBadge, StatusBadge, getFacultyColor } from '../../components/shared';
import { calculateFinalGrade, type GradeWeights } from '../../components/Milestoneservice';
import { coordinatorHomeStyles } from '../../constants/styles';
import {STATUS_LABEL, STATUS_COLORS} from '../../constants/labels'


interface PendingMilestone {
  id: string;
  projectId: string;
  projectTitleHe: string;
  projectTitleEn: string;
  type: string;
  status: string;
  studentNames: string[];
  studentIds: string[];
  supervisorId: string;
  supervisorScore: number | null;
  supervisorComment?: string;
  fileUrls?: string[];
  submissionNote?: string;
  
  examinerIds: string[];
  examiner1Score: number | null;
  examiner2Score: number | null;
  gradeWeights: GradeWeights | null;
  dueDate: any;
  facultyId: string;
  defenseDate: any;
  defenseRoom: string | null;

  supervisorName?: string;        // ← add
  milestoneGrades?: {             // ← add
    type: string;
    score: number | null;
  }[];
}

interface InProgressProject {
  id: string;
  projectTitleHe: string;
  projectTitleEn: string;
  facultyId: string;
  studentNames: string[];
  supervisorName: string;
  progress: number;
  status: string;
  milestones: {
    type: string;
    status: string;
    supervisorScore: number | null;
  }[];
}

interface ExaminerUser {
  id: string;
  displayName: string;
  email: string;
  facultyId: string;
}

const MILESTONE_LABEL: Record<string, { he: string; en: string }> = {
  research_proposal: { he: 'הצעת מחקר',    en: 'Research Proposal' },
  progress_report:   { he: 'דו"ח התקדמות', en: 'Progress Report'   },
  final_report:      { he: 'דו"ח מסכם',    en: 'Final Report'      },
  defense:           { he: 'הגנה',          en: 'Defense'           },
};

const MILESTONE_PROGRESS: Record<string, number> = {
  research_proposal: 25,
  progress_report:   50,
  final_report:      75,
  defense:           100,
};

const updateProjectProgress = async (projectId: string, milestoneType: string) => {
  const newProgress = MILESTONE_PROGRESS[milestoneType] ?? 0;
  await updateDoc(doc(db, 'projects', projectId), {
    progress: newProgress,
    lastUpdatedAt: serverTimestamp(),
  });
};

export default function CoordinatorHome() {
  const router = useRouter();
  const [lang, setLang] = useState<Lang>('he');
  const isRtl = lang === 'he';

  const [coordinatorName, setCoordinatorName] = useState('');
  const [loading, setLoading]     = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [activeTab, setActiveTab] = useState<'pending' | 'defense' | 'inProgress'>('pending');

  const [inProgressProjects, setInProgressProjects] = useState<InProgressProject[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<PendingMilestone[]>([]);
  const [defenseSetups,    setDefenseSetups]    = useState<PendingMilestone[]>([]);
  const [allExaminers,     setAllExaminers]     = useState<ExaminerUser[]>([]);

  // Approve modal (milestone 1 & 2)
  const [approveModal,     setApproveModal]     = useState(false);
  const [selectedMilestone,setSelectedMilestone]= useState<PendingMilestone | null>(null);

  // Assign examiners modal (milestone 3)
  const [assignModal,      setAssignModal]      = useState(false);
  const [examiner1Id,      setExaminer1Id]      = useState('');
  const [examiner2Id,      setExaminer2Id]      = useState('');
  const [weightSupervisor, setWeightSupervisor] = useState('30');
  const [weightExaminer1,  setWeightExaminer1]  = useState('35');
  const [weightExaminer2,  setWeightExaminer2]  = useState('35');

  // Defense setup modal (milestone 4)
  const [defenseModal,     setDefenseModal]     = useState(false);
  const [defenseDate,      setDefenseDate]      = useState<Date | null>(null);
  const [defenseDateText, setDefenseDateText] = useState<string>('');
  const [defenseRoom,      setDefenseRoom]      = useState('');

  const [saving, setSaving] = useState(false);
  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({});
  const uid = auth.currentUser?.uid;
  
  const toggleCardExpansion = (milestoneId: string) => {
    setExpandedCards((prev) => ({
      ...prev,
      [milestoneId]: !prev[milestoneId],
    }));
  };
  useEffect(() => {
    if (!uid) return;
    getDoc(doc(db, 'users', uid)).then((snap) => {
      if (snap.exists()) setCoordinatorName(snap.data().displayName || '');
    });
  }, [uid]);

  // Load all examiners for the picker
  useEffect(() => {
    return onSnapshot(
      query(collection(db, 'users'), where('role', '==', 'examiner')),
      (snap) => {
        setAllExaminers(snap.docs.map((d) => ({
          id: d.id,
          displayName: d.data().displayName || '',
          email: d.data().email || '',
          facultyId: d.data().facultyId || '',
        })));
      }
    );
  }, []);

  // ── In-progress projects ──────────────────────────────────────────────────
  useEffect(() => {
    const q = query(
      collection(db, 'projects'),
      where('status', '==', 'in_progress')
    );

    return onSnapshot(q, async (snap) => {
      if (snap.empty) {
        setInProgressProjects([]);
        return;
      }

      const items = await Promise.all(
        snap.docs.map(async (d) => {
          const data = d.data();

          // Fetch students + supervisor + milestones in parallel
          const [supervisorSnap, milestonesSnap, ...studentSnaps] = await Promise.all([
            getDoc(doc(db, 'users', data.supervisorId)),
            getDocs(query(
              collection(db, 'milestones'),
              where('projectId', '==', d.id)
            )),
            ...(data.enrolledStudentIds ?? []).map((sid: string) =>
              getDoc(doc(db, 'users', sid))
            ),
          ]);

          const studentNames = studentSnaps
            .filter((s) => s.exists())
            .map((s) => s.data().displayName as string);

          const supervisorName = supervisorSnap.exists()
            ? (supervisorSnap.data().displayName as string)
            : '';

          const milestones = milestonesSnap.docs
            .map((md) => ({
              type:           md.data().type as string,
              status:         md.data().status as string,
              supervisorScore:md.data().supervisorScore ?? null,
            }))
            .filter((m) => m.type !== 'defense')
            .reduce((acc, m) => { 
              if (!acc.find((x) => x.type === m.type)) acc.push(m);
              return acc;
            }, [] as { type: string; status: string; supervisorScore: number | null }[])
            .sort((a, b) => {
              const order = ['research_proposal', 'progress_report', 'final_report'];
              return order.indexOf(a.type) - order.indexOf(b.type);
            });

          return {
            id:             d.id,
            projectTitleHe: data.titleHe ?? '',
            projectTitleEn: data.titleEn ?? '',
            facultyId:      data.facultyId ?? '',
            studentNames,
            supervisorName,
            progress:       data.progress ?? 0,
            status:         data.status,
            milestones,
          } as InProgressProject;
        })
      );

      setInProgressProjects(items);
    });
  }, []);

  // ── Milestones awaiting coordinator approval ──────────────────────────────
  useEffect(() => {
    const q = query(
      collection(db, 'milestones'),
      where('status', '==', 'supervisor_graded')
    );

    return onSnapshot(q, async (snap) => {
      if (snap.empty) {
        setPendingApprovals([]);
        setLoading(false);
        return;
      }

      // ✅ Run ALL fetches in parallel
      const items = await Promise.all(
        snap.docs.map(async (d) => {
          const data = d.data();

          // Fetch project + all students in parallel
          const [projectSnap, ...studentSnaps] = await Promise.all([
            getDoc(doc(db, 'projects', data.projectId)),
            ...(data.studentIds ?? []).map((sid: string) =>
              getDoc(doc(db, 'users', sid))
            ),
          ]);

          const studentNames = studentSnaps
            .filter((s) => s.exists())
            .map((s) => s.data().displayName as string);

          return {
            id:               d.id,
            projectId:        data.projectId,
            projectTitleHe:   projectSnap.data()?.titleHe ?? '',
            projectTitleEn:   projectSnap.data()?.titleEn ?? '',
            type:             data.type,
            status:           data.status,
            studentNames,
            studentIds:       data.studentIds ?? [],
            supervisorId:     data.supervisorId ?? '',
            supervisorScore:  data.supervisorScore ?? null,
            supervisorComment:data.supervisorComment ?? '',
            fileUrls:         data.fileUrls ?? [],
            submissionNote:   data.submissionNote ?? '',
            examinerIds:      data.examinerIds ?? [],
            examiner1Score:   data.examiner1Score ?? null,
            examiner2Score:   data.examiner2Score ?? null,
            gradeWeights:     data.gradeWeights ?? null,
            dueDate:          data.dueDate,
            facultyId:        projectSnap.data()?.facultyId ?? '',
            defenseDate:      data.defenseDate ?? null,
            defenseRoom:      data.defenseRoom ?? null,
          } as PendingMilestone;
        })
      );

      setPendingApprovals(items);
      setLoading(false);
    });
  }, []);

  // ── Defense milestones ────────────────────────────────────────────────────
  useEffect(() => {
    const q = query(
      collection(db, 'milestones'),
      where('type', '==', 'defense'),
      where('status', 'in', ['coordinator_approved', 'examiners_assigned'])
    );

    return onSnapshot(q, async (snap) => {
      if (snap.empty) {
        setDefenseSetups([]);
        return;
      }

      const items = await Promise.all(
        snap.docs.map(async (d) => {
          const data = d.data();

          const [projectSnap, ...studentSnaps] = await Promise.all([
            getDoc(doc(db, 'projects', data.projectId)),
            ...(data.studentIds ?? []).map((sid: string) =>
              getDoc(doc(db, 'users', sid))
            ),
          ]);

          const studentNames = studentSnaps
            .filter((s) => s.exists())
            .map((s) => s.data().displayName as string);

          return {
            id:              d.id,
            projectId:       data.projectId,
            projectTitleHe:  projectSnap.data()?.titleHe ?? '',
            projectTitleEn:  projectSnap.data()?.titleEn ?? '',
            type:            data.type,
            status:          data.status,
            studentNames,
            studentIds:      data.studentIds ?? [],
            supervisorId:    data.supervisorId ?? '',
            supervisorScore: data.supervisorScore ?? null,
            examinerIds:     data.examinerIds ?? [],
            examiner1Score:  data.examiner1Score ?? null,
            examiner2Score:  data.examiner2Score ?? null,
            gradeWeights:    data.gradeWeights ?? null,
            dueDate:         data.dueDate,
            facultyId:       projectSnap.data()?.facultyId ?? '',
            defenseDate:     data.defenseDate ?? null,
            defenseRoom:     data.defenseRoom ?? null,
          } as PendingMilestone;
        })
      );

      setDefenseSetups(items);
    });
  }, []);

  // Unread notifications
  useEffect(() => {
    if (!uid) return;
    const q = query(
      collection(db, 'notifications'),
      where('recipientId', '==', uid),
      where('isRead', '==', false)
    );
    return onSnapshot(q, (snap) => setUnreadCount(snap.size));
  }, [uid]);

  // ── Approve milestone (research_proposal or progress_report) ─────────────
  const handleApprove = async (milestone: PendingMilestone) => {
    if (milestone.type === 'final_report') {
      // Open assign examiners modal instead
      setSelectedMilestone(milestone);
      setExaminer1Id('');
      setExaminer2Id('');
      setWeightSupervisor('30');
      setWeightExaminer1('35');
      setWeightExaminer2('35');
      setAssignModal(true);
      return;
    }
    setSaving(true);
    try {
      await updateDoc(doc(db, 'milestones', milestone.id), {
        status:                'coordinator_approved',
        coordinatorApprovedAt: serverTimestamp(),
        coordinatorId:         uid,
      });
      await updateProjectProgress(milestone.projectId, milestone.type);
      // Notify students
      for (const studentId of milestone.studentIds) {
        await addDoc(collection(db, 'notifications'), {
          recipientId: studentId,
          type:        'milestone_approved',
          titleHe:     '✅ אבן דרך אושרה',
          titleEn:     '✅ Milestone Approved',
          bodyHe:      `הרכז אישר את ${MILESTONE_LABEL[milestone.type]?.he}`,
          bodyEn:      `Coordinator approved your ${MILESTONE_LABEL[milestone.type]?.en}`,
          relatedProjectId:   milestone.projectId,
          relatedMilestoneId: milestone.id,
          isRead:      false,
          createdAt:   serverTimestamp(),
        });
      }
      Alert.alert('✅', lang === 'he' ? 'אבן הדרך אושרה' : 'Milestone approved');
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };
  //--- Reject milestone (research_proposal or progress_report) ----------------------
  const handleReject = async (milestone: PendingMilestone) => {
    Alert.alert(
      lang === 'he' ? 'דחיית אבן דרך' : 'Reject Milestone',
      lang === 'he'
        ? 'האם אתה בטוח שברצונך לדחות את אבן הדרך?'
        : 'Are you sure you want to reject this milestone?',
      [
        {
          text: lang === 'he' ? 'ביטול' : 'Cancel',
          style: 'cancel',
        },
        {
          text: lang === 'he' ? 'דחה' : 'Reject',
          style: 'destructive',
          onPress: async () => {
            setSaving(true);

            try {
              await updateDoc(doc(db, 'milestones', milestone.id), {
                status: 'pending',
                coordinatorApprovedAt: null,
                coordinatorId: null,
              });

              // notify students
              for (const studentId of milestone.studentIds) {
                await addDoc(collection(db, 'notifications'), {
                  recipientId: studentId,

                  type: 'milestone_rejected',

                  titleHe: '❌ אבן דרך נדחתה',
                  titleEn: '❌ Milestone Rejected',

                  bodyHe: `הרכז דחה את ${
                    MILESTONE_LABEL[milestone.type]?.he
                  } ויש לבצע תיקונים`,

                  bodyEn: `Coordinator rejected your ${
                    MILESTONE_LABEL[milestone.type]?.en
                  }. Please revise and resubmit.`,

                  relatedProjectId: milestone.projectId,
                  relatedMilestoneId: milestone.id,

                  isRead: false,
                  createdAt: serverTimestamp(),
                });
              }

              Alert.alert(
                '✅',
                lang === 'he'
                  ? 'אבן הדרך נדחתה בהצלחה'
                  : 'Milestone rejected successfully'
              );
            } catch (e) {
              console.error(e);

              Alert.alert(
                lang === 'he' ? 'שגיאה' : 'Error',
                lang === 'he'
                  ? 'אירעה שגיאה בעת דחיית אבן הדרך'
                  : 'Failed to reject milestone'
              );
            } finally {
              setSaving(false);
            }
          },
        },
      ]
    );
  };
  // ── Assign examiners + weights (final_report) ─────────────────────────────
  const handleAssignExaminers = async () => {
    if (!selectedMilestone) return;
    if (!examiner1Id || !examiner2Id) {
      Alert.alert(lang === 'he' ? 'שגיאה' : 'Error',
        lang === 'he' ? 'יש לבחור שני בוחנים' : 'Please select both examiners');
      return;
    }
    if (examiner1Id === examiner2Id) {
      Alert.alert(lang === 'he' ? 'שגיאה' : 'Error',
        lang === 'he' ? 'יש לבחור שני בוחנים שונים' : 'Please select two different examiners');
      return;
    }
    const w1 = parseFloat(weightSupervisor) / 100;
    const w2 = parseFloat(weightExaminer1) / 100;
    const w3 = parseFloat(weightExaminer2) / 100;
    if (Math.abs(w1 + w2 + w3 - 1) > 0.01) {
      Alert.alert(lang === 'he' ? 'שגיאה' : 'Error',
        lang === 'he' ? 'סך המשקלות חייב להיות 100%' : 'Weights must sum to 100%');
      return;
    }
    setSaving(true);
    try {
      const configSnap = await getDoc(doc(db, 'config', 'system'));
      const defenseWindowDays = configSnap.exists()
        ? configSnap.data().defenseWindowDays
        : 45;
      const [examiner1Snap, examiner2Snap] = await Promise.all([
        getDoc(doc(db, 'users', examiner1Id)),
        getDoc(doc(db, 'users', examiner2Id)),
      ]);
      const calculatedDefenseDate = new Date();
      calculatedDefenseDate.setDate(
        calculatedDefenseDate.getDate() + defenseWindowDays
      );
      setDefenseDate(calculatedDefenseDate);
      const examiner1Dates = examiner1Snap.data()?.dates || [];
      const examiner2Dates = examiner2Snap.data()?.dates || [];
      if(!defenseDate){
        Alert.prompt("date never got initialized")
        return;
      }
      const selectedDateStr = new Date(defenseDate)
        .toISOString()
        .split('T')[0];
      if (examiner1Dates.includes(selectedDateStr)) {
        Alert.alert(
          lang === 'he' ? 'שגיאה' : 'Error',
          `${examiner1Snap.data()?.displayName} ${
            lang === 'he'
              ? 'לא זמין בתאריך זה'
              : 'is not available on this date'
          }`
        );
        return;
      }

      if (examiner2Dates.includes(selectedDateStr)) {
        Alert.alert(
          lang === 'he' ? 'שגיאה' : 'Error',
          `${examiner2Snap.data()?.displayName} ${
            lang === 'he'
              ? 'לא זמין בתאריך זה'
              : 'is not available on this date'
          }`
        );
        return;
      }
      const weights: GradeWeights = {
        supervisorWeight: w1,
        examiner1Weight:  w2,
        examiner2Weight:  w3,
      };
      await updateDoc(doc(db, 'milestones', selectedMilestone.id), {
        status:                'examiners_assigned',
        coordinatorApprovedAt: serverTimestamp(),
        coordinatorId:         uid,
        examinerIds:           [examiner1Id, examiner2Id],
        gradeWeights:          weights,
        defenseDate:           Timestamp.fromDate(new Date(defenseDate)),
      });
      await updateDoc(doc(db, 'users', examiner1Id), {
        dates: arrayUnion(selectedDateStr),
      });

      await updateDoc(doc(db, 'users', examiner2Id), {
        dates: arrayUnion(selectedDateStr),
      });
      await updateProjectProgress(selectedMilestone.projectId, selectedMilestone.type);
      // Notify each examiner
      for (const exId of [examiner1Id, examiner2Id]) {
        await addDoc(collection(db, 'notifications'), {
          recipientId: exId,
          type:        'examiner_assigned',
          titleHe:     '📋 הוקצית כבוחן',
          titleEn:     '📋 You were assigned as examiner',
          bodyHe:      `הוקצית לבחון את הפרויקט: ${selectedMilestone.projectTitleHe}`,
          bodyEn:      `You were assigned to examine: ${selectedMilestone.projectTitleEn}`,
          relatedProjectId:   selectedMilestone.projectId,
          relatedMilestoneId: selectedMilestone.id,
          isRead:      false,
          createdAt:   serverTimestamp(),
        });
      }
      // Notify students
      for (const studentId of selectedMilestone.studentIds) {
        await addDoc(collection(db, 'notifications'), {
          recipientId: studentId,
          type:        'examiners_assigned',
          titleHe:     '👥 בוחנים הוקצו',
          titleEn:     '👥 Examiners Assigned',
          bodyHe:      'רכז הפרויקטים הקצה שני בוחנים לבחינת ההגנה שלך',
          bodyEn:      'The coordinator assigned two examiners for your defense',
          relatedProjectId:   selectedMilestone.projectId,
          relatedMilestoneId: selectedMilestone.id,
          isRead:      false,
          createdAt:   serverTimestamp(),
        });
      }
      setAssignModal(false);
      Alert.alert('✅', lang === 'he' ? 'בוחנים הוקצו בהצלחה' : 'Examiners assigned successfully');
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  // ── Set defense date & room ───────────────────────────────────────────────
  const handleSetDefense = async () => {
    if (!selectedMilestone || !defenseDate) return;

    setSaving(true);
    try {
      await updateDoc(doc(db, 'milestones', selectedMilestone.id), {
        defenseDate: Timestamp.fromDate(defenseDate),
        defenseRoom: defenseRoom.trim() || null,
      });
      // Notify all parties
      const allRecipients = [
        ...selectedMilestone.studentIds,
        selectedMilestone.supervisorId,
        ...selectedMilestone.examinerIds,
      ].filter(Boolean);
      for (const recipientId of allRecipients) {
        await addDoc(collection(db, 'notifications'), {
          recipientId,
          type:    'defense_scheduled',
          titleHe: '📅 מועד הגנה נקבע',
          titleEn: '📅 Defense Date Set',
          bodyHe:  `מועד ההגנה נקבע ל-${defenseDate}${defenseRoom ? ' | חדר: ' + defenseRoom : ''}`,
          bodyEn:  `Defense scheduled for ${defenseDate}${defenseRoom ? ' | Room: ' + defenseRoom : ''}`,
          relatedProjectId:   selectedMilestone.projectId,
          relatedMilestoneId: selectedMilestone.id,
          isRead:  false,
          createdAt: serverTimestamp(),
        });
      }
      setDefenseModal(false);
      setDefenseDate(null); setDefenseRoom('');
      Alert.alert('✅', lang === 'he' ? 'מועד ההגנה נשמר' : 'Defense date saved');
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#8B5CF6" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <TopBar
        name={coordinatorName}
        role="coordinator"
        lang={lang}
        isRtl={isRtl}
        unreadCount={unreadCount}
        onToggleLang={() => setLang(lang === 'he' ? 'en' : 'he')}
        onBell={() => router.push('/(tabs)/notifications')}
      />

      <View style={styles.tabBar}>
        {([
          { key: 'pending', heLabel: 'ממתין לאישור', enLabel: 'Pending Approval', badge: pendingApprovals.length },
          { key: 'defense', heLabel: 'הגנות',         enLabel: 'Defenses',         badge: defenseSetups.length },
          { key: 'inProgress', heLabel: 'פרויקטים פעילים', enLabel: 'In Progress',       badge: inProgressProjects.length },
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
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{tab.badge}</Text>
              </View>
            )}
          </Pressable>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.content}>

        {activeTab === 'pending' && (
          <>
            {pendingApprovals.length === 0 ? (
              <View style={styles.empty}>
                <Text style={styles.emptyEmoji}>✅</Text>
                <Text style={styles.emptyText}>
                  {lang === 'he' ? 'אין אבני דרך הממתינות לאישור' : 'No milestones awaiting approval'}
                </Text>
              </View>
            ) : (
              pendingApprovals.map((m) => (
                <Pressable
                  key={m.id}
                  style={[
                    styles.card,
                    expandedCards[m.id] && styles.cardExpanded,
                  ]}
                  onPress={() => toggleCardExpansion(m.id)}
                >
                  <View style={styles.cardHeader}>
                    <Text style={styles.milestoneType}>
                      {MILESTONE_LABEL[m.type]?.[lang]}
                    </Text>
                    <FacultyBadge facultyId={m.facultyId} lang={lang} />
                  </View>
                  <Text style={styles.cardTitle}>
                    {lang === 'he' ? m.projectTitleHe : m.projectTitleEn}
                  </Text>
                  <Text style={styles.cardMeta}>👤 {m.studentNames.join(', ')}</Text>
                  {m.supervisorScore !== null && (
                    <Text style={styles.cardMeta}>
                      ✏️ {lang === 'he' ? 'ציון מנחה:' : 'Supervisor score:'} {m.supervisorScore}
                    </Text>
                  )}
                  {expandedCards[m.id] && (
                    <View style={styles.expandedSection}>

                      {/* Supervisor comment */}
                      {(m.supervisorScore !== null || m.supervisorComment) ? (
                        <View style={styles.expandedBox}>
                          <Text style={styles.expandedTitle}>
                            {lang === 'he' ? '💬 מנחה' : '💬 Supervisor'}
                          </Text>
                          {m.supervisorScore !== null && (
                            <Text style={styles.expandedText}>
                              {lang === 'he' ? 'ציון:' : 'Score:'} {m.supervisorScore}/100
                            </Text>
                          )}
                          {m.supervisorComment ? (
                            <Text style={styles.expandedText}>{m.supervisorComment}</Text>
                          ) : null}
                        </View>
                      ) : null}

                      {/* Student submission note */}
                      {m.submissionNote ? (
                        <View style={styles.expandedBox}>
                          <Text style={styles.expandedTitle}>
                            {lang === 'he' ? '📝 הערת סטודנט' : '📝 Student Note'}
                          </Text>

                          <Text style={styles.expandedText}>
                            {m.submissionNote}
                          </Text>
                        </View>
                      ) : null}

                      {/* Uploaded files */}
                      {m.fileUrls && m.fileUrls.length > 0 && (
                        <View style={styles.expandedBox}>
                          <Text style={styles.expandedTitle}>
                            {lang === 'he' ? '📎 קבצים שהועלו' : '📎 Uploaded Files'}
                          </Text>

                          {m.fileUrls.map((url, index) => (
                            <Pressable
                              key={index}
                              style={styles.fileBtn}
                              onPress={() => {
                                console.log('url:', url); // add this
                                router.push({
                                  pathname: '/pdfViewer',
                                  params: { url },
                                })}
                              }
                            >
                              <Text style={styles.fileBtnText}>
                                📄 {lang === 'he'
                                  ? `קובץ ${index + 1}`
                                  : `File ${index + 1}`}
                              </Text>
                            </Pressable>
                          ))}
                        </View>
                      )}
                    </View>
                  )}
                  <View style={styles.actionRow}>
                    <Pressable
                      style={styles.approveBtn}
                      onPress={() => handleApprove(m)}
                    >
                      <Text style={styles.approveBtnText}>
                        {m.type === 'final_report'
                          ? (lang === 'he' ? '👥 אשר + הקצה בוחנים' : '👥 Approve + Assign Examiners')
                          : (lang === 'he' ? '✅ אשר' : '✅ Approve')}
                      </Text>
                    </Pressable>
                    <Pressable
                      style={styles.rejectBtn}
                      onPress={() => handleReject(m)}
                    >
                      <Text style={styles.rejectBtnText}>
                        {m.type === 'final_report'
                          ? (lang === 'he' ? '👥 דחה + אל תקצה בוחנים' : '👥 Reject + Do Not Assign Examiners')
                          : (lang === 'he' ? '❌ דחה' : '❌ Reject')}
                      </Text>
                    </Pressable>
                  </View>
                </Pressable>
              ))
            )}
          </>
        )}

        {activeTab === 'defense' && (
  <>
    {defenseSetups.length === 0 ? (
      <View style={styles.empty}>
        <Text style={styles.emptyEmoji}>🎓</Text>
        <Text style={styles.emptyText}>
          {lang === 'he' ? 'אין הגנות לתיאום' : 'No defenses to schedule'}
        </Text>
      </View>
    ) : (
      defenseSetups.map((m) => (
        <Pressable
          key={m.id}
          style={[styles.card, expandedCards[m.id] && styles.cardExpanded]}
          onPress={() => toggleCardExpansion(m.id)}
        >
          {/* ── Card header ── */}
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>
              {lang === 'he' ? m.projectTitleHe : m.projectTitleEn}
            </Text>
            <FacultyBadge facultyId={m.facultyId} lang={lang} />
          </View>

          {/* ── Always visible summary ── */}
          <Text style={styles.cardMeta}>👤 {m.studentNames.join(', ')}</Text>
          {m.supervisorName ? (
            <Text style={styles.cardMeta}>👨‍🏫 {lang === 'he' ? 'מנחה:' : 'Supervisor:'} {m.supervisorName}</Text>
          ) : null}
          {m.examinerIds.length > 0 && (
            <Text style={styles.cardMeta}>
              🔬 {lang === 'he' ? 'בוחנים הוקצו' : 'Examiners assigned'}: {m.examinerIds.length}
            </Text>
          )}
          {m.defenseDate ? (
            <View style={styles.defenseDateBadge}>
              <Text style={styles.defenseDateText}>
                📅 {m.defenseDate}{m.defenseRoom ? ` | ${m.defenseRoom}` : ''}
              </Text>
            </View>
          ) : null}

          {/* ── Expanded section ── */}
          {expandedCards[m.id] && (
            <View style={styles.expandedSection}>

              {/* Student info */}
              <View style={styles.expandedBox}>
                <Text style={styles.expandedTitle}>
                  {lang === 'he' ? '👤 סטודנטים' : '👤 Students'}
                </Text>
                {m.studentNames.map((name, i) => (
                  <Text key={i} style={styles.expandedText}>• {name}</Text>
                ))}
              </View>

              {/* Supervisor */}
              {m.supervisorName ? (
                <View style={styles.expandedBox}>
                  <Text style={styles.expandedTitle}>
                    {lang === 'he' ? '👨‍🏫 מנחה' : '👨‍🏫 Supervisor'}
                  </Text>
                  <Text style={styles.expandedText}>{m.supervisorName}</Text>
                </View>
              ) : null}

              {/* Milestone grades */}
              {m.milestoneGrades && m.milestoneGrades.length > 0 && (
                <View style={styles.expandedBox}>
                  <Text style={styles.expandedTitle}>
                    {lang === 'he' ? '📊 ציונים לפי אבן דרך' : '📊 Grades by Milestone'}
                  </Text>
                  {m.milestoneGrades.map((mg, i) => (
                    <View key={i} style={styles.gradeRow}>
                      <Text style={styles.expandedText}>
                        {MILESTONE_LABEL[mg.type]?.[lang] ?? mg.type}
                      </Text>
                      <Text style={[
                        styles.expandedText,
                        { fontWeight: '700', color: mg.score !== null ? '#10B981' : '#8899BB' }
                      ]}>
                        {mg.score !== null ? `${mg.score}/100` : (lang === 'he' ? 'טרם נוקד' : 'Not graded')}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}

          {/* ── Action buttons ── */}
          <View style={styles.actionRow}>
            <Pressable
              style={styles.approveBtn}
              onPress={() => {
                setSelectedMilestone(m);
                setExaminer1Id(m.examinerIds[0] ?? '');
                setExaminer2Id(m.examinerIds[1] ?? '');
                setAssignModal(true);
              }}
            >
              <Text style={styles.approveBtnText}>
                👥 {lang === 'he' ? 'הקצה בוחנים' : 'Assign Examiners'}
              </Text>
            </Pressable>
            <Pressable
              style={styles.scheduleBtn}
              onPress={() => {
                setSelectedMilestone(m);
                setDefenseDate(m.defenseDate ?? '');
                setDefenseRoom(m.defenseRoom ?? '');
                setDefenseModal(true);
              }}
            >
              <Text style={styles.scheduleBtnText}>
                📅 {lang === 'he' ? 'קבע מועד' : 'Set Date'}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      ))
    )}
  </>
)}
  {activeTab === 'inProgress' && (
    <>
      {inProgressProjects.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyEmoji}>📁</Text>
          <Text style={styles.emptyText}>
            {lang === 'he' ? 'אין פרויקטים פעילים' : 'No projects in progress'}
          </Text>
        </View>
      ) : (
        inProgressProjects.map((p) => (
          <Pressable
            key={p.id}
            style={[styles.card, expandedCards[p.id] && styles.cardExpanded]}
            onPress={() => toggleCardExpansion(p.id)}
          >
            {/* ── Header ── */}
            <View style={styles.cardHeader}>
              <Text style={styles.milestoneType}>
                {lang === 'he' ? p.projectTitleHe : p.projectTitleEn}
              </Text>
              <FacultyBadge facultyId={p.facultyId} lang={lang} />
            </View>

            {/* ── Always visible ── */}
            <Text style={styles.cardMeta}>
              👤 {p.studentNames.length > 0 ? p.studentNames.join(', ') : (lang === 'he' ? 'אין סטודנטים' : 'No students')}
            </Text>
            <Text style={styles.cardMeta}>
              👨‍🏫 {lang === 'he' ? 'מנחה:' : 'Supervisor:'} {p.supervisorName}
            </Text>

            {/* ── Progress bar ── */}
            <View style={{ marginTop: 10, marginBottom: 4 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                <Text style={{ fontSize: 12, color: '#8899BB' }}>
                  {lang === 'he' ? 'התקדמות' : 'Progress'}
                </Text>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#2E86FF' }}>
                  {p.progress}%
                </Text>
              </View>
              <View style={{ height: 6, backgroundColor: '#E0E8FF', borderRadius: 3, overflow: 'hidden' }}>
                <View style={{
                  height: '100%',
                  width: `${p.progress}%`,
                  backgroundColor: p.progress === 100 ? '#10B981' : '#2E86FF',
                  borderRadius: 3,
                }} />
              </View>
            </View>

            {/* ── Expanded: milestone breakdown ── */}
            {expandedCards[p.id] && (
              <View style={styles.expandedSection}>
                <View style={styles.expandedBox}>
                  <Text style={styles.expandedTitle}>
                    {lang === 'he' ? '📊 אבני דרך' : '📊 Milestones'}
                  </Text>
                  {p.milestones.length === 0 ? (
                    <Text style={styles.expandedText}>
                      {lang === 'he' ? 'לא נוצרו אבני דרך' : 'No milestones created'}
                    </Text>
                  ) : (
                    p.milestones.map((m, i) => (
                      <View
                        key={i}
                        style={{
                          flexDirection: 'row',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          paddingVertical: 6,
                          borderBottomWidth: i < p.milestones.length - 1 ? 1 : 0,
                          borderBottomColor: '#F0F4FF',
                        }}
                      >
                        {/* Milestone name + status */}
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 13, fontWeight: '600', color: '#111' }}>
                            {MILESTONE_LABEL[m.type]?.[lang] ?? m.type}
                          </Text>
                          <Text style={{ fontSize: 11, color: STATUS_COLORS[m.status] ?? '#8899BB', marginTop: 2 }}>
                            {STATUS_LABEL[m.status]?.[lang] ?? m.status}
                          </Text>
                        </View>

                        {/* Score */}
                        <Text style={{
                          fontSize: 14,
                          fontWeight: '700',
                          color: m.supervisorScore !== null ? '#10B981' : '#C0CCDD',
                        }}>
                          {m.supervisorScore !== null
                            ? `${m.supervisorScore}/100`
                            : '—'}
                        </Text>
                      </View>
                    ))
                  )}
                </View>
              </View>
            )}

            <Text style={{ textAlign: 'center', color: '#C0CCDD', fontSize: 11, marginTop: 6 }}>
              {expandedCards[p.id] ? '▲' : '▼'}
            </Text>
          </Pressable>
        ))
      )}
    </>
  )}

        <View style={{ height: 60 }} />
      </ScrollView>

      {/* ── Approve modal (simple confirm for milestone 1 & 2) ── */}
      <Modal visible={approveModal} animationType="fade" transparent>
        <View style={styles.overlay}>
          <View style={styles.dialog}>
            <Text style={styles.dialogTitle}>
              {lang === 'he' ? 'אישור אבן דרך' : 'Approve Milestone'}
            </Text>
            <View style={styles.dialogBtns}>
              <Pressable style={styles.dialogCancel} onPress={() => setApproveModal(false)}>
                <Text>{lang === 'he' ? 'ביטול' : 'Cancel'}</Text>
              </Pressable>
              <Pressable
                style={styles.dialogConfirm}
                onPress={() => { setApproveModal(false); selectedMilestone && handleApprove(selectedMilestone); }}
              >
                <Text style={{ color: '#fff', fontWeight: '700' }}>
                  {lang === 'he' ? 'אשר' : 'Confirm'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Assign examiners modal ── */}
      <Modal visible={assignModal} animationType="slide" presentationStyle="pageSheet">
        <ScrollView style={styles.modal} contentContainerStyle={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Pressable onPress={() => setAssignModal(false)}>
              <Text style={styles.backButton}>
                ← {lang === 'he' ? 'חזור' : 'Back'}
              </Text>
            </Pressable>
          </View>
          <Text style={styles.modalTitle}>
            {lang === 'he' ? '👥 הקצאת בוחנים ומשקלות' : '👥 Assign Examiners & Weights'}
          </Text>

          <Text style={styles.fieldLabel}>
            {lang === 'he' ? 'בוחן 1' : 'Examiner 1'}
          </Text>
          {allExaminers
            .filter((ex) => ex.id !== examiner2Id)
            .map((ex) => (
            <Pressable
              key={ex.id}
              style={[styles.examinerOption, examiner1Id === ex.id && styles.examinerOptionActive]}
              onPress={() => setExaminer1Id(ex.id)}
            >
              <Text style={[styles.examinerOptionText, examiner1Id === ex.id && { color: '#fff' }]}>
                {ex.displayName} · {ex.email}
              </Text>
            </Pressable>
          ))}

          <Text style={styles.fieldLabel}>
            {lang === 'he' ? 'בוחן 2' : 'Examiner 2'}
          </Text>
          {allExaminers
            .filter((ex) => ex.id !== examiner1Id)
            .map((ex) => (
            <Pressable
              key={ex.id}
              style={[styles.examinerOption, examiner2Id === ex.id && styles.examinerOptionActive]}
              onPress={() => setExaminer2Id(ex.id)}
            >
              <Text style={[styles.examinerOptionText, examiner2Id === ex.id && { color: '#fff' }]}>
                {ex.displayName} · {ex.email}
              </Text>
            </Pressable>
          ))}

          <Text style={styles.fieldLabel}>
            {lang === 'he' ? 'משקלות ציון (סה"כ 100%)' : 'Grade Weights (must total 100%)'}
          </Text>

          {[
            { label: lang === 'he' ? 'משקל מנחה (%)' : 'Supervisor weight (%)', value: weightSupervisor, set: setWeightSupervisor },
            { label: lang === 'he' ? 'משקל בוחן 1 (%)' : 'Examiner 1 weight (%)', value: weightExaminer1, set: setWeightExaminer1 },
            { label: lang === 'he' ? 'משקל בוחן 2 (%)' : 'Examiner 2 weight (%)', value: weightExaminer2, set: setWeightExaminer2 },
          ].map((field) => (
            <View key={field.label}>
              <Text style={styles.weightLabel}>{field.label}</Text>
              <TextInput
                style={styles.weightInput}
                value={field.value}
                onChangeText={field.set}
                keyboardType="numeric"
                placeholder="0"
              />
            </View>
          ))}

          <Text style={styles.weightSum}>
            {lang === 'he' ? 'סה"כ:' : 'Total:'}{' '}
            {(parseFloat(weightSupervisor || '0') + parseFloat(weightExaminer1 || '0') + parseFloat(weightExaminer2 || '0'))}%
          </Text>

          <Pressable
            style={[styles.submitBtn, saving && { opacity: 0.6 }]}
            onPress={handleAssignExaminers}
            disabled={saving}
          >
            {saving
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.submitBtnText}>{lang === 'he' ? 'שמור והקצה' : 'Save & Assign'}</Text>
            }
          </Pressable>

          <Pressable style={styles.cancelBtn} onPress={() => setAssignModal(false)}>
            <Text style={styles.cancelBtnText}>{lang === 'he' ? 'ביטול' : 'Cancel'}</Text>
          </Pressable>
        </ScrollView>
      </Modal>

      {/* ── Defense setup modal ── */}
      <Modal visible={defenseModal} animationType="slide" presentationStyle="formSheet">
        <ScrollView style={styles.modal} contentContainerStyle={styles.modalContent}>
          <Text style={styles.modalTitle}>
            {lang === 'he' ? '📅 קביעת מועד הגנה' : '📅 Schedule Defense'}
          </Text>

          <Text style={styles.fieldLabel}>
            {lang === 'he' ? 'תאריך ושעה' : 'Date & Time'}
          </Text>
          <TextInput
            style={styles.input}
            value={defenseDateText}
            onChangeText={(text) => {
              setDefenseDateText(text);

              // try to parse into Date
              const parsed = new Date(text);
              if (!isNaN(parsed.getTime())) {
                setDefenseDate(parsed);
              } else {
                setDefenseDate(null);
              }
            }}
            placeholder="DD/MM/YYYY HH:MM"
          />

          <Text style={styles.fieldLabel}>
            {lang === 'he' ? 'חדר (אופציונלי)' : 'Room (optional)'}
          </Text>
          <TextInput
            style={styles.input}
            value={defenseRoom}
            onChangeText={setDefenseRoom}
            placeholder={lang === 'he' ? 'חדר 101' : 'Room 101'}
          />

          <Pressable
            style={[styles.submitBtn, saving && { opacity: 0.6 }]}
            onPress={handleSetDefense}
            disabled={saving}
          >
            {saving
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.submitBtnText}>{lang === 'he' ? 'שמור' : 'Save'}</Text>
            }
          </Pressable>

          <Pressable style={styles.cancelBtn} onPress={() => setDefenseModal(false)}>
            <Text style={styles.cancelBtnText}>{lang === 'he' ? 'ביטול' : 'Cancel'}</Text>
          </Pressable>
        </ScrollView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = coordinatorHomeStyles;