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
} from 'react-native';
import { AppUser, GradingCriterion, SystemStats, UserRecord, ProjectRecord, MilestoneRecord } from '@/types';
import * as DocumentPicker from 'expo-document-picker';
import {SafeAreaView} from 'react-native-safe-area-context'
import { apiClient } from '@/src/api/apiClient';
import { auth } from '../../src/firebase/firebase';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { Lang } from '../../components/i18n';
import {
  TopBar,
  StatCard,
  FacultyBadge,
  StatusBadge,
  getFacultyColor,
  FACULTY_COLORS,
} from '../../components/shared';
import { adminPanelStyles } from '../../constants/styles';
import {ROLE_LABELS} from '../../constants';
import {NewUserModal, AddStudentToProjectModal, MaintenanceModal, EditUserModal, NewProjectModal} from '@/components/modals';

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

  const [users, setUsers] = useState<UserRecord[]>([]);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [milestones, setMilestones] = useState<MilestoneRecord[]>([]);

  const [activeTab, setActiveTab] = useState<
    'overview' | 'users' | 'projects' | 'milestones'
  >('overview');

  const [userSearch, setUserSearch] = useState('');
  const [projectFilter, setProjectFilter] = useState('all');
  const [facultyFilter, setFacultyFilter] = useState('all');

  const [userModal, setUserModal] = useState(false);
  const [editUser, setEditUser] = useState<UserRecord | null>(null);
  const [editRole, setEditRole] = useState('');
  const [editRoles, setEditRoles] = useState<string[]>([]);
  const [editFaculty, setEditFaculty] = useState('');
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
// -----------------------------------------------------------------------------
  const [maintenanceModal, setMaintenanceModal] = useState(false);
  const [maintenanceTitle, setMaintenanceTitle] = useState('');
  const [maintenanceDays, setMaintenanceDays] = useState(0);
  const [maintenanceHours, setMaintenanceHours] = useState(0);
  const [maintenanceMinutes, setMaintenanceMinutes] = useState(0);
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
  const [creating,    setCreating]    = useState(false);
  const [allSupervisors, setAllSupervisors] = useState<AppUser[]>([]);
  const [selectedSupervisor, setSelectedSupervisor] = useState<AppUser | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [maxStudents, setMaxStudents] = useState<number>(1);
  const [gradingCriteria, setGradingCriteria] = useState<GradingCriterion[]>([])
  const [selectedProgram, setSelectedProgram] = React.useState<string | null>(null);
  // ── Add student to project state ──────────────────────────────────────────────
  const [addStudentModal, setAddStudentModal] = useState(false);
  const [addStudentProject, setAddStudentProject] = useState<ProjectRecord | null>(null);
  const [studentSearch, setStudentSearch] = useState('');
  const [addingStudent, setAddingStudent] = useState(false);
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
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllDashboardData();
  }, []);

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
    if (!newUserFaculty) {
      Alert.alert(
        lang === 'he' ? 'שגיאה' : 'Error',
        lang === 'he' ? 'יש לבחור פקולטה' : 'Please select a faculty'
      );
      return;
    }

    setCreatingUser(true);
    
    try {
      const isStudent = newUserRole === 'student';

      // ── 2. Send Clean Parameters to the Server ──────────────────────────
      // Let the Node.js server handle building the Firestore defaults 
      // (like language: 'he', additionalRoles: [], creating the initial notification, etc.)
      await apiClient.post('/api/admin/users/create', {
        displayName:     newUserName.trim(),
        email:           newUserEmail.trim().toLowerCase(),
        phoneNumber:     newUserPhone.trim() || null,
        role:            newUserRole,
        facultyId:       newUserFaculty,
        
        // Student-specific fields passed dynamically
        degreeType:  isStudent ? newUserDegree : null,
        yearOfStudy: isStudent ? (parseInt(newUserYear) || 1) : null,
        major:       isStudent ? (newUserMajor.trim() || newUserFaculty) : null,
        studentId:   isStudent ? (newUserStudentId.trim() || null) : null,
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

      Alert.alert(
        '✅',
        lang === 'he'
          ? `המשתמש ${newUserName} נוצר בהצלחה`
          : `User ${newUserName} created successfully`
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
        gradingCriteria,
      });

      setShowNewProject(false);
      setNewTitleHe(''); setNewTitleEn('');
      setNewDescHe(''); setNewDescEn('');
      setNewSkills('');

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

  const groupedMilestones = Object.values(
    milestones.reduce((acc: any, milestone) => {
      const key = milestone.projectId;
      if (!acc[key]) {
        acc[key] = {
          projectId: milestone.projectId,
          projectTitleHe: milestone.projectTitleHe,
          projectTitleEn: milestone.projectTitleEn,
          facultyId: milestone.facultyId,
          studentNames: milestone.studentNames || [],
          milestones: [],
        };
      }
      acc[key].milestones.push(milestone);
      return acc;
    }, {})
  );

  const filteredUsers = users.filter((u) => {
    const q = userSearch.toLowerCase();
    return (
      u.displayName?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q) ||
      u.role?.toLowerCase().includes(q)
    );
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
      });
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

  const saveMaintenance = async () => {
    try {
      const shutdownTime =
        Date.now() +
        maintenanceDays * 24 * 60 * 60 * 1000 +
        maintenanceHours * 60 * 60 * 1000 +
        maintenanceMinutes * 60 * 1000;

      // 🚀 Replaced direct backend database injection with automated secure gateway routing logic
      await apiClient.post('/api/admin/system/maintenance', {
        title: maintenanceTitle,
        shutdownAt: shutdownTime,
      });

      Alert.alert('Success', lang === 'he' ? 'מצב תחזוקה הופעל' : 'Maintenance mode activated');
      setMaintenanceModal(false);
    } catch (e) {
      console.log(e);
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
        onMaintenance={() => setMaintenanceModal(true)}
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

      <View style={styles.tabsContainer}>
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
            >
              {tab.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <ScrollView
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
          </>
        )}

        {activeTab === 'users' && (
          <>
            <Pressable
                style={[styles.submitBtn, { marginBottom: 14 }]}
                onPress={() => setShowNewUser(true)}
              >
              <Text style={styles.submitBtnText}>
                ➕ {lang === 'he' ? 'הוסף משתמש' : 'Add User'}
              </Text>
            </Pressable>
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

            {filteredUsers.map((u) => {
              const fc = getFacultyColor(u.facultyId);

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
                    <View style={styles.roleBadge}>
                      <Text style={styles.roleBadgeText}>
                        {ROLE_LABELS[u.role]?.[lang]}
                      </Text>
                    </View>

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
                    👤 {project.studentNames.join(', ')}
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

        <View style={{ height: 80 }} />
      </ScrollView>

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

        gradingCriteria={gradingCriteria}
        setGradingCriteria={setGradingCriteria}

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

        styles={styles}
      />

      <MaintenanceModal
        visible={maintenanceModal}
        setVisible={setMaintenanceModal}
        lang={lang}

        title={maintenanceTitle}
        setTitle={setMaintenanceTitle}

        days={maintenanceDays}
        setDays={setMaintenanceDays}

        hours={maintenanceHours}
        setHours={setMaintenanceHours}

        minutes={maintenanceMinutes}
        setMinutes={setMaintenanceMinutes}

        onSave={saveMaintenance}

        styles={styles}
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

        onCreate={handleCreateUser}
        creating={creatingUser}
      />
    </SafeAreaView>
  );
}

const styles = adminPanelStyles;
