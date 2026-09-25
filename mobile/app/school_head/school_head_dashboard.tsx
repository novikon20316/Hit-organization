// app/school_head/school_head_dashboard.tsx
// Dashboard for the school_head role — same shape/approach as
// app/grad_school_head/grad_school_head_dashboard.tsx, but scoped to one or
// more specific majors (coordinatorScopes) instead of a whole faculty, and
// covering both bachelor's and master's students. Reuses
// GradSchoolHeadDashboardStyles (constants/styles.ts) rather than a whole
// new style sheet — visually identical, just a narrower data scope.
//
// Deliberately narrower than grad_school_head's screen: no staff-management
// tab (school_head isn't in DELEGATE_ADMIN_ROLES), no own-project posting —
// neither was part of the "head of school" feature request; only the
// population it operates on is.

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable,
  ActivityIndicator, Alert, RefreshControl, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { auth } from '../../src/firebase/firebase';
import { apiClient } from '@/src/api/apiClient';
import { TopBar } from '../../components/shared';
import { tx, type Lang } from '../../components/i18n';
import { GradSchoolHeadDashboardStyles } from '../../constants/styles';
import { ap } from '../../constants/theme';
import { ExceptionalActionQueue } from '@/components/ExceptionalActionQueue';
import StudentsListSection from '@/components/StudentsListSection';
import ChatbotFab from '@/components/ChatbotFab';
import { useNotifications } from '@/src/context/NotificationsContext';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PendingApproval {
  id:          string;
  type:        'examiners' | 'final_grade' | 'template';
  studentName: string;
  major:       string;
  title:       string;
  submittedAt: string;
  urgency:     'low' | 'medium' | 'high';
}

interface ProcessSummary {
  major:          string;
  majorNameHe:    string;
  majorNameEn:    string;
  total:          number;
  active:         number;
  stuck:          number;
  completed:      number;
  overdue:        number;
}

interface StuckStudent {
  studentName:      string;
  supervisorName:   string;
  major:            string;
  currentMilestone: string;
  daysInStage:      number;
  trackType:        string;
}

interface ExaminerLoad {
  examinerName:  string;
  institution:   string;
  activeReviews: number;
  pending:       number;
  overdue:       number;
}

interface ApprovedFinalGrade {
  id: string;
  studentName: string;
  major: string;
  title: string;
  finalGrade: number;
  approvedAt: string;
  michlolTransferStatus: string | null;
}

interface DashboardData {
  headName:          string;
  noScopeAssigned?:  boolean;
  assignedMajors:    string[];
  pendingApprovals:  PendingApproval[];
  processSummaries:  ProcessSummary[];
  stuckStudents:     StuckStudent[];
  examinerLoad:      ExaminerLoad[];
  approvedFinalGrades: ApprovedFinalGrade[];
  stats: {
    totalStudents:     number;
    pendingCount:      number;
    stuckCount:        number;
    completedThisYear: number;
  };
}

function approvalTypeLabel(type: PendingApproval['type'], lang: Lang): string {
  const map: Record<PendingApproval['type'], { he: string; en: string }> = {
    examiners:   { he: 'אישור בוחנים',    en: 'Examiner Approval' },
    final_grade: { he: 'אישור ציון סופי', en: 'Final Grade' },
    template:    { he: 'אישור תבנית',     en: 'Template' },
  };
  return map[type]?.[lang] ?? type;
}

const URGENCY_COLOR: Record<PendingApproval['urgency'], string> = {
  high:   '#EF4444',
  medium: '#F59E0B',
  low:    '#10B981',
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function SchoolHeadDashboard() {
  const [lang, setLang]      = useState<Lang>('he');
  const [loading, setLoading]      = useState(true);
  const [refreshing, setRefreshing]= useState(false);
  const [data, setData]            = useState<DashboardData | null>(null);

  type SchoolHeadTab = 'overview' | 'approvals' | 'stuck' | 'examiners' | 'grades' | 'students';
  const SCHOOL_HEAD_TABS: SchoolHeadTab[] = ['overview', 'approvals', 'stuck', 'examiners', 'grades', 'students'];
  const { tab: tabParam } = useLocalSearchParams<{ tab?: string }>();
  const [activeTab, setActiveTab]  = useState<SchoolHeadTab>(
    SCHOOL_HEAD_TABS.includes(tabParam as SchoolHeadTab) ? (tabParam as SchoolHeadTab) : 'overview'
  );

  const { unreadByTargetScreen, markTabSeen } = useNotifications();
  useEffect(() => {
    if (activeTab === 'approvals' && (unreadByTargetScreen['school_head_approvals'] ?? 0) > 0) {
      markTabSeen(['school_head_approvals']);
    }
  }, [activeTab, unreadByTargetScreen, markTabSeen]);

  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [unlockTargetId, setUnlockTargetId] = useState<string | null>(null);
  const [unlockReason, setUnlockReason] = useState('');
  const [unlockingId, setUnlockingId] = useState<string | null>(null);
  const [examinerRejectTargetId, setExaminerRejectTargetId] = useState<string | null>(null);
  const [examinerRejectReason, setExaminerRejectReason] = useState('');
  const [finalGradeRejectTargetId, setFinalGradeRejectTargetId] = useState<string | null>(null);
  const [finalGradeRejectReason, setFinalGradeRejectReason] = useState('');

  const uid = auth.currentUser?.uid;

  const fetchData = useCallback(async () => {
    try {
      const res = await apiClient.get(`/api/school-head/${uid}/dashboard`);
      setData(res.data);
    } catch (e: any) {
      Alert.alert(
        lang === 'he' ? 'שגיאה' : 'Error',
        lang === 'he' ? 'לא ניתן לטעון נתונים' : 'Could not load data',
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [uid, lang]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const onRefresh = () => { setRefreshing(true); fetchData(); };

  const handleApproveFinalGrade = async (item: PendingApproval) => {
    setApprovingId(item.id);
    try {
      await apiClient.post(`/api/school-head/milestones/${item.id}/approve-grade`);
      await fetchData();
    } catch (e: any) {
      Alert.alert(lang === 'he' ? 'שגיאה' : 'Error', e.response?.data?.message || (lang === 'he' ? 'אישור הציון נכשל' : 'Failed to approve the grade'));
    } finally {
      setApprovingId(null);
    }
  };

  const handleRejectFinalGrade = async (item: PendingApproval) => {
    if (!finalGradeRejectReason.trim()) return;
    setApprovingId(item.id);
    try {
      await apiClient.post(`/api/school-head/milestones/${item.id}/reject-grade`, { reason: finalGradeRejectReason.trim() });
      setFinalGradeRejectTargetId(null);
      setFinalGradeRejectReason('');
      await fetchData();
    } catch (e: any) {
      Alert.alert(lang === 'he' ? 'שגיאה' : 'Error', e.response?.data?.message || (lang === 'he' ? 'דחיית הציון נכשלה' : 'Failed to reject the grade'));
    } finally {
      setApprovingId(null);
    }
  };

  const handleApproveExaminers = async (item: PendingApproval) => {
    setApprovingId(item.id);
    try {
      await apiClient.post(`/api/school-head/examiner-recommendations/${item.id}/approve`);
      await fetchData();
    } catch (e: any) {
      Alert.alert(lang === 'he' ? 'שגיאה' : 'Error', e.response?.data?.message || (lang === 'he' ? 'אישור רשימת הבוחנים נכשל' : 'Failed to approve the examiner list'));
    } finally {
      setApprovingId(null);
    }
  };

  const handleRejectExaminers = async (item: PendingApproval) => {
    if (!examinerRejectReason.trim()) return;
    setApprovingId(item.id);
    try {
      await apiClient.post(`/api/school-head/examiner-recommendations/${item.id}/reject`, { reason: examinerRejectReason.trim() });
      setExaminerRejectTargetId(null);
      setExaminerRejectReason('');
      await fetchData();
    } catch (e: any) {
      Alert.alert(lang === 'he' ? 'שגיאה' : 'Error', e.response?.data?.message || (lang === 'he' ? 'דחיית רשימת הבוחנים נכשלה' : 'Failed to reject the examiner list'));
    } finally {
      setApprovingId(null);
    }
  };

  const handleUnlockGrade = async (milestoneId: string) => {
    if (!unlockReason.trim()) return;
    setUnlockingId(milestoneId);
    try {
      await apiClient.post(`/api/school-head/milestones/${milestoneId}/unlock-grade`, { reason: unlockReason.trim() });
      setUnlockTargetId(null);
      setUnlockReason('');
      await fetchData();
    } catch (e: any) {
      Alert.alert(lang === 'he' ? 'שגיאה' : 'Error', e.response?.data?.message || (lang === 'he' ? 'פתיחת הציון נכשלה' : 'Failed to unlock the grade'));
    } finally {
      setUnlockingId(null);
    }
  };

  if (loading) {
    return (
      <View style={s.centered}>
        <ActivityIndicator size="large" color="#7C3AED" />
      </View>
    );
  }

  const tabs = [
    { key: 'overview'  as const, he: 'סקירה כללית',    en: 'Overview',        badge: 0 },
    { key: 'approvals' as const, he: 'ממתין לאישורי',  en: 'Pending',         badge: data?.pendingApprovals.length ?? 0 },
    { key: 'stuck'     as const, he: 'תקועים',         en: 'Stuck',           badge: data?.stuckStudents.length ?? 0 },
    { key: 'examiners' as const, he: 'עומס בוחנים',    en: 'Examiners',       badge: 0 },
    { key: 'grades'    as const, he: 'ציונים מאושרים', en: 'Approved Grades', badge: 0 },
    { key: 'students'  as const, he: 'רשימת סטודנטים', en: 'Students List',   badge: 0 },
  ];

  return (
    <SafeAreaView style={s.root}>
      <TopBar
        name={data?.headName ?? ''}
        role="school_head"
        lang={lang}
        isRtl={lang === 'he'}
        onToggleLang={() => setLang(l => l === 'he' ? 'en' : 'he')}
      />

      {data?.noScopeAssigned && (
        <View style={{ marginHorizontal: 16, marginTop: 12, padding: 12, borderRadius: 8, backgroundColor: '#FEF2F2' }}>
          <Text style={{ color: '#B91C1C', fontSize: 13 }}>
            {lang === 'he'
              ? 'לחשבון זה טרם הוקצתה מגמה. פנה/י למנהל המערכת כדי להקצות מגמה (או יותר) לניהול.'
              : 'No major is assigned to this account yet. Contact system_admin to assign one or more majors.'}
          </Text>
        </View>
      )}

      {/* Stats strip */}
      <View style={s.statsStrip}>
        {[
          { label: lang === 'he' ? 'סה"כ פרויקטים' : 'Total Projects', value: data?.stats.totalStudents ?? 0, color: '#7C3AED' },
          { label: tx('gradSchoolPendingApprovals', lang), value: data?.stats.pendingCount ?? 0, color: '#F59E0B' },
          { label: tx('gradSchoolStuckStudents', lang),    value: data?.stats.stuckCount ?? 0,   color: '#EF4444' },
          { label: lang === 'he' ? 'סיימו השנה' : 'Completed',  value: data?.stats.completedThisYear ?? 0, color: '#10B981' },
        ].map(st => (
          <View key={st.label} style={s.statCard}>
            <Text style={[s.statValue, { color: st.color }]}>{st.value}</Text>
            <Text style={s.statLabel} numberOfLines={2}>{st.label}</Text>
          </View>
        ))}
      </View>

      {/* Tab bar */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tabBar}>
        {tabs.map(tab => (
          <Pressable
            key={tab.key}
            style={[s.tab, activeTab === tab.key && s.tabActive]}
            onPress={() => setActiveTab(tab.key)}
            accessibilityRole="button"
          >
            <Text style={[s.tabText, activeTab === tab.key && s.tabTextActive]} numberOfLines={1}>
              {lang === 'he' ? tab.he : tab.en}
            </Text>
            {tab.badge > 0 && (
              <View style={s.badge}><Text style={s.badgeText}>{tab.badge}</Text></View>
            )}
          </Pressable>
        ))}
      </ScrollView>

      <ScrollView
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* ── PENDING APPROVALS ── */}
        {activeTab === 'approvals' && (
          <>
            <ExceptionalActionQueue lang={lang} />
            {(data?.pendingApprovals.length ?? 0) === 0 ? (
              <EmptyState emoji="✅" text={lang === 'he' ? 'אין פריטים הממתינים לאישורך' : 'Nothing pending your approval'} />
            ) : (
              data!.pendingApprovals.map(item => (
                <View key={item.id} style={[s.card, { borderLeftColor: URGENCY_COLOR[item.urgency] }]}>
                  <View style={s.row}>
                    <View style={[s.typePill, { backgroundColor: URGENCY_COLOR[item.urgency] + '22' }]}>
                      <Text style={[s.typePillText, { color: URGENCY_COLOR[item.urgency] }]}>
                        {approvalTypeLabel(item.type, lang)}
                      </Text>
                    </View>
                    <Text style={s.cardDate}>{item.submittedAt}</Text>
                  </View>
                  <Text style={s.cardTitle}>{item.studentName}</Text>
                  <Text style={s.cardSub}>{item.title}</Text>
                  {item.type === 'final_grade' ? (
                    finalGradeRejectTargetId === item.id ? (
                      <View style={{ marginTop: 10 }}>
                        <TextInput
                          value={finalGradeRejectReason}
                          onChangeText={setFinalGradeRejectReason}
                          placeholder={lang === 'he' ? 'סיבת הדחייה (חובה)' : 'Rejection reason (required)'}
                          multiline
                          style={{ borderWidth: 1, borderColor: ap.outlineVariant, borderRadius: 8, padding: 8, minHeight: 50, fontSize: 13, textAlignVertical: 'top' }}
                        />
                        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                          <Pressable
                            style={[s.btnReturn, { flex: 1, backgroundColor: finalGradeRejectReason.trim() ? '#EF4444' : '#FCA5A5' }]}
                            onPress={() => handleRejectFinalGrade(item)}
                            disabled={!finalGradeRejectReason.trim() || approvingId === item.id}
                            accessibilityRole="button"
                          >
                            <Text style={[s.btnReturnText, { color: '#fff' }]}>{lang === 'he' ? 'שלח דחייה' : 'Submit rejection'}</Text>
                          </Pressable>
                          <Pressable
                            style={[s.btnReturn, { flex: 1 }]}
                            onPress={() => { setFinalGradeRejectTargetId(null); setFinalGradeRejectReason(''); }}
                            accessibilityRole="button"
                          >
                            <Text style={s.btnReturnText}>{lang === 'he' ? 'ביטול' : 'Cancel'}</Text>
                          </Pressable>
                        </View>
                      </View>
                    ) : (
                      <View style={s.actionRow}>
                        <Pressable style={s.btnReturn} onPress={() => setFinalGradeRejectTargetId(item.id)} disabled={approvingId === item.id} accessibilityRole="button">
                          <Text style={s.btnReturnText}>{lang === 'he' ? 'דחה' : 'Reject'}</Text>
                        </Pressable>
                        <Pressable style={[s.btnApprove, approvingId === item.id && { opacity: 0.6 }]} onPress={() => handleApproveFinalGrade(item)} disabled={approvingId === item.id} accessibilityRole="button">
                          <Text style={s.btnApproveText}>
                            {approvingId === item.id ? (lang === 'he' ? 'מאשר...' : 'Approving...') : `✅ ${tx('gradeApproved', lang)}`}
                          </Text>
                        </Pressable>
                      </View>
                    )
                  ) : item.type === 'examiners' ? (
                    examinerRejectTargetId === item.id ? (
                      <View style={{ marginTop: 10 }}>
                        <TextInput
                          value={examinerRejectReason}
                          onChangeText={setExaminerRejectReason}
                          placeholder={lang === 'he' ? 'סיבת הדחייה (חובה)' : 'Rejection reason (required)'}
                          multiline
                          style={{ borderWidth: 1, borderColor: ap.outlineVariant, borderRadius: 8, padding: 8, minHeight: 50, fontSize: 13, textAlignVertical: 'top' }}
                        />
                        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                          <Pressable
                            style={[s.btnReturn, { flex: 1, backgroundColor: examinerRejectReason.trim() ? '#EF4444' : '#FCA5A5' }]}
                            onPress={() => handleRejectExaminers(item)}
                            disabled={!examinerRejectReason.trim() || approvingId === item.id}
                            accessibilityRole="button"
                          >
                            <Text style={[s.btnReturnText, { color: '#fff' }]}>{lang === 'he' ? 'שלח דחייה' : 'Submit rejection'}</Text>
                          </Pressable>
                          <Pressable
                            style={[s.btnReturn, { flex: 1 }]}
                            onPress={() => { setExaminerRejectTargetId(null); setExaminerRejectReason(''); }}
                            accessibilityRole="button"
                          >
                            <Text style={s.btnReturnText}>{lang === 'he' ? 'ביטול' : 'Cancel'}</Text>
                          </Pressable>
                        </View>
                      </View>
                    ) : (
                      <View style={s.actionRow}>
                        <Pressable style={s.btnReturn} onPress={() => setExaminerRejectTargetId(item.id)} disabled={approvingId === item.id} accessibilityRole="button">
                          <Text style={s.btnReturnText}>{lang === 'he' ? 'דחה' : 'Reject'}</Text>
                        </Pressable>
                        <Pressable style={[s.btnApprove, approvingId === item.id && { opacity: 0.6 }]} onPress={() => handleApproveExaminers(item)} disabled={approvingId === item.id} accessibilityRole="button">
                          <Text style={s.btnApproveText}>
                            {approvingId === item.id ? (lang === 'he' ? 'מאשר...' : 'Approving...') : `✅ ${lang === 'he' ? 'אשר' : 'Approve'}`}
                          </Text>
                        </Pressable>
                      </View>
                    )
                  ) : (
                    <Text style={s.cardSub}>
                      {lang === 'he' ? 'לצפייה ואישור, יש לפתוח את פאנל הניהול' : 'View and act on this from the admin panel'}
                    </Text>
                  )}
                </View>
              ))
            )}
          </>
        )}

        {/* ── OVERVIEW (per-major) ── */}
        {activeTab === 'overview' && (
          <>
            {(data?.processSummaries.length ?? 0) === 0 ? (
              <EmptyState emoji="📊" text={lang === 'he' ? 'אין נתונים' : 'No data'} />
            ) : (
              data!.processSummaries.map(m => (
                <View key={m.major} style={[s.card, { borderLeftColor: '#7C3AED' }]}>
                  <Text style={s.cardTitle}>{lang === 'he' ? m.majorNameHe : m.majorNameEn}</Text>
                  <View style={s.statsRow}>
                    {[
                      { label: lang === 'he' ? 'סה"כ' : 'Total',    value: m.total,     color: ap.onSurface },
                      { label: lang === 'he' ? 'פעילים' : 'Active', value: m.active,    color: '#2E86FF' },
                      { label: lang === 'he' ? 'תקועים' : 'Stuck',  value: m.stuck,     color: '#EF4444' },
                      { label: lang === 'he' ? 'סיימו' : 'Done',    value: m.completed, color: '#10B981' },
                      { label: lang === 'he' ? 'באיחור' : 'Overdue', value: m.overdue,  color: '#F59E0B' },
                    ].map(st => (
                      <View key={st.label} style={s.miniStat}>
                        <Text style={[s.miniStatValue, { color: st.color }]}>{st.value}</Text>
                        <Text style={s.miniStatLabel}>{st.label}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              ))
            )}
          </>
        )}

        {/* ── STUCK STUDENTS ── */}
        {activeTab === 'stuck' && (
          <>
            {(data?.stuckStudents.length ?? 0) === 0 ? (
              <EmptyState emoji="🎉" text={lang === 'he' ? 'אין סטודנטים תקועים' : 'No stuck students'} />
            ) : (
              data!.stuckStudents.map((st, i) => (
                <View key={i} style={[s.card, { borderLeftColor: '#EF4444' }]}>
                  <Text style={s.cardTitle}>👤 {st.studentName}</Text>
                  <Text style={s.cardSub}>👨‍🏫 {st.supervisorName}</Text>
                  <Text style={s.cardSub}>📍 {lang === 'he' ? 'שלב נוכחי:' : 'Current stage:'} {st.currentMilestone}</Text>
                  <View style={s.stuckBadge}>
                    <Text style={s.stuckBadgeText}>⏱ {st.daysInStage} {lang === 'he' ? 'ימים בשלב' : 'days in stage'}</Text>
                  </View>
                </View>
              ))
            )}
          </>
        )}

        {/* ── EXAMINER LOAD ── */}
        {activeTab === 'examiners' && (
          <>
            <ExceptionalActionQueue lang={lang} />
            {(data?.examinerLoad.length ?? 0) === 0 ? (
              <EmptyState emoji="📭" text={lang === 'he' ? 'אין בוחנים פעילים' : 'No active examiners'} />
            ) : (
              data!.examinerLoad.map((ex, i) => (
                <View key={i} style={[s.card, { borderLeftColor: ex.overdue > 0 ? '#EF4444' : '#10B981' }]}>
                  <Text style={s.cardTitle}>{ex.examinerName}</Text>
                  <Text style={s.cardSub}>{ex.institution}</Text>
                  <View style={s.statsRow}>
                    {[
                      { label: lang === 'he' ? 'פעילים' : 'Active',  value: ex.activeReviews, color: '#2E86FF' },
                      { label: lang === 'he' ? 'ממתינים' : 'Pending', value: ex.pending,       color: '#F59E0B' },
                      { label: lang === 'he' ? 'באיחור' : 'Overdue',  value: ex.overdue,       color: '#EF4444' },
                    ].map(st => (
                      <View key={st.label} style={s.miniStat}>
                        <Text style={[s.miniStatValue, { color: st.color }]}>{st.value}</Text>
                        <Text style={s.miniStatLabel}>{st.label}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              ))
            )}
          </>
        )}

        {/* ── APPROVED FINAL GRADES (unlock for correction) ── */}
        {activeTab === 'grades' && (
          <>
            {(data?.approvedFinalGrades.length ?? 0) === 0 ? (
              <EmptyState emoji="📭" text={lang === 'he' ? 'אין ציונים מאושרים' : 'No approved grades'} />
            ) : (
              data!.approvedFinalGrades.map(g => (
                <View key={g.id} style={[s.card, { borderLeftColor: '#10B981' }]}>
                  <Text style={s.cardTitle}>{g.studentName}</Text>
                  <Text style={s.cardSub}>{g.title}</Text>
                  <Text style={s.cardSub}>
                    {lang === 'he' ? 'ציון סופי:' : 'Final grade:'} {g.finalGrade}
                    {g.michlolTransferStatus === 'transferred' ? (lang === 'he' ? ' · הועבר למכלול ✅' : ' · Transferred to Michlol ✅') : ''}
                  </Text>

                  {unlockTargetId === g.id ? (
                    <View style={{ marginTop: 10 }}>
                      <TextInput
                        value={unlockReason}
                        onChangeText={setUnlockReason}
                        placeholder={lang === 'he' ? 'סיבת פתיחת הציון לתיקון (חובה)' : 'Reason for unlocking (required)'}
                        multiline
                        style={{ borderWidth: 1, borderColor: ap.outlineVariant, borderRadius: 8, padding: 8, minHeight: 60, fontSize: 13, textAlignVertical: 'top' }}
                      />
                      <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                        <Pressable
                          style={[s.btnReturn, { flex: 1, backgroundColor: unlockReason.trim() ? '#EF4444' : '#FCA5A5' }]}
                          onPress={() => handleUnlockGrade(g.id)}
                          disabled={!unlockReason.trim() || unlockingId === g.id}
                          accessibilityRole="button"
                        >
                          <Text style={[s.btnReturnText, { color: '#fff' }]}>
                            {unlockingId === g.id ? (lang === 'he' ? 'פותח...' : 'Unlocking...') : (lang === 'he' ? 'אשר פתיחה' : 'Confirm Unlock')}
                          </Text>
                        </Pressable>
                        <Pressable style={[s.btnReturn, { flex: 1 }]} onPress={() => { setUnlockTargetId(null); setUnlockReason(''); }} accessibilityRole="button">
                          <Text style={s.btnReturnText}>{lang === 'he' ? 'ביטול' : 'Cancel'}</Text>
                        </Pressable>
                      </View>
                    </View>
                  ) : (
                    <Pressable style={[s.btnReturn, { marginTop: 10 }]} onPress={() => setUnlockTargetId(g.id)} accessibilityRole="button">
                      <Text style={s.btnReturnText}>🔓 {lang === 'he' ? 'פתח לתיקון' : 'Unlock for Correction'}</Text>
                    </Pressable>
                  )}
                </View>
              ))
            )}
          </>
        )}

        {/* ── STUDENTS LIST TAB ── */}
        {activeTab === 'students' && (
          <StudentsListSection lang={lang} isRtl={lang === 'he'} canManageStudents={false} />
        )}

        <View style={{ height: 60 }} />
      </ScrollView>

      <ChatbotFab lang={lang} corner="bottom-left" />
    </SafeAreaView>
  );
}

function EmptyState({ emoji, text }: { emoji: string; text: string }) {
  return (
    <View style={s.empty}>
      <Text style={s.emptyEmoji}>{emoji}</Text>
      <Text style={s.emptyText}>{text}</Text>
    </View>
  );
}

const s = GradSchoolHeadDashboardStyles;
