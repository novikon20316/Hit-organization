import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet,
  SafeAreaView, ActivityIndicator, Modal, TextInput, Alert,
} from 'react-native';
import {
  collection, query, where, onSnapshot, doc,
  updateDoc, serverTimestamp, getDoc, addDoc,
} from 'firebase/firestore';
import { db, auth } from '../../src/firebase/firebase';
import { useRouter } from 'expo-router';
import type { Lang } from '../../components/i18n';
import { TopBar, getFacultyColor } from '../../components/shared';
import { calculateFinalGrade, type GradeWeights } from '../../components/Milestoneservice';

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
  examinerIds: string[];
  examiner1Score: number | null;
  examiner2Score: number | null;
  examiner1GradeId: string | null;
  examiner2GradeId: string | null;
  gradeWeights: GradeWeights | null;
  defenseDate: string | null;
  defenseRoom: string | null;
  facultyId: string;
}

const GRADING_CRITERIA = [
  { key: 'understanding',   heLabel: 'הבנת הנושא',          enLabel: 'Subject Understanding',  maxScore: 25 },
  { key: 'methodology',     heLabel: 'מתודולוגיה',           enLabel: 'Methodology',             maxScore: 25 },
  { key: 'presentation',    heLabel: 'מצגת והצגה',           enLabel: 'Presentation',            maxScore: 25 },
  { key: 'answers',         heLabel: 'תשובות לשאלות',        enLabel: 'Answers to Questions',    maxScore: 25 },
];

export default function ExaminerHome() {
  const router = useRouter();
  const [lang, setLang] = useState<Lang>('he');
  const isRtl = lang === 'he';

  const [examinerName, setExaminerName] = useState('');
  const [loading,      setLoading]      = useState(true);
  const [unreadCount,  setUnreadCount]  = useState(0);

  const [assignments,  setAssignments]  = useState<AssignedMilestone[]>([]);

  // Grade modal
  const [gradeModal,   setGradeModal]   = useState(false);
  const [selected,     setSelected]     = useState<AssignedMilestone | null>(null);
  const [scores,       setScores]       = useState<Record<string, string>>({});
  const [comments,     setComments]     = useState('');
  const [submitting,   setSubmitting]   = useState(false);

  const uid = auth.currentUser?.uid;

  useEffect(() => {
    if (!uid) return;
    getDoc(doc(db, 'users', uid)).then((snap) => {
      if (snap.exists()) setExaminerName(snap.data().displayName || '');
    });
  }, [uid]);

  // Milestones where this examiner is assigned
  useEffect(() => {
    if (!uid) return;
    const q = query(
      collection(db, 'milestones'),
      where('examinerIds', 'array-contains', uid),
      where('status', 'in', ['examiners_assigned', 'examiner_graded'])
    );
    return onSnapshot(q, async (snap) => {
      const items: AssignedMilestone[] = [];
      for (const d of snap.docs) {
        const data = d.data();
        const projectSnap = await getDoc(doc(db, 'projects', data.projectId));
        const studentNames: string[] = [];
        for (const sid of (data.studentIds ?? [])) {
          const sSnap = await getDoc(doc(db, 'users', sid));
          if (sSnap.exists()) studentNames.push(sSnap.data().displayName);
        }
        items.push({
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
          examinerIds:      data.examinerIds ?? [],
          examiner1Score:   data.examiner1Score ?? null,
          examiner2Score:   data.examiner2Score ?? null,
          examiner1GradeId: data.examiner1GradeId ?? null,
          examiner2GradeId: data.examiner2GradeId ?? null,
          gradeWeights:     data.gradeWeights ?? null,
          defenseDate:      data.defenseDate ?? null,
          defenseRoom:      data.defenseRoom ?? null,
          facultyId:        projectSnap.data()?.facultyId ?? '',
        });
      }
      setAssignments(items);
      setLoading(false);
    });
  }, [uid]);

  useEffect(() => {
    if (!uid) return;
    const q = query(
      collection(db, 'notifications'),
      where('recipientId', '==', uid),
      where('isRead', '==', false)
    );
    return onSnapshot(q, (snap) => setUnreadCount(snap.size));
  }, [uid]);

  // Has this examiner already graded this milestone?
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

  const handleSubmitGrade = async () => {
    if (!selected || !uid) return;

    // Validate all fields filled
    for (const c of GRADING_CRITERIA) {
      const v = parseFloat(scores[c.key] || '');
      if (isNaN(v) || v < 0 || v > c.maxScore) {
        Alert.alert(
          lang === 'he' ? 'שגיאה' : 'Error',
          lang === 'he'
            ? `ציון עבור "${c.heLabel}" חייב להיות בין 0 ל-${c.maxScore}`
            : `Score for "${c.enLabel}" must be between 0 and ${c.maxScore}`
        );
        return;
      }
    }

    const score = totalScore();
    const isExaminer1 = selected.examinerIds[0] === uid;
    setSubmitting(true);

    try {
      // Save grade doc
      const gradeRef = await addDoc(collection(db, 'grades'), {
        milestoneId:   selected.id,
        projectId:     selected.projectId,
        graderId:      uid,
        graderRole:    'examiner',
        totalScore:    score,
        responses:     scores,
        comments,
        criteria:      GRADING_CRITERIA,
        submittedAt:   serverTimestamp(),
        isFinalized:   true,
      });

      // Determine new status and check if both graded
      const otherScore = isExaminer1 ? selected.examiner2Score : selected.examiner1Score;
      const bothGraded = otherScore !== null;

      const milestoneUpdate: Record<string, any> = {
        [isExaminer1 ? 'examiner1Score' : 'examiner2Score']: score,
        [isExaminer1 ? 'examiner1GradeId' : 'examiner2GradeId']: gradeRef.id,
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

        milestoneUpdate.status     = 'completed';
        milestoneUpdate.finalGrade = finalGrade;
        milestoneUpdate.status     = 'both_examiners_graded';

        // Notify students of final grade
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

  return (
    <SafeAreaView style={styles.root}>
      <TopBar
        name={examinerName}
        role="examiner"
        lang={lang}
        isRtl={isRtl}
        unreadCount={unreadCount}
        onToggleLang={() => setLang(lang === 'he' ? 'en' : 'he')}
        onBell={() => router.push('/(tabs)/Notificationsscreen')}
      />

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.pageTitle}>
          🔬 {lang === 'he' ? 'הגנות לבחינה' : 'Defenses to Examine'}
        </Text>

        {assignments.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>📭</Text>
            <Text style={styles.emptyText}>
              {lang === 'he' ? 'לא הוקצו לך הגנות לבחינה' : 'No defenses assigned to you'}
            </Text>
          </View>
        ) : (
          assignments.map((m) => {
            const graded = alreadyGraded(m);
            const fc = getFacultyColor(m.facultyId);
            return (
              <View key={m.id} style={[styles.card, { borderLeftColor: fc.primary }]}>
                <Text style={styles.cardTitle}>
                  {lang === 'he' ? m.projectTitleHe : m.projectTitleEn}
                </Text>
                <Text style={styles.cardMeta}>👤 {m.studentNames.join(', ')}</Text>

                {m.defenseDate && (
                  <View style={styles.dateChip}>
                    <Text style={styles.dateChipText}>
                      📅 {m.defenseDate}{m.defenseRoom ? ` · ${m.defenseRoom}` : ''}
                    </Text>
                  </View>
                )}

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
              </View>
            );
          })
        )}
        <View style={{ height: 60 }} />
      </ScrollView>

      {/* ── Grade modal ── */}
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
            <Text style={[
              styles.totalScore,
              { color: totalScore() >= 60 ? '#10B981' : '#EF4444' }
            ]}>
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

const styles = StyleSheet.create({
  root:     { flex: 1, backgroundColor: '#F0FDF9' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content:  { padding: 16 },

  pageTitle: { fontSize: 20, fontWeight: '900', color: '#111', marginBottom: 16 },

  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16,
    marginBottom: 12, borderLeftWidth: 4,
    borderWidth: 1, borderColor: '#D1FAE5',
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#111', marginBottom: 6 },
  cardMeta:  { fontSize: 12, color: '#6B7280', marginBottom: 4 },

  dateChip: {
    backgroundColor: '#ECFDF5', borderRadius: 8, padding: 8,
    marginTop: 8, alignSelf: 'flex-start',
    borderWidth: 1, borderColor: '#A7F3D0',
  },
  dateChipText: { color: '#065F46', fontSize: 12, fontWeight: '600' },

  gradedBadge: {
    marginTop: 12, backgroundColor: '#F0FDF4', borderRadius: 10,
    paddingVertical: 10, alignItems: 'center',
    borderWidth: 1, borderColor: '#A7F3D0',
  },
  gradedBadgeText: { color: '#10B981', fontWeight: '700' },

  gradeBtn: {
    marginTop: 12, borderRadius: 12, paddingVertical: 12, alignItems: 'center',
  },
  gradeBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  empty:      { alignItems: 'center', paddingTop: 80 },
  emptyEmoji: { fontSize: 44, marginBottom: 12 },
  emptyText:  { fontSize: 15, color: '#9CA3AF' },

  modal:        { flex: 1, backgroundColor: '#F0FDF9' },
  modalContent: { padding: 20, paddingBottom: 60 },
  modalTitle:   { fontSize: 20, fontWeight: '900', color: '#111', marginBottom: 16 },

  context: {
    backgroundColor: '#ECFDF5', borderRadius: 12, padding: 14,
    marginBottom: 20, borderLeftWidth: 3, borderLeftColor: '#10B981',
  },
  contextTitle: { fontSize: 15, fontWeight: '700', color: '#111', marginBottom: 4 },
  contextSub:   { fontSize: 13, color: '#065F46', marginBottom: 2 },

  criterionRow:   { marginBottom: 16 },
  criterionHeader:{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  criterionLabel: { fontSize: 14, fontWeight: '600', color: '#374151' },
  criterionMax:   { fontSize: 12, color: '#9CA3AF' },
  scoreInput: {
    backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 14,
    height: 48, fontSize: 20, fontWeight: '800', color: '#10B981',
    borderWidth: 1, borderColor: '#D1FAE5', textAlign: 'center',
  },

  totalRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: 16, paddingVertical: 14, backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 16 },
  totalLabel: { fontSize: 16, fontWeight: '700', color: '#374151' },
  totalScore: { fontSize: 28, fontWeight: '900' },

  fieldLabel: { fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 8 },
  textarea: {
    backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 14,
    paddingVertical: 12, fontSize: 14, color: '#111',
    borderWidth: 1, borderColor: '#D1FAE5', textAlignVertical: 'top', minHeight: 100,
  },

  submitBtn: {
    backgroundColor: '#10B981', borderRadius: 14, paddingVertical: 15,
    alignItems: 'center', marginTop: 20,
  },
  submitBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  cancelBtn:     { borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  cancelBtnText: { color: '#10B981', fontSize: 14, fontWeight: '600' },
});