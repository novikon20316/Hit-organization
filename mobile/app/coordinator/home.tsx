import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, Pressable,
  SafeAreaView, ActivityIndicator, Modal, TextInput, Alert,
} from 'react-native';
import { auth } from '../../src/firebase/firebase';
import { useRouter } from 'expo-router';
import type { Lang } from '../../components/i18n';
import { TopBar, FacultyBadge } from '../../components/shared';
import {type GradeWeights } from '../../components/Milestoneservice';
import { coordinatorHomeStyles } from '../../constants/styles';
import {STATUS_LABEL, STATUS_COLORS} from '../../constants/labels'
import { apiClient } from '@/src/api/apiClient';


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

interface Project {
  id: string;
  titleHe: string;
  titleEn: string;
  status: string;
  facultyId: string;
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



export default function CoordinatorHome() {
  const router = useRouter();
  const [lang, setLang] = useState<Lang>('he');
  const isRtl = lang === 'he';

  const [coordinatorName, setCoordinatorName] = useState('');
  const [loading, setLoading]     = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [activeTab, setActiveTab] = useState<'pending' | 'defense' | 'inProgress'>('pending');
  const [pendingMilestones, setPendingMilestones] = useState<PendingMilestone[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
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
  const [selectedProjectForDefense, setSelectedProjectForDefense] = useState<Project | null>(null);
  const [defenseModal,     setDefenseModal]     = useState(false);
  const [defenseDate,      setDefenseDate]      = useState<Date | null>(null);
  const [defenseDateText, setDefenseDateText] = useState<string>('');
  const [defenseRoom,      setDefenseRoom]      = useState('');
  const [projectId, setProjectId] = useState<string>('')
  const [saving, setSaving] = useState(false);
  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({});
  const uid = auth.currentUser?.uid;


  const updateProjectProgress = async (projectId: string, milestoneType: string) => {
    try {
      setLoading(true);
      // 🚀 We talk only to our API. The server handles the logic!
      await apiClient.post(`/api/projects/${projectId}/progress`, { 
        milestoneType 
      });
      
      // Refresh the UI to show the new progress
      fetchCoordinatorDashboard(); 
    } catch (err) {
      Alert.alert('Error', 'Could not update progress');
    } finally {
      setLoading(false);
    }
  };


  const toggleCardExpansion = (milestoneId: string) => {
    setExpandedCards((prev) => ({
      ...prev,
      [milestoneId]: !prev[milestoneId],
    }));
  };

  // ── 1. Unified Fetch Loop ───────────────────────────────────────────
  const fetchCoordinatorDashboard = async () => {
    try {
      if (!auth.currentUser) return;
      setLoading(true);

      // 🚀 Replaced all multi-collection snapshots with one optimized backend matrix call
      const [profileRes, dashboardRes] = await Promise.all([
        apiClient.get('/api/users/profile'),
        apiClient.get('/api/coordinator/dashboard') 
      ]);

      setCoordinatorName(profileRes.data?.displayName || 'Coordinator');
      if (profileRes.data?.language) setLang(profileRes.data.language);

      setPendingMilestones(dashboardRes.data.pendingMilestones || []);
      setProjects(dashboardRes.data.projects || []);
      setUnreadCount(dashboardRes.data.unreadCount || 0);
    } catch (err) {
      console.error("Failed fetching coordinator panel matrix:", err);
    } finally {
      setLoading(false);
    }
  };


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
    try {
      setSaving(true);
      // 🚀 Moved scoring computations & structural calculations to the server
      await apiClient.post(`/api/coordinator/milestones/${milestone.id}/approve`);
      
      Alert.alert('✅', lang === 'he' ? 'אבן הדרך אושרה בהצלחה' : 'Milestone approved successfully');
      fetchCoordinatorDashboard();
    } catch (err) {
      Alert.alert('Error', 'Failed to submit approval.');
    } finally {
      setSaving(false);
    }
  };
  //--- Reject milestone (research_proposal or progress_report) ----------------------
  const handleReject = async (milestone: PendingMilestone) => {
    try {
      setSaving(true);
      // 🚀 We send the ID and the reason to the server. 
      // The server handles the update AND the notification creation.
      await apiClient.post(`/api/coordinator/milestones/${milestone.id}/reject`, {
        id: milestone.id,
        projectId: milestone.projectId,
        studentNames: milestone.studentNames,
        supervisorId: milestone.supervisorId, 
      });

      Alert.alert('✅', lang === 'he' ? 'אבן הדרך נדחתה' : 'Milestone rejected');
      fetchCoordinatorDashboard(); // Refresh UI
    } catch (err) {
      console.error("Reject error:", err);
      Alert.alert('Error', 'Failed to reject milestone');
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
    try {
      setSaving(true);
      // 🚀 Clean API call: The server will validate the examiners and update the project
      await apiClient.post(`/api/coordinator/projects/${projectId}/assign-examiners`, {
        examinerIds: [examiner1Id,examiner2Id],
        
      });
      const response = await apiClient.get('/api/config/system/defenseWindowDays')
      const defenseWindowDays = response.data;
      const calculatedDefenseDate = new Date();
      calculatedDefenseDate.setDate(
        calculatedDefenseDate.getDate() + defenseWindowDays
      );
      setDefenseDate(calculatedDefenseDate);
      Alert.alert('✅', lang === 'he' ? 'בוחנים שובצו בהצלחה' : 'Examiners assigned successfully');
      fetchCoordinatorDashboard(); 
    } catch (err) {
      console.error("Assignment error:", err);
      // The server will send a meaningful error if assignment is invalid
      Alert.alert('Error', (err as any).response?.data?.message || 'Failed to assign examiners');
    } finally {
      setSaving(false);
    }
  };

  // ── Set defense date & room ───────────────────────────────────────────────
  const handleSetDefense = async () => {
    if (!selectedMilestone || !defenseDate || !selectedProjectForDefense) return;
    try {
      setSaving(true);
      
      // 🚀 Pass a normal ISO string down to Express. The server handles date parsing logic cleanly.
      await apiClient.post(`/api/coordinator/projects/${selectedProjectForDefense.id}/assign-defense`, {
        defenseDate: new Date(defenseDateText).toISOString(),
        room: defenseRoom.trim() || null
      });

      setDefenseModal(false);
      setDefenseDateText('');
      setDefenseRoom('');
      Alert.alert('✅', lang === 'he' ? 'מועד הגנה נקבע בהצלחה' : 'Defense session updated successfully');
      fetchCoordinatorDashboard();
    } catch (err) {
      console.log("error: ", err)
      Alert.alert('Error', 'Failed to save presentation parameters');
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
                setProjectId(m.projectId)
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