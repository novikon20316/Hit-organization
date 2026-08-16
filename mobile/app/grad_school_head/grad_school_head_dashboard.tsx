// app/grad_school_head/dashboard.tsx
// Dashboard for ראש בית הספר ללימודי מוסמכים (Graduate School Head).
// Shows: pending approvals, master's process overview, stuck students, examiner load.

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable,
  ActivityIndicator, Alert, RefreshControl, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { auth } from '../../src/firebase/firebase';
import { apiClient } from '@/src/api/apiClient';
import { TopBar, FACULTY_COLORS } from '../../components/shared';
import { t, tx, type Lang } from '../../components/i18n';
import { GradSchoolHeadDashboardStyles, adminPanelStyles } from '../../constants/styles';
import { ExceptionalActionQueue } from '@/components/ExceptionalActionQueue';
import ManagedStaffSection, { type ManagedStaffRecord } from '@/components/ManagedStaffSection';
import { DELEGATE_MANAGEABLE_ROLES } from '@/firebase/roles';
import { NewProjectModal } from '@/components/modals';
import CreateOwnProjectButton from '@/components/CreateOwnProjectButton';
import type { PrerequisiteSpec } from '@/components/Prerequisites';
import type { AppUser } from '@/types';

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

interface ApprovedFinalGrade {
  id: string;
  studentName: string;
  facultyId: string;
  title: string;
  finalGrade: number;
  approvedAt: string;
  michlolTransferStatus: string | null;
}

interface DashboardData {
  headName:          string;
  pendingApprovals:  PendingApproval[];
  processSummaries:  ProcessSummary[];
  stuckStudents:     StuckStudent[];
  examinerLoad:      ExaminerLoad[];
  approvedFinalGrades: ApprovedFinalGrade[];
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
  return map[type]?.[lang] ?? type;
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
    'approvals' | 'overview' | 'stuck' | 'examiners' | 'grades' | 'staff'
  >('approvals');
  // Cross-faculty staff this role can now manage directly (see
  // server/src/config/permissionScopes.ts's DELEGATE_ADMIN_ROLES) — this
  // role had zero user-management endpoints of any kind before this.
  const [staff, setStaff] = useState<ManagedStaffRecord[]>([]);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [unlockTargetId, setUnlockTargetId] = useState<string | null>(null);
  const [unlockReason, setUnlockReason] = useState('');
  const [examinerRejectTargetId, setExaminerRejectTargetId] = useState<string | null>(null);
  const [examinerRejectReason, setExaminerRejectReason] = useState('');
  const [finalGradeRejectTargetId, setFinalGradeRejectTargetId] = useState<string | null>(null);
  const [finalGradeRejectReason, setFinalGradeRejectReason] = useState('');
  const [unlockingId, setUnlockingId] = useState<string | null>(null);

  // ── Add Project modal state ─────────────────────────────────────────────
  // Net-new — grad_school_head previously had no project-creation
  // capability at all (POST /api/admin/projects hard-403'd every role
  // except faculty_admin/system_admin; now widened). Cross-faculty role
  // (facultyId 'all' by convention), so this reuses NewProjectModal's
  // mode="admin" — full faculty checkbox list scoped to whatever
  // add_projects grants this head holds, plus a supervisor picker.
  const [showNewProject, setShowNewProject] = useState(false);
  const [newProjectFacultyIds, setNewProjectFacultyIds] = useState<string[]>([]);
  const [newTitleHe, setNewTitleHe] = useState('');
  const [newTitleEn, setNewTitleEn] = useState('');
  const [newDescHe, setNewDescHe] = useState('');
  const [newDescEn, setNewDescEn] = useState('');
  const [newDegreeTypes, setNewDegreeTypes] = useState<('bachelors' | 'masters')[]>(['bachelors']);
  const [newProjectTypes, setNewProjectTypes] = useState<('project' | 'thesis')[]>(['project']);
  const [newSkills, setNewSkills] = useState('');
  const [newPrerequisites, setNewPrerequisites] = useState<PrerequisiteSpec[]>([]);
  const [newMaxStudents, setNewMaxStudents] = useState(1);
  const [selectedProgram, setSelectedProgram] = useState<string | null>(null);
  const [allSupervisors, setAllSupervisors] = useState<AppUser[]>([]);
  const [selectedSupervisor, setSelectedSupervisor] = useState<AppUser | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);
  const [projectFile, setProjectFile] = useState<string | null>(null);
  const [projectName, setProjectName] = useState<string | null>(null);

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

  const fetchStaff = useCallback(async () => {
    try {
      const res = await apiClient.get('/api/admin/staff');
      setStaff(res.data.staff ?? []);
    } catch (e) {
      // Non-fatal — the Staff tab just shows an empty list if this fails.
      console.error('grad_school_head fetchStaff error:', e);
    }
  }, []);

  useEffect(() => { fetchData(); fetchStaff(); }, [fetchData, fetchStaff]);

  const onRefresh = () => { setRefreshing(true); fetchData(); fetchStaff(); };

  // Fetches per selected faculty and merges (dedup by id).
  useEffect(() => {
    if (!showNewProject || newProjectFacultyIds.length === 0) {
      setAllSupervisors([]);
      return;
    }
    let cancelled = false;
    // Note: the server reads `facultyIds` (plural) — a single `facultyId` key
    // here would never match, silently returning an empty list regardless of
    // selection. Passing the whole array once (rather than one request per
    // faculty) also lets a single-faculty account's cross-faculty grant
    // (supervisorFacultyIds/secondarySupervisorFacultyIds) match correctly.
    apiClient.get('/api/admin/supervisors', { params: { facultyIds: newProjectFacultyIds } })
      .then((r) => {
        if (cancelled) return;
        // Single-select picker (one primary supervisor per project) — only
        // offer candidates actually eligible as a PRIMARY supervisor for the
        // selected faculty/ies (see getSupervisorsList's eligibleAsSupervisor).
        const eligible: AppUser[] = (r.data || []).filter((sup: any) => sup.eligibleAsSupervisor);
        setAllSupervisors(eligible);
      })
      .catch((err) => console.error('Error loading supervisors for selected faculties:', err));
    return () => {
      cancelled = true;
    };
  }, [newProjectFacultyIds.join(','), showNewProject]);

  const pickProjectFile = async (isNew: boolean) => {
    const result = await DocumentPicker.getDocumentAsync({ type: 'application/pdf' });
    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];
    if (isNew) {
      setProjectFile(asset.uri);
      setProjectName(asset.name);
    }
  };

  const handleCreateProject = async () => {
    if (!selectedSupervisor || !newTitleHe.trim() || !newTitleEn.trim() || newProjectFacultyIds.length === 0) {
      Alert.alert(lang === 'he' ? 'שגיאה' : 'Error', lang === 'he' ? 'יש למלא את כל השדות' : 'Missing required fields');
      return;
    }
    if (newDegreeTypes.length === 0 || newProjectTypes.length === 0) {
      Alert.alert(lang === 'he' ? 'שגיאה' : 'Error', lang === 'he' ? 'יש לבחור לפחות סוג תואר אחד וסוג פרויקט אחד' : 'Select at least one degree type and one project type');
      return;
    }
    setCreatingProject(true);
    try {
      await apiClient.post('/api/admin/projects', {
        supervisorId: selectedSupervisor.id,
        facultyIds: newProjectFacultyIds,
        titleHe: newTitleHe.trim(),
        titleEn: newTitleEn.trim(),
        descriptionHe: newDescHe.trim(),
        descriptionEn: newDescEn.trim(),
        degreeTypes: newDegreeTypes,
        projectTypes: newProjectTypes,
        maxStudents: newMaxStudents,
        requiredSkills: newSkills.split(',').map((sk) => sk.trim()).filter(Boolean),
        prerequisites: newPrerequisites.filter((p) => p.subject.trim()).map((p) => ({ subject: p.subject.trim(), ...(p.minGrade != null ? { minGrade: p.minGrade } : {}) })),
        major: selectedProgram || undefined,
      });
      setShowNewProject(false);
      setNewTitleHe(''); setNewTitleEn('');
      setNewDescHe(''); setNewDescEn('');
      setNewSkills(''); setNewPrerequisites([]);
      setSelectedProgram(null);
      setSelectedSupervisor(null);
      Alert.alert('✅', lang === 'he' ? 'הפרויקט פורסם בהצלחה!' : 'Project published successfully!');
      fetchData();
    } catch (e: any) {
      Alert.alert(lang === 'he' ? 'שגיאה' : 'Error', e?.response?.data?.message || (lang === 'he' ? 'פרסום הפרויקט נכשל' : 'Failed to publish the project'));
    } finally {
      setCreatingProject(false);
    }
  };

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

  // New capability — previously a computed final grade could only be
  // approved, never rejected pre-approval. See gradSchoolHeadController.ts's
  // rejectFinalGrade.
  const handleRejectFinalGrade = async (item: PendingApproval) => {
    if (!finalGradeRejectReason.trim()) return;
    setApprovingId(item.id);
    try {
      await apiClient.post(`/api/grad-school-head/milestones/${item.id}/reject-grade`, { reason: finalGradeRejectReason.trim() });
      setFinalGradeRejectTargetId(null);
      setFinalGradeRejectReason('');
      await fetchData();
    } catch (e: any) {
      Alert.alert(
        lang === 'he' ? 'שגיאה' : 'Error',
        e.response?.data?.message || (lang === 'he' ? 'דחיית הציון נכשלה' : 'Failed to reject the grade'),
      );
    } finally {
      setApprovingId(null);
    }
  };

  // P1 #5 — second sign-off for msc_thesis examiner lists a coordinator
  // already approved. See gradSchoolHeadController.ts's
  // approveExaminerRecommendationFinal/rejectExaminerRecommendationFinal.
  const handleApproveExaminers = async (item: PendingApproval) => {
    setApprovingId(item.id);
    try {
      await apiClient.post(`/api/grad-school-head/examiner-recommendations/${item.id}/approve`);
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
    if (!examinerRejectReason.trim()) return;
    setApprovingId(item.id);
    try {
      await apiClient.post(`/api/grad-school-head/examiner-recommendations/${item.id}/reject`, { reason: examinerRejectReason.trim() });
      setExaminerRejectTargetId(null);
      setExaminerRejectReason('');
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

  const handleUnlockGrade = async (milestoneId: string) => {
    if (!unlockReason.trim()) return;
    setUnlockingId(milestoneId);
    try {
      await apiClient.post(`/api/grad-school-head/milestones/${milestoneId}/unlock-grade`, { reason: unlockReason.trim() });
      setUnlockTargetId(null);
      setUnlockReason('');
      await fetchData();
    } catch (e: any) {
      Alert.alert(
        lang === 'he' ? 'שגיאה' : 'Error',
        e.response?.data?.message || (lang === 'he' ? 'פתיחת הציון נכשלה' : 'Failed to unlock the grade'),
      );
    } finally {
      setUnlockingId(null);
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
    { key: 'grades'    as const, he: 'ציונים מאושרים',  en: 'Approved Grades', badge: 0 },
    { key: 'staff'     as const, he: 'סגל',             en: 'Staff', badge: 0 },
  ];

  return (
    <SafeAreaView style={s.root}>
      <TopBar
        name={data?.headName ?? ''}
        role="grad_school_head"
        lang={lang}
        isRtl={lang === 'he'}
        onToggleLang={() => setLang(l => l === 'he' ? 'en' : 'he')}
        extraMenuItems={[
          {
            key: 'new-project', icon: '📁',
            label: lang === 'he' ? 'פרסום פרויקט חדש' : 'Post New Project',
            onPress: () => setShowNewProject(true),
          },
          {
            key: 'milestone-templates', icon: '🧬',
            label: lang === 'he' ? 'ניהול תבניות אבני דרך' : 'Manage Milestone Templates',
            onPress: () => router.push('/WorkflowTemplateManager' as any),
          },
          {
            key: 'reports', icon: '📊',
            label: lang === 'he' ? 'דוחות' : 'Reports',
            onPress: () => router.push('/Reports' as any),
          },
          {
            key: 'bulk-permissions', icon: '🛡️',
            label: lang === 'he' ? 'הרשאות מרוכזות לפי תפקיד' : 'Bulk Permissions by Role',
            onPress: () => router.push('/BulkPermissionsManager' as any),
          },
        ]}
      />
      {/* Manage Milestone Templates / Reports / Bulk Permissions by Role
          moved into the TopBar's ☰ menu (extraMenuItems above) — same
          routes, no functionality dropped, just decluttered off the header. */}

      {/* Self-service "create my own project" entry point for a
          grad_school_head who also holds supervisor/secondary_supervisor
          among their full roles — separate from the admin "Post New
          Project" menu item above (which creates a project on behalf of
          another supervisor). Renders nothing if the signed-in user
          doesn't qualify. */}
      <View style={{ paddingHorizontal: 16, marginTop: 12 }}>
        <CreateOwnProjectButton lang={lang} isRtl={lang === 'he'} onCreated={fetchData} />
      </View>

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
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tabBar}>
        {tabs.map(tab => (
          <Pressable
            key={tab.key}
            style={[s.tab, activeTab === tab.key && s.tabActive]}
            onPress={() => setActiveTab(tab.key)}
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
                          style={{ borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 8, padding: 8, minHeight: 50, fontSize: 13, textAlignVertical: 'top' }}
                        />
                        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                          <Pressable
                            style={[s.btnReturn, { flex: 1, backgroundColor: finalGradeRejectReason.trim() ? '#EF4444' : '#FCA5A5' }]}
                            onPress={() => handleRejectFinalGrade(item)}
                            disabled={!finalGradeRejectReason.trim() || approvingId === item.id}
                          >
                            <Text style={[s.btnReturnText, { color: '#fff' }]}>
                              {lang === 'he' ? 'שלח דחייה' : 'Submit rejection'}
                            </Text>
                          </Pressable>
                          <Pressable
                            style={[s.btnReturn, { flex: 1 }]}
                            onPress={() => { setFinalGradeRejectTargetId(null); setFinalGradeRejectReason(''); }}
                          >
                            <Text style={s.btnReturnText}>{lang === 'he' ? 'ביטול' : 'Cancel'}</Text>
                          </Pressable>
                        </View>
                      </View>
                    ) : (
                      <View style={s.actionRow}>
                        <Pressable
                          style={s.btnReturn}
                          onPress={() => setFinalGradeRejectTargetId(item.id)}
                          disabled={approvingId === item.id}
                        >
                          <Text style={s.btnReturnText}>{lang === 'he' ? 'דחה' : 'Reject'}</Text>
                        </Pressable>
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
                    )
                  ) : item.type === 'examiners' ? (
                    examinerRejectTargetId === item.id ? (
                      <View style={{ marginTop: 10 }}>
                        <TextInput
                          value={examinerRejectReason}
                          onChangeText={setExaminerRejectReason}
                          placeholder={lang === 'he' ? 'סיבת הדחייה (חובה)' : 'Rejection reason (required)'}
                          multiline
                          style={{ borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 8, padding: 8, minHeight: 50, fontSize: 13, textAlignVertical: 'top' }}
                        />
                        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                          <Pressable
                            style={[s.btnReturn, { flex: 1, backgroundColor: examinerRejectReason.trim() ? '#EF4444' : '#FCA5A5' }]}
                            onPress={() => handleRejectExaminers(item)}
                            disabled={!examinerRejectReason.trim() || approvingId === item.id}
                          >
                            <Text style={[s.btnReturnText, { color: '#fff' }]}>
                              {lang === 'he' ? 'שלח דחייה' : 'Submit rejection'}
                            </Text>
                          </Pressable>
                          <Pressable
                            style={[s.btnReturn, { flex: 1 }]}
                            onPress={() => { setExaminerRejectTargetId(null); setExaminerRejectReason(''); }}
                          >
                            <Text style={s.btnReturnText}>{lang === 'he' ? 'ביטול' : 'Cancel'}</Text>
                          </Pressable>
                        </View>
                      </View>
                    ) : (
                      <View style={s.actionRow}>
                        <Pressable
                          style={s.btnReturn}
                          onPress={() => setExaminerRejectTargetId(item.id)}
                          disabled={approvingId === item.id}
                        >
                          <Text style={s.btnReturnText}>{lang === 'he' ? 'דחה' : 'Reject'}</Text>
                        </Pressable>
                        <Pressable
                          style={[s.btnApprove, approvingId === item.id && { opacity: 0.6 }]}
                          onPress={() => handleApproveExaminers(item)}
                          disabled={approvingId === item.id}
                        >
                          <Text style={s.btnApproveText}>
                            {approvingId === item.id ? (lang === 'he' ? 'מאשר...' : 'Approving...') : `✅ ${lang === 'he' ? 'אשר' : 'Approve'}`}
                          </Text>
                        </Pressable>
                      </View>
                    )
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
                        style={{ borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 8, padding: 8, minHeight: 60, fontSize: 13, textAlignVertical: 'top' }}
                      />
                      <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                        <Pressable
                          style={[s.btnReturn, { flex: 1, backgroundColor: unlockReason.trim() ? '#EF4444' : '#FCA5A5' }]}
                          onPress={() => handleUnlockGrade(g.id)}
                          disabled={!unlockReason.trim() || unlockingId === g.id}
                        >
                          <Text style={[s.btnReturnText, { color: '#fff' }]}>
                            {unlockingId === g.id ? (lang === 'he' ? 'פותח...' : 'Unlocking...') : (lang === 'he' ? 'אשר פתיחה' : 'Confirm Unlock')}
                          </Text>
                        </Pressable>
                        <Pressable
                          style={[s.btnReturn, { flex: 1 }]}
                          onPress={() => { setUnlockTargetId(null); setUnlockReason(''); }}
                        >
                          <Text style={s.btnReturnText}>{lang === 'he' ? 'ביטול' : 'Cancel'}</Text>
                        </Pressable>
                      </View>
                    </View>
                  ) : (
                    <Pressable style={[s.btnReturn, { marginTop: 10 }]} onPress={() => setUnlockTargetId(g.id)}>
                      <Text style={s.btnReturnText}>🔓 {lang === 'he' ? 'פתח לתיקון' : 'Unlock for Correction'}</Text>
                    </Pressable>
                  )}
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
            scope={{ selectableRoles: DELEGATE_MANAGEABLE_ROLES }}
            lang={lang}
            isRtl={lang === 'he'}
          />
        )}

        <View style={{ height: 60 }} />
      </ScrollView>

      <NewProjectModal
        visible={showNewProject}
        setVisible={setShowNewProject}
        mode="admin"
        lang={lang}
        isRtl={lang === 'he'}
        titleHe={newTitleHe} setTitleHe={setNewTitleHe}
        titleEn={newTitleEn} setTitleEn={setNewTitleEn}
        descHe={newDescHe} setDescHe={setNewDescHe}
        descEn={newDescEn} setDescEn={setNewDescEn}
        skills={newSkills} setSkills={setNewSkills}
        prerequisites={newPrerequisites} setPrerequisites={setNewPrerequisites}
        facultyIds={newProjectFacultyIds}
        setFacultyIds={setNewProjectFacultyIds}
        degreeTypes={newDegreeTypes} setDegreeTypes={setNewDegreeTypes}
        projectTypes={newProjectTypes} setProjectTypes={setNewProjectTypes}
        selectedProgram={selectedProgram}
        setSelectedProgram={setSelectedProgram}
        supervisors={allSupervisors}
        selectedSupervisor={selectedSupervisor}
        setSelectedSupervisor={setSelectedSupervisor}
        setShowConfirm={setShowConfirm}
        onCreate={handleCreateProject}
        creating={creatingProject}
        maxStudents={newMaxStudents}
        setMaxStudents={setNewMaxStudents}
        projectName={projectName}
        setProjectName={setProjectName}
        projectFile={projectFile}
        setProjectFile={setProjectFile}
        pickFile={pickProjectFile}
        facultyColors={FACULTY_COLORS}
        styles={adminPanelStyles}
      />
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
// ACCENT ('#7C3AED') is now inlined directly in GradSchoolHeadDashboardStyles
// (constants/styles.ts) since that's its only use.
const s = GradSchoolHeadDashboardStyles;