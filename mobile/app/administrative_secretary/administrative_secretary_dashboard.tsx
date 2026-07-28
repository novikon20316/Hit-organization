// app/administrative_secretary/administrative_secretary_dashboard.tsx
// Dashboard for מזכירה אדמיניסטרטיבית (Administrative Secretary).
// Manages bachelor's and master's project groups:
// open groups, assign students, schedule defenses, track submissions.

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable,
  ActivityIndicator, Alert, RefreshControl,
  TextInput, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { auth } from '../../src/firebase/firebase';
import { apiClient } from '@/src/api/apiClient';
import { TopBar, getFacultyColor, FACULTY_COLORS } from '../../components/shared';
import { t, tx, type Lang } from '../../components/i18n';
import DefenseBuildingPicker from '@/components/DefenseBuildingPicker';
import { BulkDueDateModal, NewProjectModal } from '@/components/modals';
import { AdministrativeSecretaryDashboardStyles, AdministrativeSecretaryModalStyles, adminPanelStyles } from '../../constants/styles';
import type { AppUser } from '@/types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProjectGroup {
  id:              string;
  projectTitle:    string;
  supervisorName:  string;
  facultyId:       string;
  trackType:       'bachelor_project' | 'masters_project';
  members:         Array<{ uid: string; name: string }>;
  currentMilestone:string;
  // Real milestone doc id (as opposed to the display label above) and the
  // project's already-assigned internal examiners — both needed so
  // SendExaminerModal below can invite an external examiner via the real
  // assign-examiners endpoint without wiping out an existing internal one.
  currentMilestoneId: string | null;
  existingExaminerIds: string[];
  primaryStatus:   string;
  defenseDate:     string | null;
  defenseRoom:     string | null;
  submissionsCount:number;
  overdueCount:    number;
  isOverdue:       boolean;
}

interface DashboardData {
  coordinatorName: string;
  facultyId:       string;
  groups:          ProjectGroup[];
  stats: {
    totalGroups:     number;
    activeGroups:    number;
    scheduledDefenses:number;
    overdueGroups:   number;
  };
}

// ─── Send Examiner Modal ───────────────────────────────────────────────────────
// Previously wrote an examinerTokens doc directly to Firestore
// (src/firebase/createExaminerToken.ts) — that path only checks the caller's
// ROLE (Firestore rules), never her assigned degree scope, so any
// administrative_secretary could invite an examiner for a project outside
// her own faculty/major. It also never emailed the examiner (she had to
// copy/paste the link herself) and passed group.currentMilestone — a
// display label like "Final Report", not a real milestone doc id — as
// milestoneId. Now routed through the same POST
// /api/coordinator/projects/:id/assign-examiners endpoint the coordinator's
// own assign-examiners flow uses (see app/coordinator/home.tsx), which
// enforces withinCoordinatorScope server-side and emails the access link.
interface SendExaminerModalProps {
  visible:  boolean;
  group:    ProjectGroup | null;
  lang:     Lang;
  onClose:  () => void;
}

function SendExaminerModal({
  visible, group, lang, onClose,
}: SendExaminerModalProps) {
  const [examinerName,        setExaminerName]        = useState('');
  const [examinerEmail,       setExaminerEmail]       = useState('');
  const [examinerInstitution, setExaminerInstitution] = useState('');
  const [examinerLanguage,    setExaminerLanguage]    = useState<'he' | 'en'>('he');
  const [sending,             setSending]             = useState(false);
  const [sent,                setSent]                = useState(false);

  const reset = () => {
    setExaminerName(''); setExaminerEmail(''); setExaminerInstitution('');
    setSent(false); setExaminerLanguage('he');
  };

  const handleClose = () => { reset(); onClose(); };

  const handleSend = async () => {
    if (!group) return;
    if (!examinerName.trim() || !examinerEmail.trim()) {
      Alert.alert(
        lang === 'he' ? 'שדות חובה' : 'Required fields',
        lang === 'he' ? 'יש להזין שם ומייל של הבוחן' : 'Please enter examiner name and email',
      );
      return;
    }
    setSending(true);
    try {
      const res = await apiClient.post(`/api/coordinator/projects/${group.id}/assign-examiners`, {
        // Existing internal examiners must be re-sent — the endpoint
        // replaces the project's whole examiner panel with what's passed
        // here, so omitting them would silently unassign them.
        examiners: [
          ...group.existingExaminerIds.map((uid) => ({ type: 'internal' as const, uid })),
          {
            type: 'external' as const,
            name: examinerName.trim(),
            email: examinerEmail.trim(),
            institution: examinerInstitution.trim(),
          },
        ],
        ...(group.currentMilestoneId ? { milestoneId: group.currentMilestoneId } : {}),
        lang: examinerLanguage,
      });
      if ((res.data.externalFailed ?? []).length > 0) {
        Alert.alert(
          lang === 'he' ? 'שגיאה' : 'Error',
          lang === 'he'
            ? 'הבקשה נשמרה אך שליחת המייל לבוחן נכשלה — נסה שוב מאוחר יותר'
            : 'The request was saved, but the email to the examiner failed to send — please try again later.',
        );
        return;
      }
      setSent(true);
      Alert.alert(
        lang === 'he' ? '✅ נשלח' : '✅ Sent',
        lang === 'he'
          ? 'קישור הגישה נשלח לבוחן במייל.'
          : 'The access link was emailed directly to the examiner.',
      );
    } catch (e: any) {
      Alert.alert(lang === 'he' ? 'שגיאה' : 'Error', e.response?.data?.message || String(e));
    } finally {
      setSending(false);
    }
  };

  const isRtl = lang === 'he';

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <ScrollView style={m.modal} contentContainerStyle={m.modalContent}>
        <Text style={m.modalTitle}>
          📧 {tx('send', lang)} {tx('externalExaminer', lang)}
        </Text>

        {group && (
          <View style={m.contextCard}>
            <Text style={m.contextTitle}>{group.projectTitle}</Text>
            <Text style={m.contextSub}>
              👥 {group.members.map(mem => mem.name).join(', ')}
            </Text>
          </View>
        )}

        {/* Examiner details */}
        {[
          { label: lang === 'he' ? 'שם הבוחן *' : 'Examiner name *',         value: examinerName,        set: setExaminerName,        key: 'name' },
          { label: lang === 'he' ? 'דוא"ל *' : 'Email *',                    value: examinerEmail,       set: setExaminerEmail,       key: 'email' },
          { label: lang === 'he' ? 'מוסד' : 'Institution',                   value: examinerInstitution, set: setExaminerInstitution, key: 'inst' },
        ].map(field => (
          <View key={field.key} style={m.fieldWrap}>
            <Text style={m.fieldLabel}>{field.label}</Text>
            <TextInput
              style={[m.input, isRtl && { textAlign: 'right' }]}
              value={field.value}
              onChangeText={field.set}
              keyboardType={field.key === 'email' ? 'email-address' : 'default'}
              autoCapitalize="none"
              placeholderTextColor="#9CA3AF"
            />
          </View>
        ))}

        {/* Language preference */}
        <Text style={m.fieldLabel}>{tx('examinerPreferredLanguage', lang)}</Text>
        <View style={m.langRow}>
          {(['he', 'en'] as const).map(l => (
            <Pressable
              key={l}
              style={[m.langBtn, examinerLanguage === l && m.langBtnActive]}
              onPress={() => setExaminerLanguage(l)}
            >
              <Text style={[m.langBtnText, examinerLanguage === l && m.langBtnTextActive]}>
                {l === 'he' ? 'עברית' : 'English'}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Sent confirmation */}
        {sent && (
          <View style={m.linkBox}>
            <Text style={m.linkLabel}>
              {lang === 'he' ? '✅ קישור הגישה נשלח לבוחן במייל.' : '✅ The access link was emailed directly to the examiner.'}
            </Text>
          </View>
        )}

        <Pressable
          style={[m.btnSend, sending && { opacity: 0.6 }]}
          onPress={handleSend}
          disabled={sending}
        >
          {sending
            ? <ActivityIndicator color="#fff" />
            : <Text style={m.btnSendText}>
                {sent
                  ? (lang === 'he' ? 'שלח שוב' : 'Send again')
                  : (lang === 'he' ? '📧 שלח בקשה' : '📧 Send Request')}
              </Text>
          }
        </Pressable>

        <Pressable style={m.btnCancel} onPress={handleClose}>
          <Text style={m.btnCancelText}>{tx('cancel', lang)}</Text>
        </Pressable>
      </ScrollView>
    </Modal>
  );
}

// ─── Defense Logistics Modal ────────────────────────────────────────────────
interface DefenseLogisticsModalProps {
  visible: boolean;
  group:   ProjectGroup | null;
  lang:    Lang;
  onClose: () => void;
  onSaved: () => void;
}

function DefenseLogisticsModal({ visible, group, lang, onClose, onSaved }: DefenseLogisticsModalProps) {
  const [time,     setTime]     = useState('');
  const [room,     setRoom]     = useState('');
  const [building, setBuilding] = useState('');
  const [onlineDefenseLink, setOnlineDefenseLink] = useState('');
  const [saving,   setSaving]   = useState(false);

  const reset = () => { setTime(''); setRoom(''); setBuilding(''); setOnlineDefenseLink(''); };
  const handleClose = () => { reset(); onClose(); };

  const handleSave = async () => {
    if (!group) return;
    if (!time.trim() || !room.trim() || !building) {
      Alert.alert(
        lang === 'he' ? 'שגיאה' : 'Error',
        lang === 'he' ? 'יש למלא שעה, חדר ובניין' : 'Time, room, and building are all required',
      );
      return;
    }
    setSaving(true);
    try {
      await apiClient.post(`/api/project-coordinator/projects/${group.id}/assign-defense`, {
        time: time.trim(),
        room: room.trim(),
        building,
        ...(onlineDefenseLink.trim() ? { onlineDefenseLink: onlineDefenseLink.trim() } : {}),
      });
      Alert.alert('✅', lang === 'he' ? 'פרטי ההגנה נשמרו בהצלחה' : 'Defense logistics saved successfully');
      reset();
      onSaved();
      onClose();
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.message || 'Failed to save defense logistics');
    } finally {
      setSaving(false);
    }
  };

  const isRtl = lang === 'he';

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <ScrollView style={m.modal} contentContainerStyle={m.modalContent}>
        <Text style={m.modalTitle}>
          🛡 {tx('scheduleDefense', lang)}
        </Text>

        {group && (
          <View style={m.contextCard}>
            <Text style={m.contextTitle}>{group.projectTitle}</Text>
            <Text style={m.contextSub}>
              👥 {group.members.map(mem => mem.name).join(', ')}
            </Text>
            {group.defenseDate && (
              <Text style={m.contextSub}>
                📅 {tx('defenseDate', lang)} {group.defenseDate}
              </Text>
            )}
          </View>
        )}

        <View style={m.fieldWrap}>
          <Text style={m.fieldLabel}>{tx('defenseTime', lang)}</Text>
          <TextInput
            style={[m.input, isRtl && { textAlign: 'right' }]}
            value={time}
            onChangeText={setTime}
            placeholder="HH:MM"
            placeholderTextColor="#9CA3AF"
          />
        </View>

        <View style={m.fieldWrap}>
          <Text style={m.fieldLabel}>{tx('defenseRoom', lang)}</Text>
          <TextInput
            style={[m.input, isRtl && { textAlign: 'right' }]}
            value={room}
            onChangeText={setRoom}
            placeholder={lang === 'he' ? 'חדר 101' : 'Room 101'}
            placeholderTextColor="#9CA3AF"
          />
        </View>

        <View style={m.fieldWrap}>
          <Text style={m.fieldLabel}>{tx('defenseBuilding', lang)}</Text>
          <DefenseBuildingPicker value={building} onChange={setBuilding} lang={lang} />
        </View>

        <View style={m.fieldWrap}>
          <Text style={m.fieldLabel}>{lang === 'he' ? 'קישור להגנה מקוונת (אופציונלי)' : 'Online defense link (optional)'}</Text>
          <TextInput
            style={[m.input, isRtl && { textAlign: 'right' }]}
            value={onlineDefenseLink}
            onChangeText={setOnlineDefenseLink}
            placeholder="https://zoom.us/j/..."
            placeholderTextColor="#9CA3AF"
            autoCapitalize="none"
          />
        </View>

        <Pressable
          style={[m.btnSend, saving && { opacity: 0.6 }]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving
            ? <ActivityIndicator color="#fff" />
            : <Text style={m.btnSendText}>{lang === 'he' ? 'שמור' : 'Save'}</Text>
          }
        </Pressable>

        <Pressable style={m.btnCancel} onPress={handleClose}>
          <Text style={m.btnCancelText}>{tx('cancel', lang)}</Text>
        </Pressable>
      </ScrollView>
    </Modal>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ProjectCoordinatorDashboard() {
  const router              = useRouter();
  const [lang, setLang]     = useState<Lang>('he');
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData]             = useState<DashboardData | null>(null);
  const [filterTrack, setFilterTrack] = useState<'all' | 'bachelor_project' | 'masters_project'>('all');
  const [filterOverdue, setFilterOverdue] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [examinerModalGroup, setExaminerModalGroup] = useState<ProjectGroup | null>(null);
  const [defenseModalGroup, setDefenseModalGroup] = useState<ProjectGroup | null>(null);
  const [showBulkDueDate, setShowBulkDueDate] = useState(false);

  // ── Add Project modal state ─────────────────────────────────────────────
  // Net-new — administrative_secretary previously had no project-creation
  // capability at all (POST /api/admin/projects hard-403'd every role
  // except faculty_admin/system_admin; now widened). She's a cross-faculty
  // role (facultyId 'all' by convention, no single "own" faculty), so this
  // reuses NewProjectModal's mode="admin" — full faculty checkbox list
  // scoped to whatever add_projects grants she holds (see
  // FacultyCheckboxes) plus a supervisor picker, same as the system_admin flow.
  const [showNewProject, setShowNewProject] = useState(false);
  const [newProjectFacultyIds, setNewProjectFacultyIds] = useState<string[]>([]);
  const [newTitleHe, setNewTitleHe] = useState('');
  const [newTitleEn, setNewTitleEn] = useState('');
  const [newDescHe, setNewDescHe] = useState('');
  const [newDescEn, setNewDescEn] = useState('');
  const [newDegreeTypes, setNewDegreeTypes] = useState<('bachelors' | 'masters')[]>(['bachelors']);
  const [newProjectTypes, setNewProjectTypes] = useState<('project' | 'thesis')[]>(['project']);
  const [newSkills, setNewSkills] = useState('');
  const [newPrerequisites, setNewPrerequisites] = useState('');
  const [newMaxStudents, setNewMaxStudents] = useState(1);
  const [selectedProgram, setSelectedProgram] = useState<string | null>(null);
  const [allSupervisors, setAllSupervisors] = useState<AppUser[]>([]);
  const [selectedSupervisor, setSelectedSupervisor] = useState<AppUser | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);
  const [projectFile, setProjectFile] = useState<string | null>(null);
  const [projectName, setProjectName] = useState<string | null>(null);

  const uid  = auth.currentUser?.uid ?? '';

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    try {
      const res = await apiClient.get(`/api/project-coordinator/${uid}/dashboard`);
      setData(res.data);
    } catch (e: any) {
      console.error('administrative_secretary dashboard error:', e);
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

  // Fetches per selected faculty and merges (dedup by id).
  useEffect(() => {
    if (!showNewProject || newProjectFacultyIds.length === 0) {
      setAllSupervisors([]);
      return;
    }
    let cancelled = false;
    Promise.all(newProjectFacultyIds.map((facultyId) => apiClient.get('/api/admin/supervisors', { params: { facultyId } })))
      .then((responses) => {
        if (cancelled) return;
        const byId = new Map<string, AppUser>();
        responses.forEach((r) => (r.data || []).forEach((sup: AppUser) => byId.set(sup.id, sup)));
        setAllSupervisors([...byId.values()]);
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
        prerequisites: newPrerequisites.split(',').map((p) => p.trim()).filter(Boolean),
        major: selectedProgram || undefined,
      });
      setShowNewProject(false);
      setNewTitleHe(''); setNewTitleEn('');
      setNewDescHe(''); setNewDescEn('');
      setNewSkills(''); setNewPrerequisites('');
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

  // ── Filter ─────────────────────────────────────────────────────────────────
  const filteredGroups = (data?.groups ?? []).filter(g => {
    const q = searchText.toLowerCase();
    const matchesSearch =
      !q ||
      g.projectTitle.toLowerCase().includes(q) ||
      g.supervisorName.toLowerCase().includes(q) ||
      g.members.some(m => m.name.toLowerCase().includes(q));
    const matchesTrack   = filterTrack === 'all' || g.trackType === filterTrack;
    const matchesOverdue = !filterOverdue || g.isOverdue;
    return matchesSearch && matchesTrack && matchesOverdue;
  });

  if (loading) {
    return (
      <View style={s.centered}>
        <ActivityIndicator size="large" color="#F59E0B" />
      </View>
    );
  }

  const fc = getFacultyColor(data?.facultyId ?? 'all');

  return (
    <SafeAreaView style={s.root}>
      <TopBar
        name={data?.coordinatorName ?? ''}
        role="administrative_secretary"
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
            key: 'bulk-due-dates', icon: '📅',
            label: lang === 'he' ? 'עדכון תאריכי יעד מרוכז' : 'Bulk Update Due Dates',
            onPress: () => setShowBulkDueDate(true),
          },
          {
            key: 'academic-year', icon: '🎓',
            label: lang === 'he' ? 'שנת לימודים' : 'Academic Year',
            onPress: () => router.push('/AcademicYearManager' as any),
          },
          {
            key: 'workflow-templates', icon: '🧬',
            label: lang === 'he' ? 'תבניות תהליך' : 'Process Templates',
            onPress: () => router.push('/WorkflowTemplateManager' as any),
          },
        ]}
      />

      {/* Stats strip */}
      <View style={s.statsStrip}>
        {[
          { label: lang === 'he' ? 'קבוצות' : 'Groups',           value: data?.stats.totalGroups      ?? 0, color: '#F59E0B' },
          { label: lang === 'he' ? 'פעילות' : 'Active',           value: data?.stats.activeGroups     ?? 0, color: '#10B981' },
          { label: lang === 'he' ? 'הגנות מתוכננות' : 'Defenses', value: data?.stats.scheduledDefenses ?? 0, color: '#2E86FF' },
          { label: lang === 'he' ? 'באיחור' : 'Overdue',          value: data?.stats.overdueGroups    ?? 0, color: '#EF4444' },
        ].map(st => (
          <View key={st.label} style={s.statCard}>
            <Text style={[s.statValue, { color: st.color }]}>{st.value}</Text>
            <Text style={s.statLabel} numberOfLines={2}>{st.label}</Text>
          </View>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Bulk Update Due Dates / Academic Year moved into the TopBar's ☰
            menu (extraMenuItems above) — same actions, no functionality
            dropped, just decluttered off this row. */}
        <TextInput
          style={s.searchInput}
          value={searchText}
          onChangeText={setSearchText}
          placeholder={tx('searchPlaceholder', lang)}
          placeholderTextColor="#9CA3AF"
          textAlign={lang === 'he' ? 'right' : 'left'}
        />
        <View style={s.filterRow}>
          {(['all', 'bachelor_project', 'masters_project'] as const).map(track => (
            <Pressable
              key={track}
              style={[s.filterChip, filterTrack === track && { backgroundColor: fc.primary }]}
              onPress={() => setFilterTrack(track)}
            >
              <Text style={[s.filterChipText, filterTrack === track && { color: '#fff' }]}>
                {track === 'all'
                  ? tx('all', lang)
                  : track === 'bachelor_project'
                    ? tx('trackBachelorProject', lang)
                    : tx('trackMastersProject', lang)}
              </Text>
            </Pressable>
          ))}
          <Pressable
            style={[s.filterChip, filterOverdue && { backgroundColor: '#EF4444' }]}
            onPress={() => setFilterOverdue(v => !v)}
          >
            <Text style={[s.filterChipText, filterOverdue && { color: '#fff' }]}>
              ⚠️ {lang === 'he' ? 'באיחור' : 'Overdue'}
            </Text>
          </Pressable>
        </View>

        {/* Group cards */}
        {filteredGroups.length === 0 ? (
          <View style={s.empty}>
            <Text style={s.emptyEmoji}>📭</Text>
            <Text style={s.emptyText}>{lang === 'he' ? 'אין קבוצות להצגה' : 'No groups to show'}</Text>
          </View>
        ) : (
          filteredGroups.map(group => (
            <View key={group.id} style={[s.card, { borderLeftColor: group.isOverdue ? '#EF4444' : fc.primary }]}>
              {/* Title + overdue */}
              <View style={s.cardHeaderRow}>
                <Text style={s.cardTitle} numberOfLines={2}>{group.projectTitle}</Text>
                {group.isOverdue && (
                  <View style={s.overduePill}>
                    <Text style={s.overduePillText}>⚠️ {tx('overdue', lang)}</Text>
                  </View>
                )}
              </View>

              {/* Supervisor */}
              <Text style={s.cardSub}>👨‍🏫 {group.supervisorName}</Text>

              {/* Members */}
              <Text style={s.cardSub}>
                👥 {group.members.map(m => m.name).join('  ·  ')}
              </Text>

              {/* Milestone + track */}
              <View style={s.metaRow}>
                <View style={[s.trackPill, { backgroundColor: group.trackType === 'bachelor_project' ? '#EFF6FF' : '#F5F3FF' }]}>
                  <Text style={[s.trackPillText, { color: group.trackType === 'bachelor_project' ? '#1D4ED8' : '#7C3AED' }]}>
                    {group.trackType === 'bachelor_project'
                      ? tx('trackBachelorProject', lang)
                      : tx('trackMastersProject', lang)}
                  </Text>
                </View>
                <Text style={s.milestoneText}>
                  📍 {group.currentMilestone}
                </Text>
              </View>

              {/* Defense date */}
              {group.defenseDate ? (
                <View style={s.defensePill}>
                  <Text style={s.defensePillText}>
                    🛡 {tx('defenseDate', lang)} {group.defenseDate}
                    {group.defenseRoom ? `  ·  ${group.defenseRoom}` : ''}
                  </Text>
                </View>
              ) : (
                <Text style={s.noDefenseText}>
                  📅 {tx('defenseNotScheduled', lang)}
                </Text>
              )}

              {/* Actions */}
              <View style={s.actionRow}>
                <Pressable
                  style={[s.actionBtn, { backgroundColor: '#EFF6FF' }]}
                  onPress={() =>
                    router.push({ pathname: '/admin/panel', params: { groupId: group.id } } as any)
                  }
                >
                  <Text style={[s.actionBtnText, { color: '#1D4ED8' }]}>
                    📁 {tx('view', lang)}
                  </Text>
                </Pressable>

                <Pressable
                  style={[s.actionBtn, { backgroundColor: '#F0FDF4' }]}
                  onPress={() => setDefenseModalGroup(group)}
                >
                  <Text style={[s.actionBtnText, { color: '#065F46' }]}>
                    🛡 {tx('scheduleDefense', lang)}
                  </Text>
                </Pressable>

                <Pressable
                  style={[s.actionBtn, { backgroundColor: '#FFF7ED' }]}
                  onPress={() => setExaminerModalGroup(group)}
                >
                  <Text style={[s.actionBtnText, { color: '#92400E' }]}>
                    📧 {tx('externalExaminer', lang)}
                  </Text>
                </Pressable>
              </View>
            </View>
          ))
        )}

        <View style={{ height: 60 }} />
      </ScrollView>

      {/* Send examiner modal */}
      <SendExaminerModal
        visible={!!examinerModalGroup}
        group={examinerModalGroup}
        lang={lang}
        onClose={() => setExaminerModalGroup(null)}
      />

      {/* Defense logistics modal */}
      <DefenseLogisticsModal
        visible={!!defenseModalGroup}
        group={defenseModalGroup}
        lang={lang}
        onClose={() => setDefenseModalGroup(null)}
        onSaved={fetchData}
      />

      <BulkDueDateModal
        visible={showBulkDueDate}
        onClose={() => setShowBulkDueDate(false)}
        lang={lang}
        projects={(data?.groups ?? []).map((g) => ({ id: g.id, label: g.projectTitle }))}
        onSaved={fetchData}
      />

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

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = AdministrativeSecretaryDashboardStyles;

// ─── Send Examiner Modal styles ───────────────────────────────────────────────
const m = AdministrativeSecretaryModalStyles;