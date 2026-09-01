// app/administrative_coordinator/administrative_coordinator_dashboard.tsx
// Dashboard for רכזת אדמיניסטרטיבית (Administrative Coordinator).
// Manages bachelor's and master's project groups:
// open groups, assign students, schedule defenses, track submissions.

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable,
  ActivityIndicator, Alert, RefreshControl,
  TextInput, Modal, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { auth } from '../../src/firebase/firebase';
import { apiClient } from '@/src/api/apiClient';
import { TopBar, getFacultyColor, FACULTY_COLORS } from '../../components/shared';
import { t, tx, type Lang } from '../../components/i18n';
import DefenseBuildingPicker from '@/components/DefenseBuildingPicker';
import { BulkDueDateModal, NewProjectModal } from '@/components/modals';
import type { PrerequisiteSpec } from '@/components/Prerequisites';
import { AdministrativeCoordinatorDashboardStyles, AdministrativeCoordinatorModalStyles, adminPanelStyles } from '../../constants/styles';
import { PendingSignoffsWidget } from '@/components/PendingSignoffsWidget';
import CreateOwnProjectButton from '@/components/CreateOwnProjectButton';
import type { AppUser } from '@/types';
import ChatbotFab from '@/components/ChatbotFab';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProjectGroup {
  id:              string;
  projectTitle:    string;
  supervisorId:    string | null;
  supervisorName:  string;
  facultyId:       string;
  trackType:       'bachelor_project' | 'masters_project';
  members:         Array<{ uid: string; name: string; email: string; phoneNumber: string | null }>;
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

// ─── Students Report tab ────────────────────────────────────────────────────
// Full roster of every student in the coordinator's assigned degree(s) —
// unlike the group cards above (enrolled students only), this includes
// students who haven't enrolled in a project yet. See
// server/src/controllers/projectCoordinatorController.ts's getStudentsReport.
type StudentStatus = 'not_in_project' | 'applied' | 'in_project' | 'awaiting_defense' | 'finished';

interface StudentReportRow {
  id: string;
  name: string;
  status: StudentStatus;
  appliedProjects: Array<{ titleHe: string; titleEn: string }>;
  projectTitleHe: string | null;
  projectTitleEn: string | null;
  supervisorName: string | null;
  milestoneNameHe: string | null;
  milestoneNameEn: string | null;
  days: number | null;
}

const STUDENT_STATUS_LABEL: Record<StudentStatus, { he: string; en: string }> = {
  not_in_project:   { he: 'לא נמצא בפרויקט/תזה',  en: 'Not in a project/thesis' },
  applied:          { he: 'הגיש בקשה ל־',          en: 'Submitted application to' },
  in_project:       { he: 'בפרויקט/תזה',           en: 'In project/thesis' },
  awaiting_defense: { he: 'ממתין לבחינת הגנה',      en: 'Awaiting defense exam' },
  finished:         { he: 'סיים',                  en: 'Finished' },
};

const STUDENT_STATUS_COLOR: Record<StudentStatus, string> = {
  not_in_project:   '#8899BB',
  applied:          '#F59E0B',
  in_project:       '#3E6C8C',
  awaiting_defense: '#7C3AED',
  finished:         '#10B981',
};

function studentStatusText(row: StudentReportRow, lang: Lang): string {
  const base = STUDENT_STATUS_LABEL[row.status][lang];
  if (row.status === 'applied' && row.appliedProjects.length > 0) {
    const names = row.appliedProjects.map((p) => (lang === 'he' ? p.titleHe : p.titleEn) || '—').join(', ');
    return `${base} ${names}`;
  }
  return base;
}

// ─── Grade Overrides tab ────────────────────────────────────────────────────
// The coordinator's half of the three-rubric final-grade override workflow
// (see workflowTemplates.ts's finalGradeComponents) — a supervisor proposed
// changing a defense milestone's auto-calculated grade with a mandatory
// reason (supervisorController.ts's decideFinalGrade); she either approves
// the change or keeps the automatic grade (gradSchoolHeadController.ts's
// decideGradeOverride). Mirrors
// web/app/administrative_coordinator/dashboard/GradeOverridesTab.tsx.
interface GradeOverrideRow {
  milestoneId: string;
  projectId: string | null;
  projectTitleHe: string;
  projectTitleEn: string;
  studentNames: string[];
  // 'auto_confirmed' = supervisor accepted the computed grade as-is (no
  // dispute) — still routed here so the coordinator signs off on every
  // final grade, not just contested ones (see supervisorController.ts's
  // decideFinalGrade). Legacy pending rows default to 'override' server-side.
  kind: 'auto_confirmed' | 'override';
  autoCalculatedFinalGrade: number | null;
  proposedGrade: number | null;
  reason: string;
  proposedAt: string | null;
  supervisorEvaluationTotal: number | null;
  examinerProjectAvg: number | null;
  examinerDefenseAvg: number | null;
  supervisorEvaluationFileUrls: string[];
  examinerProjectFileUrls: string[];
  examinerDefenseFileUrls: string[];
  gradeOverrideFileUrls: string[];
}

function FileLinksRow({ label, urls }: { label: string; urls: string[] }) {
  if (urls.length === 0) return null;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 4 }}>
      <Text style={{ fontSize: 10, color: '#64748B' }}>{label}</Text>
      {urls.map((url, i) => (
        <Pressable
          key={i}
          onPress={() => Linking.openURL(url)}
          style={{ borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}
          accessibilityRole="link"
          accessibilityLabel={`${label} ${i + 1}`}
        >
          <Text style={{ fontSize: 11, color: '#1E293B' }}>📄 {i + 1}</Text>
        </Pressable>
      ))}
    </View>
  );
}

// ─── Send Examiner Modal ───────────────────────────────────────────────────────
// Previously wrote an examinerTokens doc directly to Firestore
// (src/firebase/createExaminerToken.ts) — that path only checks the caller's
// ROLE (Firestore rules), never her assigned degree scope, so any
// the administrative coordinator role could invite an examiner for a project outside
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
              accessibilityRole="button"
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
          accessibilityRole="button"
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

        <Pressable style={m.btnCancel} onPress={handleClose} accessibilityRole="button">
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
          accessibilityRole="button"
        >
          {saving
            ? <ActivityIndicator color="#fff" />
            : <Text style={m.btnSendText}>{lang === 'he' ? 'שמור' : 'Save'}</Text>
          }
        </Pressable>

        <Pressable style={m.btnCancel} onPress={handleClose} accessibilityRole="button">
          <Text style={m.btnCancelText}>{tx('cancel', lang)}</Text>
        </Pressable>
      </ScrollView>
    </Modal>
  );
}

// Popup shown when she taps a student's name inside a project card, so she
// can actually reach them — email/phone straight from their own user doc,
// tappable via mailto:/tel:.
interface ContactMember { name: string; email: string; phoneNumber: string | null }

function StudentContactModal({ member, lang, onClose }: { member: ContactMember | null; lang: Lang; onClose: () => void }) {
  return (
    <Modal visible={!!member} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={contactStyles.backdrop} onPress={onClose}>
        <View style={contactStyles.card}>
          <View style={contactStyles.header}>
            <Text style={contactStyles.title}>👤 {member?.name}</Text>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel={lang === 'he' ? 'סגור' : 'Close'}
            >
              <Text style={contactStyles.closeIcon}>✕</Text>
            </Pressable>
          </View>

          {member?.email ? (
            <Pressable style={contactStyles.row} onPress={() => Linking.openURL(`mailto:${member.email}`)} accessibilityRole="link">
              <Text style={contactStyles.rowText}>✉️ {member.email}</Text>
            </Pressable>
          ) : (
            <Text style={contactStyles.emptyText}>{lang === 'he' ? 'לא הוגדר אימייל' : 'No email on file'}</Text>
          )}

          {member?.phoneNumber ? (
            <Pressable style={contactStyles.row} onPress={() => Linking.openURL(`tel:${member.phoneNumber}`)} accessibilityRole="link">
              <Text style={contactStyles.rowText}>📞 {member.phoneNumber}</Text>
            </Pressable>
          ) : (
            <Text style={contactStyles.emptyText}>{lang === 'he' ? 'לא הוגדר טלפון' : 'No phone number on file'}</Text>
          )}
        </View>
      </Pressable>
    </Modal>
  );
}

const contactStyles = {
  backdrop: { flex: 1, backgroundColor: 'rgba(17,24,39,0.4)', alignItems: 'center', justifyContent: 'center', padding: 20 } as const,
  card: { width: '100%', maxWidth: 320, backgroundColor: '#fff', borderRadius: 16, padding: 18 } as const,
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 } as const,
  title: { fontSize: 16, fontWeight: '700', color: '#111' } as const,
  closeIcon: { fontSize: 16, color: '#8899BB' } as const,
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F0F4FF', borderRadius: 10, paddingVertical: 12, paddingHorizontal: 14, marginBottom: 10 } as const,
  rowText: { fontSize: 14, color: '#111', writingDirection: 'ltr' } as const,
  emptyText: { fontSize: 13, color: '#8899BB', fontStyle: 'italic', marginBottom: 10 } as const,
};

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
  // ── Project Groups tab: supervisor list → drill into that supervisor's
  // own groups, instead of one flat list of every project at once. Grouped
  // by supervisorId when present (two supervisors can share a display
  // name); falls back to a name-keyed bucket for legacy/unassigned projects
  // with no supervisorId at all.
  const [viewingSupervisorKey, setViewingSupervisorKey] = useState<string | null>(null);
  const [supervisorSearchText, setSupervisorSearchText] = useState('');
  const [examinerModalGroup, setExaminerModalGroup] = useState<ProjectGroup | null>(null);
  const [defenseModalGroup, setDefenseModalGroup] = useState<ProjectGroup | null>(null);
  const [contactMember, setContactMember] = useState<ContactMember | null>(null);
  const [showBulkDueDate, setShowBulkDueDate] = useState(false);

  // ── Students Report tab ───────────────────────────────────────────────────
  // Lets a notification's "Go to dashboard" deep-link land on a specific tab
  // (?tab=...) instead of always opening on Groups — same convention the web
  // dashboard already supports.
  type AdminCoordinatorTab = 'groups' | 'students' | 'overrides';
  const ADMIN_COORDINATOR_TABS: AdminCoordinatorTab[] = ['groups', 'students', 'overrides'];
  const { tab: tabParam } = useLocalSearchParams<{ tab?: string }>();
  const [activeTab, setActiveTab] = useState<AdminCoordinatorTab>(
    ADMIN_COORDINATOR_TABS.includes(tabParam as AdminCoordinatorTab) ? (tabParam as AdminCoordinatorTab) : 'groups'
  );
  const [studentsReport, setStudentsReport] = useState<StudentReportRow[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [studentsLoaded, setStudentsLoaded] = useState(false);
  const [studentsNoScope, setStudentsNoScope] = useState(false);
  const [reportSearchText, setReportSearchText] = useState('');
  const [reportFilterStatus, setReportFilterStatus] = useState<'all' | StudentStatus>('all');

  // ── Grade Overrides tab ───────────────────────────────────────────────────
  const [overrides, setOverrides] = useState<GradeOverrideRow[]>([]);
  const [overridesLoading, setOverridesLoading] = useState(false);
  const [overridesLoaded, setOverridesLoaded] = useState(false);
  const [overrideBusyId, setOverrideBusyId] = useState<string | null>(null);

  // ── Add Project modal state ─────────────────────────────────────────────
  // Net-new — the administrative coordinator role previously had no project-creation
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
  const [newPrerequisites, setNewPrerequisites] = useState<PrerequisiteSpec[]>([]);
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
      console.error('administrative_coordinator dashboard error:', e);
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

  const fetchStudentsReport = useCallback(async () => {
    setStudentsLoading(true);
    try {
      const res = await apiClient.get('/api/project-coordinator/students-report');
      setStudentsReport(res.data.students ?? []);
      setStudentsNoScope(!!res.data.noScopeAssigned);
    } catch (e: any) {
      console.error('students report error:', e);
      Alert.alert(
        lang === 'he' ? 'שגיאה' : 'Error',
        lang === 'he' ? 'לא ניתן לטעון נתונים' : 'Could not load data',
      );
    } finally {
      setStudentsLoading(false);
      setStudentsLoaded(true);
    }
  }, [lang]);

  // Fetched lazily, the first time the tab is opened.
  useEffect(() => {
    if (activeTab === 'students' && !studentsLoaded) fetchStudentsReport();
  }, [activeTab, studentsLoaded, fetchStudentsReport]);

  const filteredStudentsReport = studentsReport.filter((row) => {
    const q = reportSearchText.trim().toLowerCase();
    const matchesSearch = !q || row.name.toLowerCase().includes(q);
    const matchesStatus = reportFilterStatus === 'all' || row.status === reportFilterStatus;
    return matchesSearch && matchesStatus;
  });

  const fetchOverrides = useCallback(async () => {
    setOverridesLoading(true);
    try {
      const res = await apiClient.get('/api/project-coordinator/grade-overrides');
      setOverrides(res.data.overrides ?? []);
    } catch (e: any) {
      console.error('grade overrides fetch error:', e);
      Alert.alert(
        lang === 'he' ? 'שגיאה' : 'Error',
        lang === 'he' ? 'לא ניתן לטעון נתונים' : 'Could not load data',
      );
    } finally {
      setOverridesLoading(false);
      setOverridesLoaded(true);
    }
  }, [lang]);

  // Fetched lazily, the first time the tab is opened.
  useEffect(() => {
    if (activeTab === 'overrides' && !overridesLoaded) fetchOverrides();
  }, [activeTab, overridesLoaded, fetchOverrides]);

  const decideOverride = async (milestoneId: string, decision: 'approve_override' | 'keep_auto') => {
    setOverrideBusyId(milestoneId);
    try {
      await apiClient.post(`/api/grad-school-head/milestones/${milestoneId}/grade-override-decision`, { decision });
      await fetchOverrides();
    } catch (e: any) {
      Alert.alert(
        lang === 'he' ? 'שגיאה' : 'Error',
        e.response?.data?.message || (lang === 'he' ? 'הפעולה נכשלה' : 'The action failed'),
      );
    } finally {
      setOverrideBusyId(null);
    }
  };

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

  // ── Filter ─────────────────────────────────────────────────────────────────
  const supervisorKey = (g: ProjectGroup) => g.supervisorId ?? `name:${g.supervisorName}`;

  const supervisorSummaries = React.useMemo(() => {
    const map = new Map<string, { key: string; name: string; projectCount: number; overdueCount: number }>();
    (data?.groups ?? []).forEach((g) => {
      const key = supervisorKey(g);
      const existing = map.get(key);
      if (existing) {
        existing.projectCount++;
        if (g.isOverdue) existing.overdueCount++;
      } else {
        map.set(key, { key, name: g.supervisorName, projectCount: 1, overdueCount: g.isOverdue ? 1 : 0 });
      }
    });
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [data?.groups]);

  const filteredSupervisors = supervisorSummaries.filter((s) =>
    !supervisorSearchText.trim() || s.name.toLowerCase().includes(supervisorSearchText.trim().toLowerCase())
  );

  const viewingSupervisor = supervisorSummaries.find((s) => s.key === viewingSupervisorKey) ?? null;

  const filteredGroups = (data?.groups ?? [])
    .filter((g) => !viewingSupervisorKey || supervisorKey(g) === viewingSupervisorKey)
    .filter(g => {
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
          {
            key: 'project-records', icon: '📜',
            label: lang === 'he' ? 'רישומי פרויקטים' : 'Project Records',
            onPress: () => router.push({ pathname: '/administrative_coordinator/records', params: { lang } } as any),
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

      {/* Tab switcher: Project Groups / Students Report / Grade Overrides */}
      <View style={s.filterRow}>
        {(['groups', 'students', 'overrides'] as const).map((key) => (
          <Pressable
            key={key}
            style={[s.filterChip, activeTab === key && { backgroundColor: fc.primary }]}
            onPress={() => setActiveTab(key)}
            accessibilityRole="button"
          >
            <Text style={[s.filterChipText, activeTab === key && { color: '#fff' }]}>
              {key === 'groups'
                ? (lang === 'he' ? 'קבוצות פרויקט' : 'Project Groups')
                : key === 'students'
                  ? (lang === 'he' ? 'דוח סטודנטים' : 'Students Report')
                  : (lang === 'he' ? 'אישור ציונים סופיים' : 'Final Grade Approvals')}
            </Text>
          </Pressable>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={s.scroll}
        refreshControl={
          <RefreshControl
            refreshing={activeTab === 'groups' ? refreshing : activeTab === 'students' ? studentsLoading : overridesLoading}
            onRefresh={activeTab === 'groups' ? onRefresh : activeTab === 'students' ? fetchStudentsReport : fetchOverrides}
          />
        }
      >
        {/* Bulk Update Due Dates / Academic Year moved into the TopBar's ☰
            menu (extraMenuItems above) — same actions, no functionality
            dropped, just decluttered off this row. */}
        <PendingSignoffsWidget lang={lang} />

        {activeTab === 'overrides' ? (
          <View>
            {overridesLoading && !overridesLoaded ? (
              <ActivityIndicator style={{ marginTop: 24 }} />
            ) : overrides.length === 0 ? (
              <View style={s.empty}>
                <Text style={s.emptyEmoji}>✅</Text>
                <Text style={s.emptyText}>
                  {lang === 'he' ? 'אין ציונים סופיים ממתינים לאישור' : 'No final grades pending approval'}
                </Text>
              </View>
            ) : (
              overrides.map((r) => (
                <View key={r.milestoneId} style={[s.card, { borderLeftColor: '#F59E0B' }]}>
                  <Text style={s.cardTitle}>{lang === 'he' ? r.projectTitleHe : r.projectTitleEn}</Text>
                  <Text style={s.cardSub}>👤 {r.studentNames.join(', ')}</Text>

                  {(r.supervisorEvaluationTotal != null || r.examinerProjectAvg != null || r.examinerDefenseAvg != null) && (
                    <View style={s.overrideSplit}>
                      <View style={s.overrideBox}>
                        <Text style={s.overrideLabel}>{lang === 'he' ? 'מנחה' : 'Supervisor'}</Text>
                        <Text style={s.overrideBreakdownValue}>{r.supervisorEvaluationTotal ?? '—'}</Text>
                      </View>
                      <View style={s.overrideBox}>
                        <Text style={s.overrideLabel}>{lang === 'he' ? 'בוחן — עבודה' : 'Examiner — project'}</Text>
                        <Text style={s.overrideBreakdownValue}>{r.examinerProjectAvg ?? '—'}</Text>
                      </View>
                      <View style={s.overrideBox}>
                        <Text style={s.overrideLabel}>{lang === 'he' ? 'בוחן — הגנה' : 'Examiner — defense'}</Text>
                        <Text style={s.overrideBreakdownValue}>{r.examinerDefenseAvg ?? '—'}</Text>
                      </View>
                    </View>
                  )}

                  <FileLinksRow label={lang === 'he' ? '📎 מנחה:' : '📎 Supervisor:'} urls={r.supervisorEvaluationFileUrls} />
                  <FileLinksRow label={lang === 'he' ? '📎 בוחן — עבודה:' : '📎 Examiner — project:'} urls={r.examinerProjectFileUrls} />
                  <FileLinksRow label={lang === 'he' ? '📎 בוחן — הגנה:' : '📎 Examiner — defense:'} urls={r.examinerDefenseFileUrls} />
                  <FileLinksRow label={lang === 'he' ? '📎 טופס הציון הסופי:' : '📎 Final-grade form:'} urls={r.gradeOverrideFileUrls} />

                  {r.kind === 'override' ? (
                    <>
                      <View style={s.overrideSplit}>
                        <View style={s.overrideBox}>
                          <Text style={s.overrideLabel}>{lang === 'he' ? 'ציון מחושב' : 'Computed'}</Text>
                          <Text style={s.overrideValue}>{r.autoCalculatedFinalGrade ?? '—'}</Text>
                        </View>
                        <View style={[s.overrideBox, s.overrideBoxProposed]}>
                          <Text style={[s.overrideLabel, { color: '#B45309' }]}>{lang === 'he' ? 'ציון מוצע' : 'Proposed'}</Text>
                          <Text style={[s.overrideValue, { color: '#B45309' }]}>{r.proposedGrade ?? '—'}</Text>
                        </View>
                      </View>

                      <Text style={s.overrideReason}>💬 {r.reason}</Text>

                      <View style={s.overrideActionRow}>
                        <Pressable
                          style={[s.btnApproveOverride, overrideBusyId === r.milestoneId && { opacity: 0.6 }]}
                          onPress={() => decideOverride(r.milestoneId, 'approve_override')}
                          disabled={overrideBusyId === r.milestoneId}
                          accessibilityRole="button"
                        >
                          <Text style={s.btnApproveOverrideText}>{lang === 'he' ? '✓ אשר את השינוי' : '✓ Approve change'}</Text>
                        </Pressable>
                        <Pressable
                          style={[s.btnKeepAuto, overrideBusyId === r.milestoneId && { opacity: 0.6 }]}
                          onPress={() => decideOverride(r.milestoneId, 'keep_auto')}
                          disabled={overrideBusyId === r.milestoneId}
                          accessibilityRole="button"
                        >
                          <Text style={s.btnKeepAutoText}>{lang === 'he' ? 'השאר מחושב' : 'Keep computed'}</Text>
                        </Pressable>
                      </View>
                    </>
                  ) : (
                    <>
                      <View style={s.overrideBox}>
                        <Text style={s.overrideLabel}>{lang === 'he' ? 'המנחה אישר את הציון המחושב' : 'Supervisor confirmed the computed grade'}</Text>
                        <Text style={s.overrideValue}>{r.proposedGrade ?? '—'}</Text>
                      </View>

                      <View style={s.overrideActionRow}>
                        <Pressable
                          style={[s.btnApproveOverride, { flex: 1 }, overrideBusyId === r.milestoneId && { opacity: 0.6 }]}
                          onPress={() => decideOverride(r.milestoneId, 'approve_override')}
                          disabled={overrideBusyId === r.milestoneId}
                          accessibilityRole="button"
                        >
                          <Text style={s.btnApproveOverrideText}>{lang === 'he' ? '✓ אשר ציון סופי' : '✓ Approve final grade'}</Text>
                        </Pressable>
                      </View>
                    </>
                  )}
                </View>
              ))
            )}
          </View>
        ) : activeTab === 'students' ? (
          <View>
            <TextInput
              style={s.searchInput}
              value={reportSearchText}
              onChangeText={setReportSearchText}
              placeholder={lang === 'he' ? 'חיפוש לפי שם...' : 'Search by name...'}
              placeholderTextColor="#9CA3AF"
              textAlign={lang === 'he' ? 'right' : 'left'}
            />
            <View style={s.filterRow}>
              {(['all', 'not_in_project', 'applied', 'in_project', 'awaiting_defense', 'finished'] as const).map((st) => (
                <Pressable
                  key={st}
                  style={[s.filterChip, reportFilterStatus === st && { backgroundColor: fc.primary }]}
                  onPress={() => setReportFilterStatus(st)}
                  accessibilityRole="button"
                >
                  <Text style={[s.filterChipText, reportFilterStatus === st && { color: '#fff' }]}>
                    {st === 'all' ? (lang === 'he' ? 'הכל' : 'All') : STUDENT_STATUS_LABEL[st][lang]}
                  </Text>
                </Pressable>
              ))}
            </View>

            {studentsNoScope ? (
              <View style={s.empty}>
                <Text style={s.emptyText}>
                  {lang === 'he'
                    ? 'לא הוקצה לך עדיין תחום אחריות (פקולטה/תואר).'
                    : 'No degree has been assigned to your account yet.'}
                </Text>
              </View>
            ) : studentsLoading && !studentsLoaded ? (
              <ActivityIndicator style={{ marginTop: 24 }} />
            ) : filteredStudentsReport.length === 0 ? (
              <View style={s.empty}>
                <Text style={s.emptyEmoji}>📭</Text>
                <Text style={s.emptyText}>{lang === 'he' ? 'אין סטודנטים להצגה' : 'No students to show'}</Text>
              </View>
            ) : (
              filteredStudentsReport.map((row) => {
                const projectTitle = row.projectTitleHe || row.projectTitleEn ? (lang === 'he' ? row.projectTitleHe : row.projectTitleEn) : null;
                const milestoneName = row.milestoneNameHe || row.milestoneNameEn ? (lang === 'he' ? row.milestoneNameHe : row.milestoneNameEn) : null;
                const daysLabel =
                  row.days === null
                    ? '—'
                    : row.status === 'not_in_project' || row.status === 'applied'
                      ? (lang === 'he' ? `${row.days} ימים בחיפוש` : `${row.days}d searching`)
                      : `${row.days}`;
                return (
                  <Pressable
                    key={row.id}
                    style={[s.card, { borderLeftColor: fc.primary }]}
                    onPress={() => router.push(`/administrative_coordinator/students/${row.id}` as any)}
                    accessibilityRole="link"
                  >
                    <Text style={s.cardTitle}>{row.name}</Text>
                    <Text style={[s.cardSub, { color: STUDENT_STATUS_COLOR[row.status], fontWeight: '700' }]}>
                      {studentStatusText(row, lang)}
                    </Text>
                    <Text style={s.cardSub}>📁 {projectTitle ?? (lang === 'he' ? 'אין' : 'None')}</Text>
                    <Text style={s.cardSub}>👨‍🏫 {row.supervisorName ?? (lang === 'he' ? 'אין' : 'None')}</Text>
                    <Text style={s.cardSub}>📍 {milestoneName ?? (lang === 'he' ? 'אין' : 'None')}</Text>
                    <Text style={[s.cardSub, { fontWeight: '700', color: row.days !== null && row.days < 0 ? '#EF4444' : undefined }]}>
                      ⏳ {daysLabel}
                    </Text>
                  </Pressable>
                );
              })
            )}
          </View>
        ) : !viewingSupervisorKey ? (
        <>
        <CreateOwnProjectButton lang={lang} isRtl={lang === 'he'} onCreated={fetchData} />
        <TextInput
          style={s.searchInput}
          value={supervisorSearchText}
          onChangeText={setSupervisorSearchText}
          placeholder={lang === 'he' ? 'חיפוש מנחה...' : 'Search supervisor...'}
          placeholderTextColor="#9CA3AF"
          textAlign={lang === 'he' ? 'right' : 'left'}
        />

        {/* Supervisor list — click a supervisor to drill into their own
            project groups below, instead of one flat list of everyone's. */}
        {filteredSupervisors.length === 0 ? (
          <View style={s.empty}>
            <Text style={s.emptyEmoji}>📭</Text>
            <Text style={s.emptyText}>{lang === 'he' ? 'אין מנחים להצגה' : 'No supervisors to show'}</Text>
          </View>
        ) : (
          filteredSupervisors.map((sv) => (
            <Pressable
              key={sv.key}
              style={[s.card, { borderLeftColor: sv.overdueCount > 0 ? '#EF4444' : fc.primary }]}
              onPress={() => setViewingSupervisorKey(sv.key)}
              accessibilityRole="button"
            >
              <View style={s.cardHeaderRow}>
                <Text style={s.cardTitle}>👨‍🏫 {sv.name}</Text>
                {sv.overdueCount > 0 && (
                  <View style={s.overduePill}>
                    <Text style={s.overduePillText}>⚠️ {sv.overdueCount}</Text>
                  </View>
                )}
              </View>
              <Text style={s.cardSub}>
                📁 {sv.projectCount} {lang === 'he' ? 'פרויקטים/תזות' : sv.projectCount === 1 ? 'project/thesis' : 'projects/theses'}
              </Text>
            </Pressable>
          ))
        )}
        </>
        ) : (
        <>
        <Pressable style={s.filterChip} onPress={() => setViewingSupervisorKey(null)} accessibilityRole="button">
          <Text style={s.filterChipText}>{lang === 'he' ? '← חזרה למנחים' : '← Back to supervisors'}</Text>
        </Pressable>
        <Text style={[s.cardTitle, { marginTop: 10, marginBottom: 4 }]}>👨‍🏫 {viewingSupervisor?.name}</Text>

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
              accessibilityRole="button"
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
            accessibilityRole="button"
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
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' }}>
                <Text style={s.cardSub}>👥 </Text>
                {group.members.map((m, i) => (
                  <React.Fragment key={m.uid}>
                    {i > 0 && <Text style={s.cardSub}>  ·  </Text>}
                    <Pressable onPress={() => setContactMember({ name: m.name, email: m.email, phoneNumber: m.phoneNumber })} accessibilityRole="button">
                      <Text style={[s.cardSub, { textDecorationLine: 'underline' }]}>{m.name}</Text>
                    </Pressable>
                  </React.Fragment>
                ))}
              </View>

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
                  accessibilityRole="link"
                >
                  <Text style={[s.actionBtnText, { color: '#1D4ED8' }]}>
                    📁 {tx('view', lang)}
                  </Text>
                </Pressable>

                <Pressable
                  style={[s.actionBtn, { backgroundColor: '#F0FDF4' }]}
                  onPress={() => setDefenseModalGroup(group)}
                  accessibilityRole="button"
                >
                  <Text style={[s.actionBtnText, { color: '#065F46' }]}>
                    🛡 {tx('scheduleDefense', lang)}
                  </Text>
                </Pressable>

                <Pressable
                  style={[s.actionBtn, { backgroundColor: '#FFF7ED' }]}
                  onPress={() => setExaminerModalGroup(group)}
                  accessibilityRole="button"
                >
                  <Text style={[s.actionBtnText, { color: '#92400E' }]}>
                    📧 {tx('externalExaminer', lang)}
                  </Text>
                </Pressable>
              </View>
            </View>
          ))
        )}
        </>
        )}

        <View style={{ height: 60 }} />
      </ScrollView>

      <StudentContactModal member={contactMember} lang={lang} onClose={() => setContactMember(null)} />

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
        projects={(data?.groups ?? []).map((g) => ({ id: g.id, label: g.projectTitle, sublabel: g.members.map((m) => m.name).join(', ') || undefined }))}
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

      <ChatbotFab lang={lang} corner="bottom-left" />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = AdministrativeCoordinatorDashboardStyles;

// ─── Send Examiner Modal styles ───────────────────────────────────────────────
const m = AdministrativeCoordinatorModalStyles;