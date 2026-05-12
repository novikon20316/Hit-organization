import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, Pressable,
  SafeAreaView, ActivityIndicator, Modal, TextInput, Alert, Switch,
} from 'react-native';
import {
  collection, query, where, onSnapshot, doc,
  updateDoc, serverTimestamp, getDoc, addDoc,
} from 'firebase/firestore';
import { db, auth } from '../../src/firebase/firebase';
import { useRouter } from 'expo-router';
import type { Lang } from '../../components/i18n';
import { TopBar, FacultyBadge, StatusBadge, getFacultyColor } from '../../components/shared';
import { calculateFinalGrade, type GradeWeights } from '../../components/Milestoneservice';
import { coordinatorHomeStyles } from '../../constants/styles';

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
  examinerIds: string[];
  examiner1Score: number | null;
  examiner2Score: number | null;
  gradeWeights: GradeWeights | null;
  dueDate: any;
  facultyId: string;
  defenseDate: any;
  defenseRoom: string | null;
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

export default function CoordinatorHome() {
  const router = useRouter();
  const [lang, setLang] = useState<Lang>('he');
  const isRtl = lang === 'he';

  const [coordinatorName, setCoordinatorName] = useState('');
  const [loading, setLoading]     = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [activeTab, setActiveTab] = useState<'pending' | 'defense'>('pending');

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
  const [defenseDate,      setDefenseDate]      = useState('');
  const [defenseRoom,      setDefenseRoom]      = useState('');

  const [saving, setSaving] = useState(false);
  const uid = auth.currentUser?.uid;

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

  // Milestones awaiting coordinator approval (status = supervisor_graded)
  useEffect(() => {
    const q = query(
      collection(db, 'milestones'),
      where('status', '==', 'supervisor_graded')
    );
    return onSnapshot(q, async (snap) => {
      const items: PendingMilestone[] = [];
      for (const d of snap.docs) {
        const data = d.data();
        const projectSnap = await getDoc(doc(db, 'projects', data.projectId));
        const studentNames: string[] = [];
        for (const sid of (data.studentIds ?? [])) {
          const sSnap = await getDoc(doc(db, 'users', sid));
          if (sSnap.exists()) studentNames.push(sSnap.data().displayName);
        }
        items.push({
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
        });
      }
      setPendingApprovals(items);
      setLoading(false);
    });
  }, []);

  // Defense milestones needing setup (status = coordinator_approved + type = defense)
  useEffect(() => {
    const q = query(
      collection(db, 'milestones'),
      where('type', '==', 'defense'),
      where('status', 'in', ['coordinator_approved', 'examiners_assigned'])
    );
    return onSnapshot(q, async (snap) => {
      const items: PendingMilestone[] = [];
      for (const d of snap.docs) {
        const data = d.data();
        const projectSnap = await getDoc(doc(db, 'projects', data.projectId));
        const studentNames: string[] = [];
        for (const sid of (data.studentIds ?? [])) {
          const sSnap = await getDoc(doc(db, 'users', sid));
          if (sSnap.exists()) studentNames.push(sSnap.data().displayName);
        }
        items.push({
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
        });
      }
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
      });
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
    if (!selectedMilestone) return;
    if (!defenseDate.trim()) {
      Alert.alert(lang === 'he' ? 'שגיאה' : 'Error',
        lang === 'he' ? 'יש להזין תאריך הגנה' : 'Please enter a defense date');
      return;
    }
    setSaving(true);
    try {
      await updateDoc(doc(db, 'milestones', selectedMilestone.id), {
        defenseDate: defenseDate.trim(),
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
      setDefenseDate(''); setDefenseRoom('');
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
        onBell={() => router.push('/(tabs)/Notificationsscreen')}
      />

      <View style={styles.tabBar}>
        {([
          { key: 'pending', heLabel: 'ממתין לאישור', enLabel: 'Pending Approval', badge: pendingApprovals.length },
          { key: 'defense', heLabel: 'הגנות',         enLabel: 'Defenses',         badge: defenseSetups.length },
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
                <View key={m.id} style={styles.card}>
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
                  </View>
                </View>
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
                <View key={m.id} style={styles.card}>
                  <Text style={styles.cardTitle}>
                    {lang === 'he' ? m.projectTitleHe : m.projectTitleEn}
                  </Text>
                  <Text style={styles.cardMeta}>👤 {m.studentNames.join(', ')}</Text>
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
                      📅 {lang === 'he' ? 'קבע מועד הגנה' : 'Schedule Defense'}
                    </Text>
                  </Pressable>
                </View>
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
          <Text style={styles.modalTitle}>
            {lang === 'he' ? '👥 הקצאת בוחנים ומשקלות' : '👥 Assign Examiners & Weights'}
          </Text>

          <Text style={styles.fieldLabel}>
            {lang === 'he' ? 'בוחן 1' : 'Examiner 1'}
          </Text>
          {allExaminers.map((ex) => (
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
          {allExaminers.map((ex) => (
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
            value={defenseDate}
            onChangeText={setDefenseDate}
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