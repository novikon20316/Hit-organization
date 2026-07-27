// app/admin/panel.tsx
import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  TextInput,
  Alert,
  Switch,
  Modal,
} from 'react-native';
import { AppUser, SystemStats, UserRecord, ProjectRecord, MilestoneRecord, StatusOption } from '@/types';
import * as DocumentPicker from 'expo-document-picker';
import * as Clipboard from 'expo-clipboard';
import {SafeAreaView} from 'react-native-safe-area-context'
import { apiClient } from '@/src/api/apiClient';
import { pickAndImportStaff, exportUsers, ImportSummary } from '@/src/api/userImportExport';
import { pickAndImportStudentRoster, listStudentRoster, updateStudentRosterEntry, deleteStudentRosterEntry, type RosterEntry } from '@/src/api/studentRoster';
import { auth } from '../../src/firebase/firebase';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { Lang, AppRole } from '../../components/i18n';
import { CROSS_FACULTY_ROLES } from '../../firebase/roles';
import type { ScopeRule, CoordinatorScope } from '../../constants/permissions';
import { getProgramByKey } from '../../constants/faculties';
import { VALID_ROLES, isStaff } from '../../firebase/roles';
import {
  TopBar,
  StatCard,
  FacultyBadge,
  StatusBadge,
  getFacultyColor,
  getRoleAccent,
  FACULTY_COLORS,
} from '../../components/shared';
import { adminPanelStyles } from '../../constants/styles';
import {ROLE_LABELS} from '../../constants';
import {NewUserModal, AddStudentToProjectModal, MaintenanceModal, EditUserModal, NewProjectModal, ScheduleDefenseModal, BulkDueDateModal, StudentStatusesModal} from '@/components/modals';
import FloatingActionMenu from '@/components/FloatingActionMenu';

export default function PanelScreen() {
  const router = useRouter();
  const [projectFile, setProjectFile] = useState<string | null>(null);
  const [projectName, setProjectName] = useState<string | null>(null);
  const [lang, setLang] = useState<Lang>('he');
  const isRtl = lang === 'he';
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const [loading, setLoading] = useState(true);
  const [adminName, setAdminName] = useState('');
  const [showNewUser, setShowNewUser] = useState(false);
  const [exportingUsers, setExportingUsers] = useState(false);
  const [importingRoster, setImportingRoster] = useState(false);
  const [importingStaff, setImportingStaff] = useState(false);
  // Visible progress for the staff import — the FAB's own "loading" spinner
  // is inside the pill that collapses the instant it's tapped, so it was
  // never actually visible to the user during the (sometimes long, since
  // every row awaits a real email send) upload+processing. See ImportProgressOverlay.
  const [importProgress, setImportProgress] = useState<{ stage: 'uploading' | 'processing'; percent?: number } | null>(null);

  const [users, setUsers] = useState<UserRecord[]>([]);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [milestones, setMilestones] = useState<MilestoneRecord[]>([]);

  const [activeTab, setActiveTab] = useState<
    'overview' | 'users' | 'projects' | 'milestones' | 'defenseAccess' | 'feedback' | 'studentRoster'
  >('overview');

  // ── Real feedback awaiting review — one-way (see feedbackController.ts);
  //    system_admin reviews/resolves here instead of replying in-thread ──────
  const [feedbackMessages, setFeedbackMessages] = useState<any[]>([]);
  const [loadingFeedback, setLoadingFeedback] = useState(false);
  const [feedbackStatusFilter, setFeedbackStatusFilter] = useState<'open' | 'resolved'>('open');
  const [resolvingFeedbackId, setResolvingFeedbackId] = useState<string | null>(null);

  // ── Expired defense-day access grants (external examiners who missed their
  //    day-of window) — system_admin can grant a longer recovery window ────
  const [defenseGrants, setDefenseGrants] = useState<any[]>([]);
  const [loadingDefenseGrants, setLoadingDefenseGrants] = useState(false);
  const [extendGrantCode, setExtendGrantCode] = useState<string | null>(null);
  const [extendNewDate, setExtendNewDate] = useState('');
  const [extendReason, setExtendReason] = useState('');
  const [extendingGrant, setExtendingGrant] = useState(false);

  // ── Pre-registration student roster (see src/api/studentRoster.ts) — the
  //    allowlist coordinators/admin upload before students self-register;
  //    this is the first place system_admin can actually view/edit it rather
  //    than only ever writing to it via import ──────────────────────────────
  const [rosterEntries, setRosterEntries] = useState<RosterEntry[]>([]);
  const [loadingRoster, setLoadingRoster] = useState(false);
  const [rosterError, setRosterError] = useState('');
  const [rosterSearch, setRosterSearch] = useState('');
  const [rosterFacultyFilter, setRosterFacultyFilter] = useState('all');
  const [rosterDegreeFilter, setRosterDegreeFilter] = useState<'all' | 'bachelors' | 'masters'>('all');
  const [rosterUsedFilter, setRosterUsedFilter] = useState<'all' | 'used' | 'unused'>('all');
  const [editingRosterId, setEditingRosterId] = useState<string | null>(null);
  const [editRosterFullName, setEditRosterFullName] = useState('');
  const [editRosterMajor, setEditRosterMajor] = useState('');
  const [savingRosterId, setSavingRosterId] = useState<string | null>(null);
  const [confirmDeleteRosterId, setConfirmDeleteRosterId] = useState<string | null>(null);

  const [userSearch, setUserSearch] = useState('');
  const [projectFilter, setProjectFilter] = useState('all');
  const [facultyFilter, setFacultyFilter] = useState('all');
  const [userStaffFilter, setUserStaffFilter] = useState<'all' | 'staff' | 'student'>('all');
  const [userRoleFilter, setUserRoleFilter] = useState<'all' | AppRole>('all');

  const [userModal, setUserModal] = useState(false);
  const [editUser, setEditUser] = useState<UserRecord | null>(null);
  const [editRole, setEditRole] = useState('');
  const [editRoles, setEditRoles] = useState<string[]>([]);
  const [editFaculty, setEditFaculty] = useState('');
  // Granular permissions — UI only for now, not yet sent to the server
  // (see constants/permissions.ts and PermissionsEditorModal).
  const [editPermissionRules, setEditPermissionRules] = useState<ScopeRule[]>([]);
  // Coordinator's own operational scope — UI only for now, see
  // constants/permissions.ts and CoordinatorScopesModal.
  const [editCoordinatorScopes, setEditCoordinatorScopes] = useState<CoordinatorScope[]>([]);
  // Majors restriction (supervisor / secondary_supervisor only) — unlike the
  // two above, this one IS persisted server-side (see updateUserRoleAdmin).
  const [editAssignedMajors, setEditAssignedMajors] = useState<string[]>([]);
  // Student Primary/Secondary status — independent axes, persisted via a
  // separate endpoint (see handleSaveUser). null = "— none —".
  const [editPrimaryStatus, setEditPrimaryStatus] = useState<string | null>(null);
  const [editSecondaryStatus, setEditSecondaryStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // ── New user modal state ───────────────────────────────────────────────────
  const [newUserName,    setNewUserName]    = useState('');
  const [newUserEmail,   setNewUserEmail]   = useState('');
  const [newUserRole,    setNewUserRole]    = useState('student');
  const [newUserFaculty, setNewUserFaculty] = useState('');
  const [creatingUser,   setCreatingUser]   = useState(false);
  const [newUserPhone,      setNewUserPhone]      = useState('');
  const [newUserDegree,     setNewUserDegree]     = useState<'bachelors' | 'masters' | ''>('');
  const [newUserYear,       setNewUserYear]       = useState('1');
  const [newUserMajor,      setNewUserMajor]      = useState('');
  const [newUserStudentId,  setNewUserStudentId]  = useState('');
  const [newUserTempPassword, setNewUserTempPassword] = useState('');
  // Optional majors restriction for supervisor/secondary_supervisor roles —
  // empty = unrestricted (all majors in the faculty). See
  // constants/permissions.ts's majorsForFaculty.
  const [newUserAssignedMajors, setNewUserAssignedMajors] = useState<string[]>([]);
// -----------------------------------------------------------------------------
  const [maintenanceModal, setMaintenanceModal] = useState(false);
  const [studentStatusesModal, setStudentStatusesModal] = useState(false);
  // Resolved once per screen load (not per user row) — used to render each
  // student row's status badge and to know which keys are currently valid.
  // See server/src/services/studentStatuses.ts.
  const [studentStatusOptions, setStudentStatusOptions] = useState<{ primary: StatusOption[]; secondary: StatusOption[] }>({ primary: [], secondary: [] });
  const [academicCalendarModal, setAcademicCalendarModal] = useState(false);
  const [academicCalendarLoading, setAcademicCalendarLoading] = useState(false);
  const [fallMonth, setFallMonth]     = useState('11');
  const [fallDay, setFallDay]         = useState('1');
  const [springMonth, setSpringMonth] = useState('3');
  const [springDay, setSpringDay]     = useState('1');
  const [maintenanceTitle, setMaintenanceTitle] = useState('');
  const [warnDays, setWarnDays]       = useState(0);
  const [warnHours, setWarnHours]     = useState(2);
  const [warnMinutes, setWarnMinutes] = useState(0);

  const [durDays, setDurDays]         = useState(0);
  const [durHours, setDurHours]       = useState(4);
  const [durMinutes, setDurMinutes]   = useState(0);
  const [blockedRoles, setBlockedRoles] = useState<string[]>([]);
  const [broadcastEnabled, setBroadcastEnabled] = useState(true);
  // Mobile's own live maintenance status — fetched whenever the modal opens
  // so the "End now" button there can end it early without switching to
  // the web admin panel.
  const [maintenanceStatus, setMaintenanceStatus] = useState<{ isActive: boolean; title: string; endsAt: string | null } | null>(null);
  const [deactivatingMaintenance, setDeactivatingMaintenance] = useState(false);
  // ── New project modal state ───────────────────────────────────────────────
  const [newProjectFaculty, setNewProjectFaculty] = useState('');
  const [showNewProject, setShowNewProject] = useState(false);
  const [newTitleHe,  setNewTitleHe]  = useState('');
  const [newTitleEn,  setNewTitleEn]  = useState('');
  const [newDescHe,   setNewDescHe]   = useState('');
  const [newDescEn,   setNewDescEn]   = useState('');
  const [newDegree,   setNewDegree]   = useState<'bachelors' | 'masters'>('bachelors');
  const [newType,     setNewType]     = useState<'project' | 'thesis'>('project');
  const [newSkills,   setNewSkills]   = useState('');
  const [newPrerequisites, setNewPrerequisites] = useState('');
  const [creating,    setCreating]    = useState(false);
  const [allSupervisors, setAllSupervisors] = useState<AppUser[]>([]);
  const [selectedSupervisor, setSelectedSupervisor] = useState<AppUser | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [maxStudents, setMaxStudents] = useState<number>(1);
  const [selectedProgram, setSelectedProgram] = React.useState<string | null>(null);
  // ── Add student to project state ──────────────────────────────────────────────
  const [addStudentModal, setAddStudentModal] = useState(false);
  const [addStudentProject, setAddStudentProject] = useState<ProjectRecord | null>(null);
  const [studentSearch, setStudentSearch] = useState('');
  const [addingStudent, setAddingStudent] = useState(false);
  // ── Schedule defense state ─────────────────────────────────────────────────────
  const [defenseProject, setDefenseProject] = useState<ProjectRecord | null>(null);
  const [schedulingDefense, setSchedulingDefense] = useState(false);
  const [showBulkDueDate, setShowBulkDueDate] = useState(false);
  //-----------------------------------------------------------------------------------
  const unsubUsersRef      = useRef<(() => void) | null>(null);
  const unsubProjectsRef   = useRef<(() => void) | null>(null);
  const unsubMilestonesRef = useRef<(() => void) | null>(null);
  const unsubNotifsRef     = useRef<(() => void) | null>(null);
  const uid = auth.currentUser?.uid;

  const activeProjectIds = useMemo(() => {
    return new Set(projects.map((p) => p.id));
  }, [projects]);

  // ── 1. Unified Core Dashboard Synchronization ────────────────────────
  
  const fetchAllDashboardData = async () => {
    try {
      if (!auth.currentUser) return;
      setLoading(true);

      // 🚀 Replaced separate snapshots with clean relational endpoints
      const [adminProfile, dataMatrix] = await Promise.all([
        apiClient.get('/api/users/profile'),
        apiClient.get('/api/admin/dashboard-summary') // Expected response payload format: { users: [], projects: [], milestones: [], unreadCount: 0 }
      ]);

      setAdminName(adminProfile.data?.displayName || 'Admin');
      if (adminProfile.data?.language) setLang(adminProfile.data.language);

      setUsers(dataMatrix.data.users || []);
      setProjects(dataMatrix.data.projects || []);
      setMilestones(dataMatrix.data.milestones || []);
    } catch (err) {
      console.error("Critical Admin Matrix Sync Fault:", err);
      Alert.alert(
        lang === 'he' ? 'שגיאה' : 'Error',
        lang === 'he' ? 'טעינת לוח הבקרה נכשלה.' : 'Failed to load the dashboard.',
        [
          { text: lang === 'he' ? 'ביטול' : 'Cancel', style: 'cancel' },
          { text: lang === 'he' ? 'נסה שוב' : 'Retry', onPress: () => fetchAllDashboardData() },
        ],
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllDashboardData();
  }, []);

  // Student status option lists — fetched once at screen load, not per row
  // (see server/src/controllers/studentStatusController.ts's GET, open to
  // any authenticated user).
  useEffect(() => {
    apiClient.get('/api/student-statuses')
      .then((res) => setStudentStatusOptions({ primary: res.data?.primary ?? [], secondary: res.data?.secondary ?? [] }))
      .catch((err) => console.error('Failed to load student status options:', err));
  }, []);

  const resolveStatusLabel = (key: string | null | undefined, list: StatusOption[]): string | null => {
    if (!key) return null;
    const found = list.find((o) => o.key === key);
    return found ? (lang === 'he' ? found.labelHe : found.labelEn) : null;
  };

  useEffect(() => {
    const fetchProjectMilestones = async () => {
      try {
        console.log("📍 Loading milestones for Project ID:", projectId);

        if (!projectId) {
          console.warn("⚠️ No projectId found in search params");
          return;
        }

        // 2. Call your existing list endpoint passing the parameter filter
        const responseData = await apiClient.get('/api/admin/milestones',{ 
          params: { projectId } 
        });
        const milestones = responseData.data;
        // Update your state here (e.g., setMilestones(responseData))
        
      } catch (error) {
        console.error("❌ Error fetching milestones:", error);
      }
    };

    fetchProjectMilestones();
  }, [projectId]);

  // ── 2. Supervisor Picker Sync ────────────────────────────────────────
  useEffect(() => {
    const fetchSupervisors = async () => {
      try {
        // 🚀 Moved query filtering constraints parameters directly to your backend service router parameters
        const response = await apiClient.get('/api/admin/supervisors', {
          params: { facultyId: newProjectFaculty }
        });
        setAllSupervisors(response.data || []);
      } catch (err) {
        console.error("Error loading panel supervisors:", err);
      }
    };
    if (showNewProject) fetchSupervisors();
  }, [newProjectFaculty, showNewProject]);

  // ── Defense-day access grants — external examiners who missed their window ──
  useEffect(() => {
    if (activeTab !== 'defenseAccess') return;
    const fetchExpiredGrants = async () => {
      try {
        setLoadingDefenseGrants(true);
        const res = await apiClient.get('/api/admin/defense-access-grants', { params: { status: 'expired' } });
        setDefenseGrants(res.data.grants || []);
      } catch (err) {
        console.error('Error loading defense access grants:', err);
      } finally {
        setLoadingDefenseGrants(false);
      }
    };
    fetchExpiredGrants();
  }, [activeTab]);

  // ── Student roster tab — debounced so typing in the search box doesn't
  //    refetch on every keystroke ──────────────────────────────────────────
  const fetchRosterEntries = async () => {
    try {
      setLoadingRoster(true);
      setRosterError('');
      const entries = await listStudentRoster({
        facultyId: rosterFacultyFilter === 'all' ? undefined : rosterFacultyFilter,
        degreeType: rosterDegreeFilter === 'all' ? undefined : rosterDegreeFilter,
        used: rosterUsedFilter === 'all' ? undefined : rosterUsedFilter === 'used',
        q: rosterSearch.trim() || undefined,
      });
      setRosterEntries(entries);
    } catch (err) {
      console.error('Error loading student roster:', err);
      setRosterError(lang === 'he' ? 'טעינת רשימת הסטודנטים נכשלה' : 'Failed to load the student roster');
    } finally {
      setLoadingRoster(false);
    }
  };

  useEffect(() => {
    if (activeTab !== 'studentRoster') return;
    const id = setTimeout(fetchRosterEntries, 300);
    return () => clearTimeout(id);
  }, [activeTab, rosterFacultyFilter, rosterDegreeFilter, rosterUsedFilter, rosterSearch]);

  const startRosterEdit = (entry: RosterEntry) => {
    setEditingRosterId(entry.id);
    setEditRosterFullName(entry.fullName ?? '');
    setEditRosterMajor(entry.major ?? '');
    setConfirmDeleteRosterId(null);
  };

  const handleSaveRosterEdit = async (entry: RosterEntry) => {
    setSavingRosterId(entry.id);
    try {
      await updateStudentRosterEntry(entry.id, { fullName: editRosterFullName.trim(), major: editRosterMajor.trim() || null });
      setEditingRosterId(null);
      await fetchRosterEntries();
    } catch (err: any) {
      Alert.alert(lang === 'he' ? 'שגיאה' : 'Error', err.response?.data?.message || err.message || 'Save failed');
    } finally {
      setSavingRosterId(null);
    }
  };

  const handleReopenRoster = async (entry: RosterEntry) => {
    setSavingRosterId(entry.id);
    try {
      await updateStudentRosterEntry(entry.id, { used: false });
      await fetchRosterEntries();
    } catch (err: any) {
      Alert.alert(lang === 'he' ? 'שגיאה' : 'Error', err.response?.data?.message || err.message || 'Action failed');
    } finally {
      setSavingRosterId(null);
    }
  };

  const handleDeleteRoster = async (entry: RosterEntry) => {
    setSavingRosterId(entry.id);
    try {
      await deleteStudentRosterEntry(entry.id);
      setConfirmDeleteRosterId(null);
      setRosterEntries((prev) => prev.filter((e) => e.id !== entry.id));
    } catch (err: any) {
      Alert.alert(lang === 'he' ? 'שגיאה' : 'Error', err.response?.data?.message || err.message || 'Delete failed');
    } finally {
      setSavingRosterId(null);
    }
  };

  // ── Feedback chat — real feedback awaiting review ────────────────────────
  useEffect(() => {
    if (activeTab !== 'feedback') return;
    const fetchFeedback = async () => {
      try {
        setLoadingFeedback(true);
        const res = await apiClient.get('/api/feedback/admin', { params: { status: feedbackStatusFilter } });
        setFeedbackMessages(res.data.messages || []);
      } catch (err) {
        console.error('Error loading feedback:', err);
      } finally {
        setLoadingFeedback(false);
      }
    };
    fetchFeedback();
  }, [activeTab, feedbackStatusFilter]);

  const handleResolveFeedback = async (id: string) => {
    try {
      setResolvingFeedbackId(id);
      await apiClient.patch(`/api/feedback/admin/${id}/resolve`);
      setFeedbackMessages((prev) => prev.filter((f) => f.id !== id));
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.message || 'Failed to resolve feedback');
    } finally {
      setResolvingFeedbackId(null);
    }
  };

  const handleExtendGrant = async () => {
    if (!extendGrantCode || !extendNewDate.trim()) return;
    const parsed = new Date(extendNewDate.trim());
    if (isNaN(parsed.getTime())) {
      Alert.alert(lang === 'he' ? 'שגיאה' : 'Error', lang === 'he' ? 'תאריך לא תקין' : 'Invalid date');
      return;
    }
    try {
      setExtendingGrant(true);
      await apiClient.post(`/api/admin/defense-access-grants/${extendGrantCode}/extend`, {
        newExpiresAtISO: parsed.toISOString(),
        reason: extendReason.trim(),
      });
      Alert.alert('✅', lang === 'he' ? 'הגישה הוארכה בהצלחה' : 'Access extended successfully');
      setExtendGrantCode(null);
      setExtendNewDate('');
      setExtendReason('');
      setDefenseGrants((prev) => prev.filter((g) => g.code !== extendGrantCode));
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.message || 'Failed to extend access');
    } finally {
      setExtendingGrant(false);
    }
  };

  const handleAddStudentToProject = async (user: UserRecord) => {
    if (!addStudentProject) return;

    // ── 1. User Confirmation Dialog (Preserved Exactly) ─────────────────
    Alert.alert(
      lang === 'he' ? 'אישור הוספה' : 'Confirm Addition',
      lang === 'he'
        ? `האם להוסיף את ${user.displayName} לפרויקט "${addStudentProject.titleHe}"?`
        : `Add ${user.displayName} to project "${addStudentProject.titleEn}"?`,
      [
        { text: lang === 'he' ? 'לא' : 'No', style: 'cancel' },
        {
          text: lang === 'he' ? 'כן' : 'Yes',
          onPress: async () => {
            setAddingStudent(true);
            try {
              // ── 2. Replaced Direct Firestore updateDoc / arrayUnion ───────
              // Instead of manually pushing to enrolledStudentIds and updating 
              // hasActiveProject in a separate table, let the server handle it safely.
              await apiClient.post(`/api/admin/projects/${addStudentProject.id}/enroll-student`, {
                studentId: user.id
              });

              // ── 3. Reset UI States Following Success ──────────────────────
              setAddStudentModal(false);
              setAddStudentProject(null);
              setStudentSearch('');

              Alert.alert(
                '✅', 
                lang === 'he' 
                  ? `${user.displayName} נוסף לפרויקט בהצלחה` 
                  : `${user.displayName} added successfully`
              );
              
              // ── 4. Dynamic UI Re-hydration ──────────────────────────────
              // Re-fetches all system stats, fresh project configurations, and mapped arrays
              fetchAllDashboardData(); 

            } catch (e: any) {
              console.error('Enroll student verification error:', e);
              
              // Pull backend error messages gracefully
              const errorMsg = e.response?.data?.message || String(e);
              Alert.alert('Error', errorMsg);
            } finally {
              setAddingStudent(false);
            }
          },
        },
      ]
    );
  };

  const handleCreateUser = async () => {
    // ── 1. Client-Side Input Validations (Preserved Exactly) ─────────────
    if (!newUserName.trim()) {
      Alert.alert(
        lang === 'he' ? 'שגיאה' : 'Error',
        lang === 'he' ? 'יש למלא שם' : 'Name is required'
      );
      return;
    }
    if (!newUserEmail.trim()) {
      Alert.alert(
        lang === 'he' ? 'שגיאה' : 'Error',
        lang === 'he' ? 'יש למלא אימייל' : 'Email is required'
      );
      return;
    }
    const isCrossFaculty = CROSS_FACULTY_ROLES.includes(newUserRole as AppRole);
    if (!isCrossFaculty && !newUserFaculty) {
      Alert.alert(
        lang === 'he' ? 'שגיאה' : 'Error',
        lang === 'he' ? 'יש לבחור פקולטה' : 'Please select a faculty'
      );
      return;
    }
    // major must be one of constants/faculties.ts's canonical slugs (picked
    // via NewUserModal's program picker) — never a free-text/blank fallback,
    // since scope-matching (e.g. coordinator assignment) depends on it.
    if (newUserRole === 'student' && !newUserMajor.trim()) {
      Alert.alert(
        lang === 'he' ? 'שגיאה' : 'Error',
        lang === 'he' ? 'יש לבחור מגמה' : 'Please select a major'
      );
      return;
    }

    setCreatingUser(true);

    try {
      const isStudent = newUserRole === 'student';

      // ── 2. Send Clean Parameters to the Server ──────────────────────────
      // Let the Node.js server handle building the Firestore defaults
      // (like language: 'he', additionalRoles: [], creating the initial notification, etc.)
      const { data } = await apiClient.post<{ tempPassword: string }>('/api/admin/users/create', {
        displayName:     newUserName.trim(),
        email:           newUserEmail.trim().toLowerCase(),
        phoneNumber:     newUserPhone.trim() || null,
        role:            newUserRole,
        // Cross-faculty roles (system_admin, administrative_secretary, grad_school_head,
        // internal_examiner) are college-wide by definition — never scope them to
        // whatever faculty happened to be selected in the picker.
        facultyId:       isCrossFaculty ? 'all' : newUserFaculty,

        // Student-specific fields passed dynamically
        degreeType:  isStudent ? newUserDegree : null,
        yearOfStudy: isStudent ? (parseInt(newUserYear) || 1) : null,
        major:       isStudent ? newUserMajor.trim() : null,
        studentId:   isStudent ? (newUserStudentId.trim() || null) : null,

        // Optional majors restriction — only meaningful for supervisor /
        // secondary_supervisor roles; empty/omitted = unrestricted (all
        // majors in the faculty). Validated server-side too — see
        // adminController.ts's createAdminUser.
        assignedMajors: ['supervisor', 'secondary_supervisor'].includes(newUserRole)
          ? newUserAssignedMajors
          : undefined,

        // Left blank to let the server auto-generate one via generateTempPassword().
        tempPassword: newUserTempPassword.trim() || undefined,
      });

      // ── 3. Reset All UI Fields Following Success ───────────────────────
      setShowNewUser(false);
      setNewUserName('');
      setNewUserEmail('');
      setNewUserRole('student');
      setNewUserFaculty('');
      setNewUserPhone('');
      setNewUserDegree('bachelors');
      setNewUserYear('1');
      setNewUserMajor('');
      setNewUserStudentId('');
      setNewUserTempPassword('');
      setNewUserAssignedMajors([]);

      // The temp password is only ever shown here — the admin must capture
      // it now (or rely on the account_created email) since it's never
      // stored in plaintext anywhere after this.
      const createdTempPassword = data?.tempPassword;
      Alert.alert(
        '✅',
        (lang === 'he'
          ? `המשתמש ${newUserName} נוצר בהצלחה`
          : `User ${newUserName} created successfully`) +
          (createdTempPassword
            ? `\n\n${lang === 'he' ? 'סיסמה זמנית' : 'Temporary password'}: ${createdTempPassword}`
            : ''),
        createdTempPassword
          ? [
              {
                text: lang === 'he' ? 'העתק סיסמה' : 'Copy password',
                onPress: () => { Clipboard.setStringAsync(createdTempPassword); },
              },
              { text: lang === 'he' ? 'סגור' : 'Close', style: 'cancel' },
            ]
          : undefined
      );

      // 💡 Pro-tip: Trigger your parent state dashboard refresh function
      // here if you want the user list component to instantly show the new addition:
      fetchAllDashboardData();

    } catch (e: any) {
      console.error('Create user error:', e);
      
      // Checks if your backend custom error middleware dispatched a precise error string
      const fallbackError = e.response?.data?.message || String(e);
      Alert.alert('Error', fallbackError);
    } finally {
      setCreatingUser(false);
    }
  };

  // ── Import / export users (Excel) ───────────────────────────────────────────
  const showImportSummary = (summary: ImportSummary) => {
    const failedLines = summary.details
      .filter((d) => d.status === 'failed')
      .map((d) => `#${d.row} ${d.email || '—'}: ${d.reason}`)
      .slice(0, 10)
      .join('\n');

    Alert.alert(
      lang === 'he' ? '📥 תוצאות ייבוא' : '📥 Import Results',
      lang === 'he'
        ? `נוצרו: ${summary.created}\nדולגו: ${summary.skipped}\nנכשלו: ${summary.failed}\nמתוך ${summary.totalRows} שורות` +
          (failedLines ? `\n\n${failedLines}` : '')
        : `Created: ${summary.created}\nSkipped: ${summary.skipped}\nFailed: ${summary.failed}\nof ${summary.totalRows} rows` +
          (failedLines ? `\n\n${failedLines}` : '')
    );
  };

  const handleExportUsers = async () => {
    setExportingUsers(true);
    try {
      await exportUsers('admin');
    } catch (e: any) {
      console.error('Export users error:', e);
      Alert.alert(
        lang === 'he' ? 'שגיאה' : 'Error',
        lang === 'he' ? 'ייצוא המשתמשים נכשל' : 'Failed to export users'
      );
    } finally {
      setExportingUsers(false);
    }
  };

  const handleImportStaff = async () => {
    setImportingStaff(true);
    setImportProgress({ stage: 'uploading', percent: 0 });
    try {
      const summary = await pickAndImportStaff('admin', (stage, percent) => setImportProgress({ stage, percent }));
      if (!summary) return; // user cancelled the picker
      showImportSummary(summary);
      fetchAllDashboardData();
    } catch (e: any) {
      console.error('Import staff error:', e);
      const timedOut = e.code === 'ECONNABORTED';
      Alert.alert(
        lang === 'he' ? 'שגיאה' : 'Error',
        e.response?.data?.message
          || (timedOut
            ? (lang === 'he'
                ? 'התגובה מהשרת התעכבה — ייתכן שחלק מהמשתמשים נוצרו בכל זאת. בדוק ברשימת המשתמשים לפני ניסיון חוזר.'
                : "The server took too long to respond — some users may have been created anyway. Check the users list before retrying.")
            : (lang === 'he' ? 'ייבוא הסגל נכשל' : 'Failed to import staff'))
      );
    } finally {
      setImportingStaff(false);
      setImportProgress(null);
    }
  };

  // Uploads the pre-registration student roster (see server/src/services/
  // studentRoster.ts) — signup checks entered ID+degree against this before
  // a student account can be created.
  const handleImportStudentRoster = async () => {
    setImportingRoster(true);
    try {
      const summary = await pickAndImportStudentRoster('admin');
      if (!summary) return; // user cancelled the picker
      const failedLines = summary.details
        .filter((d) => d.status === 'failed')
        .map((d) => `#${d.row} ${d.studentId || '—'}: ${d.reason}`)
        .slice(0, 10)
        .join('\n');
      Alert.alert(
        lang === 'he' ? '🎓 תוצאות ייבוא רשימת סטודנטים' : '🎓 Student Roster Import Results',
        lang === 'he'
          ? `נוספו: ${summary.imported}\nדולגו: ${summary.skipped}\nנכשלו: ${summary.failed}\nמתוך ${summary.totalRows} שורות` +
            (failedLines ? `\n\n${failedLines}` : '')
          : `Added: ${summary.imported}\nSkipped: ${summary.skipped}\nFailed: ${summary.failed}\nof ${summary.totalRows} rows` +
            (failedLines ? `\n\n${failedLines}` : '')
      );
      if (activeTab === 'studentRoster') fetchRosterEntries();
    } catch (e: any) {
      console.error('Import student roster error:', e);
      Alert.alert(
        lang === 'he' ? 'שגיאה' : 'Error',
        e.response?.data?.message || (lang === 'he' ? 'ייבוא רשימת הסטודנטים נכשל' : 'Failed to import the student roster')
      );
    } finally {
      setImportingRoster(false);
    }
  };

  // ── Create project ─────────────────────────────────────────────────────────
  const handleCreateProject = async () => {
    if (!selectedSupervisor || !newTitleHe.trim() || !newTitleEn.trim() || !newProjectFaculty) {
      Alert.alert(lang === 'he' ? 'שגיאה' : 'Error', lang === 'he' ? 'יש למלא את כל השדות' : 'Missing required arguments');
      return;
    }
    setCreating(true);
    try {
      // 🚀 Replaced client-side addDoc write allocation loop
      await apiClient.post('/api/admin/projects', {
        supervisorId: selectedSupervisor.id,
        facultyId: newProjectFaculty,
        titleHe: newTitleHe.trim(),
        titleEn: newTitleEn.trim(),
        descriptionHe: newDescHe.trim(),
        descriptionEn: newDescEn.trim(),
        degreeType: newDegree,
        projectType: newType,
        maxStudents: maxStudents,
        requiredSkills: newSkills.split(',').map((s) => s.trim()).filter(Boolean),
        prerequisites: newPrerequisites.split(',').map((s) => s.trim()).filter(Boolean),
        // Optional single-major restriction — selectedProgram holds a
        // level-specific program *key* (e.g. "bsc_cs"), but the backend's
        // `major` field expects the canonical subject *slug* (e.g.
        // "computer_science"), so resolve through getProgramByKey. Omitted
        // = open to every major in the faculty (today's default).
        major: selectedProgram ? getProgramByKey(selectedProgram)?.slug : undefined,
      });

      setShowNewProject(false);
      setNewTitleHe(''); setNewTitleEn('');
      setNewDescHe(''); setNewDescEn('');
      setNewPrerequisites('');
      setNewSkills('');
      setSelectedProgram(null);

      Alert.alert('✅', lang === 'he' ? 'הפרויקט פורסם בהצלחה!' : 'Project published successfully!');
      fetchAllDashboardData();
    } catch (e) {
      console.error(e);
    } finally {
      setCreating(false);
    }
  };

  const deleteProject = async (projectId: string) => {
    Alert.alert('Delete Project', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            // 🚀 Replaced direct updateDoc mutation flag
            await apiClient.delete(`/api/admin/projects/${projectId}`);
            fetchAllDashboardData();
          } catch (e) {
            console.log(e);
          }
        },
      },
    ]);
  };

  const handleScheduleDefense = async (fields: { time: string; room: string; building: string }) => {
    if (!defenseProject) return;
    if (!fields.time || !fields.room || !fields.building) {
      Alert.alert(
        lang === 'he' ? 'שגיאה' : 'Error',
        lang === 'he' ? 'יש למלא שעה, חדר ובניין' : 'Time, room, and building are all required',
      );
      return;
    }
    try {
      setSchedulingDefense(true);
      await apiClient.post(`/api/admin/projects/${defenseProject.id}/assign-defense`, fields);
      Alert.alert('✅', lang === 'he' ? 'פרטי ההגנה נשמרו בהצלחה' : 'Defense logistics saved successfully');
      setDefenseProject(null);
      fetchAllDashboardData();
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.message || 'Failed to save defense logistics');
    } finally {
      setSchedulingDefense(false);
    }
  };

  const stats: SystemStats = useMemo(() => {
    return {
      totalUsers: users.length,
      totalProjects: projects.length,
      activeProjects: projects.filter((p) => p.status === 'in_progress').length,
      totalMilestones: milestones.length,
      pendingMilestones: milestones.filter((m) => m.status === 'submitted').length,
      totalApplications: 0,
    };
  }, [users, projects, milestones]);

  // Raw milestone docs don't carry the project title or student names —
  // those live on the project/user documents, so join them in here rather
  // than reading fields that never exist on the milestone itself.
  const projectsById = useMemo(() => {
    const map: Record<string, ProjectRecord> = {};
    projects.forEach((p) => { map[p.id] = p; });
    return map;
  }, [projects]);

  const userNamesById = useMemo(() => {
    const map: Record<string, string> = {};
    users.forEach((u) => { map[u.id] = u.displayName; });
    return map;
  }, [users]);

  const groupedMilestones = useMemo(() => Object.values(
    milestones.reduce((acc: any, milestone) => {
      const key = milestone.projectId;
      if (!acc[key]) {
        const project = projectsById[key];
        const studentNames = (project?.enrolledStudentIds ?? [])
          .map((sid: string) => userNamesById[sid] ?? sid);
        acc[key] = {
          projectId: milestone.projectId,
          projectTitleHe: project?.titleHe ?? milestone.projectTitleHe ?? '',
          projectTitleEn: project?.titleEn ?? milestone.projectTitleEn ?? '',
          facultyId: project?.facultyId ?? milestone.facultyId ?? '',
          studentNames,
          milestones: [],
        };
      }
      acc[key].milestones.push(milestone);
      return acc;
    }, {})
  ), [milestones, projectsById, userNamesById]);

  const filteredUsers = users.filter((u) => {
    const q = userSearch.toLowerCase();
    const searchOk =
      !q ||
      u.displayName?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q) ||
      u.role?.toLowerCase().includes(q);
    const staffOk =
      userStaffFilter === 'all' || (userStaffFilter === 'staff' ? isStaff(u.role as AppRole) : u.role === 'student');
    const roleOk = userRoleFilter === 'all' || u.role === userRoleFilter || (u.roles ?? []).includes(userRoleFilter);
    return searchOk && staffOk && roleOk;
  });

  const filteredProjects = projects.filter((p) => {
    const statusOk = projectFilter === 'all' || p.status === projectFilter;
    const facultyOk = facultyFilter === 'all' || p.facultyId === facultyFilter;
    return statusOk && facultyOk;
  });

  const openEditUser = (user: UserRecord) => {
    setEditUser(user);
    setEditRole(user.role);
    setEditRoles(user.roles?.length ? user.roles : [user.role]); // ← ADD
    setEditFaculty(user.facultyId);
    // Persisted server-side via role-update's permissionRules/
    // coordinatorScopes fields — see constants/permissions.ts.
    setEditPermissionRules(user.permissionRules ?? []);
    setEditCoordinatorScopes(user.coordinatorScopes ?? []);
    // Unlike the two above, assignedMajors IS persisted server-side, so it
    // loads from the actual user doc (see UserRecord.assignedMajors).
    setEditAssignedMajors(user.assignedMajors ?? []);
    // Student-only, independent of role/faculty — loads from the actual
    // user doc, same as assignedMajors above.
    setEditPrimaryStatus(user.primaryStatus ?? null);
    setEditSecondaryStatus(user.secondaryStatus ?? null);
    setUserModal(true);
  };

  const handleSaveUser = async () => {
    if (!editUser) return;
    try {
      setSaving(true);
      await apiClient.post(`/api/admin/users/${editUser.id}/role-update`, {
        role:      editRole,
        roles:     editRoles,
        facultyId: editFaculty,
        // Only meaningfully persisted server-side when role is supervisor /
        // secondary_supervisor (see updateUserRoleAdmin) — sent unconditionally
        // here since the server already gates on role.
        assignedMajors: editAssignedMajors,
        permissionRules: editPermissionRules,
        coordinatorScopes: (editRole === 'coordinator' || editRoles.includes('coordinator')) ? editCoordinatorScopes : undefined,
      });

      // Student status is a separate axis from role/faculty, set through its
      // own endpoint — only meaningful (and only sent) when the user being
      // saved is (still) a student. See studentStatusController.setStudentStatus.
      if (editRole === 'student' || editRoles.includes('student')) {
        await apiClient.post(`/api/admin/users/${editUser.id}/status`, {
          primaryStatus:   editPrimaryStatus,
          secondaryStatus: editSecondaryStatus,
        });
      }

      Alert.alert('Success', lang === 'he' ? 'המשתמש עודכן בהצלחה' : 'User updated successfully');
      setUserModal(false);
      fetchAllDashboardData();
    } catch (e) {
      console.log(e);
    } finally {
      setSaving(false);
    }
  };

  const toggleUserActive = async (userId: string, current: boolean) => {
    try {
      // 🚀 Replaced direct updateDoc boolean payload toggle
      await apiClient.post(`/api/admin/users/${userId}/toggle-status`, {
        isActive: !current
      });
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, isActive: !current } : u));
    } catch (e) {
      console.error(e);
    }
  };

  const eraseUser = (userId: string, userName: string) => {
    Alert.alert(
      lang === 'he' ? 'מחיקת משתמש לצמיתות' : 'Permanently erase user',
      lang === 'he'
        ? `פעולה זו תמחק את ${userName} ואת כל הנתונים שלו לצמיתות. לא ניתן לבטל. להמשיך?`
        : `This will permanently delete ${userName} and all their data. This cannot be undone. Continue?`,
      [
        { text: lang === 'he' ? 'ביטול' : 'Cancel', style: 'cancel' },
        {
          text: lang === 'he' ? 'מחק לצמיתות' : 'Erase permanently',
          style: 'destructive',
          onPress: async () => {
            try {
              await apiClient.post(`/api/admin/users/${userId}/erase`);
              setUsers(prev => prev.filter(u => u.id !== userId));
              Alert.alert('✅', lang === 'he' ? 'המשתמש נמחק' : 'User erased');
            } catch (e: any) {
              Alert.alert(
                lang === 'he' ? 'שגיאה' : 'Error',
                e.response?.data?.message || (lang === 'he' ? 'מחיקת המשתמש נכשלה' : 'Failed to erase user'),
              );
            }
          },
        },
      ],
    );
  };

  const saveMaintenance = async () => {
    try {
      const warnMs =
        warnDays * 86_400_000 + warnHours * 3_600_000 + warnMinutes * 60_000;
      const durMs =
        durDays  * 86_400_000 + durHours  * 3_600_000 + durMinutes  * 60_000;

    await apiClient.post('/api/admin/system/maintenance', {
      // Mobile only ever manages its own maintenance flag from here — web
      // and mobile are independent now (see server/src/services/maintenanceStatus.ts),
      // and the dual-platform control panel lives in the web admin panel.
      platform:          'mobile',
      title: maintenanceTitle.trim() || 'Scheduled Maintenance',
      shutdownAt:        Date.now() + warnMs,   // when the app shuts down
      maintenanceDurMs:  durMs,                 // how long it stays down
      broadcastEnabled,
    });

      Alert.alert('Success', lang === 'he' ? 'מצב תחזוקה הופעל' : 'Maintenance mode activated');
      setMaintenanceModal(false);
    } catch (e) {
      console.log(e);
    }
  };

  const fetchMaintenanceStatus = async () => {
    try {
      const res = await apiClient.get('/api/system/maintenance-status', { params: { platform: 'mobile' } });
      setMaintenanceStatus(res.data);
    } catch (e) {
      console.log(e);
      setMaintenanceStatus(null);
    }
  };

  const deactivateMaintenance = async () => {
    setDeactivatingMaintenance(true);
    try {
      await apiClient.delete('/api/admin/system/maintenance', { data: { platform: 'mobile' } });
      await fetchMaintenanceStatus();
      Alert.alert('✅', lang === 'he' ? 'מצב התחזוקה בוטל' : 'Maintenance mode ended');
    } catch (e) {
      console.log(e);
      Alert.alert('Error', lang === 'he' ? 'ביטול מצב התחזוקה נכשל' : 'Failed to end maintenance mode');
    } finally {
      setDeactivatingMaintenance(false);
    }
  };

  const openAcademicCalendar = async () => {
    setAcademicCalendarModal(true);
    setAcademicCalendarLoading(true);
    try {
      const res = await apiClient.get('/api/admin/academic-calendar');
      setFallMonth(String(res.data.fallSemesterStartMonth));
      setFallDay(String(res.data.fallSemesterStartDay));
      setSpringMonth(String(res.data.springSemesterStartMonth));
      setSpringDay(String(res.data.springSemesterStartDay));
    } catch (e) {
      Alert.alert('Error', lang === 'he' ? 'טעינת לוח השנה נכשלה' : 'Failed to load the academic calendar');
    } finally {
      setAcademicCalendarLoading(false);
    }
  };

  const saveAcademicCalendar = async () => {
    try {
      setAcademicCalendarLoading(true);
      await apiClient.put('/api/admin/academic-calendar', {
        fallSemesterStartMonth: Number(fallMonth),
        fallSemesterStartDay: Number(fallDay),
        springSemesterStartMonth: Number(springMonth),
        springSemesterStartDay: Number(springDay),
      });
      Alert.alert('✅', lang === 'he' ? 'לוח השנה עודכן' : 'Academic calendar updated');
      setAcademicCalendarModal(false);
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.message || (lang === 'he' ? 'עדכון לוח השנה נכשל' : 'Failed to update the academic calendar'));
    } finally {
      setAcademicCalendarLoading(false);
    }
  };

  const pickFile = async (isNew: boolean) => {
    const result = await DocumentPicker.getDocumentAsync({ type: 'application/pdf' });
    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];
    if(isNew){
      setProjectFile(asset.uri);
      setProjectName(asset.name);  
    } else{
  
    }  
  };

  if (loading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color="#EF4444" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <TopBar
        name={adminName}
        role="system_admin"
        lang={lang}
        isRtl={isRtl}
        onToggleLang={() => setLang(lang === 'he' ? 'en' : 'he')}
        onMaintenance={() => { setMaintenanceModal(true); fetchMaintenanceStatus(); }}
        extraMenuItems={[
          {
            key: 'manage-files', icon: '📎',
            label: lang === 'he' ? 'ניהול מסמכים לסטודנטים' : 'Manage Student Info Files',
            onPress: () => router.push('/Info-files' as any),
          },
          {
            key: 'manage-year', icon: '🎓',
            label: lang === 'he' ? 'ניהול שנת לימודים' : 'Academic Year Management',
            onPress: () => router.push('/AcademicYearManager' as any),
          },
          {
            key: 'bulk-permissions', icon: '🛡️',
            label: lang === 'he' ? 'הרשאות מרוכזות לפי תפקיד' : 'Bulk Permissions by Role',
            onPress: () => router.push('/BulkPermissionsManager' as any),
          },
        ]}
        onBeforeSignOut={() => {
          unsubUsersRef.current?.();
          unsubProjectsRef.current?.();
          unsubMilestonesRef.current?.();
          unsubNotifsRef.current?.();
        }}
      />

      <View style={styles.hero}>
        <Text style={[styles.heroTitle, isRtl && styles.textRight]}>
          🚀 {lang === 'he' ? 'פאנל ניהול מערכת' : 'System Control Panel'}
        </Text>

        <Text style={[styles.heroSub, isRtl && styles.textRight]}>
          {lang === 'he'
            ? 'ניהול משתמשים, פרויקטים ואבני דרך במקום אחד'
            : 'Manage users, projects and milestones in one place'}
        </Text>
      </View>

      {/* Explicit height — without it, this horizontal ScrollView's own frame
          can measure much taller than its visible pills on Android when it
          sits directly next to another scrollable sibling (the main content
          ScrollView below) with nothing fixed-height in between. The result:
          a big blank area below the pills that's still part of this
          ScrollView's own hit-test region (drag it and the pills scroll),
          painted with tabsContainer's own white background. Height = tab
          height (46) + tabsContainer's paddingVertical (10) * 2. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ height: 66 }}
        contentContainerStyle={styles.tabsContainer}
      >
        {[
          {
            key: 'overview',
            label: lang === 'he' ? 'סקירה' : 'Overview',
          },
          {
            key: 'users',
            label: lang === 'he' ? 'משתמשים' : 'Users',
          },
          {
            key: 'projects',
            label: lang === 'he' ? 'פרויקטים' : 'Projects',
          },
          {
            key: 'milestones',
            label: lang === 'he' ? 'אבני דרך' : 'Milestones',
          },
          {
            key: 'defenseAccess',
            label: lang === 'he' ? 'גישת הגנה' : 'Defense Access',
          },
          {
            key: 'feedback',
            label: lang === 'he' ? 'משוב' : 'Feedback',
          },
          {
            key: 'studentRoster',
            label: lang === 'he' ? 'רשימת סטודנטים' : 'Student Roster',
          },
        ].map((tab) => (
          <Pressable
            key={tab.key}
            style={[
              styles.tab,
              activeTab === tab.key && styles.tabActive,
            ]}
            onPress={() => setActiveTab(tab.key as any)}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === tab.key && styles.tabTextActive,
              ]}
              numberOfLines={1}
            >
              {tab.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {activeTab === 'users' && (
        <>
          <View style={styles.searchBox}>
            <TextInput
              placeholder={
                lang === 'he' ? 'חפש משתמש...' : 'Search user...'
              }
              value={userSearch}
              onChangeText={setUserSearch}
              style={styles.searchInput}
            />
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.userFilterRow}
            contentContainerStyle={styles.userFilterRowContent}
          >
            {(
              [
                { key: 'all', label: lang === 'he' ? 'הכל' : 'All' },
                { key: 'staff', label: lang === 'he' ? 'צוות' : 'Staff' },
                { key: 'student', label: lang === 'he' ? 'סטודנטים' : 'Students' },
              ] as const
            ).map((opt) => (
              <Pressable
                key={opt.key}
                style={[styles.userFilterChip, userStaffFilter === opt.key && styles.userFilterChipActive]}
                onPress={() => setUserStaffFilter(opt.key)}
              >
                <Text style={[styles.userFilterChipText, userStaffFilter === opt.key && styles.userFilterChipTextActive]}>
                  {opt.label}
                </Text>
              </Pressable>
            ))}
            <View style={styles.userFilterDivider} />
            <Pressable
              style={[styles.userFilterChip, userRoleFilter === 'all' && styles.userFilterChipActive]}
              onPress={() => setUserRoleFilter('all')}
            >
              <Text style={[styles.userFilterChipText, userRoleFilter === 'all' && styles.userFilterChipTextActive]}>
                {lang === 'he' ? 'כל התפקידים' : 'All roles'}
              </Text>
            </Pressable>
            {VALID_ROLES.map((r) => (
              <Pressable
                key={r}
                style={[styles.userFilterChip, userRoleFilter === r && styles.userFilterChipActive]}
                onPress={() => setUserRoleFilter(r)}
              >
                <Text style={[styles.userFilterChipText, userRoleFilter === r && styles.userFilterChipTextActive]}>
                  {ROLE_LABELS[r]?.[lang] ?? r}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </>
      )}

      <ScrollView
        style={styles.contentScroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {activeTab === 'overview' && (
          <>
            <View style={styles.statsGrid}>
              <StatCard
                emoji="👥"
                value={stats.totalUsers}
                label={lang === 'he' ? 'משתמשים' : 'Users'}
                color="#EF4444"
              />

              <StatCard
                emoji="📁"
                value={stats.totalProjects}
                label={lang === 'he' ? 'פרויקטים' : 'Projects'}
                color="#3B82F6"
              />

              <StatCard
                emoji="🔥"
                value={stats.activeProjects}
                label={lang === 'he' ? 'פעילים' : 'Active'}
                color="#F59E0B"
              />

              <StatCard
                emoji="⏳"
                value={stats.pendingMilestones}
                label={lang === 'he' ? 'ממתינים' : 'Pending'}
                color="#8B5CF6"
              />
            </View>

            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>
                🎨 {lang === 'he'
                  ? 'פרויקטים לפי פקולטה'
                  : 'Projects by Faculty'}
              </Text>

              {Object.entries(FACULTY_COLORS)
                .filter(([k]) => k !== 'default')
                .map(([id, fc]) => {
                  const count = projects.filter(
                    (p) => p.facultyId === id
                  ).length;

                  if (!count) return null;

                  return (
                    <View key={id} style={styles.facultyRow}>
                      <View
                        style={[
                          styles.facultyDot,
                          { backgroundColor: fc.primary },
                        ]}
                      />

                      <Text style={styles.facultyText}>
                        {fc.label[lang]}
                      </Text>

                      <View style={styles.facultyBar}>
                        <View
                          style={[
                            styles.facultyFill,
                            {
                              width: `${(count / projects.length) * 100}%`,
                              backgroundColor: fc.primary,
                            },
                          ]}
                        />
                      </View>

                      <Text style={styles.facultyCount}>{count}</Text>
                    </View>
                  );
                })}
            </View>
            {/* Manage Student Info Files / Academic Year Management / Bulk
                Permissions by Role moved into the TopBar's ☰ menu
                (extraMenuItems above) — same routes, no functionality
                dropped, just decluttered off this tab. */}
          </>
        )}

        {activeTab === 'users' && (
          <>
            {filteredUsers.map((u) => {
              const fc = getFacultyColor(u.facultyId);
              const rc = getRoleAccent(u.role);

              return (
                <View key={u.id} style={styles.userCard}>
                  <View style={styles.userTop}>
                    <View
                      style={[
                        styles.avatar,
                        { backgroundColor: fc.primary },
                      ]}
                    >
                      <Text style={styles.avatarText}>
                        {u.displayName.charAt(0).toUpperCase()}
                      </Text>
                    </View>

                    <View style={{ flex: 1 }}>
                      <Text style={styles.userName}>
                        {u.displayName}
                      </Text>

                      <Text style={styles.userEmail}>{u.email}</Text>
                    </View>

                    <Switch
                      value={u.isActive}
                      onValueChange={() =>
                        toggleUserActive(u.id, u.isActive)
                      }
                    />
                  </View>

                  <View style={styles.userBottom}>
                    <View style={[styles.roleBadge, { backgroundColor: rc.bg }]}>
                      <Text style={[styles.roleBadgeText, { color: rc.text }]}>
                        {ROLE_LABELS[u.role as AppRole]?.[lang] ?? u.role}
                      </Text>
                    </View>

                    {/* Student Primary/Secondary status badge — students
                        with a status set only (see server/src/services/
                        studentStatuses.ts). */}
                    {u.role === 'student' && u.primaryStatus && (
                      <View style={[styles.roleBadge, { backgroundColor: '#FDF4FF' }]}>
                        <Text style={[styles.roleBadgeText, { color: '#A21CAF' }]} numberOfLines={1}>
                          🏷️ {resolveStatusLabel(u.primaryStatus, studentStatusOptions.primary)}
                          {u.secondaryStatus ? ` · ${resolveStatusLabel(u.secondaryStatus, studentStatusOptions.secondary)}` : ''}
                        </Text>
                      </View>
                    )}

                    {/* 2FA status badge */}
                    <View style={[
                      styles.roleBadge,
                      { backgroundColor: (u as any).totp_enabled ? '#ECFDF5' : '#F1F5F9' }
                    ]}>
                      <Text style={{
                        fontSize: 11, fontWeight: '700',
                        color: (u as any).totp_enabled ? '#10B981' : '#94A3B8'
                      }}>
                        {(u as any).totp_enabled
                          ? (lang === 'he' ? '🔐 2FA פעיל' : '🔐 2FA On')
                          : (lang === 'he' ? '🔓 2FA כבוי' : '🔓 2FA Off')}
                      </Text>
                    </View>

                    {/* Disable 2FA button — only shown when enabled */}
                    {(u as any).totp_enabled && (
                      <Pressable
                        style={[styles.editBtn, { backgroundColor: '#FFF7ED', borderColor: '#F97316' }]}
                        onPress={() => {
                          Alert.alert(
                            lang === 'he' ? 'ביטול 2FA' : 'Disable 2FA',
                            lang === 'he'
                              ? `האם לבטל את האימות הדו-שלבי עבור ${u.displayName}?`
                              : `Disable 2FA for ${u.displayName}?`,
                            [
                              { text: lang === 'he' ? 'לא' : 'Cancel', style: 'cancel' },
                              {
                                text: lang === 'he' ? 'כן, בטל' : 'Yes, disable',
                                style: 'destructive',
                                onPress: async () => {
                                  try {
                                    await apiClient.post(`/api/admin/users/${u.id}/disable-2fa`);
                                    Alert.alert('✅', lang === 'he' ? '2FA בוטל בהצלחה' : '2FA disabled successfully');
                                    fetchAllDashboardData();
                                  } catch {
                                    Alert.alert('Error', lang === 'he' ? 'שגיאה בביטול 2FA' : 'Failed to disable 2FA');
                                  }
                                },
                              },
                            ]
                          );
                        }}
                      >
                        <Text style={[styles.editBtnText, { color: '#F97316' }]}>
                          🔓 {lang === 'he' ? 'בטל 2FA' : 'Disable 2FA'}
                        </Text>
                      </Pressable>
                    )}

                    <Pressable style={styles.editBtn} onPress={() => openEditUser(u)}>
                      <Text style={styles.editBtnText}>✏️ {lang === 'he' ? 'ערוך' : 'Edit'}</Text>
                    </Pressable>

                    <Pressable
                      style={[styles.editBtn, { backgroundColor: '#FEF2F2', borderColor: '#EF4444' }]}
                      onPress={() => eraseUser(u.id, u.displayName)}
                    >
                      <Text style={[styles.editBtnText, { color: '#EF4444' }]}>
                        🗑️ {lang === 'he' ? 'מחק' : 'Erase'}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </>
        )}

        {activeTab === 'projects' && (
          <>
            <Pressable
              style={[styles.submitBtn, { marginBottom: 14 }]}
              onPress={() => setShowNewProject(true)}
            >
              <Text style={styles.submitBtnText}>
                ➕ {lang === 'he' ? 'הוסף פרויקט' : 'Add Project'}
              </Text>
            </Pressable>

            {filteredProjects.map((p) => (
              <View key={p.id} style={styles.projectCard}>
                <View style={styles.projectHeader}>
                  <FacultyBadge facultyId={p.facultyId} lang={lang} />
                  <StatusBadge status={p.status} lang={lang} />
                </View>

                <Text style={styles.projectTitle}>
                  {lang === 'he' ? p.titleHe : p.titleEn}
                </Text>

                <Text style={styles.projectMeta}>
                  👨‍🏫 {p.supervisorName || 'No Supervisor'}
                </Text>

                <Text style={styles.projectMeta}>
                  👥 {p.enrolledStudentIds?.length || 0}{' '}
                  {lang === 'he' ? 'סטודנטים' : 'students'}
                </Text>

                {/* ── Add Student Button ── */}
                <Pressable
                  style={styles.addStudentBtn}
                  onPress={() => {
                    setAddStudentProject(p);
                    setStudentSearch('');
                    setAddStudentModal(true);
                  }}
                >
                  <Text style={styles.addStudentBtnText}>
                    👤➕ {lang === 'he' ? 'הוסף סטודנט' : 'Add Student'}
                  </Text>
                </Pressable>

                <Pressable
                  style={styles.addStudentBtn}
                  onPress={() => setDefenseProject(p)}
                >
                  <Text style={styles.addStudentBtnText}>
                    🛡 {lang === 'he' ? 'תאם הגנה' : 'Schedule Defense'}
                  </Text>
                </Pressable>

                <Pressable
                  style={styles.deleteBtn}
                  onPress={() => deleteProject(p.id)}
                >
                  <Text style={styles.deleteBtnText}>
                    🗑️ {lang === 'he' ? 'מחק' : 'Delete'}
                  </Text>
                </Pressable>
              </View>
            ))}
          </>
        )}

        {activeTab === 'milestones' && (
          <>
            <Pressable
              style={[styles.submitBtn, { marginBottom: 14 }]}
              onPress={() => setShowBulkDueDate(true)}
            >
              <Text style={styles.submitBtnText}>
                📅 {lang === 'he' ? 'עדכון תאריכי יעד מרוכז' : 'Bulk Update Due Dates'}
              </Text>
            </Pressable>
            {groupedMilestones
            .filter((g: any) => activeProjectIds.has(g.projectId))
            .map((project: any) => {

              const submittedCount = project.milestones.filter(
                (m: any) => m.status === 'submitted'
              ).length;

              const pendingCount = project.milestones.filter(
                (m: any) => m.status === 'pending'
              ).length;

              return (
                <Pressable
                  key={project.projectId}
                  style={styles.projectMilestoneCard}
                  onPress={() =>
                    router.push({
                      pathname: '/admin/projectMilestones',
                      params: {
                        projectId: project.projectId,
                        lang: lang,
                      },
                    })
                  }
                >
                  {/* Header */}
                  <View style={styles.projectHeader}>
                    <FacultyBadge
                      facultyId={project.facultyId}
                      lang={lang}
                    />

                    <View style={styles.milestoneCounter}>
                      <Text style={styles.milestoneCounterText}>
                        📋 {project.milestones.length}
                      </Text>
                    </View>
                  </View>

                  {/* Project title */}
                  <Text style={styles.projectTitle}>
                    {lang === 'he'
                      ? project.projectTitleHe
                      : project.projectTitleEn}
                  </Text>

                  {/* Students */}
                  <Text style={styles.projectMeta}>
                    👤 {project.studentNames.length} {lang === 'he' ? 'סטודנטים' : 'students'}
                    {project.studentNames.length > 0 ? ` — ${project.studentNames.join(', ')}` : ''}
                  </Text>

                  {/* Stats */}
                  <View style={styles.milestoneStatsRow}>

                    <View style={styles.milestoneStatBox}>
                      <Text style={styles.milestoneStatEmoji}>⏳</Text>
                      <Text style={styles.milestoneStatValue}>
                        {pendingCount}
                      </Text>
                    </View>

                    <View style={styles.milestoneStatBox}>
                      <Text style={styles.milestoneStatEmoji}>📨</Text>
                      <Text style={styles.milestoneStatValue}>
                        {submittedCount}
                      </Text>
                    </View>

                    <View style={styles.milestoneStatBox}>
                      <Text style={styles.milestoneStatEmoji}>✅</Text>
                      <Text style={styles.milestoneStatValue}>
                        {
                          project.milestones.filter(
                            (m: any) => m.status === 'approved'
                          ).length
                        }
                      </Text>
                    </View>

                  </View>

                  {/* Footer */}
                  <Text style={styles.openProjectText}>
                    👉 {lang === 'he'
                      ? 'לחץ לצפייה בכל אבני הדרך'
                      : 'Tap to view all milestones'}
                  </Text>

                </Pressable>
              );
            })}
          </>
        )}

        {activeTab === 'defenseAccess' && (
          <>
            <Text style={styles.sectionTitle}>
              {lang === 'he'
                ? 'בוחנים חיצוניים שהחמיצו את חלון הגישה ביום ההגנה'
                : 'External examiners who missed their defense-day access window'}
            </Text>
            {loadingDefenseGrants ? (
              <ActivityIndicator size="large" color="#8B5CF6" />
            ) : defenseGrants.length === 0 ? (
              <Text style={styles.projectMeta}>
                {lang === 'he' ? 'אין בקשות הארכה ממתינות' : 'No pending extension requests'}
              </Text>
            ) : (
              defenseGrants.map((g) => (
                <View key={g.code} style={styles.projectMilestoneCard}>
                  <Text style={styles.projectTitle}>{g.examinerName}</Text>
                  <Text style={styles.projectMeta}>📧 {g.examinerEmail}</Text>
                  <Text style={styles.projectMeta}>
                    📅 {lang === 'he' ? 'תאריך הגנה:' : 'Defense date:'} {g.defenseDateISO}
                  </Text>
                  {extendGrantCode === g.code ? (
                    <View style={{ marginTop: 10 }}>
                      <TextInput
                        style={adminPanelStyles.input}
                        value={extendNewDate}
                        onChangeText={setExtendNewDate}
                        placeholder={lang === 'he' ? 'תוקף חדש (ISO)' : 'New expiry (ISO date)'}
                      />
                      <TextInput
                        style={[adminPanelStyles.input, { marginTop: 8 }]}
                        value={extendReason}
                        onChangeText={setExtendReason}
                        placeholder={lang === 'he' ? 'סיבה (אופציונלי)' : 'Reason (optional)'}
                      />
                      <Pressable
                        style={[styles.submitBtn, extendingGrant && { opacity: 0.6 }]}
                        onPress={handleExtendGrant}
                        disabled={extendingGrant}
                      >
                        {extendingGrant
                          ? <ActivityIndicator color="#fff" />
                          : <Text style={styles.submitBtnText}>{lang === 'he' ? 'אשר הארכה' : 'Confirm extension'}</Text>
                        }
                      </Pressable>
                      <Pressable style={{ paddingVertical: 10, alignItems: 'center', marginTop: 6 }} onPress={() => setExtendGrantCode(null)}>
                        <Text style={{ color: '#8899BB', fontSize: 14 }}>{lang === 'he' ? 'ביטול' : 'Cancel'}</Text>
                      </Pressable>
                    </View>
                  ) : (
                    <Pressable
                      style={[styles.submitBtn, { marginTop: 10 }]}
                      onPress={() => { setExtendGrantCode(g.code); setExtendNewDate(''); setExtendReason(''); }}
                    >
                      <Text style={styles.submitBtnText}>
                        {lang === 'he' ? '🔓 הארך גישה' : '🔓 Extend access'}
                      </Text>
                    </Pressable>
                  )}
                </View>
              ))
            )}
          </>
        )}

        {activeTab === 'studentRoster' && (
          <>
            <Text style={styles.sectionTitle}>
              {lang === 'he'
                ? 'רשימת הסטודנטים המאושרים שהועלתה על ידי רכזי הפקולטות (או המערכת)'
                : "The approved-students allowlist uploaded by faculty coordinators (or system-wide)"}
            </Text>

            <View style={styles.searchBox}>
              <TextInput
                placeholder={lang === 'he' ? 'חפש לפי ת.ז. או שם...' : 'Search by ID or name...'}
                value={rosterSearch}
                onChangeText={setRosterSearch}
                style={styles.searchInput}
              />
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.userFilterRow}
              contentContainerStyle={styles.userFilterRowContent}
            >
              {(
                [
                  { key: 'all', label: lang === 'he' ? 'הכל' : 'All' },
                  { key: 'unused', label: lang === 'he' ? 'לא נרשמו' : 'Not registered' },
                  { key: 'used', label: lang === 'he' ? 'נרשמו' : 'Registered' },
                ] as const
              ).map((opt) => (
                <Pressable
                  key={opt.key}
                  style={[styles.userFilterChip, rosterUsedFilter === opt.key && styles.userFilterChipActive]}
                  onPress={() => setRosterUsedFilter(opt.key)}
                >
                  <Text style={[styles.userFilterChipText, rosterUsedFilter === opt.key && styles.userFilterChipTextActive]}>
                    {opt.label}
                  </Text>
                </Pressable>
              ))}
              <View style={styles.userFilterDivider} />
              {(
                [
                  { key: 'all', label: lang === 'he' ? 'כל התארים' : 'All degrees' },
                  { key: 'bachelors', label: lang === 'he' ? 'תואר ראשון' : "Bachelor's" },
                  { key: 'masters', label: lang === 'he' ? 'תואר שני' : "Master's" },
                ] as const
              ).map((opt) => (
                <Pressable
                  key={opt.key}
                  style={[styles.userFilterChip, rosterDegreeFilter === opt.key && styles.userFilterChipActive]}
                  onPress={() => setRosterDegreeFilter(opt.key)}
                >
                  <Text style={[styles.userFilterChipText, rosterDegreeFilter === opt.key && styles.userFilterChipTextActive]}>
                    {opt.label}
                  </Text>
                </Pressable>
              ))}
              <View style={styles.userFilterDivider} />
              <Pressable
                style={[styles.userFilterChip, rosterFacultyFilter === 'all' && styles.userFilterChipActive]}
                onPress={() => setRosterFacultyFilter('all')}
              >
                <Text style={[styles.userFilterChipText, rosterFacultyFilter === 'all' && styles.userFilterChipTextActive]}>
                  {lang === 'he' ? 'כל הפקולטות' : 'All faculties'}
                </Text>
              </Pressable>
              {Object.entries(FACULTY_COLORS)
                .filter(([k]) => k !== 'default' && k !== 'all')
                .map(([id, fc]) => (
                  <Pressable
                    key={id}
                    style={[styles.userFilterChip, rosterFacultyFilter === id && styles.userFilterChipActive]}
                    onPress={() => setRosterFacultyFilter(id)}
                  >
                    <Text style={[styles.userFilterChipText, rosterFacultyFilter === id && styles.userFilterChipTextActive]}>
                      {fc.label[lang]}
                    </Text>
                  </Pressable>
                ))}
            </ScrollView>

            {rosterError ? (
              <Text style={[styles.projectMeta, { color: '#EF4444' }]}>{rosterError}</Text>
            ) : loadingRoster ? (
              <ActivityIndicator size="large" color="#8B5CF6" />
            ) : rosterEntries.length === 0 ? (
              <Text style={styles.projectMeta}>{lang === 'he' ? 'לא נמצאו רשומות' : 'No entries found'}</Text>
            ) : (
              rosterEntries.map((entry) => (
                <View key={entry.id} style={styles.projectMilestoneCard}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.projectTitle}>{entry.studentId}</Text>
                      <Text style={styles.projectMeta}>{entry.fullName || '—'}</Text>
                    </View>
                    <View
                      style={{
                        borderRadius: 999,
                        paddingHorizontal: 10,
                        paddingVertical: 3,
                        backgroundColor: entry.used ? '#FEF2F2' : '#EFF6FF',
                      }}
                    >
                      <Text style={{ fontSize: 12, fontWeight: '600', color: entry.used ? '#EF4444' : '#2E86FF' }}>
                        {entry.used ? (lang === 'he' ? 'נרשם' : 'Registered') : lang === 'he' ? 'פנוי' : 'Open'}
                      </Text>
                    </View>
                  </View>

                  <Text style={styles.projectMeta}>
                    {FACULTY_COLORS[entry.facultyId as keyof typeof FACULTY_COLORS]?.label?.[lang] ?? entry.facultyId}
                    {' · '}
                    {entry.degreeType === 'masters' ? (lang === 'he' ? 'תואר שני' : "Master's") : (lang === 'he' ? 'תואר ראשון' : "Bachelor's")}
                    {entry.major ? ` · ${entry.major}` : ''}
                  </Text>

                  {editingRosterId === entry.id ? (
                    <View style={{ marginTop: 10 }}>
                      <TextInput
                        style={adminPanelStyles.input}
                        value={editRosterFullName}
                        onChangeText={setEditRosterFullName}
                        placeholder={lang === 'he' ? 'שם מלא' : 'Full name'}
                      />
                      <TextInput
                        style={[adminPanelStyles.input, { marginTop: 8 }]}
                        value={editRosterMajor}
                        onChangeText={setEditRosterMajor}
                        placeholder={lang === 'he' ? 'מגמה (אופציונלי)' : 'Major (optional)'}
                      />
                      <Pressable
                        style={[styles.submitBtn, savingRosterId === entry.id && { opacity: 0.6 }]}
                        onPress={() => handleSaveRosterEdit(entry)}
                        disabled={savingRosterId === entry.id}
                      >
                        {savingRosterId === entry.id
                          ? <ActivityIndicator color="#fff" />
                          : <Text style={styles.submitBtnText}>{lang === 'he' ? 'שמור' : 'Save'}</Text>
                        }
                      </Pressable>
                      <Pressable style={{ paddingVertical: 10, alignItems: 'center', marginTop: 6 }} onPress={() => setEditingRosterId(null)}>
                        <Text style={{ color: '#8899BB', fontSize: 14 }}>{lang === 'he' ? 'ביטול' : 'Cancel'}</Text>
                      </Pressable>
                    </View>
                  ) : confirmDeleteRosterId === entry.id ? (
                    <View style={{ marginTop: 10 }}>
                      <Text style={{ color: '#EF4444', fontSize: 13, marginBottom: 8 }}>
                        {lang === 'he' ? 'למחוק את הרשומה הזו לצמיתות?' : 'Permanently delete this entry?'}
                      </Text>
                      <Pressable
                        style={[styles.submitBtn, { backgroundColor: '#EF4444' }, savingRosterId === entry.id && { opacity: 0.6 }]}
                        onPress={() => handleDeleteRoster(entry)}
                        disabled={savingRosterId === entry.id}
                      >
                        {savingRosterId === entry.id
                          ? <ActivityIndicator color="#fff" />
                          : <Text style={styles.submitBtnText}>{lang === 'he' ? 'מחק' : 'Delete'}</Text>
                        }
                      </Pressable>
                      <Pressable style={{ paddingVertical: 10, alignItems: 'center', marginTop: 6 }} onPress={() => setConfirmDeleteRosterId(null)}>
                        <Text style={{ color: '#8899BB', fontSize: 14 }}>{lang === 'he' ? 'ביטול' : 'Cancel'}</Text>
                      </Pressable>
                    </View>
                  ) : (
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                      <Pressable style={[styles.submitBtn, { flex: 1, marginTop: 0 }]} onPress={() => startRosterEdit(entry)}>
                        <Text style={styles.submitBtnText}>✏️ {lang === 'he' ? 'ערוך' : 'Edit'}</Text>
                      </Pressable>
                      {entry.used && (
                        <Pressable
                          style={[styles.submitBtn, { flex: 1, marginTop: 0, backgroundColor: '#8B5CF6' }]}
                          onPress={() => handleReopenRoster(entry)}
                        >
                          <Text style={styles.submitBtnText}>🔓 {lang === 'he' ? 'פתח מחדש' : 'Reopen'}</Text>
                        </Pressable>
                      )}
                      <Pressable
                        style={[styles.submitBtn, { marginTop: 0, backgroundColor: '#EF4444', flex: entry.used ? 0 : 1, paddingHorizontal: 14 }]}
                        onPress={() => setConfirmDeleteRosterId(entry.id)}
                      >
                        <Text style={styles.submitBtnText}>🗑️</Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              ))
            )}
          </>
        )}

        {activeTab === 'feedback' && (
          <>
            <Text style={styles.sectionTitle}>
              {lang === 'he'
                ? 'משוב אמיתי שהתקבל מהמשתמשים (חד-כיווני — לא ניתן להשיב בתוך הצ׳אט)'
                : 'Real feedback from users (one-way — replies aren\'t sent back in-thread)'}
            </Text>

            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
              {(['open', 'resolved'] as const).map((st) => (
                <Pressable
                  key={st}
                  style={[styles.tab, feedbackStatusFilter === st && styles.tabActive]}
                  onPress={() => setFeedbackStatusFilter(st)}
                >
                  <Text style={[styles.tabText, feedbackStatusFilter === st && styles.tabTextActive]}>
                    {st === 'open'
                      ? (lang === 'he' ? 'פתוח' : 'Open')
                      : (lang === 'he' ? 'טופל' : 'Resolved')}
                  </Text>
                </Pressable>
              ))}
            </View>

            {loadingFeedback ? (
              <ActivityIndicator size="large" color="#2E86FF" />
            ) : feedbackMessages.length === 0 ? (
              <Text style={styles.projectMeta}>
                {lang === 'he' ? 'אין משוב להצגה' : 'No feedback to show'}
              </Text>
            ) : (
              feedbackMessages.map((f) => (
                <View key={f.id} style={styles.projectMilestoneCard}>
                  <Text style={styles.projectTitle}>{f.userName} · {f.role}</Text>
                  <Text style={[styles.projectMeta, { marginTop: 6 }]}>{f.text}</Text>
                  {f.aiReasoning && (
                    <Text style={[styles.projectMeta, { marginTop: 6, fontStyle: 'italic' }]}>
                      🤖 {f.aiReasoning}
                    </Text>
                  )}
                  {f.status !== 'resolved' && (
                    <Pressable
                      style={[styles.submitBtn, { marginTop: 10 }, resolvingFeedbackId === f.id && { opacity: 0.6 }]}
                      onPress={() => handleResolveFeedback(f.id)}
                      disabled={resolvingFeedbackId === f.id}
                    >
                      {resolvingFeedbackId === f.id
                        ? <ActivityIndicator color="#fff" />
                        : <Text style={styles.submitBtnText}>{lang === 'he' ? '✅ סמן כטופל' : '✅ Mark resolved'}</Text>
                      }
                    </Pressable>
                  )}
                </View>
              ))
            )}
          </>
        )}

        <View style={{ height: 80 }} />
      </ScrollView>

      <FloatingActionMenu
        lang={lang}
        isRtl={isRtl}
        corner="bottom-right"
        actions={[
          { key: 'add', icon: '➕', label: lang === 'he' ? 'הוסף משתמש' : 'Add User', onPress: () => { setActiveTab('users'); setShowNewUser(true); } },
          { key: 'import', icon: '📥', label: lang === 'he' ? 'ייבוא סגל' : 'Import Staff', onPress: handleImportStaff, loading: importingStaff },
          { key: 'importRoster', icon: '🎓', label: lang === 'he' ? 'ייבוא רשימת סטודנטים' : 'Import Student Roster', onPress: handleImportStudentRoster, loading: importingRoster },
          { key: 'export', icon: '📤', label: lang === 'he' ? 'ייצוא לאקסל' : 'Export Excel', onPress: handleExportUsers, loading: exportingUsers },
          { key: 'calendar', icon: '📅', label: lang === 'he' ? 'לוח שנה אקדמי' : 'Academic Calendar', onPress: openAcademicCalendar },
          { key: 'studentStatuses', icon: '🏷️', label: lang === 'he' ? 'סטטוסי סטודנטים' : 'Student Statuses', onPress: () => setStudentStatusesModal(true) },
          { key: 'workflowTemplates', icon: '🧬', label: lang === 'he' ? 'תבניות תהליך' : 'Process Templates', onPress: () => router.push('/WorkflowTemplateManager' as any) },
        ]}
      />

      {/* Academic calendar settings — the two admin-editable semester start
          dates consumed by the graduation-based auto-deletion sweep (see
          server/src/services/accountDeletion.ts). Summer's start/end are
          fixed, not configurable here — see that file's comments. */}
      <Modal visible={academicCalendarModal} animationType="slide" presentationStyle="formSheet" onRequestClose={() => setAcademicCalendarModal(false)}>
        <View style={{ flex: 1, backgroundColor: '#fff', padding: 20 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <Text style={{ fontSize: 18, fontWeight: '800' }}>
              📅 {lang === 'he' ? 'לוח שנה אקדמי' : 'Academic Calendar'}
            </Text>
            <Pressable onPress={() => setAcademicCalendarModal(false)}>
              <Text style={{ fontSize: 20, color: '#64748B' }}>✕</Text>
            </Pressable>
          </View>

          {academicCalendarLoading ? (
            <ActivityIndicator size="large" color="#2E86FF" />
          ) : (
            <>
              <Text style={{ fontSize: 13, color: '#64748B', marginBottom: 16 }}>
                {lang === 'he'
                  ? 'סמסטר הקיץ קבוע (יולי–ספטמבר). התאריכים הבאים משמשים גם לחישוב מחיקת חשבון אוטומטית לסטודנטים שסיימו את משך הלימודים.'
                  : "Summer semester is fixed (July–September). These dates also feed the automatic graduation-based account-deletion check."}
              </Text>

              <Text style={{ fontSize: 14, fontWeight: '700', marginBottom: 6 }}>
                {lang === 'he' ? 'תחילת סמסטר סתיו' : 'Fall semester start'}
              </Text>
              <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
                <TextInput
                  style={{ flex: 1, borderWidth: 1.5, borderColor: '#E2E8F0', borderRadius: 10, padding: 12 }}
                  value={fallMonth}
                  onChangeText={setFallMonth}
                  keyboardType="numeric"
                  placeholder={lang === 'he' ? 'חודש (1-12)' : 'Month (1-12)'}
                />
                <TextInput
                  style={{ flex: 1, borderWidth: 1.5, borderColor: '#E2E8F0', borderRadius: 10, padding: 12 }}
                  value={fallDay}
                  onChangeText={setFallDay}
                  keyboardType="numeric"
                  placeholder={lang === 'he' ? 'יום' : 'Day'}
                />
              </View>

              <Text style={{ fontSize: 14, fontWeight: '700', marginBottom: 6 }}>
                {lang === 'he' ? 'תחילת סמסטר אביב' : 'Spring semester start'}
              </Text>
              <View style={{ flexDirection: 'row', gap: 10, marginBottom: 24 }}>
                <TextInput
                  style={{ flex: 1, borderWidth: 1.5, borderColor: '#E2E8F0', borderRadius: 10, padding: 12 }}
                  value={springMonth}
                  onChangeText={setSpringMonth}
                  keyboardType="numeric"
                  placeholder={lang === 'he' ? 'חודש (1-12)' : 'Month (1-12)'}
                />
                <TextInput
                  style={{ flex: 1, borderWidth: 1.5, borderColor: '#E2E8F0', borderRadius: 10, padding: 12 }}
                  value={springDay}
                  onChangeText={setSpringDay}
                  keyboardType="numeric"
                  placeholder={lang === 'he' ? 'יום' : 'Day'}
                />
              </View>

              <Pressable
                style={{ backgroundColor: '#2E86FF', borderRadius: 12, paddingVertical: 14, alignItems: 'center' }}
                onPress={saveAcademicCalendar}
              >
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>
                  {lang === 'he' ? 'שמור' : 'Save'}
                </Text>
              </Pressable>
            </>
          )}
        </View>
      </Modal>

      <NewProjectModal
        visible={showNewProject}
        setVisible={setShowNewProject}
        mode="admin"
        lang={lang}
        isRtl={isRtl}

        titleHe={newTitleHe}
        setTitleHe={setNewTitleHe}
        titleEn={newTitleEn}
        setTitleEn={setNewTitleEn}

        descHe={newDescHe}
        setDescHe={setNewDescHe}
        descEn={newDescEn}
        setDescEn={setNewDescEn}

        skills={newSkills}
        setSkills={setNewSkills}

        prerequisites={newPrerequisites}
        setPrerequisites={setNewPrerequisites}

        faculty={newProjectFaculty}
        setFaculty={setNewProjectFaculty}

        degree={newDegree}
        setDegree={setNewDegree}

        type={newType}
        setType={setNewType}

        supervisors={allSupervisors}
        selectedSupervisor={selectedSupervisor}
        setSelectedSupervisor={setSelectedSupervisor}

        onCreate={handleCreateProject}
        creating={creating}

        maxStudents={maxStudents}
        setMaxStudents={setMaxStudents}

        setShowConfirm={setShowConfirm}

        projectName={projectName}
        setProjectName={setProjectName}

        projectFile={projectFile}
        setProjectFile={setProjectFile}

        selectedProgram={selectedProgram}
        setSelectedProgram={setSelectedProgram}

        pickFile={(b) => pickFile(b)}

        facultyColors={FACULTY_COLORS}
        styles={styles}
      />

      <EditUserModal
        visible={userModal}
        setVisible={setUserModal}

        lang={lang}

        role={editRole}
        setRole={setEditRole}

        faculty={editFaculty}
        setFaculty={setEditFaculty}

        roleLabels={ROLE_LABELS}
        facultyColors={FACULTY_COLORS}

        onSave={handleSaveUser}
        saving={saving}

        roles={editRoles}
        setRoles={setEditRoles}

        permissionRules={editPermissionRules}
        setPermissionRules={setEditPermissionRules}

        coordinatorScopes={editCoordinatorScopes}
        setCoordinatorScopes={setEditCoordinatorScopes}

        assignedMajors={editAssignedMajors}
        setAssignedMajors={setEditAssignedMajors}

        primaryStatus={editPrimaryStatus}
        setPrimaryStatus={setEditPrimaryStatus}
        secondaryStatus={editSecondaryStatus}
        setSecondaryStatus={setEditSecondaryStatus}

        styles={styles}
      />

      <StudentStatusesModal
        visible={studentStatusesModal}
        onClose={() => {
          setStudentStatusesModal(false);
          // Re-fetch — labels/keys may have changed (edited/removed/added)
          // since this modal was opened, and both the row badges above and
          // the EditUserModal's dropdowns rely on this cached copy.
          apiClient.get('/api/student-statuses')
            .then((res) => setStudentStatusOptions({ primary: res.data?.primary ?? [], secondary: res.data?.secondary ?? [] }))
            .catch((err) => console.error('Failed to refresh student status options:', err));
        }}
        lang={lang}
      />

      <MaintenanceModal
        visible={maintenanceModal}
        setVisible={setMaintenanceModal}
        lang={lang}

        currentStatus={maintenanceStatus}
        onDeactivate={deactivateMaintenance}
        deactivating={deactivatingMaintenance}

        title={maintenanceTitle}
        setTitle={setMaintenanceTitle}
        warnDays={warnDays}
        setWarnDays={setWarnDays}
        warnHours={warnHours}
        setWarnHours={setWarnHours}
        warnMinutes={warnMinutes}
        setWarnMinutes={setWarnMinutes}
        durDays={durDays}
        setDurDays={setDurDays}
        durHours={durHours}
        setDurHours={setDurHours}
        durMinutes={durMinutes}
        setDurMinutes={setDurMinutes}
        broadcastEnabled={broadcastEnabled}
        setBroadcastEnabled={setBroadcastEnabled}
        blockedRoles={blockedRoles}
        setBlockedRoles={setBlockedRoles}
        onSave={saveMaintenance}
      />
      {/* ── Add Student to Project Modal ── */}
      <AddStudentToProjectModal
        visible={addStudentModal}
        lang={lang}
        isRtl={isRtl}
        styles={styles}

        users={users}
        project={addStudentProject}
        studentSearch={studentSearch}
        setStudentSearch={setStudentSearch}
        

        setVisible={setAddStudentModal}
        setProject={setAddStudentProject}

        addingStudent={addingStudent}

        onAddStudent={handleAddStudentToProject}
        getFacultyColor={getFacultyColor}
      />
      {/* ── Schedule Defense Modal ── */}
      <ScheduleDefenseModal
        visible={!!defenseProject}
        project={defenseProject}
        lang={lang}
        isRtl={isRtl}
        saving={schedulingDefense}
        onClose={() => setDefenseProject(null)}
        onSave={handleScheduleDefense}
      />
      <BulkDueDateModal
        visible={showBulkDueDate}
        onClose={() => setShowBulkDueDate(false)}
        lang={lang}
        projects={projects.map((p) => ({ id: p.id, label: lang === 'he' ? p.titleHe : p.titleEn }))}
        onSaved={fetchAllDashboardData}
      />

      <NewUserModal
        visible={showNewUser}
        lang={lang}
        isRtl={isRtl}
        styles={styles}

        newUserName={newUserName}
        newUserEmail={newUserEmail}
        newUserPhone={newUserPhone}
        newUserRole={newUserRole}
        newUserFaculty={newUserFaculty}
        newUserDegree={newUserDegree}
        newUserYear={newUserYear}
        newUserMajor={newUserMajor}
        newUserStudentId={newUserStudentId}
        newUserTempPassword={newUserTempPassword}
        newUserAssignedMajors={newUserAssignedMajors}

        setVisible={setShowNewUser}
        setNewUserName={setNewUserName}
        setNewUserEmail={setNewUserEmail}
        setNewUserPhone={setNewUserPhone}
        setNewUserRole={setNewUserRole}
        setNewUserFaculty={setNewUserFaculty}
        setNewUserDegree={setNewUserDegree}
        setNewUserYear={setNewUserYear}
        setNewUserMajor={setNewUserMajor}
        setNewUserStudentId={setNewUserStudentId}
        setNewUserTempPassword={setNewUserTempPassword}
        setNewUserAssignedMajors={setNewUserAssignedMajors}

        onCreate={handleCreateUser}
        creating={creatingUser}
      />

      {/* Visible upload/processing progress — a plain absolutely-positioned
          overlay (not tucked inside the FAB, which collapses the instant
          it's tapped and would hide any indicator placed there) so the
          admin has actual feedback while a multi-row import (each row does
          a real awaited email send) is still working. */}
      {importProgress && (
        <View
          pointerEvents="auto"
          style={{
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(17,24,39,0.45)',
            alignItems: 'center', justifyContent: 'center',
            zIndex: 100,
          }}
        >
          <View style={{
            backgroundColor: '#fff', borderRadius: 20, paddingVertical: 28, paddingHorizontal: 32,
            alignItems: 'center', minWidth: 220,
          }}>
            <ActivityIndicator size="large" color="#7C3AED" />
            <Text style={{ marginTop: 14, fontSize: 15, fontWeight: '700', color: '#111' }}>
              {importProgress.stage === 'uploading'
                ? (lang === 'he' ? `מעלה קובץ... ${importProgress.percent ?? 0}%` : `Uploading file... ${importProgress.percent ?? 0}%`)
                : (lang === 'he' ? 'מעבד ויוצר משתמשים...' : 'Processing & creating users...')}
            </Text>
            <Text style={{ marginTop: 6, fontSize: 12, color: '#8899BB', textAlign: 'center' }}>
              {lang === 'he' ? 'נא לא לסגור את האפליקציה' : 'Please don’t close the app'}
            </Text>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = adminPanelStyles;
