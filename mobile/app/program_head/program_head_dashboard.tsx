// app/program_head/dashboard.tsx
// Dashboard for ראש תוכנית תואר שני (Master's Program Head).
// Scope: one faculty / program. Shows students in their program,
// pending faculty-level approvals, template management, supervisor load.

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable,
  ActivityIndicator, Alert, RefreshControl,
  TextInput, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { auth } from '../../src/firebase/firebase';
import { apiClient } from '@/src/api/apiClient';
import { TopBar, getFacultyColor } from '../../components/shared';
import { t, tx, type Lang } from '../../components/i18n';
import { ProgramHeadDashboardStyles } from '../../constants/styles';
import { ap } from '../../constants/theme';
import { ExceptionalActionQueue } from '@/components/ExceptionalActionQueue';
import { PendingSignoffsWidget } from '@/components/PendingSignoffsWidget';
import ManagedStaffSection, { type ManagedStaffRecord } from '@/components/ManagedStaffSection';
import { DELEGATE_MANAGEABLE_ROLES } from '@/firebase/roles';
import { useActiveRole } from '@/contexts/ActiveRoleContext';
import CreateOwnProjectButton from '@/components/CreateOwnProjectButton';
import ChatbotFab from '@/components/ChatbotFab';
import { TourTarget } from '@/components/onboarding/TourTarget';

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
  const { roles }           = useActiveRole();
  const [lang, setLang]     = useState<Lang>('he');
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData]             = useState<DashboardData | null>(null);
  // Lets a notification's "Go to dashboard" deep-link land on a specific tab
  // (?tab=...) instead of always opening on Students — same convention the
  // web dashboard already supports.
  type ProgramHeadTab = 'students' | 'approvals' | 'supervisors' | 'staff' | 'myProjects';
  const PROGRAM_HEAD_TABS: ProgramHeadTab[] = ['students', 'approvals', 'supervisors', 'staff', 'myProjects'];
  const { tab: tabParam } = useLocalSearchParams<{ tab?: string }>();
  const [activeTab, setActiveTab]   = useState<ProgramHeadTab>(
    PROGRAM_HEAD_TABS.includes(tabParam as ProgramHeadTab) ? (tabParam as ProgramHeadTab) : 'students'
  );
  // A program_head who's ALSO a supervisor/secondary_supervisor otherwise
  // has no way to reach the supervisor dashboard's own "New Project" button
  // — program_head always outranks supervisor, so that's never their
  // landing screen (see firebase/roles.ts's highestRankedRole). This tab
  // exists only for that overlap; a plain program_head never sees it.
  const canCreateOwnProject = roles.includes('supervisor') || roles.includes('secondary_supervisor');
  const [myProjects, setMyProjects] = useState<Array<{ id: string; titleHe: string; titleEn: string; degreeType: string; projectType: string; enrolledStudentIds?: string[]; NumberOfStudents?: number }>>([]);
  // Own-faculty staff this role can now manage directly (see
  // server/src/config/permissionScopes.ts's DELEGATE_ADMIN_ROLES) — a
  // separate endpoint from the read-only dashboard data above, since
  // program_head never had a user-listing endpoint of any kind before this.
  const [staff, setStaff] = useState<ManagedStaffRecord[]>([]);

  // Filters
  const [searchText, setSearchText]         = useState('');
  const [filterOverdue, setFilterOverdue]   = useState(false);
  const [filterTrack, setFilterTrack]       = useState<'all' | 'thesis' | 'masters_project'>('all');

  // Approvals tab — same approve/reject pattern as grad_school_head's own
  // dashboard. Server-side, program_head is now allowed onto the same
  // first-tier examiner-recommendation/template-proposal approval endpoints
  // coordinator/faculty_admin already use — this dashboard's own
  // pendingApprovals only ever contains 'examiners' and 'template' items
  // (programHeadController.ts), so those are the only two types handled.
  // Examiner rejection needs no reason (same endpoint web/coordinator use
  // with none); template rejection does (rejectTemplateProposal 400s
  // without one).
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [templateRejectTargetId, setTemplateRejectTargetId] = useState<string | null>(null);
  const [templateRejectReason, setTemplateRejectReason] = useState('');

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

  const fetchStaff = useCallback(async () => {
    try {
      const res = await apiClient.get('/api/admin/staff');
      setStaff(res.data.staff ?? []);
    } catch (e) {
      // Non-fatal — the Staff tab just shows an empty list if this fails.
      console.error('program_head fetchStaff error:', e);
    }
  }, []);

  const fetchMyProjects = useCallback(async () => {
    try {
      const res = await apiClient.get('/api/supervisor/dashboard');
      setMyProjects(res.data.myProjects ?? []);
    } catch (e) {
      // Non-fatal — the tab just shows an empty list if this fails.
      console.error('program_head fetchMyProjects error:', e);
    }
  }, []);

  useEffect(() => {
    fetchData(); fetchStaff();
    if (canCreateOwnProject) fetchMyProjects();
  }, [fetchData, fetchStaff, canCreateOwnProject, fetchMyProjects]);
  const onRefresh = () => { setRefreshing(true); fetchData(); fetchStaff(); if (canCreateOwnProject) fetchMyProjects(); };

  // See server/src/controllers/coordinatorController.ts's
  // approveExaminerRecommendation/rejectExaminerRecommendation.
  const handleApproveExaminers = async (item: PendingApproval) => {
    setApprovingId(item.id);
    try {
      await apiClient.post(`/api/coordinator/examiner-recommendations/${item.id}/approve`);
      await fetchData();
    } catch (e: any) {
      Alert.alert(
        lang === 'he' ? 'שגיאה' : 'Error',
        e.response?.data?.message || (lang === 'he' ? 'אישור רשימת הבוחנים נכשל' : 'Failed to approve the examiner list'),
      );
    } finally {
      setApprovingId(null);
    }
  };

  const handleRejectExaminers = async (item: PendingApproval) => {
    setApprovingId(item.id);
    try {
      await apiClient.post(`/api/coordinator/examiner-recommendations/${item.id}/reject`);
      await fetchData();
    } catch (e: any) {
      Alert.alert(
        lang === 'he' ? 'שגיאה' : 'Error',
        e.response?.data?.message || (lang === 'he' ? 'דחיית רשימת הבוחנים נכשלה' : 'Failed to reject the examiner list'),
      );
    } finally {
      setApprovingId(null);
    }
  };

  // See server/src/controllers/facultyTemplateController.ts's
  // approveTemplateProposal/rejectTemplateProposal.
  const handleApproveTemplate = async (item: PendingApproval) => {
    setApprovingId(item.id);
    try {
      await apiClient.post(`/api/faculty-templates/proposals/${item.id}/approve`);
      await fetchData();
    } catch (e: any) {
      Alert.alert(
        lang === 'he' ? 'שגיאה' : 'Error',
        e.response?.data?.message || (lang === 'he' ? 'אישור התבנית נכשל' : 'Failed to approve the template'),
      );
    } finally {
      setApprovingId(null);
    }
  };

  const handleRejectTemplate = async (item: PendingApproval) => {
    if (!templateRejectReason.trim()) return;
    setApprovingId(item.id);
    try {
      await apiClient.post(`/api/faculty-templates/proposals/${item.id}/reject`, { reason: templateRejectReason.trim() });
      setTemplateRejectTargetId(null);
      setTemplateRejectReason('');
      await fetchData();
    } catch (e: any) {
      Alert.alert(
        lang === 'he' ? 'שגיאה' : 'Error',
        e.response?.data?.message || (lang === 'he' ? 'דחיית התבנית נכשלה' : 'Failed to reject the template'),
      );
    } finally {
      setApprovingId(null);
    }
  };

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
    { key: 'staff'       as const, he: 'סגל',            en: 'Staff',       badge: 0 },
    ...(canCreateOwnProject
      ? [{ key: 'myProjects' as const, he: 'הפרויקטים שלי', en: 'My Projects', badge: myProjects.length }]
      : []),
  ];

  return (
    <SafeAreaView style={s.root}>
      <TopBar
        name={data?.headName ?? ''}
        role="program_head"
        lang={lang}
        isRtl={lang === 'he'}
        onToggleLang={() => setLang(l => l === 'he' ? 'en' : 'he')}
        extraMenuItems={[
          {
            key: 'project-records', icon: '📜',
            label: lang === 'he' ? 'רישומי פרויקטים' : 'Project Records',
            onPress: () => router.push({ pathname: '/program_head/records', params: { lang } } as any),
          },
        ]}
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
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tabBar}>
        {tabs.map(tab => (
          <TourTarget key={tab.key} tourKey={tab.key}>
            <Pressable
              style={[s.tab, activeTab === tab.key && { borderBottomColor: fc.primary, borderBottomWidth: 2 }]}
              onPress={() => setActiveTab(tab.key)}
              accessibilityRole="button"
            >
              <Text
                style={[s.tabText, activeTab === tab.key && { color: fc.primary, fontWeight: '700' }]}
                numberOfLines={1}
              >
                {lang === 'he' ? tab.he : tab.en}
              </Text>
              {tab.badge > 0 && (
                <View style={[s.badge, { backgroundColor: tab.key === 'approvals' ? '#EF4444' : fc.primary }]}>
                  <Text style={s.badgeText}>{tab.badge}</Text>
                </View>
              )}
            </Pressable>
          </TourTarget>
        ))}
      </ScrollView>

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
                  accessibilityRole="button"
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
                accessibilityRole="button"
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
                  accessibilityRole="link"
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
            <PendingSignoffsWidget lang={lang} showEmptyState />
            <ExceptionalActionQueue lang={lang} />
            {(data?.pendingApprovals.length ?? 0) === 0 ? (
              <EmptyState emoji="✅" text={lang === 'he' ? 'אין פריטים ממתינים' : 'Nothing pending'} />
            ) : (
              data!.pendingApprovals.map(item => (
                <View key={item.id} style={[s.card, { borderLeftColor: '#F59E0B' }]}>
                  <Text style={s.cardTitle}>{item.studentName}</Text>
                  <Text style={[s.cardSub, { fontWeight: '600', color: '#92400E' }]}>
                    {item.type === 'examiners'
                      ? (lang === 'he' ? 'אישור בוחנים' : 'Examiner Approval')
                      : item.type === 'template'
                        ? (lang === 'he' ? 'אישור תבנית פקולטית' : 'Faculty Template')
                        : item.type}
                  </Text>
                  <Text style={s.cardSub}>{item.description}</Text>
                  <Text style={s.cardDate}>{item.submittedAt}</Text>
                  {item.type === 'examiners' ? (
                    <View style={s.actionRow}>
                      <Pressable
                        style={s.btnReturn}
                        onPress={() => handleRejectExaminers(item)}
                        disabled={approvingId === item.id}
                        accessibilityRole="button"
                      >
                        <Text style={s.btnReturnText}>{lang === 'he' ? 'דחה' : 'Reject'}</Text>
                      </Pressable>
                      <Pressable
                        style={[s.btnApprove, approvingId === item.id && { opacity: 0.6 }]}
                        onPress={() => handleApproveExaminers(item)}
                        disabled={approvingId === item.id}
                        accessibilityRole="button"
                      >
                        <Text style={s.btnApproveText}>
                          {approvingId === item.id ? (lang === 'he' ? 'מאשר...' : 'Approving...') : `✅ ${lang === 'he' ? 'אשר' : 'Approve'}`}
                        </Text>
                      </Pressable>
                    </View>
                  ) : item.type === 'template' ? (
                    templateRejectTargetId === item.id ? (
                      <View style={{ marginTop: 10 }}>
                        <TextInput
                          value={templateRejectReason}
                          onChangeText={setTemplateRejectReason}
                          placeholder={lang === 'he' ? 'סיבת הדחייה (חובה)' : 'Rejection reason (required)'}
                          multiline
                          style={{ borderWidth: 1, borderColor: ap.outlineVariant, borderRadius: 8, padding: 8, minHeight: 50, fontSize: 13, textAlignVertical: 'top' }}
                        />
                        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                          <Pressable
                            style={[s.btnReturn, { flex: 1, backgroundColor: templateRejectReason.trim() ? '#EF4444' : '#FCA5A5' }]}
                            onPress={() => handleRejectTemplate(item)}
                            disabled={!templateRejectReason.trim() || approvingId === item.id}
                            accessibilityRole="button"
                          >
                            <Text style={[s.btnReturnText, { color: '#fff' }]}>
                              {lang === 'he' ? 'שלח דחייה' : 'Submit rejection'}
                            </Text>
                          </Pressable>
                          <Pressable
                            style={[s.btnReturn, { flex: 1 }]}
                            onPress={() => { setTemplateRejectTargetId(null); setTemplateRejectReason(''); }}
                            accessibilityRole="button"
                          >
                            <Text style={s.btnReturnText}>{lang === 'he' ? 'ביטול' : 'Cancel'}</Text>
                          </Pressable>
                        </View>
                      </View>
                    ) : (
                      <View style={s.actionRow}>
                        <Pressable
                          style={s.btnReturn}
                          onPress={() => setTemplateRejectTargetId(item.id)}
                          disabled={approvingId === item.id}
                          accessibilityRole="button"
                        >
                          <Text style={s.btnReturnText}>{lang === 'he' ? 'דחה' : 'Reject'}</Text>
                        </Pressable>
                        <Pressable
                          style={[s.btnApprove, approvingId === item.id && { opacity: 0.6 }]}
                          onPress={() => handleApproveTemplate(item)}
                          disabled={approvingId === item.id}
                          accessibilityRole="button"
                        >
                          <Text style={s.btnApproveText}>
                            {approvingId === item.id ? (lang === 'he' ? 'מאשר...' : 'Approving...') : `✅ ${lang === 'he' ? 'אשר' : 'Approve'}`}
                          </Text>
                        </Pressable>
                      </View>
                    )
                  ) : null}
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

        {/* ── STAFF TAB ── */}
        {activeTab === 'staff' && (
          <ManagedStaffSection
            staff={staff}
            onRefresh={fetchStaff}
            scope={{ selectableRoles: DELEGATE_MANAGEABLE_ROLES, lockedFacultyId: data?.facultyId }}
            lang={lang}
            isRtl={lang === 'he'}
          />
        )}

        {/* ── MY PROJECTS TAB (only for a program_head who's also a supervisor) ── */}
        {activeTab === 'myProjects' && (
          <>
            <CreateOwnProjectButton lang={lang} isRtl={lang === 'he'} onCreated={fetchMyProjects} />
            {myProjects.length === 0 ? (
              <EmptyState emoji="📭" text={lang === 'he' ? 'טרם פרסמת פרויקטים' : 'No projects posted yet'} />
            ) : (
              myProjects.map((p) => (
                <View key={p.id} style={[s.card, { borderLeftColor: fc.primary }]}>
                  <Text style={s.cardTitle}>
                    {lang === 'he' ? p.titleHe : p.titleEn}
                  </Text>
                  <Text style={s.cardSub}>
                    🎓 {p.degreeType === 'bachelors' ? (lang === 'he' ? 'תואר ראשון' : "Bachelor's") : (lang === 'he' ? 'תואר שני' : "Master's")}
                    {' · '}
                    {p.projectType === 'project' ? (lang === 'he' ? 'פרויקט' : 'Project') : (lang === 'he' ? 'תזה' : 'Thesis')}
                  </Text>
                  <Text style={s.cardSub}>
                    👥 {lang === 'he' ? 'סטודנטים' : 'Students'}: {p.enrolledStudentIds?.length ?? 0}/{p.NumberOfStudents ?? 1}
                  </Text>
                </View>
              ))
            )}
          </>
        )}

        <View style={{ height: 60 }} />
      </ScrollView>

      <ChatbotFab lang={lang} corner="bottom-left" />
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
const s = ProgramHeadDashboardStyles;