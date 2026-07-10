// app/program_head/dashboard.tsx
// Dashboard for ראש תוכנית תואר שני (Master's Program Head).
// Scope: one faculty / program. Shows students in their program,
// pending faculty-level approvals, template management, supervisor load.

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable,
  ActivityIndicator, Alert, RefreshControl,
  TextInput, Modal, StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { auth } from '../../src/firebase/firebase';
import { apiClient } from '@/src/api/apiClient';
import { TopBar, getFacultyColor } from '../../components/shared';
import { t, tx, type Lang } from '../../components/i18n';

// ─── Types ────────────────────────────────────────────────────────────────────

interface StudentRow {
  uid:              string;
  studentName:      string;
  trackType:        'thesis' | 'masters_project';
  supervisorName:   string;
  currentMilestone: string;
  primaryStatus:    string;
  subStatus:        string;
  daysInStage:      number;
  deadline:         string | null;
  isOverdue:        boolean;
  facultyId:        string;
}

interface PendingApproval {
  id:          string;
  type:        string;
  studentName: string;
  description: string;
  submittedAt: string;
}

interface SupervisorLoad {
  supervisorName:  string;
  supervisorEmail: string;
  activeStudents:  number;
}

interface DashboardData {
  headName:         string;
  facultyId:        string;
  students:         StudentRow[];
  pendingApprovals: PendingApproval[];
  supervisorLoads:  SupervisorLoad[];
  stats: {
    totalStudents:  number;
    activeStudents: number;
    overdueCount:   number;
    pendingCount:   number;
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ProgramHeadDashboard() {
  const router              = useRouter();
  const [lang, setLang]     = useState<Lang>('he');
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData]             = useState<DashboardData | null>(null);
  const [activeTab, setActiveTab]   = useState<'students' | 'approvals' | 'supervisors'>('students');

  // Filters
  const [searchText, setSearchText]         = useState('');
  const [filterOverdue, setFilterOverdue]   = useState(false);
  const [filterTrack, setFilterTrack]       = useState<'all' | 'thesis' | 'masters_project'>('all');

  const uid = auth.currentUser?.uid;

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    try {
      const res = await apiClient.get(`/api/program-head/${uid}/dashboard`);
      setData(res.data);
    } catch (e: any) {
      console.error('program_head dashboard error:', e);
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

  // ── Filter students ────────────────────────────────────────────────────────
  const filteredStudents = (data?.students ?? []).filter(s => {
    const q = searchText.toLowerCase();
    const matchesSearch =
      !q ||
      s.studentName.toLowerCase().includes(q) ||
      s.supervisorName.toLowerCase().includes(q) ||
      s.currentMilestone.toLowerCase().includes(q);
    const matchesOverdue = !filterOverdue || s.isOverdue;
    const matchesTrack   = filterTrack === 'all' || s.trackType === filterTrack;
    return matchesSearch && matchesOverdue && matchesTrack;
  });

  if (loading) {
    return (
      <View style={s.centered}>
        <ActivityIndicator size="large" color="#0EA5E9" />
      </View>
    );
  }

  const fc = getFacultyColor(data?.facultyId ?? 'default');

  const tabs = [
    { key: 'students'   as const, he: 'סטודנטים',      en: 'Students',    badge: data?.stats.totalStudents ?? 0 },
    { key: 'approvals'  as const, he: 'ממתין לאישור',   en: 'Approvals',   badge: data?.pendingApprovals.length ?? 0 },
    { key: 'supervisors'as const, he: 'מנחים',          en: 'Supervisors', badge: 0 },
  ];

  return (
    <SafeAreaView style={s.root}>
      <TopBar
        name={data?.headName ?? ''}
        role="program_head"
        lang={lang}
        isRtl={lang === 'he'}
        onToggleLang={() => setLang(l => l === 'he' ? 'en' : 'he')}
      />

      {/* Stats strip */}
      <View style={s.statsStrip}>
        {[
          { label: lang === 'he' ? 'סה"כ' : 'Total',     value: data?.stats.totalStudents  ?? 0, color: '#0EA5E9' },
          { label: lang === 'he' ? 'פעילים' : 'Active',   value: data?.stats.activeStudents ?? 0, color: '#10B981' },
          { label: lang === 'he' ? 'באיחור' : 'Overdue',  value: data?.stats.overdueCount   ?? 0, color: '#EF4444' },
          { label: lang === 'he' ? 'ממתינים' : 'Pending', value: data?.stats.pendingCount   ?? 0, color: '#F59E0B' },
        ].map(st => (
          <View key={st.label} style={s.statCard}>
            <Text style={[s.statValue, { color: st.color }]}>{st.value}</Text>
            <Text style={s.statLabel}>{st.label}</Text>
          </View>
        ))}
      </View>

      {/* Tab bar */}
      <View style={s.tabBar}>
        {tabs.map(tab => (
          <Pressable
            key={tab.key}
            style={[s.tab, activeTab === tab.key && { borderBottomColor: fc.primary, borderBottomWidth: 2 }]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Text style={[s.tabText, activeTab === tab.key && { color: fc.primary, fontWeight: '700' }]}>
              {lang === 'he' ? tab.he : tab.en}
            </Text>
            {tab.badge > 0 && (
              <View style={[s.badge, { backgroundColor: tab.key === 'approvals' ? '#EF4444' : fc.primary }]}>
                <Text style={s.badgeText}>{tab.badge}</Text>
              </View>
            )}
          </Pressable>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >

        {/* ── STUDENTS TAB ── */}
        {activeTab === 'students' && (
          <>
            {/* Search + filters */}
            <TextInput
              style={s.searchInput}
              value={searchText}
              onChangeText={setSearchText}
              placeholder={tx('searchPlaceholder', lang)}
              placeholderTextColor="#9CA3AF"
              textAlign={lang === 'he' ? 'right' : 'left'}
            />
            <View style={s.filterRow}>
              {/* Track filter */}
              {(['all', 'thesis', 'masters_project'] as const).map(track => (
                <Pressable
                  key={track}
                  style={[s.filterChip, filterTrack === track && { backgroundColor: fc.primary }]}
                  onPress={() => setFilterTrack(track)}
                >
                  <Text style={[s.filterChipText, filterTrack === track && { color: '#fff' }]}>
                    {track === 'all'
                      ? tx('all', lang)
                      : track === 'thesis'
                        ? tx('trackThesis', lang)
                        : tx('trackMastersProject', lang)}
                  </Text>
                </Pressable>
              ))}
              {/* Overdue toggle */}
              <Pressable
                style={[s.filterChip, filterOverdue && { backgroundColor: '#EF4444' }]}
                onPress={() => setFilterOverdue(v => !v)}
              >
                <Text style={[s.filterChipText, filterOverdue && { color: '#fff' }]}>
                  ⚠️ {lang === 'he' ? 'באיחור' : 'Overdue'}
                </Text>
              </Pressable>
            </View>

            {filteredStudents.length === 0 ? (
              <EmptyState emoji="🎓" text={lang === 'he' ? 'אין סטודנטים להצגה' : 'No students to show'} />
            ) : (
              filteredStudents.map(st => (
                <Pressable
                  key={st.uid}
                  style={[s.card, { borderLeftColor: st.isOverdue ? '#EF4444' : fc.primary }]}
                  onPress={() =>
                    router.push({ pathname: '/admin/panel', params: { studentId: st.uid } } as any)
                  }
                >
                  <View style={s.row}>
                    <Text style={s.cardTitle}>👤 {st.studentName}</Text>
                    {st.isOverdue && (
                      <View style={s.overduePill}>
                        <Text style={s.overduePillText}>⚠️ {tx('overdue', lang)}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={s.cardSub}>👨‍🏫 {st.supervisorName}</Text>
                  <Text style={s.cardSub}>
                    📍 {lang === 'he' ? 'שלב:' : 'Stage:'} {st.currentMilestone}
                    {'  ·  '}
                    {st.daysInStage} {lang === 'he' ? 'ימים' : 'days'}
                  </Text>
                  <View style={s.row}>
                    <View style={s.trackPill}>
                      <Text style={s.trackPillText}>
                        {st.trackType === 'thesis' ? tx('trackThesis', lang) : tx('trackMastersProject', lang)}
                      </Text>
                    </View>
                    {st.deadline && (
                      <Text style={s.deadlineText}>
                        📅 {tx('deadline', lang)}: {st.deadline}
                      </Text>
                    )}
                  </View>
                </Pressable>
              ))
            )}
          </>
        )}

        {/* ── APPROVALS TAB ── */}
        {activeTab === 'approvals' && (
          <>
            {(data?.pendingApprovals.length ?? 0) === 0 ? (
              <EmptyState emoji="✅" text={lang === 'he' ? 'אין פריטים ממתינים' : 'Nothing pending'} />
            ) : (
              data!.pendingApprovals.map(item => (
                <View key={item.id} style={[s.card, { borderLeftColor: '#F59E0B' }]}>
                  <Text style={s.cardTitle}>{item.studentName}</Text>
                  <Text style={[s.cardSub, { fontWeight: '600', color: '#92400E' }]}>{item.type}</Text>
                  <Text style={s.cardSub}>{item.description}</Text>
                  <Text style={s.cardDate}>{item.submittedAt}</Text>
                  <View style={s.actionRow}>
                    <Pressable style={s.btnApprove}>
                      <Text style={s.btnApproveText}>✅ {tx('approve', lang)}</Text>
                    </Pressable>
                    <Pressable style={s.btnReturn}>
                      <Text style={s.btnReturnText}>↩ {tx('returnForRevision', lang)}</Text>
                    </Pressable>
                  </View>
                </View>
              ))
            )}
          </>
        )}

        {/* ── SUPERVISORS TAB ── */}
        {activeTab === 'supervisors' && (
          <>
            {(data?.supervisorLoads.length ?? 0) === 0 ? (
              <EmptyState emoji="👨‍🏫" text={lang === 'he' ? 'אין מנחים' : 'No supervisors'} />
            ) : (
              data!.supervisorLoads.map((sv, i) => (
                <View key={i} style={[s.card, { borderLeftColor: fc.primary }]}>
                  <Text style={s.cardTitle}>👨‍🏫 {sv.supervisorName}</Text>
                  <Text style={s.cardSub}>{sv.supervisorEmail}</Text>
                  <View style={s.statsRow}>
                    <View style={s.miniStat}>
                      <Text style={[s.miniStatValue, { color: fc.primary }]}>{sv.activeStudents}</Text>
                      <Text style={s.miniStatLabel}>{lang === 'he' ? 'מונחים פעילים' : 'Active advisees'}</Text>
                    </View>
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
const s = StyleSheet.create({
  root:     { flex: 1, backgroundColor: '#F0F9FF' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll:   { padding: 16 },

  statsStrip: { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 10,
                backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  statCard:   { flex: 1, alignItems: 'center' },
  statValue:  { fontSize: 22, fontWeight: '800' },
  statLabel:  { fontSize: 10, color: '#64748B', marginTop: 2 },

  tabBar:      { flexDirection: 'row', backgroundColor: '#fff',
                 borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  tab:         { flex: 1, paddingVertical: 12, alignItems: 'center',
                 flexDirection: 'row', justifyContent: 'center', gap: 4 },
  tabText:     { fontSize: 13, color: '#64748B' },
  badge:       { borderRadius: 10, paddingHorizontal: 5, paddingVertical: 1 },
  badgeText:   { color: '#fff', fontSize: 10, fontWeight: '700' },

  searchInput: { backgroundColor: '#fff', borderRadius: 10, borderWidth: 1.5,
                 borderColor: '#E2E8F0', padding: 12, fontSize: 14,
                 color: '#1E293B', marginBottom: 10 },
  filterRow:   { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  filterChip:  { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
                 backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#E2E8F0' },
  filterChipText:{ fontSize: 12, color: '#475569', fontWeight: '600' },

  card:        { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 12,
                 borderLeftWidth: 4, shadowColor: '#000', shadowOpacity: 0.05,
                 shadowRadius: 6, elevation: 2 },
  cardTitle:   { fontSize: 15, fontWeight: '700', color: '#1E293B', marginBottom: 4 },
  cardSub:     { fontSize: 13, color: '#64748B', marginBottom: 2 },
  cardDate:    { fontSize: 12, color: '#94A3B8', marginTop: 4 },
  row:         { flexDirection: 'row', justifyContent: 'space-between',
                 alignItems: 'center', marginTop: 4 },

  overduePill:     { backgroundColor: '#FEE2E2', borderRadius: 8,
                     paddingHorizontal: 8, paddingVertical: 3 },
  overduePillText: { color: '#991B1B', fontSize: 11, fontWeight: '700' },
  trackPill:       { backgroundColor: '#EFF6FF', borderRadius: 8,
                     paddingHorizontal: 8, paddingVertical: 3 },
  trackPillText:   { color: '#1D4ED8', fontSize: 11, fontWeight: '600' },
  deadlineText:    { fontSize: 11, color: '#64748B' },

  actionRow:      { flexDirection: 'row', gap: 8, marginTop: 10 },
  btnApprove:     { flex: 1, backgroundColor: '#D1FAE5', borderRadius: 8,
                    padding: 10, alignItems: 'center' },
  btnApproveText: { color: '#065F46', fontWeight: '700', fontSize: 13 },
  btnReturn:      { flex: 1, backgroundColor: '#FEF3C7', borderRadius: 8,
                    padding: 10, alignItems: 'center' },
  btnReturnText:  { color: '#92400E', fontWeight: '700', fontSize: 13 },

  statsRow:       { flexDirection: 'row', gap: 24, marginTop: 8 },
  miniStat:       { alignItems: 'center' },
  miniStatValue:  { fontSize: 20, fontWeight: '800' },
  miniStatLabel:  { fontSize: 11, color: '#64748B', marginTop: 2 },

  empty:      { alignItems: 'center', paddingVertical: 48 },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyText:  { fontSize: 15, color: '#64748B', textAlign: 'center' },
});