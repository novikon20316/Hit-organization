import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, Pressable,
  SafeAreaView, ActivityIndicator, Modal, TextInput, Alert, StyleSheet,
} from 'react-native';
import {
  collection, query, where, onSnapshot, doc,
  updateDoc, serverTimestamp, getDoc, addDoc, getDocs,
} from 'firebase/firestore';
import { db, auth } from '../../src/firebase/firebase';
import { useRouter } from 'expo-router';
import type { Lang } from '../../components/i18n';
import { TopBar, getFacultyColor } from '../../components/shared';
import { calculateFinalGrade, type GradeWeights } from '../../components/Milestoneservice';
import { examinerHomeStyles } from '../../constants/styles';
 
// ─── Types ────────────────────────────────────────────────────────────────────
 
interface AssignedMilestone {
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
  supervisorName: string;                // ← new
  examinerIds: string[];
  examiner1Score: number | null;
  examiner2Score: number | null;
  examiner1GradeId: string | null;
  examiner2GradeId: string | null;
  gradeWeights: GradeWeights | null;
  defenseDate: string | null;
  defenseRoom: string | null;
  facultyId: string;
  milestoneHistory: {                    // ← new
    type: string;
    supervisorScore: number | null;
    supervisorComment: string;
    fileUrls: string[];
    status: string;
  }[];
}
 
// ─── Constants ────────────────────────────────────────────────────────────────
 
const GRADING_CRITERIA = [
  { key: 'understanding', heLabel: 'הבנת הנושא',   enLabel: 'Subject Understanding', maxScore: 25 },
  { key: 'methodology',   heLabel: 'מתודולוגיה',    enLabel: 'Methodology',           maxScore: 25 },
  { key: 'presentation',  heLabel: 'מצגת והצגה',    enLabel: 'Presentation',          maxScore: 25 },
  { key: 'answers',       heLabel: 'תשובות לשאלות', enLabel: 'Answers to Questions',  maxScore: 25 },
];
 
const MILESTONE_LABEL: Record<string, { he: string; en: string }> = {
  research_proposal: { he: 'הצעת מחקר',    en: 'Research Proposal' },
  progress_report:   { he: 'דו"ח התקדמות', en: 'Progress Report'   },
  final_report:      { he: 'דו"ח מסכם',    en: 'Final Report'      },
  defense:           { he: 'הגנה',          en: 'Defense'           },
};
 
// ─── Helpers ──────────────────────────────────────────────────────────────────
 
function parseDefenseDate(raw: string | null): Date | null {
  if (!raw) return null;
  const [datePart, timePart] = raw.trim().split(' ');
  if (!datePart) return null;
  const [day, month, year] = datePart.split('/').map(Number);
  const [hour = 0, minute = 0] = (timePart ?? '').split(':').map(Number);
  const d = new Date(year, month - 1, day, hour, minute);
  return isNaN(d.getTime()) ? null : d;
}
 
function daysUntil(date: Date): number {
  const now  = new Date();
  const diff = date.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}
 
// ─── Component ────────────────────────────────────────────────────────────────
 
export default function ExaminerHome() {
  const router = useRouter();
  const [lang, setLang]   = useState<Lang>('he');
  const isRtl              = lang === 'he';
  const styles             = examinerHomeStyles;
 
  const [examinerName, setExaminerName] = useState('');
  const [loading,      setLoading]      = useState(true);
  const [unreadCount,  setUnreadCount]  = useState(0);
  const [activeTab,    setActiveTab]    = useState<'projects' | 'schedule'>('projects');
  const [assignments,  setAssignments]  = useState<AssignedMilestone[]>([]);
  const [expandedCards,setExpandedCards]= useState<Record<string, boolean>>({});
 
  // Grade modal (100% unchanged from original)
  const [gradeModal,  setGradeModal]  = useState(false);
  const [selected,    setSelected]    = useState<AssignedMilestone | null>(null);
  const [scores,      setScores]      = useState<Record<string, string>>({});
  const [comments,    setComments]    = useState('');
  const [submitting,  setSubmitting]  = useState(false);
 
  const uid = auth.currentUser?.uid;
 
  // ── Load examiner name ──────────────────────────────────────────────────
  useEffect(() => {
    if (!uid) return;
    getDoc(doc(db, 'users', uid)).then((snap) => {
      if (snap.exists()) setExaminerName(snap.data().displayName || '');
    });
  }, [uid]);
 
  // ── Unread notifications ────────────────────────────────────────────────
  useEffect(() => {
    if (!uid) return;
    const q = query(
      collection(db, 'notifications'),
      where('recipientId', '==', uid),
      where('isRead', '==', false),
    );
    return onSnapshot(q, (snap) => setUnreadCount(snap.size));
  }, [uid]);
 
  // ── Load assigned milestones ────────────────────────────────────────────
  useEffect(() => {
    if (!uid) return;
    const q = query(
      collection(db, 'milestones'),
      where('examinerIds', 'array-contains', uid),
      where('status', 'in', ['examiners_assigned', 'examiner_graded']),
    );
    return onSnapshot(q, async (snap) => {
      const items: AssignedMilestone[] = [];
 
      for (const d of snap.docs) {
        const data = d.data();
 
        // Project
        const projectSnap = await getDoc(doc(db, 'projects', data.projectId));
        const projectData  = projectSnap.data() ?? {};
 
        // Students
        const studentNames: string[] = [];
        for (const sid of (data.studentIds ?? [])) {
          const sSnap = await getDoc(doc(db, 'users', sid));
          if (sSnap.exists()) studentNames.push(sSnap.data().displayName);
        }
 
        // Supervisor name  ← new
        let supervisorName = '';
        if (data.supervisorId) {
          const supSnap = await getDoc(doc(db, 'users', data.supervisorId));
          if (supSnap.exists()) supervisorName = supSnap.data().displayName ?? '';
        }
 
        // All milestones history for this project  ← new
        const allMilestonesSnap = await getDocs(
          query(collection(db, 'milestones'), where('projectId', '==', data.projectId))
        );
        const milestoneHistory = allMilestonesSnap.docs
          .filter((md) => md.data().type !== 'defense')
          .map((md) => ({
            type:              md.data().type as string,
            supervisorScore:   md.data().supervisorScore ?? null,
            supervisorComment: md.data().supervisorComment ?? '',
            fileUrls:          md.data().fileUrls ?? [],
            status:            md.data().status as string,
          }))
          .sort((a, b) => {
            const order = ['research_proposal', 'progress_report', 'final_report'];
            return order.indexOf(a.type) - order.indexOf(b.type);
          });
 
        items.push({
          id:               d.id,
          projectId:        data.projectId,
          projectTitleHe:   projectData.titleHe ?? '',
          projectTitleEn:   projectData.titleEn ?? '',
          type:             data.type,
          status:           data.status,
          studentNames,
          studentIds:       data.studentIds ?? [],
          supervisorId:     data.supervisorId ?? '',
          supervisorName,
          supervisorScore:  data.supervisorScore ?? null,
          examinerIds:      data.examinerIds ?? [],
          examiner1Score:   data.examiner1Score ?? null,
          examiner2Score:   data.examiner2Score ?? null,
          examiner1GradeId: data.examiner1GradeId ?? null,
          examiner2GradeId: data.examiner2GradeId ?? null,
          gradeWeights:     data.gradeWeights ?? null,
          defenseDate:      data.defenseDate ?? null,
          defenseRoom:      data.defenseRoom ?? null,
          facultyId:        projectData.facultyId ?? '',
          milestoneHistory,
        });
      }
 
      setAssignments(items);
      setLoading(false);
    });
  }, [uid]);
 
  // ── Helpers (unchanged) ─────────────────────────────────────────────────
  const alreadyGraded = (m: AssignedMilestone): boolean => {
    const isExaminer1 = m.examinerIds[0] === uid;
    return isExaminer1 ? m.examiner1GradeId !== null : m.examiner2GradeId !== null;
  };
 
  const openGradeModal = (m: AssignedMilestone) => {
    setSelected(m);
    const initial: Record<string, string> = {};
    GRADING_CRITERIA.forEach((c) => { initial[c.key] = ''; });
    setScores(initial);
    setComments('');
    setGradeModal(true);
  };
 
  const totalScore = () =>
    GRADING_CRITERIA.reduce((sum, c) => sum + (parseFloat(scores[c.key] || '0')), 0);
 
  // ── Submit grade (unchanged) ────────────────────────────────────────────
  const handleSubmitGrade = async () => {
    if (!selected || !uid) return;
 
    for (const c of GRADING_CRITERIA) {
      const v = parseFloat(scores[c.key] || '');
      if (isNaN(v) || v < 0 || v > c.maxScore) {
        Alert.alert(
          lang === 'he' ? 'שגיאה' : 'Error',
          lang === 'he'
            ? `ציון עבור "${c.heLabel}" חייב להיות בין 0 ל-${c.maxScore}`
            : `Score for "${c.enLabel}" must be between 0 and ${c.maxScore}`,
        );
        return;
      }
    }
 
    const score       = totalScore();
    const isExaminer1 = selected.examinerIds[0] === uid;
    setSubmitting(true);
 
    try {
      const gradeRef = await addDoc(collection(db, 'grades'), {
        milestoneId:  selected.id,
        projectId:    selected.projectId,
        graderId:     uid,
        graderRole:   'examiner',
        totalScore:   score,
        responses:    scores,
        comments,
        criteria:     GRADING_CRITERIA,
        submittedAt:  serverTimestamp(),
        isFinalized:  true,
      });
 
      const otherScore = isExaminer1 ? selected.examiner2Score : selected.examiner1Score;
      const bothGraded = otherScore !== null;
 
      const milestoneUpdate: Record<string, any> = {
        [isExaminer1 ? 'examiner1Score'       : 'examiner2Score']:       score,
        [isExaminer1 ? 'examiner1GradeId'     : 'examiner2GradeId']:     gradeRef.id,
        [isExaminer1 ? 'examiner1SubmittedAt' : 'examiner2SubmittedAt']: serverTimestamp(),
      };
 
      if (bothGraded && selected.gradeWeights && selected.supervisorScore !== null) {
        const e1Score = isExaminer1 ? score : (selected.examiner1Score ?? score);
        const e2Score = isExaminer1 ? (selected.examiner2Score ?? score) : score;
        const finalGrade = calculateFinalGrade({
          supervisorScore: selected.supervisorScore,
          examiner1Score:  e1Score,
          examiner2Score:  e2Score,
          weights:         selected.gradeWeights,
        });
        milestoneUpdate.status     = 'both_examiners_graded';
        milestoneUpdate.finalGrade = finalGrade;
 
        for (const studentId of selected.studentIds) {
          await addDoc(collection(db, 'notifications'), {
            recipientId: studentId,
            type:        'final_grade_ready',
            titleHe:     '🎓 ציון סופי זמין',
            titleEn:     '🎓 Final Grade Ready',
            bodyHe:      `הציון הסופי שלך הוא: ${finalGrade}`,
            bodyEn:      `Your final grade is: ${finalGrade}`,
            relatedProjectId:   selected.projectId,
            relatedMilestoneId: selected.id,
            isRead:      false,
            createdAt:   serverTimestamp(),
          });
        }
      } else {
        milestoneUpdate.status = 'examiner_graded';
      }
 
      await updateDoc(doc(db, 'milestones', selected.id), milestoneUpdate);
      setGradeModal(false);
      Alert.alert('✅', lang === 'he' ? 'הציון נשלח בהצלחה' : 'Grade submitted successfully');
    } catch (e) {
      console.error(e);
      Alert.alert('Error', String(e));
    } finally {
      setSubmitting(false);
    }
  };
 
  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#10B981" />
      </View>
    );
  }
 
  // Schedule: only milestones with a defenseDate, sorted soonest first
  const scheduled = [...assignments]
    .filter((m) => m.defenseDate)
    .sort((a, b) => {
      const da = parseDefenseDate(a.defenseDate);
      const db_ = parseDefenseDate(b.defenseDate);
      if (!da || !db_) return 0;
      return da.getTime() - db_.getTime();
    });
 
  return (
    <SafeAreaView style={styles.root}>
      <TopBar
        name={examinerName}
        role="examiner"
        lang={lang}
        isRtl={isRtl}
        unreadCount={unreadCount}
        onToggleLang={() => setLang(lang === 'he' ? 'en' : 'he')}
        onBell={() => router.push('/(tabs)/notifications')}
      />
 
      {/* ── Tab bar ── */}
      <View style={styles.tabBar}>
        {([
          { key: 'projects', he: 'הגנות לבחינה', en: 'Defenses', badge: assignments.length },
          { key: 'schedule', he: 'לוח זמנים',     en: 'Schedule', badge: scheduled.length  },
        ] as const).map((tab) => (
          <Pressable
            key={tab.key}
            style={[styles.tab, activeTab === tab.key && styles.tabActive]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
              {lang === 'he' ? tab.he : tab.en}
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
 
        {/* ════════ PROJECTS TAB ════════ */}
        {activeTab === 'projects' && (
          <>
            {assignments.length === 0 ? (
              <View style={styles.empty}>
                <Text style={styles.emptyEmoji}>📭</Text>
                <Text style={styles.emptyText}>
                  {lang === 'he' ? 'לא הוקצו לך הגנות לבחינה' : 'No defenses assigned to you'}
                </Text>
              </View>
            ) : (
              assignments.map((m) => {
                const graded        = alreadyGraded(m);
                const fc            = getFacultyColor(m.facultyId);
                const examinerIndex = m.examinerIds[0] === uid ? 1 : 2;
 
                return (
                  <Pressable
                    key={m.id}
                    style={[styles.card, { borderLeftColor: fc.primary },
                      expandedCards[m.id] && styles.cardExpanded]}
                    onPress={() =>
                      setExpandedCards((prev) => ({ ...prev, [m.id]: !prev[m.id] }))
                    }
                  >
                    {/* Title */}
                    <Text style={styles.cardTitle}>
                      {lang === 'he' ? m.projectTitleHe : m.projectTitleEn}
                    </Text>
 
                    {/* Students */}
                    <Text style={styles.cardMeta}>👤 {m.studentNames.join(', ')}</Text>
 
                    {/* Supervisor */}
                    <Text style={styles.cardMeta}>
                      👨‍🏫 {lang === 'he' ? 'מנחה:' : 'Supervisor:'} {m.supervisorName}
                    </Text>
 
                    {/* My slot */}
                    <Text style={styles.cardMeta}>
                      🔢 {lang === 'he'
                        ? `אני בוחן #${examinerIndex}`
                        : `I am Examiner #${examinerIndex}`}
                    </Text>
 
                    {/* Defense date pill */}
                    {m.defenseDate && (
                      <View style={styles.defensePill}>
                        <Text style={styles.defensePillText}>
                          📅 {m.defenseDate}{m.defenseRoom ? ` · ${m.defenseRoom}` : ''}
                        </Text>
                      </View>
                    )}
 
                    {/* Grade weights */}
                    {m.gradeWeights && (
                      <View style={styles.weightsRow}>
                        {[
                          { label: lang === 'he' ? 'מנחה'   : 'Supervisor', w: m.gradeWeights.supervisorWeight, hl: false },
                          { label: lang === 'he' ? 'בוחן 1' : 'Examiner 1', w: m.gradeWeights.examiner1Weight,  hl: examinerIndex === 1 },
                          { label: lang === 'he' ? 'בוחן 2' : 'Examiner 2', w: m.gradeWeights.examiner2Weight,  hl: examinerIndex === 2 },
                        ].map((wt) => (
                          <View key={wt.label} style={[styles.weightChip, wt.hl && styles.weightChipHL]}>
                            <Text style={[styles.weightChipLabel, wt.hl && { color: '#fff' }]}>{wt.label}</Text>
                            <Text style={[styles.weightChipValue, wt.hl && { color: '#fff' }]}>{Math.round(wt.w * 100)}%</Text>
                          </View>
                        ))}
                      </View>
                    )}
 
                    {/* Expanded: milestone history */}
                    {expandedCards[m.id] && (
                      <View style={styles.expandedSection}>
                        <Text style={styles.sectionTitle}>
                          {lang === 'he' ? '📊 ציונים ומסמכים לפי אבן דרך' : '📊 Grades & Files by Milestone'}
                        </Text>
 
                        {m.milestoneHistory.map((mg) => (
                          <View key={mg.type} style={styles.milestoneBlock}>
                            <Text style={styles.milestoneName}>
                              {MILESTONE_LABEL[mg.type]?.[lang] ?? mg.type}
                            </Text>
 
                            <View style={styles.scoreRow}>
                              <Text style={styles.scoreLabel}>
                                {lang === 'he' ? 'ציון מנחה:' : 'Supervisor score:'}
                              </Text>
                              <Text style={[styles.scoreValue,
                                { color: mg.supervisorScore !== null ? '#10B981' : '#9CA3AF' }]}>
                                {mg.supervisorScore !== null
                                  ? `${mg.supervisorScore}/100`
                                  : (lang === 'he' ? 'טרם ניתן' : 'Not yet')}
                              </Text>
                            </View>
 
                            {mg.supervisorComment ? (
                              <Text style={styles.commentText}>💬 {mg.supervisorComment}</Text>
                            ) : null}
 
                            {mg.fileUrls.length > 0 ? (
                              <View style={{ marginTop: 6 }}>
                                <Text style={styles.filesLabel}>
                                  📎 {lang === 'he' ? 'קבצים:' : 'Files:'}
                                </Text>
                                {mg.fileUrls.map((url, idx) => (
                                  <Pressable
                                    key={idx}
                                    style={styles.fileBtn}
                                    onPress={() =>
                                      router.push({ pathname: '/pdfViewer', params: { url } })
                                    }
                                  >
                                    <Text style={styles.fileBtnText}>
                                      📄 {lang === 'he' ? `קובץ ${idx + 1}` : `File ${idx + 1}`}
                                    </Text>
                                  </Pressable>
                                ))}
                              </View>
                            ) : (
                              <Text style={styles.noFiles}>
                                {lang === 'he' ? 'לא הועלו קבצים' : 'No files uploaded'}
                              </Text>
                            )}
                          </View>
                        ))}
                      </View>
                    )}
 
                    <Text style={styles.expandHint}>
                      {expandedCards[m.id] ? '▲' : '▼'}
                    </Text>
 
                    {/* Grade button — unchanged */}
                    {graded ? (
                      <View style={styles.gradedBadge}>
                        <Text style={styles.gradedBadgeText}>
                          ✅ {lang === 'he' ? 'ציון הוגש' : 'Grade submitted'}
                        </Text>
                      </View>
                    ) : (
                      <Pressable
                        style={[styles.gradeBtn, { backgroundColor: fc.primary }]}
                        onPress={() => openGradeModal(m)}
                      >
                        <Text style={styles.gradeBtnText}>
                          ✏️ {lang === 'he' ? 'הגש ציון' : 'Submit Grade'}
                        </Text>
                      </Pressable>
                    )}
                  </Pressable>
                );
              })
            )}
          </>
        )}
 
        {/* ════════ SCHEDULE TAB ════════ */}
        {activeTab === 'schedule' && (
          <>
            {scheduled.length === 0 ? (
              <View style={styles.empty}>
                <Text style={styles.emptyEmoji}>📅</Text>
                <Text style={styles.emptyText}>
                  {lang === 'he' ? 'אין הגנות מתוכננות עדיין' : 'No defenses scheduled yet'}
                </Text>
              </View>
            ) : (
              scheduled.map((m) => {
                const defDate       = parseDefenseDate(m.defenseDate);
                const days          = defDate ? daysUntil(defDate) : null;
                const fc            = getFacultyColor(m.facultyId);
                const examinerIndex = m.examinerIds[0] === uid ? 1 : 2;
 
                const urgencyColor =
                  days === null ? '#6B7280' :
                  days < 0     ? '#9CA3AF' :
                  days === 0   ? '#EF4444' :
                  days <= 3    ? '#F97316' :
                  days <= 7    ? '#F59E0B' :
                                 '#10B981';
 
                const urgencyLabel =
                  lang === 'he'
                    ? (days === null ? '—'    :
                       days < 0     ? 'עברה'  :
                       days === 0   ? 'היום!' :
                       days === 1   ? 'מחר!'  :
                       `בעוד ${days} ימים`)
                    : (days === null ? '—'          :
                       days < 0     ? 'Past'        :
                       days === 0   ? 'Today!'      :
                       days === 1   ? 'Tomorrow!'   :
                       `In ${days} days`);
 
                const datePart = m.defenseDate?.split(' ')[0] ?? '';
                const timePart = m.defenseDate?.split(' ')[1] ?? '';
 
                return (
                  <View key={m.id} style={[styles.scheduleCard, { borderLeftColor: fc.primary }]}>
 
                    {/* Countdown badge */}
                    <View style={[styles.countdownBadge, { backgroundColor: urgencyColor }]}>
                      <Text style={styles.countdownText}>{urgencyLabel}</Text>
                    </View>
 
                    {/* Project title */}
                    <Text style={styles.scheduleTitle}>
                      {lang === 'he' ? m.projectTitleHe : m.projectTitleEn}
                    </Text>
 
                    {/* Students */}
                    <Text style={styles.cardMeta}>👤 {m.studentNames.join(', ')}</Text>
 
                    {/* Supervisor */}
                    <Text style={styles.cardMeta}>
                      👨‍🏫 {lang === 'he' ? 'מנחה:' : 'Supervisor:'} {m.supervisorName}
                    </Text>
 
                    {/* My role */}
                    <Text style={styles.cardMeta}>
                      🔢 {lang === 'he'
                        ? `תפקידי: בוחן #${examinerIndex}`
                        : `My role: Examiner #${examinerIndex}`}
                    </Text>
 
                    {/* Date / Time / Room chips */}
                    <View style={styles.scheduleRow}>
                      <View style={styles.scheduleChip}>
                        <Text style={styles.scheduleChipLabel}>
                          {lang === 'he' ? 'תאריך' : 'Date'}
                        </Text>
                        <Text style={styles.scheduleChipValue}>{datePart}</Text>
                      </View>
                      {timePart ? (
                        <View style={styles.scheduleChip}>
                          <Text style={styles.scheduleChipLabel}>
                            {lang === 'he' ? 'שעה' : 'Time'}
                          </Text>
                          <Text style={styles.scheduleChipValue}>{timePart}</Text>
                        </View>
                      ) : null}
                      {m.defenseRoom ? (
                        <View style={styles.scheduleChip}>
                          <Text style={styles.scheduleChipLabel}>
                            {lang === 'he' ? 'חדר' : 'Room'}
                          </Text>
                          <Text style={styles.scheduleChipValue}>{m.defenseRoom}</Text>
                        </View>
                      ) : null}
                    </View>
 
                    {/* Grade weights — highlight my slot */}
                    {m.gradeWeights && (
                      <View style={styles.weightsRow}>
                        {[
                          { label: lang === 'he' ? 'מנחה'   : 'Supervisor', w: m.gradeWeights.supervisorWeight, hl: false },
                          { label: lang === 'he' ? 'בוחן 1' : 'Examiner 1', w: m.gradeWeights.examiner1Weight,  hl: examinerIndex === 1 },
                          { label: lang === 'he' ? 'בוחן 2' : 'Examiner 2', w: m.gradeWeights.examiner2Weight,  hl: examinerIndex === 2 },
                        ].map((wt) => (
                          <View key={wt.label} style={[styles.weightChip, wt.hl && styles.weightChipHL]}>
                            <Text style={[styles.weightChipLabel, wt.hl && { color: '#fff' }]}>{wt.label}</Text>
                            <Text style={[styles.weightChipValue, wt.hl && { color: '#fff' }]}>{Math.round(wt.w * 100)}%</Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                );
              })
            )}
          </>
        )}
 
        <View style={{ height: 60 }} />
      </ScrollView>
 
      {/* ════════ GRADE MODAL — 100% unchanged from original ════════ */}
      <Modal visible={gradeModal} animationType="slide" presentationStyle="pageSheet">
        <ScrollView style={styles.modal} contentContainerStyle={styles.modalContent}>
          <Text style={styles.modalTitle}>
            {lang === 'he' ? '✏️ טופס ציון בוחן' : '✏️ Examiner Grading Form'}
          </Text>
 
          {selected && (
            <View style={styles.context}>
              <Text style={styles.contextTitle}>
                {lang === 'he' ? selected.projectTitleHe : selected.projectTitleEn}
              </Text>
              <Text style={styles.contextSub}>👤 {selected.studentNames.join(', ')}</Text>
              {selected.defenseDate && (
                <Text style={styles.contextSub}>📅 {selected.defenseDate}</Text>
              )}
            </View>
          )}
 
          {GRADING_CRITERIA.map((c) => (
            <View key={c.key} style={styles.criterionRow}>
              <View style={styles.criterionHeader}>
                <Text style={styles.criterionLabel}>
                  {lang === 'he' ? c.heLabel : c.enLabel}
                </Text>
                <Text style={styles.criterionMax}>/ {c.maxScore}</Text>
              </View>
              <TextInput
                style={styles.scoreInput}
                value={scores[c.key] || ''}
                onChangeText={(v) => setScores((prev) => ({ ...prev, [c.key]: v }))}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor="#9CA3AF"
              />
            </View>
          ))}
 
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>
              {lang === 'he' ? 'סה"כ' : 'Total'}
            </Text>
            <Text style={[styles.totalScore,
              { color: totalScore() >= 60 ? '#10B981' : '#EF4444' }]}>
              {totalScore()} / 100
            </Text>
          </View>
 
          <Text style={styles.fieldLabel}>
            {lang === 'he' ? 'הערות' : 'Comments'}
          </Text>
          <TextInput
            style={styles.textarea}
            value={comments}
            onChangeText={setComments}
            multiline
            numberOfLines={5}
            placeholder={lang === 'he' ? 'הערות לסטודנט...' : 'Comments to student...'}
            textAlign={isRtl ? 'right' : 'left'}
          />
 
          <Pressable
            style={[styles.submitBtn, submitting && { opacity: 0.6 }]}
            onPress={handleSubmitGrade}
            disabled={submitting}
          >
            {submitting
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.submitBtnText}>
                  {lang === 'he' ? 'שלח ציון' : 'Submit Grade'}
                </Text>
            }
          </Pressable>
 
          <Pressable style={styles.cancelBtn} onPress={() => setGradeModal(false)}>
            <Text style={styles.cancelBtnText}>{lang === 'he' ? 'ביטול' : 'Cancel'}</Text>
          </Pressable>
        </ScrollView>
      </Modal>
    </SafeAreaView>
  );
}