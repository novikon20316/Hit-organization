import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  Alert,
  Switch,
  Dimensions,
  Pressable,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  serverTimestamp,
} from 'firebase/firestore';
import { apiClient } from '@/src/api/apiClient';
import { auth } from '../../src/firebase/firebase';
import { useRouter, useLocalSearchParams } from 'expo-router';
import type { Lang } from '../../components/i18n';

import {
  TopBar,
  FACULTY_COLORS,
} from '../../components/shared';
import { AppUser, SystemStats, UserRecord, ProjectRecord, MilestoneRecord, StatusOption } from '@/types'
import { ROLE_LABELS } from '../../constants';
import { FacultyAdminDashboardStyles } from '../../constants/styles';
import { ap } from '@/constants/theme';

import {
  NewUserModal,
  AddStudentToProjectModal,
  EditUserModal,
  NewProjectModal,
} from '@/components/modals';
import type { PrerequisiteSpec } from '@/components/Prerequisites';
import ManagedStaffSection from '@/components/ManagedStaffSection';
import StudentsListSection from '@/components/StudentsListSection';
import { DELEGATE_MANAGEABLE_ROLES } from '@/firebase/roles';
import { PendingSignoffsWidget } from '@/components/PendingSignoffsWidget';
import CreateOwnProjectButton from '@/components/CreateOwnProjectButton';
import ChatbotFab from '@/components/ChatbotFab';
import { TourTarget } from '@/components/onboarding/TourTarget';
import { TabBadge } from '@/components/TabBadge';
import { useNotifications } from '@/src/context/NotificationsContext';

const { width } = Dimensions.get('window');

export default function PanelScreen() {
  const router = useRouter();

  const [lang, setLang] = useState<Lang>('he');
  const isRtl = lang === 'he';

  const [loading, setLoading] = useState(true);
  const [adminName, setAdminName] = useState('');
  
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [milestones, setMilestones] = useState<MilestoneRecord[]>([]);

  // Lets a notification's "Go to dashboard" deep-link land on a specific tab
  // (?tab=...) instead of always opening on Overview — same convention the
  // web dashboard already supports.
  type FacultyAdminTab = 'overview' | 'users' | 'projects' | 'milestones' | 'deadlines' | 'staff' | 'signoffs' | 'students';
  const FACULTY_ADMIN_TABS: FacultyAdminTab[] = ['overview', 'users', 'projects', 'milestones', 'deadlines', 'staff', 'signoffs', 'students'];
  const { tab: tabParam } = useLocalSearchParams<{ tab?: string }>();
  const [activeTab, setActiveTab] = useState<FacultyAdminTab>(
    FACULTY_ADMIN_TABS.includes(tabParam as FacultyAdminTab) ? (tabParam as FacultyAdminTab) : 'overview'
  );
  // "New since last opened" badges for the tabs with no live queue-count of
  // their own — driven by unread notifications bucketed by targetScreen,
  // same mechanism as web's SidebarShell.tsx and mobile's coordinator/home.tsx.
  const { unreadByTargetScreen, markTabSeen } = useNotifications();
  const TAB_BADGE_TARGET_SCREENS: Partial<Record<FacultyAdminTab, string>> = {
    deadlines: 'faculty_admin_deadlines',
    signoffs: 'faculty_admin_signoffs',
  };
  const newItemBadgeFor = (tab: FacultyAdminTab) => {
    const targetScreen = TAB_BADGE_TARGET_SCREENS[tab];
    return targetScreen ? (unreadByTargetScreen[targetScreen] ?? 0) : 0;
  };
  useEffect(() => {
    const targetScreen = TAB_BADGE_TARGET_SCREENS[activeTab];
    if (targetScreen && (unreadByTargetScreen[targetScreen] ?? 0) > 0) {
      markTabSeen([targetScreen]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- TAB_BADGE_TARGET_SCREENS is a stable literal, re-declared each render but never changing shape
  }, [activeTab, unreadByTargetScreen, markTabSeen]);

  const [deadlines, setDeadlines] = useState<any[]>([]);
  const [loadingDeadlines, setLoadingDeadlines] = useState(false);

  // Own-faculty staff this role can now manage directly (see
  // server/src/config/permissionScopes.ts's DELEGATE_ADMIN_ROLES) — reuses
  // the same `users` list already fetched by fetchAdminDashboard below
  // rather than a second fetch, filtered to non-student/non-admin-tier rows.

  const [userModal, setUserModal] = useState(false);
  const [editUser, setEditUser] = useState<UserRecord | null>(null);
  const [editFaculty, setEditFaculty] = useState<string>('');
  const [editRole , setEditRole] = useState<string>('');
  const [editRoles, setEditRoles] = useState<string[]>([]);
  // Student Primary/Secondary status — independent axes, persisted via a
  // separate endpoint (see handleSaveUser). null = "— none —".
  const [editPrimaryStatus, setEditPrimaryStatus] = useState<string | null>(null);
  const [editSecondaryStatus, setEditSecondaryStatus] = useState<string | null>(null);
  // Resolved once per screen load (not per user row) — used for each
  // student row's status badge. See server/src/services/studentStatuses.ts.
  const [studentStatusOptions, setStudentStatusOptions] = useState<{ primary: StatusOption[]; secondary: StatusOption[] }>({ primary: [], secondary: [] });
  const [saving, setSaving] = useState(false);
  const [selectedProgram, setSelectedProgram] = React.useState<string | null>(null);
  const [showNewUser, setShowNewUser] = useState(false);
  const [newProjectFacultyIds, setNewProjectFacultyIds] = useState<string[]>([]);
  const [showNewProject, setShowNewProject] = useState(false);
  const [projectFile, setProjectFile] = useState<string | null>(null);
  const [projectName, setProjectName] = useState<string | null>(null);
  const [newTitleHe, setNewTitleHe] = useState('');
  const [newTitleEn, setNewTitleEn] = useState('');
  const [newDescHe, setNewDescHe] = useState('');
  const [newDescEn, setNewDescEn] = useState('');
  const [newDegreeTypes, setNewDegreeTypes] = useState<('bachelors' | 'masters')[]>(['bachelors']);
  const [newProjectTypes, setNewProjectTypes] = useState<('project' | 'thesis')[]>(['project']);
  const [newSkills, setNewSkills] = useState('');
  const [newPrerequisites, setNewPrerequisites] = useState<PrerequisiteSpec[]>([]);
  const [creating, setCreating] = useState(false);
  const [maxStudents, setMaxStudents] = useState<number>(1);

  const [allSupervisors, setAllSupervisors] = useState<AppUser[]>([]);
  const [selectedSupervisor, setSelectedSupervisor] = useState<AppUser | null>(null);

  const uid = auth.currentUser?.uid;

  const [adminFacultyId, setAdminFacultyId] = useState('');

  // ─── 🆕 Unified Dashboard Sync ───────────────────────────────────────────
  const fetchAdminDashboard = async () => {
    try {
      setLoading(true);
      // The backend uses the auth token context to deduce the faculty ID and gather structured items
      const response = await apiClient.get('/api/admin/dashboard');
      
      setAdminName(response.data.adminName || 'Admin');
      setAdminFacultyId(response.data.adminFacultyId || '');
      setUsers(response.data.users || []);
      setProjects(response.data.projects || []);
      setMilestones(response.data.milestones || []);
      setAllSupervisors(response.data.supervisors || []);
    } catch (err: any) {
      console.error('Fetch error:', err);
      Alert.alert('Error', lang === 'he' ? 'שגיאה בטעינת הנתונים' : 'Failed to synchronize administration items');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAdminDashboard();
  }, []);

  // Re-fetches supervisors per selected faculty when the Add Project picker
  // changes — a project can now be posted open to more than one faculty
  // (own faculty plus any additionally granted ones), so the initial
  // dashboard fetch's own-faculty-only supervisor list isn't enough once the
  // caller selects beyond it.
  useEffect(() => {
    if (!showNewProject || newProjectFacultyIds.length === 0) return;
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
        const eligible: AppUser[] = (r.data || []).filter((s: any) => s.eligibleAsSupervisor);
        setAllSupervisors(eligible);
      })
      .catch((err) => console.error('Error loading supervisors for selected faculties:', err));
    return () => {
      cancelled = true;
    };
  }, [newProjectFacultyIds.join(','), showNewProject]);

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
    if (activeTab !== 'deadlines') return;
    const fetchDeadlines = async () => {
      try {
        setLoadingDeadlines(true);
        const res = await apiClient.get(`/api/staff/${uid}/deadlines`);
        setDeadlines(res.data.deadlines || []);
      } catch (e) {
        console.error('Failed to load deadlines', e);
        Alert.alert('Error', 'Failed to load deadlines');
      } finally {
        setLoadingDeadlines(false);
      }
    };
    fetchDeadlines();
  }, [activeTab]);

  
  // ─── 🆕 CRUD Request Actions ──────────────────────────────────────────────
  
  // ─── 🆕 Fix: handleSaveUser Parameters Matching () => void ──────────────
  const handleSaveUser = async () => {
    if (!editUser) return;
    try {
      setSaving(true);
      await apiClient.post(`/api/admin/users/${editUser.id}/role-update`, {
        role:      editRole,
        roles:     editRoles,
        facultyId: editFaculty,
      });

      // Student status is a separate axis from role/faculty, set through its
      // own endpoint (faculty_admin is only allowed to set it for students in
      // their own faculty — enforced server-side, see setStudentStatus) —
      // only meaningful (and only sent) when the user being saved is
      // (still) a student.
      if (editRole === 'student' || editRoles.includes('student')) {
        await apiClient.post(`/api/admin/users/${editUser.id}/status`, {
          primaryStatus:   editPrimaryStatus,
          secondaryStatus: editSecondaryStatus,
        });
      }

      Alert.alert('Success', lang === 'he' ? 'המשתמש עודכן בהצלחה' : 'User updated successfully');
      setUserModal(false);
      fetchAdminDashboard();
    } catch (e) {
      console.log(e);
    } finally {
      setSaving(false);
    }
  };

  const openEditUser = (user: UserRecord) => {
    setEditUser(user);
    setEditRole(user.role);
    setEditRoles(user.roles?.length ? user.roles : [user.role]); // ← ADD
    setEditFaculty(user.facultyId);
    // Student-only, independent of role/faculty — loads from the actual
    // user doc.
    setEditPrimaryStatus(user.primaryStatus ?? null);
    setEditSecondaryStatus(user.secondaryStatus ?? null);
    setUserModal(true);
  };

  /*const handleSaveUser = async () => {
    if (!editUser) return;

    try {
      setSaving(true);

      await updateDoc(doc(db, 'users', editUser.id), {
        isActive: editUser.isActive,
      });

      Alert.alert('Success', 'User updated');
      setUserModal(false);
    } catch (e) {
      console.log(e);
    } finally {
      setSaving(false);
    }
  };*/

  // ───────────────────────────────
  // CREATE PROJECT
  // ───────────────────────────────
  const handleCreateProject = async () => {
    if (!selectedSupervisor || newProjectFacultyIds.length === 0) return;
    if (newDegreeTypes.length === 0 || newProjectTypes.length === 0) return;

    try {
      setSaving(true);
      setCreating(true);
      await apiClient.post('/api/admin/projects', {
        supervisorId: selectedSupervisor.id,
        facultyIds: newProjectFacultyIds,
        titleHe: newTitleHe,
        titleEn: newTitleEn,
        descriptionHe: newDescHe,
        descriptionEn: newDescEn,
        degreeTypes: newDegreeTypes,
        projectTypes: newProjectTypes,
        requiredSkills: newSkills.split(',').map((s) => s.trim()),
        prerequisites: newPrerequisites.filter((p) => p.subject.trim()).map((p) => ({ subject: p.subject.trim(), ...(p.minGrade != null ? { minGrade: p.minGrade } : {}) })),
        status: 'published',
        enrolledStudentIds: [],
        isArchived: false,
        createdAt: serverTimestamp(),
      });

      setShowNewProject(false);

      await fetchAdminDashboard();
    } catch (e) {
      console.log(e);
    } finally {
      setCreating(false);
    }
  };

  const toggleUserActive = async (userId: string, current: boolean) => {
    try {
      await apiClient.post(`/api/admin/users/${userId}/toggle-active`, {
        isActive: !current,
      });

      // optimistic UI update
      setUsers((prev) =>
        prev.map((u) =>
          u.id === userId
            ? { ...u, isActive: !current }
            : u
        )
      );

      Alert.alert(
        'Success',
        lang === 'he'
          ? 'סטטוס המשתמש עודכן'
          : 'User status updated'
      );

    } catch (e) {
      console.error('Toggle user error:', e);

      Alert.alert(
        'Error',
        lang === 'he'
          ? 'שגיאה בעדכון המשתמש'
          : 'Failed to update user status'
      );
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

  // ───────────────────────────────
  // UI
  // ───────────────────────────────
  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1 }}>

      <TopBar
        name={adminName}
        role="faculty_admin"
        lang={lang}
        isRtl={isRtl}
        onToggleLang={() => setLang(lang === 'he' ? 'en' : 'he')}
        extraMenuItems={[
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
          {
            key: 'project-records', icon: '📜',
            label: lang === 'he' ? 'רישומי פרויקטים' : 'Project Records',
            onPress: () => router.push({ pathname: '/faculty_admin/records', params: { lang } } as any),
          },
        ]}
      />
      {/* Manage Milestone Templates / Reports / Bulk Permissions by Role
          moved into the TopBar's ☰ menu (extraMenuItems above) — same
          routes, no functionality dropped, just decluttered off the header. */}

      <TourTarget tourKey="overview">
        <Pressable style={localStyles.tabBar} onPress={() => setActiveTab('overview')} accessibilityRole="button">
          <Text style={localStyles.tabLabel}>Overview</Text>
        </Pressable>
      </TourTarget>
      <TourTarget tourKey="deadlines">
        <Pressable style={[localStyles.tabBar, { flexDirection: 'row', alignItems: 'center' }]} onPress={() => setActiveTab('deadlines')} accessibilityRole="button">
          <Text style={localStyles.tabLabel}>{lang === 'he' ? 'מועדי הגשה' : 'DeadLines'}</Text>
          <TabBadge count={newItemBadgeFor('deadlines')} />
        </Pressable>
      </TourTarget>
      <TourTarget tourKey="staff">
        <Pressable style={localStyles.tabBar} onPress={() => setActiveTab('staff')} accessibilityRole="button">
          <Text style={localStyles.tabLabel}>{lang === 'he' ? 'סגל' : 'Staff'}</Text>
        </Pressable>
      </TourTarget>
      <TourTarget tourKey="signoffs">
        <Pressable style={[localStyles.tabBar, { flexDirection: 'row', alignItems: 'center' }]} onPress={() => setActiveTab('signoffs')} accessibilityRole="button">
          <Text style={localStyles.tabLabel}>{lang === 'he' ? 'ממתין לאישור ציונים ובוחנים' : 'Awaiting Grade/Examiner Approval'}</Text>
          <TabBadge count={newItemBadgeFor('signoffs')} />
        </Pressable>
      </TourTarget>
      <TourTarget tourKey="students">
        <Pressable style={localStyles.tabBar} onPress={() => setActiveTab('students')} accessibilityRole="button">
          <Text style={localStyles.tabLabel}>🎓 {lang === 'he' ? 'רשימת סטודנטים' : 'Students List'}</Text>
        </Pressable>
      </TourTarget>
      <Pressable
        style={localStyles.tabBar}
        onPress={() => {
          if (newProjectFacultyIds.length === 0 && adminFacultyId) setNewProjectFacultyIds([adminFacultyId]);
          setShowNewProject(true);
        }}
        accessibilityRole="button"
      >
        <Text style={localStyles.tabLabel}>📁 {lang === 'he' ? 'פרויקט חדש' : 'New Project'}</Text>
      </Pressable>

      <CreateOwnProjectButton lang={lang} isRtl={isRtl} onCreated={fetchAdminDashboard} />

      <ScrollView>
        {activeTab === 'staff' ? (
          <ManagedStaffSection
            staff={users.filter((u) => DELEGATE_MANAGEABLE_ROLES.includes(u.role as any)) as any}
            onRefresh={fetchAdminDashboard}
            scope={{ selectableRoles: DELEGATE_MANAGEABLE_ROLES, lockedFacultyId: adminFacultyId }}
            lang={lang}
            isRtl={isRtl}
          />
        ) : activeTab === 'deadlines' ? (
            loadingDeadlines ? (
            <ActivityIndicator size="large" />
          ) : (
            deadlines.length === 0 ? (
              <View style={{ padding: 20 }}><Text>{lang === 'he' ? 'אין מועדי הגשה' : 'No deadlines available'}</Text></View>
            ) : (
              deadlines.map((d) => (
                <View key={`${d.milestoneId}-${d.studentId}`} style={localStyles.deadlineRow}>
                  {/* Student Name - Bold Header */}
                  <View style={{ marginBottom: 12 }}>
                    <Text style={localStyles.studentName}>👤 {d.studentName}</Text>
                  </View>

                  {/* Info Grid */}
                  <View style={{ marginBottom: 8 }}>
                    {/* Degree Type & Year of Study */}
                    <View style={{ marginBottom: 6 }}>
                      <Text style={localStyles.label}>
                        {lang === 'he' ? 'תואר:' : 'Degree:'} <Text style={localStyles.value}>{d.degreeType || 'N/A'}</Text>
                      </Text>
                      <Text style={localStyles.label}>
                        {lang === 'he' ? 'שנה:' : 'Year:'} <Text style={localStyles.value}>{d.yearOfStudy || '—'}</Text>
                      </Text>
                    </View>

                    {/* Project/Thesis Name */}
                    <View style={{ marginBottom: 6 }}>
                      <Text style={localStyles.label}>
                        {lang === 'he' ? 'פרויקט:' : 'Project:'} <Text style={localStyles.value}>{d.projectTitle || 'N/A'}</Text>
                      </Text>
                    </View>

                    {/* Current Milestone */}
                    <View style={{ marginBottom: 6 }}>
                      <Text style={localStyles.label}>
                        {lang === 'he' ? 'אבן דרך:' : 'Milestone:'} <Text style={localStyles.value}>{d.milestoneName || 'N/A'}</Text>
                      </Text>
                    </View>

                    {/* Days Until Due - Color Coded */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Text style={localStyles.label}>
                        {lang === 'he' ? 'ימים לסיום:' : 'Days Left:'}
                      </Text>
                      <Text
                        style={[
                          localStyles.daysLeft,
                          {
                            color: d.daysLeft !== null && d.daysLeft < 0 ? '#EF4444' : '#10B981',
                            fontWeight: '700',
                          },
                        ]}
                      >
                        {d.daysLeft !== null ? `${d.daysLeft} ${lang === 'he' ? 'ימים' : 'days'}` : 'N/A'}
                      </Text>
                    </View>

                    {/* Faculty (only for faculty_admin) */}
                    {d.facultyId ? (
                      <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: ap.outlineVariant }}>
                        <Text style={localStyles.label}>
                          {lang === 'he' ? 'פקולטה:' : 'Faculty:'} <Text style={localStyles.value}>{d.facultyId}</Text>
                        </Text>
                        {d.class && (
                          <Text style={localStyles.label}>
                            {lang === 'he' ? 'קבוצה:' : 'Class:'} <Text style={localStyles.value}>{d.class}</Text>
                          </Text>
                        )}
                      </View>
                    ) : null}
                  </View>
                </View>
              ))
            )
          )
        ) : activeTab === 'signoffs' ? (
          <PendingSignoffsWidget lang={lang} showEmptyState />
        ) : activeTab === 'students' ? (
          <StudentsListSection lang={lang} isRtl={isRtl} />
        ) : (
          /* USERS */
          users.map((u) => (
            <View key={u.id} style={{ padding: 14, borderBottomWidth: 1, borderBottomColor: ap.outlineVariant }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: ap.onSurface }}>{u.displayName}</Text>

                <Switch
                  value={u.isActive}
                  onValueChange={() => toggleUserActive(u.id, u.isActive)}
                />
              </View>

              {/* Student Primary/Secondary status badge — students with a
                  status set only (see server/src/services/studentStatuses.ts). */}
              {u.role === 'student' && u.primaryStatus && (
                <View style={{ marginTop: 6, alignSelf: 'flex-start', backgroundColor: '#FDF4FF', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 }}>
                  <Text style={{ color: '#A21CAF', fontWeight: '700', fontSize: 11 }}>
                    🏷️ {resolveStatusLabel(u.primaryStatus, studentStatusOptions.primary)}
                    {u.secondaryStatus ? ` · ${resolveStatusLabel(u.secondaryStatus, studentStatusOptions.secondary)}` : ''}
                  </Text>
                </View>
              )}

              <Pressable
                style={{ marginTop: 8, alignSelf: 'flex-start', backgroundColor: '#EF4444', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 10 }}
                onPress={() => openEditUser(u)}
                accessibilityRole="button"
              >
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>
                  ✏️ {lang === 'he' ? 'ערוך' : 'Edit'}
                </Text>
              </Pressable>
            </View>
          ))
        )}

      </ScrollView>

      <EditUserModal
        visible={userModal}
        setVisible={setUserModal}
        lang={lang}
        role={editUser?.role || ''}
        setRole={() => {}}
        faculty={editUser?.facultyId || ''}
        setFaculty={() => {}}
        onSave={handleSaveUser}
        saving={saving}
        styles={{}}
        roleLabels={ROLE_LABELS}
        facultyColors={FACULTY_COLORS}
        roles={editRoles}
        setRoles={setEditRoles}

        primaryStatus={editPrimaryStatus}
        setPrimaryStatus={setEditPrimaryStatus}
        secondaryStatus={editSecondaryStatus}
        setSecondaryStatus={setEditSecondaryStatus}
      />

      <NewProjectModal
        visible={showNewProject}
        setVisible={setShowNewProject}
        lang={lang}
        isRtl={isRtl}
        mode="faculty_admin"
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

        facultyIds={newProjectFacultyIds}
        setFacultyIds={setNewProjectFacultyIds}

        degreeTypes={newDegreeTypes}
        setDegreeTypes={setNewDegreeTypes}

        projectTypes={newProjectTypes}
        setProjectTypes={setNewProjectTypes}

        supervisors={allSupervisors}
        selectedSupervisor={selectedSupervisor}
        setSelectedSupervisor={setSelectedSupervisor}

        onCreate={handleCreateProject}
        creating={creating}

        maxStudents={maxStudents}
        setMaxStudents={setMaxStudents}

        projectName={projectName}
        setProjectName={setProjectName}
        
        projectFile={projectFile}
        setProjectFile={setProjectFile}

        selectedProgram={selectedProgram}
        setSelectedProgram={setSelectedProgram}

        pickFile={(b) => pickFile(b)}

        facultyColors={FACULTY_COLORS}
        styles={{}}
      />

      <ChatbotFab lang={lang} corner="bottom-left" />
    </SafeAreaView>
  );
}

const localStyles = FacultyAdminDashboardStyles;