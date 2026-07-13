// app/grad_school_head/dashboard.tsx
// Dashboard for ראש בית הספר ללימודי מוסמכים (Graduate School Head).
// Shows: pending approvals, master's process overview, stuck students, examiner load.

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable,
  ActivityIndicator, Alert, RefreshControl, StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { auth } from '../../src/firebase/firebase';
import { apiClient } from '@/src/api/apiClient';
import { TopBar } from '../../components/shared';
import { t, tx, type Lang } from '../../components/i18n';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PendingApproval {
  id:          string;
  type:        'supervisor' | 'proposal' | 'thesis' | 'examiners' | 'final_grade' | 'template';
  studentName: string;
  facultyId:   string;
  title:       string;
  submittedAt: string;
  urgency:     'low' | 'medium' | 'high';
}

interface ProcessSummary {
  facultyId:      string;
  facultyNameHe:  string;
  facultyNameEn:  string;
  total:          number;
  active:         number;
  stuck:          number;
  completed:      number;
  overdue:        number;
}

interface StuckStudent {
  studentName:      string;
  supervisorName:   string;
  facultyId:        string;
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

interface DashboardData {
  headName:          string;
  pendingApprovals:  PendingApproval[];
  processSummaries:  ProcessSummary[];
  stuckStudents:     StuckStudent[];
  examinerLoad:      ExaminerLoad[];
  stats: {
    totalMasters:      number;
    pendingCount:      number;
    stuckCount:        number;
    completedThisYear: number;
  };
}

// ─── Approval type label ──────────────────────────────────────────────────────
function approvalTypeLabel(type: PendingApproval['type'], lang: Lang): string {
  const map: Record<PendingApproval['type'], { he: string; en: string }> = {
    supervisor:  { he: 'אישור מנחה',           en: 'Supervisor Approval' },
    proposal:    { he: 'אישור הצעת מחקר',       en: 'Research Proposal' },
    thesis:      { he: 'אישור תזה לשיפוט',      en: 'Thesis for Judgment' },
    examiners:   { he: 'אישור בוחנים',          en: 'Examiner Approval' },
    final_grade: { he: 'אישור ציון סופי',       en: 'Final Grade' },
    template:    { he: 'אישור תבנית פקולטית',   en: 'Faculty Template' },
  };
  return map[type][lang];
}

const URGENCY_COLOR: Record<PendingApproval['urgency'], string> = {
  high:   '#EF4444',
  medium: '#F59E0B',
  low:    '#10B981',
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function GradSchoolHeadDashboard() {
  const router               = useRouter();
  const [lang, setLang]      = useState<Lang>('he');
  const [loading, setLoading]      = useState(true);
  const [refreshing, setRefreshing]= useState(false);
  const [data, setData]            = useState<DashboardData | null>(null);
  const [activeTab, setActiveTab]  = useState<
    'approvals' | 'overview' | 'stuck' | 'examiners'
  >('approvals');
  const [approvingId, setApprovingId] = useState<string | null>(null);

  const uid = auth.currentUser?.uid;

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    try {
      const res = await apiClient.get(`/api/grad-school-head/${uid}/dashboard`);
      setData(res.data);
    } catch (e: any) {
      console.error('grad_school_head dashboard error:', e);
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

  // Final-grade approvals go straight to a real endpoint — see
  // server/src/controllers/gradSchoolHeadController.ts's approveFinalGrade.
  // (Other approval types below still route to /admin/panel — unchanged,
  // out of scope for this addition.)
  const handleApproveFinalGrade = async (item: PendingApproval) => {
    setApprovingId(item.id);
    try {
      await apiClient.post(`/api/grad-school-head/milestones/${item.id}/approve-grade`);
      await fetchData();
    } catch (e: any) {
      Alert.alert(
        lang === 'he' ? 'שגיאה' : 'Error',
        e.response?.data?.message || (lang === 'he' ? 'אישור הציון נכשל' : 'Failed to approve the grade'),
      );
    } finally {
      setApprovingId(null);
    }
  };

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={s.centered}>
        <ActivityIndicator size="large" color="#7C3AED" />
      </View>
    );
  }

  const tabs = [
    { key: 'approvals' as const, he: 'ממתין לאישורי',   en: 'Pending',   badge: data?.pendingApprovals.length ?? 0 },
    { key: 'overview'  as const, he: 'סקירה כללית',     en: 'Overview',  badge: 0 },
    { key: 'stuck'     as const, he: 'תקועים',          en: 'Stuck',     badge: data?.stuckStudents.length ?? 0 },
    { key: 'examiners' as const, he: 'עומס בוחנים',     en: 'Examiners', badge: 0 },
  ];

  return (
    <SafeAreaView style={s.root}>
      <TopBar
        name={data?.headName ?? ''}
        role="grad_school_head"
        lang={lang}
        isRtl={lang === 'he'}
        onToggleLang={() => setLang(l => l === 'he' ? 'en' : 'he')}
      />

      <Pressable
        style={{ marginHorizontal: 16, marginTop: 4, marginBottom: 8, backgroundColor: '#EDE9FE', borderRadius: 10, paddingVertical: 10, alignItems: 'center' }}
        onPress={() => router.push('/WorkflowTemplateManager' as any)}
      >
        <Text style={{ color: '#7C3AED', fontWeight: '700', fontSize: 13 }}>
          🧬 {lang === 'he' ? 'ניהול תבניות אבני דרך' : 'Manage Milestone Templates'}
        </Text>
      </Pressable>

      <Pressable
        style={{ marginHorizontal: 16, marginBottom: 8, backgroundColor: '#DBEAFE', borderRadius: 10, paddingVertical: 10, alignItems: 'center' }}
        onPress={() => router.push('/Reports' as any)}
      >
        <Text style={{ color: '#2E86FF', fontWeight: '700', fontSize: 13 }}>
          📊 {lang === 'he' ? 'דוחות' : 'Reports'}
        </Text>
      </Pressable>

      {/* Stats strip */}
      <View style={s.statsStrip}>
        {[
          { label: tx('gradSchoolMastersOverview', lang), value: data?.stats.totalMasters ?? 0, color: '#7C3AED' },
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
      <View style={s.tabBar}>
        {tabs.map(tab => (
          <Pressable
            key={tab.key}
            style={[s.tab, activeTab === tab.key && s.tabActive]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Text style={[s.tabText, activeTab === tab.key && s.tabTextActive]}>
              {lang === 'he' ? tab.he : tab.en}
            </Text>
            {tab.badge > 0 && (
              <View style={s.badge}><Text style={s.badgeText}>{tab.badge}</Text></View>
            )}
          </Pressable>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >

        {/* ── PENDING APPROVALS ── */}
        {activeTab === 'approvals' && (
          <>
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
                    <View style={s.actionRow}>
                      <Pressable
                        style={[s.btnApprove, approvingId === item.id && { opacity: 0.6 }]}
                        onPress={() => handleApproveFinalGrade(item)}
                        disabled={approvingId === item.id}
                      >
                        <Text style={s.btnApproveText}>
                          {approvingId === item.id
                            ? (lang === 'he' ? 'מאשר...' : 'Approving...')
                            : `✅ ${tx('gradeApproved', lang)}`}
                        </Text>
                      </Pressable>
                    </View>
                  ) : (
                    <View style={s.actionRow}>
                      <Pressable style={s.btnApprove} onPress={() =>
                        router.push({ pathname: '/admin/panel', params: { approvalId: item.id } } as any)
                      }>
                        <Text style={s.btnApproveText}>✅ {tx('approve', lang)}</Text>
                      </Pressable>
                      <Pressable style={s.btnReturn} onPress={() =>
                        router.push({ pathname: '/admin/panel', params: { approvalId: item.id, action: 'return' } } as any)
                      }>
                        <Text style={s.btnReturnText}>↩ {tx('returnForRevision', lang)}</Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              ))
            )}
          </>
        )}

        {/* ── FACULTY OVERVIEW ── */}
        {activeTab === 'overview' && (
          <>
            {(data?.processSummaries.length ?? 0) === 0 ? (
              <EmptyState emoji="📊" text={lang === 'he' ? 'אין נתוני פקולטות' : 'No faculty data'} />
            ) : (
              data!.processSummaries.map(f => (
                <View key={f.facultyId} style={[s.card, { borderLeftColor: '#7C3AED' }]}>
                  <Text style={s.cardTitle}>{lang === 'he' ? f.facultyNameHe : f.facultyNameEn}</Text>
                  <View style={s.statsRow}>
                    {[
                      { label: lang === 'he' ? 'סה"כ' : 'Total',     value: f.total,     color: '#1E293B' },
                      { label: lang === 'he' ? 'פעילים' : 'Active',   value: f.active,    color: '#2E86FF' },
                      { label: lang === 'he' ? 'תקועים' : 'Stuck',    value: f.stuck,     color: '#EF4444' },
                      { label: lang === 'he' ? 'סיימו' : 'Done',      value: f.completed, color: '#10B981' },
                      { label: lang === 'he' ? 'באיחור' : 'Overdue',  value: f.overdue,   color: '#F59E0B' },
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
                  <Text style={s.cardSub}>
                    📍 {lang === 'he' ? 'שלב נוכחי:' : 'Current stage:'} {st.currentMilestone}
                  </Text>
                  <View style={s.stuckBadge}>
                    <Text style={s.stuckBadgeText}>
                      ⏱ {st.daysInStage} {lang === 'he' ? 'ימים בשלב' : 'days in stage'}
                    </Text>
                  </View>
                </View>
              ))
            )}
          </>
        )}

        {/* ── EXAMINER LOAD ── */}
        {activeTab === 'examiners' && (
          <>
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

        <View style={{ height: 60 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function EmptyState({ emoji, text }: { emoji: string; text: string }) {
  return (
    <View style={s.empty}>
      <Text style={s.emptyEmoji}>{emoji}</Text>
      <Text style={s.emptyText}>{text}</Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const ACCENT = '#7C3AED';

const s = StyleSheet.create({
  root:      { flex: 1, backgroundColor: '#F5F3FF' },
  centered:  { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll:    { padding: 16 },

  statsStrip:  { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 10,
                 backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  statCard:    { flex: 1, alignItems: 'center', paddingHorizontal: 4 },
  statValue:   { fontSize: 22, fontWeight: '800' },
  statLabel:   { fontSize: 10, color: '#64748B', textAlign: 'center', marginTop: 2 },

  tabBar:      { flexDirection: 'row', backgroundColor: '#fff',
                 borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  tab:         { flex: 1, paddingVertical: 12, alignItems: 'center', flexDirection: 'row',
                 justifyContent: 'center', gap: 4 },
  tabActive:   { borderBottomWidth: 2, borderBottomColor: ACCENT },
  tabText:     { fontSize: 12, color: '#64748B' },
  tabTextActive:{ fontSize: 12, color: ACCENT, fontWeight: '700' },
  badge:       { backgroundColor: '#EF4444', borderRadius: 10, paddingHorizontal: 5,
                 paddingVertical: 1 },
  badgeText:   { color: '#fff', fontSize: 10, fontWeight: '700' },

  card:        { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 12,
                 borderLeftWidth: 4, shadowColor: '#000', shadowOpacity: 0.05,
                 shadowRadius: 6, elevation: 2 },
  cardTitle:   { fontSize: 15, fontWeight: '700', color: '#1E293B', marginBottom: 4 },
  cardSub:     { fontSize: 13, color: '#64748B', marginBottom: 2 },
  cardDate:    { fontSize: 12, color: '#94A3B8' },
  row:         { flexDirection: 'row', justifyContent: 'space-between',
                 alignItems: 'center', marginBottom: 6 },
  typePill:    { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  typePillText:{ fontSize: 12, fontWeight: '600' },

  actionRow:   { flexDirection: 'row', gap: 8, marginTop: 10 },
  btnApprove:  { flex: 1, backgroundColor: '#D1FAE5', borderRadius: 8,
                 padding: 10, alignItems: 'center' },
  btnApproveText:{ color: '#065F46', fontWeight: '700', fontSize: 13 },
  btnReturn:   { flex: 1, backgroundColor: '#FEF3C7', borderRadius: 8,
                 padding: 10, alignItems: 'center' },
  btnReturnText:{ color: '#92400E', fontWeight: '700', fontSize: 13 },

  statsRow:    { flexDirection: 'row', justifyContent: 'space-around', marginTop: 10 },
  miniStat:    { alignItems: 'center' },
  miniStatValue:{ fontSize: 18, fontWeight: '800' },
  miniStatLabel:{ fontSize: 10, color: '#64748B', marginTop: 2 },

  stuckBadge:     { backgroundColor: '#FEE2E2', borderRadius: 8, paddingHorizontal: 10,
                    paddingVertical: 4, alignSelf: 'flex-start', marginTop: 8 },
  stuckBadgeText: { color: '#991B1B', fontWeight: '600', fontSize: 12 },

  empty:     { alignItems: 'center', paddingVertical: 48 },
  emptyEmoji:{ fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 15, color: '#64748B', textAlign: 'center' },
});