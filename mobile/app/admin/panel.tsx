// app/admin/panel.tsx
import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  Modal,
  TextInput,
  Alert,
  Switch,
  Dimensions,
} from 'react-native';

import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  updateDoc,
  addDoc,
  serverTimestamp,
  getDoc,
  getDocs,
  setDoc,
  orderBy,
} from 'firebase/firestore';
import { User } from 'firebase/auth';
import { db, auth } from '../../src/firebase/firebase';
import { useRouter } from 'expo-router';
import type { Lang } from '../../components/i18n';
import { createMilestonesOnApproval } from '../../components/Milestoneservice';
import {
  TopBar,
  StatCard,
  FacultyBadge,
  StatusBadge,
  getFacultyColor,
  FACULTY_COLORS,
} from '../../components/shared';

import { Picker } from '@react-native-picker/picker';
import { sendPushNotification } from '@/components/pushNotifications';

const { width } = Dimensions.get('window');

interface AppUser {
  id: string;
  displayName?: string;
  email?: string;
  role?: string;
  facultyId?: string;
  expoPushToken?: string;
}

interface SystemStats {
  totalUsers: number;
  totalProjects: number;
  activeProjects: number;
  totalMilestones: number;
  pendingMilestones: number;
  totalApplications: number;
}

interface UserRecord {
  id: string;
  displayName: string;
  email: string;
  role: string;
  facultyId: string;
  isActive: boolean;
}

interface ProjectRecord {
  id: string;
  titleHe: string;
  titleEn: string;
  facultyId: string;
  status: string;
  supervisorName: string;
  degreeType: string;
  projectType: string;
  academicYear: string;
  enrolledStudentIds: string[];
}

interface MilestoneRecord {
  id: string;
  type: string;
  status: string;
  projectTitleHe: string;
  projectTitleEn: string;
  facultyId: string;
  dueDate: any;
  studentNames: string[];
}

const ROLE_LABELS: Record<string, { he: string; en: string }> = {
  student: { he: 'סטודנט', en: 'Student' },
  supervisor: { he: 'מנחה', en: 'Supervisor' },
  examiner: { he: 'בוחן', en: 'Examiner' },
  coordinator: { he: 'רכז', en: 'Coordinator' },
  faculty_admin: { he: 'מנהל פקולטה', en: 'Faculty Admin' },
  system_admin: { he: 'מנהל מערכת', en: 'System Admin' },
};

const MILESTONE_LABEL: Record<string, { he: string; en: string }> = {
  research_proposal: { he: 'הצעת מחקר', en: 'Research Proposal' },
  progress_report: { he: 'דו״ח התקדמות', en: 'Progress Report' },
  final_report: { he: 'דו״ח סופי', en: 'Final Report' },
  defense: { he: 'הגנה', en: 'Defense' },
};

export default function PanelScreen() {
  const router = useRouter();

  const [lang, setLang] = useState<Lang>('he');
  const isRtl = lang === 'he';

  const [loading, setLoading] = useState(true);
  const [adminName, setAdminName] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);
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
  const [editFaculty, setEditFaculty] = useState('');
  const [saving, setSaving] = useState(false);

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
  const [newDegree,   setNewDegree]   = useState<'bachelors' | 'masters' | 'both'>('bachelors');
  const [newType,     setNewType]     = useState<'project' | 'thesis'>('project');
  const [newSkills,   setNewSkills]   = useState('');
  const [creating,    setCreating]    = useState(false);
  const [allSupervisors, setAllSupervisors] = useState<AppUser[]>([]);
  const [selectedSupervisor, setSelectedSupervisor] = useState<AppUser | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  // ── Add student to project state ──────────────────────────────────────────────
  const [addStudentModal, setAddStudentModal] = useState(false);
  const [addStudentProject, setAddStudentProject] = useState<ProjectRecord | null>(null);
  const [studentSearch, setStudentSearch] = useState('');
  const [addingStudent, setAddingStudent] = useState(false);
  const uid = auth.currentUser?.uid;

  useEffect(() => {
    const fetchSupervisors = async () => {
      // If the admin hasn't picked a faculty, you might show all or none
      let q = query(collection(db, 'users'), where('role', '==', 'supervisor'));
      
      // If faculty is selected, filter by it
      if (newProjectFaculty && newProjectFaculty !== 'multi-faculty') {
        q = query(
          collection(db, 'users'), 
          where('role', '==', 'supervisor'),
          where('facultyId', '==', newProjectFaculty)
        );
      }

      const snap = await getDocs(q);
      setAllSupervisors(
        snap.docs.map(d => ({ 
          id: d.id, 
          ...d.data() 
        } as AppUser)) // Use AppUser here
      );    };
    fetchSupervisors();
  }, [newProjectFaculty]);

  useEffect(() => {
    if (showConfirm && selectedSupervisor) {
      Alert.alert(
        lang === 'he' ? 'אישור מנחה' : 'Confirm Supervisor',
        lang === 'he' 
          ? `האם אתה בטוח שברצונך ש-${selectedSupervisor.displayName} ינהל את הפרויקט ${newTitleHe}?`
          : `Are you sure you want to have ${selectedSupervisor.displayName} control for the project ${newTitleEn}?`,
        [
          {
            text: lang === 'he' ? 'לא' : 'No',
            style: 'cancel',
            onPress: () => {
              setSelectedSupervisor(null);
              setShowConfirm(false);
            }
          },
          {
            text: lang === 'he' ? 'כן' : 'Yes',
            onPress: () => setShowConfirm(false) // Keep the selection
          }
        ]
      );
    }
  }, [showConfirm]);


  useEffect(() => {
    if (!uid) return;

    getDoc(doc(db, 'users', uid)).then((snap) => {
      if (snap.exists()) {
        setAdminName(snap.data().displayName || 'Admin');
      }
    });
  }, [uid]);

  useEffect(() => {
    return onSnapshot(collection(db, 'users'), (snap) => {
      setUsers(snap.docs.map((d) => ({
        id: d.id,
        displayName: d.data().displayName || '',
        email: d.data().email || '',
        role: d.data().role || 'student',
        facultyId: d.data().facultyId || '',
        isActive: d.data().isActive ?? true,
      })));
    }, (error) => {
      console.error('Users listener error:', error);
    });
  }, []);

  useEffect(() => {
  const q = query(
    collection(db, 'projects'),
    where('isArchived', '==', false),
    orderBy('createdAt', 'desc')
  );

  return onSnapshot(q, async (snap) => {
    const items: ProjectRecord[] = [];

    for (const d of snap.docs) {
      const data = d.data();

      // ✅ Guard: only fetch supervisor if ID exists
      let supervisorName = '';
      if (data.supervisorId) {
        const supervisorSnap = await getDoc(doc(db, 'users', data.supervisorId));
        supervisorName = supervisorSnap.data()?.displayName || '';
      }

      items.push({
        id: d.id,
        titleHe: data.titleHe || '',
        titleEn: data.titleEn || '',
        facultyId: data.facultyId || '',
        status: data.status || 'published',
        supervisorName,
        degreeType: data.degreeType || '',
        projectType: data.projectType || '',
        academicYear: data.academicYear || '',
        enrolledStudentIds: data.enrolledStudentIds || [],
      });
    }

    setProjects(items);
  }, (error) => {
    console.error('Projects listener error:', error);
  });
}, []);

  useEffect(() => {
    const statuses = ['pending', 'submitted', 'supervisor_graded'];
    const q = query(
      collection(db, 'milestones'),
      where('status', 'in', statuses)
    );

    return onSnapshot(q, async (snap) => {
      const items: MilestoneRecord[] = [];

      for (const d of snap.docs) {
        const data = d.data();
        const projectSnap = await getDoc(doc(db, 'projects', data.projectId));
        const studentNames: string[] = [];
        for (const sid of data.studentIds || []) {
          const sSnap = await getDoc(doc(db, 'users', sid));
          if (sSnap.exists()) studentNames.push(sSnap.data().displayName);
        }
        items.push({
          id: d.id,
          type: data.type,
          status: data.status,
          projectTitleHe: projectSnap.data()?.titleHe || '',
          projectTitleEn: projectSnap.data()?.titleEn || '',
          facultyId: projectSnap.data()?.facultyId || '',
          dueDate: data.dueDate,
          studentNames,
        });
      }

      setMilestones(items);
      setLoading(false);
    }, (error) => {
      console.error('Milestones listener error:', error);
      setLoading(false); // ← unblocks spinner even on failure
    });
  }, []);

  useEffect(() => {
    if (!uid) return;

    const q = query(
      collection(db, 'notifications'),
      where('recipientId', '==', uid),
      where('isRead', '==', false)
    );

    return onSnapshot(q, (snap) => {
      setUnreadCount(snap.size);
    });
  }, [uid]);


  const handleAddStudentToProject = async (user: UserRecord) => {
    if (!addStudentProject) return;

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
              // Add student to project
              await updateDoc(doc(db, 'projects', addStudentProject.id), {
                enrolledStudentIds: [user.id],
                status: 'in_progress',
                updatedAt: serverTimestamp(),
              });

              // Update student's user doc
              await updateDoc(doc(db, 'users', user.id), {
                hasActiveProject: true,
                activeProjectId: addStudentProject.id,
                updatedAt: serverTimestamp(),
              });

              // Create milestones for the student
              await createMilestonesOnApproval({
                projectId: addStudentProject.id,
                studentIds: [user.id],
                facultyId: addStudentProject.facultyId,
                supervisorId: uid!,
              });

              // Notify the student
              await addDoc(collection(db, 'notifications'), {
                recipientId: user.id,
                type: 'application_approved',
                titleHe: '✅ נוספת לפרויקט',
                titleEn: '✅ Added to Project',
                bodyHe: `מנהל המערכת הוסיף אותך לפרויקט "${addStudentProject.titleHe}"`,
                bodyEn: `System admin added you to project "${addStudentProject.titleEn}"`,
                relatedProjectId: addStudentProject.id,
                relatedMilestoneId: null,
                isRead: false,
                createdAt: serverTimestamp(),
              });

              setAddStudentModal(false);
              setAddStudentProject(null);
              setStudentSearch('');

              Alert.alert(
                '✅',
                lang === 'he'
                  ? `${user.displayName} נוסף לפרויקט בהצלחה`
                  : `${user.displayName} added to project successfully`
              );
            } catch (e) {
              console.error(e);
              Alert.alert('Error', String(e));
            } finally {
              setAddingStudent(false);
            }
          },
        },
      ]
    );
  };
  const createUser = async (
    uid: string,
    role: 'student' | 'supervisor' | 'coordinator',
    email: string
  ) => {
    try {
      const baseUser = {
        uid,
        email,

        displayName:
          role === 'student'
            ? 'דוד כהן'
            : role === 'supervisor'
            ? 'ד"ר ישראל ישראלי'
            : 'רכז הפרויקטים',

        displayNameHe:
          role === 'student'
            ? 'דוד כהן'
            : role === 'supervisor'
            ? 'ד"ר ישראל ישראלי'
            : 'רכז הפרויקטים',

        displayNameEn:
          role === 'student'
            ? 'David Cohen'
            : role === 'supervisor'
            ? 'Dr. Israel Israeli'
            : 'Project Coordinator',

        role,
        facultyId: 'computer_science',
        additionalRoles: [],

        isActive: true,
        profileComplete: true,
        hasActiveProject: false,
        language: 'he',
        expoPushToken: null,
      };

      let userData: any = baseUser;

      if (role === 'student') {
        userData = {
          ...baseUser,
          degreeType: 'bachelors',
          yearOfStudy: 3,
          major: 'computer_science',
          studentId: null,
        };
      }

      if (role === 'supervisor') {
        userData = {
          ...baseUser,
          degreeType: null,
          yearOfStudy: null,
          major: null,
          studentId: null,
        };
      }

      if (role === 'coordinator') {
        userData = {
          ...baseUser,
          degreeType: null,
          yearOfStudy: null,
          major: null,
          studentId: null,
        };
      }

      await setDoc(doc(db, 'users', uid), userData);

      Alert.alert('✅ Success', `${role} created successfully`);
    } catch (e) {
      console.log('Create user error:', e);
    }
  };

  // ── Create project ─────────────────────────────────────────────────────────
  const handleCreateProject = async () => {
    if (!selectedSupervisor) {
      Alert.alert(lang === 'he' ? 'שגיאה' : 'Error',
        lang === 'he' ? 'יש לבחור מנחה' : 'Please select a supervisor');
      return;
    }
    if (!newTitleHe.trim() || !newTitleEn.trim()) {
      Alert.alert(lang === 'he' ? 'שגיאה' : 'Error',
        lang === 'he' ? 'יש למלא כותרת בעברית ואנגלית' : 'Title in both languages is required');
      return;
    }
    // ✅ Faculty is now required
    if (!newProjectFaculty) {
      Alert.alert(lang === 'he' ? 'שגיאה' : 'Error',
        lang === 'he' ? 'יש לבחור פקולטה' : 'Please select a faculty');
      return;
    }
    setCreating(true);
    try {
      const adminSnap = await getDoc(doc(db, 'users', uid!));
      const adminData = adminSnap.data();

      const projectRef = await addDoc(collection(db, 'projects'), {
        supervisorId:       selectedSupervisor?.id || uid,
        facultyId:          newProjectFaculty, // ✅ use selected faculty, not admin's faculty
        titleHe:            newTitleHe.trim(),
        titleEn:            newTitleEn.trim(),
        descriptionHe:      newDescHe.trim(),
        descriptionEn:      newDescEn.trim(),
        degreeType:         newDegree,
        projectType:        newType,
        maxStudents:        1,
        requiredSkills:     newSkills.split(',').map((s) => s.trim()).filter(Boolean),
        status:             'published',
        enrolledStudentIds: [],
        applicationIds:     [],
        semesterStart:      null,
        academicYear:       new Date().getFullYear() + '-' + (new Date().getFullYear() + 1),
        isArchived:         false,
        createdAt:          serverTimestamp(),
        updatedAt:          serverTimestamp(),
      });

      setShowNewProject(false);
      setNewTitleHe(''); setNewTitleEn('');
      setNewDescHe('');  setNewDescEn('');
      setNewSkills('');
      setNewProjectFaculty(''); // ✅ reset faculty

      Alert.alert('✅', lang === 'he' ? 'הפרויקט פורסם בהצלחה!' : 'Project published successfully!');
      await createMilestonesOnApproval({
        projectId: projectRef.id,
        studentIds: [], // No students yet at this stage
        facultyId: newProjectFaculty, // ✅ use selected faculty
        supervisorId: uid!, // ✅ uid IS the supervisor ID
      });
    } catch (e) {
      console.error(e);
    } finally {
      setCreating(false);
    }
  };

  const deleteProject = async (projectId: string) => {
    Alert.alert(
      'Delete Project',
      'Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await updateDoc(doc(db, 'projects', projectId), {
                isArchived: true,
                deletedAt: serverTimestamp(),
              });
            } catch (e) {
              console.log(e);
            }
          },
        },
      ]
    );
  };

  const stats: SystemStats = useMemo(() => {
    return {
      totalUsers: users.length,
      totalProjects: projects.length,
      activeProjects: projects.filter((p) => p.status === 'in_progress')
        .length,
      totalMilestones: milestones.length,
      pendingMilestones: milestones.filter(
        (m) => m.status === 'submitted'
      ).length,
      totalApplications: 0,
    };
  }, [users, projects, milestones]);

  const filteredUsers = users.filter((u) => {
    const q = userSearch.toLowerCase();

    return (
      u.displayName.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      u.role.toLowerCase().includes(q)
    );
  });

  const filteredProjects = projects.filter((p) => {
    const statusOk = projectFilter === 'all' || p.status === projectFilter;
    const facultyOk =
      facultyFilter === 'all' || p.facultyId === facultyFilter;

    return statusOk && facultyOk;
  });

  const openEditUser = (user: UserRecord) => {
    setEditUser(user);
    setEditRole(user.role);
    setEditFaculty(user.facultyId);
    setUserModal(true);
  };

  const handleSaveUser = async () => {
    if (!editUser) return;

    try {
      setSaving(true);

      await updateDoc(doc(db, 'users', editUser.id), {
        role: editRole,
        facultyId: editFaculty,
      });

      Alert.alert(
        'Success',
        lang === 'he'
          ? 'המשתמש עודכן בהצלחה'
          : 'User updated successfully'
      );

      setUserModal(false);
    } catch (e) {
      console.log(e);
    } finally {
      setSaving(false);
    }
  };

  const toggleUserActive = async (
    userId: string,
    current: boolean
  ) => {
    await updateDoc(doc(db, 'users', userId), {
      isActive: !current,
    });
  };

  const saveMaintenance = async () => {
    try {
      const shutdownTime =
        Date.now() +
        maintenanceDays * 24 * 60 * 60 * 1000 +
        maintenanceHours * 60 * 60 * 1000 +
        maintenanceMinutes * 60 * 1000;

      await addDoc(collection(db, 'system'), {
        type: 'maintenance',
        title: maintenanceTitle,
        shutdownAt: shutdownTime,
        messageEn: 'Sorry for the inconvenience',
        messageHe: 'מצטערים על אי הנוחות',
        active: true,
        createdAt: serverTimestamp(),
      });

      Alert.alert(
        'Success',
        lang === 'he'
          ? 'מצב תחזוקה הופעל'
          : 'Maintenance mode activated'
      );

      setMaintenanceModal(false);
    } catch (e) {
      console.log(e);
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
        unreadCount={unreadCount}
        onToggleLang={() => setLang(lang === 'he' ? 'en' : 'he')}
        onBell={() => router.push('/(tabs)/Notificationsscreen')}
        onMaintenance={() => setMaintenanceModal(true)}
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

                    <Pressable
                      style={styles.editBtn}
                      onPress={() => openEditUser(u)}
                    >
                      <Text style={styles.editBtnText}>
                        ✏️ {lang === 'he' ? 'ערוך' : 'Edit'}
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
            {milestones.map((m) => (
              <View key={m.id} style={styles.milestoneCard}>
                <View style={styles.projectHeader}>
                  <Text style={styles.milestoneType}>
                    {MILESTONE_LABEL[m.type]?.[lang]}
                  </Text>

                  <StatusBadge status={m.status} lang={lang} />
                </View>

                <Text style={styles.projectTitle}>
                  {lang === 'he'
                    ? m.projectTitleHe
                    : m.projectTitleEn}
                </Text>

                <Text style={styles.projectMeta}>
                  👤 {m.studentNames.join(', ')}
                </Text>
              </View>
            ))}
          </>
        )}

        <View style={{ height: 80 }} />
      </ScrollView>

      <Modal visible={showNewProject} animationType="slide" presentationStyle="pageSheet">
        <ScrollView style={styles.modal} contentContainerStyle={styles.modalContent}>
          <View style={[styles.modalHeader, isRtl && styles.rowReverse]}>
            <Text style={styles.modalTitle}>
              {lang === 'he' ? 'פרסום פרויקט חדש' : 'Post New Project'}
            </Text>
            <Pressable onPress={() => setShowNewProject(false)}>
              <Text style={styles.modalClose}>✕</Text>
            </Pressable>
          </View>

          {/* Text fields */}
          {[
            { label: lang === 'he' ? 'כותרת בעברית *' : 'Hebrew Title *', value: newTitleHe, set: setNewTitleHe, dir: 'rtl' },
            { label: lang === 'he' ? 'כותרת באנגלית *' : 'English Title *', value: newTitleEn, set: setNewTitleEn, dir: 'ltr' },
            { label: lang === 'he' ? 'תיאור בעברית' : 'Hebrew Description', value: newDescHe, set: setNewDescHe, dir: 'rtl', multi: true },
            { label: lang === 'he' ? 'תיאור באנגלית' : 'English Description', value: newDescEn, set: setNewDescEn, dir: 'ltr', multi: true },
            { label: lang === 'he' ? 'טכנולוגיות (מופרדות בפסיק)' : 'Technologies (comma separated)', value: newSkills, set: setNewSkills, dir: 'ltr' },
          ].map((field) => (
            <View key={field.label}>
              <Text style={[styles.fieldLabel, isRtl && styles.textRight]}>{field.label}</Text>
              <TextInput
                style={[styles.input, field.multi && styles.textarea, { textAlign: field.dir === 'rtl' ? 'right' : 'left' }]}
                value={field.value}
                onChangeText={field.set}
                multiline={field.multi}
                numberOfLines={field.multi ? 4 : 1}
              />
            </View>
          ))}

          {/* ── Faculty selector ── */}
          <Text style={[styles.fieldLabel, isRtl && styles.textRight]}>
            {lang === 'he' ? 'פקולטה *' : 'Faculty *'}
          </Text>
          <View style={styles.facultyGrid}>
            {Object.entries(FACULTY_COLORS)
              .filter(([k]) => k !== 'default')
              .map(([fid, fc]) => (
                <Pressable
                  key={fid}
                  style={[
                    styles.facultyPickerBtn,
                    newProjectFaculty === fid && { backgroundColor: fc.primary, borderColor: fc.primary },
                  ]}
                  onPress={() => setNewProjectFaculty(fid)}
                >
                  <View style={[styles.facultyPickerDot, { backgroundColor: fc.primary }]} />
                  <Text style={[
                    styles.facultyPickerText,
                    newProjectFaculty === fid && { color: '#fff' },
                  ]}>
                    {fc.label[lang]}
                  </Text>
                </Pressable>
              ))}
          </View>

          {/* Degree type */}
          <Text style={[styles.fieldLabel, isRtl && styles.textRight]}>
            {lang === 'he' ? 'סוג תואר' : 'Degree Type'}
          </Text>
          <View style={[styles.toggleRow, isRtl && styles.rowReverse]}>
            {(['bachelors', 'masters', 'both'] as const).map((d) => (
              <Pressable
                key={d}
                style={[styles.toggleBtn, newDegree === d && styles.toggleBtnActive]}
                onPress={() => setNewDegree(d)}
              >
                <Text style={[styles.toggleText, newDegree === d && styles.toggleTextActive]}>
                  {d === 'bachelors' ? (lang === 'he' ? 'תואר ראשון' : 'B.Sc.')
                  : d === 'masters'  ? (lang === 'he' ? 'תואר שני'   : 'M.Sc.')
                  :                    (lang === 'he' ? 'שניהם'       : 'Both')}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Project type */}
          <Text style={[styles.fieldLabel, isRtl && styles.textRight]}>
            {lang === 'he' ? 'סוג פרויקט' : 'Project Type'}
          </Text>
          <View style={[styles.toggleRow, isRtl && styles.rowReverse]}>
            {(['project', 'thesis'] as const).map((tp) => (
              <Pressable
                key={tp}
                style={[styles.toggleBtn, newType === tp && styles.toggleBtnActive]}
                onPress={() => setNewType(tp)}
              >
                <Text style={[styles.toggleText, newType === tp && styles.toggleTextActive]}>
                  {tp === 'project' ? (lang === 'he' ? 'פרויקט' : 'Project')
                                    : (lang === 'he' ? 'תזה'     : 'Thesis')}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.fieldLabel}>
            {lang === 'he' ? 'בחר מנחה' : 'Select Supervisor'}
          </Text>

          {/* 2. The Supervisor List */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {allSupervisors.map((sup) => (
              <Pressable
                key={sup.id}
                style={[
                  styles.supOption,
                  selectedSupervisor?.id === sup.id && styles.supOptionActive
                ]}
                onPress={() => {
                  setSelectedSupervisor(sup);
                  setShowConfirm(true); // Open the confirmation alert/modal
                }}
              >
                <Text>{sup.displayName}</Text>
              </Pressable>
            ))}
          </ScrollView>

          <Pressable
            style={[styles.submitBtn, creating && { opacity: 0.6 }]}
            onPress={handleCreateProject}
            disabled={creating}
          >
            {creating
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.submitBtnText}>
                  {lang === 'he' ? 'פרסם פרויקט' : 'Publish Project'}
                </Text>
            }
          </Pressable>
        </ScrollView>
      </Modal>

      <Modal visible={userModal} animationType="slide">
        <View style={styles.modalRoot}>
          <ScrollView contentContainerStyle={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {lang === 'he' ? 'עריכת משתמש' : 'Edit User'}
              </Text>

              <Pressable onPress={() => setUserModal(false)}>
                <Text style={styles.close}>✕</Text>
              </Pressable>
            </View>

            <Text style={styles.fieldLabel}>
              {lang === 'he' ? 'תפקיד' : 'Role'}
            </Text>

            {Object.entries(ROLE_LABELS).map(([role, label]) => (
              <Pressable
                key={role}
                style={[
                  styles.roleOption,
                  editRole === role && styles.roleOptionActive,
                ]}
                onPress={() => setEditRole(role)}
              >
                <Text
                  style={[
                    styles.roleOptionText,
                    editRole === role && styles.roleOptionTextActive,
                  ]}
                >
                  {label[lang]}
                </Text>
              </Pressable>
            ))}

            <Text style={styles.fieldLabel}>
              {lang === 'he' ? 'פקולטה' : 'Faculty'}
            </Text>

            {Object.entries(FACULTY_COLORS)
              .filter(([k]) => k !== 'default')
              .map(([fid, fc]) => (
                <Pressable
                  key={fid}
                  style={[styles.facultyOption,
                    editFaculty === fid && styles.facultyOptionActive]}
                  onPress={() => setEditFaculty(fid)}
                >
                  <View
                    style={[
                      styles.facultyDot,
                      { backgroundColor: fc.primary },
                    ]}
                  />

                  <Text>{fc.label[lang]}</Text>
                </Pressable>
              ))}

            <Pressable style={styles.submitBtn} onPress={handleSaveUser}>
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.submitBtnText}>
                  {lang === 'he' ? 'שמור' : 'Save'}
                </Text>
              )}
            </Pressable>
          </ScrollView>
        </View>
      </Modal>

      <Modal visible={maintenanceModal} animationType="slide">
        <View style={styles.modalRoot}>
          <ScrollView contentContainerStyle={styles.modalContent}>
            <Text style={styles.modalTitle}>
              🛠️ {lang === 'he' ? 'מצב תחזוקה' : 'Maintenance'}
            </Text>

            <TextInput
              placeholder={lang === 'he' ? 'כותרת' : 'Title'}
              value={maintenanceTitle}
              onChangeText={setMaintenanceTitle}
              style={styles.input}
            />

            <Text style={styles.fieldLabel}>Days</Text>
            <Picker
              selectedValue={maintenanceDays}
              onValueChange={(v) => setMaintenanceDays(v)}
            >
              {[...Array(8).keys()].map((d) => (
                <Picker.Item key={d} label={`${d}`} value={d} />
              ))}
            </Picker>

            <Text style={styles.fieldLabel}>Hours</Text>
            <Picker
              selectedValue={maintenanceHours}
              onValueChange={(v) => setMaintenanceHours(v)}
            >
              {[...Array(24).keys()].map((h) => (
                <Picker.Item key={h} label={`${h}`} value={h} />
              ))}
            </Picker>

            <Text style={styles.fieldLabel}>Minutes</Text>
            <Picker
              selectedValue={maintenanceMinutes}
              onValueChange={(v) => setMaintenanceMinutes(v)}
            >
              {[0, 5, 10, 15, 30, 45, 50, 55].map((m) => (
                <Picker.Item key={m} label={`${m}`} value={m} />
              ))}
            </Picker>

            <Pressable style={styles.submitBtn} onPress={saveMaintenance}>
              <Text style={styles.submitBtnText}>
                {lang === 'he' ? 'שמור ושלח' : 'Save & Send'}
              </Text>
            </Pressable>
          </ScrollView>
        </View>
      </Modal>
      {/* ── Add Student to Project Modal ── */}
      <Modal visible={addStudentModal} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.modalRoot}>

          {/* Header */}
          <View style={styles.addStudentHeader}>
            <View>
              <Text style={styles.addStudentTitle}>
                👤 {lang === 'he' ? 'הוסף סטודנט לפרויקט' : 'Add Student to Project'}
              </Text>
              {addStudentProject && (
                <Text style={styles.addStudentSubtitle} numberOfLines={1}>
                  📁 {lang === 'he' ? addStudentProject.titleHe : addStudentProject.titleEn}
                </Text>
              )}
            </View>
            <Pressable
              onPress={() => {
                setAddStudentModal(false);
                setAddStudentProject(null);
                setStudentSearch('');
              }}
            >
              <Text style={styles.close}>✕</Text>
            </Pressable>
          </View>

          {/* Search */}
          <View style={styles.addStudentSearchBox}>
            <Text style={styles.addStudentSearchIcon}>🔍</Text>
            <TextInput
              style={styles.addStudentSearchInput}
              placeholder={lang === 'he' ? 'חיפוש לפי שם או אימייל...' : 'Search by name or email...'}
              placeholderTextColor="#9BA8C0"
              value={studentSearch}
              onChangeText={setStudentSearch}
              textAlign={isRtl ? 'right' : 'left'}
              autoFocus
            />
            {studentSearch.length > 0 && (
              <Pressable onPress={() => setStudentSearch('')}>
                <Text style={{ color: '#9BA8C0', fontSize: 16, paddingHorizontal: 8 }}>✕</Text>
              </Pressable>
            )}
          </View>

          {/* Student list */}
          <ScrollView contentContainerStyle={{ padding: 16 }}>
            {users
              .filter((u) => {
                // Only show students
                if (u.role !== 'student') return false;
                // Already in this project
                if (addStudentProject?.enrolledStudentIds?.includes(u.id)) return false;
                // Search filter — works for both Hebrew and English
                if (!studentSearch.trim()) return true;
                const q = studentSearch.toLowerCase();
                return (
                  u.displayName.toLowerCase().includes(q) ||
                  u.email.toLowerCase().includes(q)
                );
              })
              .map((u) => {
                const fc = getFacultyColor(u.facultyId);
                return (
                  <Pressable
                    key={u.id}
                    style={styles.studentPickerCard}
                    onPress={() => handleAddStudentToProject(u)}
                    disabled={addingStudent}
                  >
                    <View style={[styles.avatar, { backgroundColor: fc.primary, marginRight: 12 }]}>
                      <Text style={styles.avatarText}>
                        {u.displayName.charAt(0).toUpperCase()}
                      </Text>
                    </View>

                    <View style={{ flex: 1 }}>
                      <Text style={styles.studentPickerName}>{u.displayName}</Text>
                      <Text style={styles.studentPickerEmail}>{u.email}</Text>
                    </View>

                    <Text style={styles.studentPickerArrow}>›</Text>
                  </Pressable>
                );
              })}

            {/* Empty state */}
            {users.filter((u) => {
              if (u.role !== 'student') return false;
              if (addStudentProject?.enrolledStudentIds?.includes(u.id)) return false;
              if (!studentSearch.trim()) return true;
              const q = studentSearch.toLowerCase();
              return u.displayName.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
            }).length === 0 && (
              <View style={{ alignItems: 'center', paddingTop: 40 }}>
                <Text style={{ fontSize: 36, marginBottom: 10 }}>🔍</Text>
                <Text style={{ color: '#9BA8C0', fontSize: 14 }}>
                  {lang === 'he' ? 'לא נמצאו סטודנטים' : 'No students found'}
                </Text>
              </View>
            )}

            <View style={{ height: 40 }} />
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#F3F6FF',
  },

  loader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  hero: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 18,
    backgroundColor: '#fff',
  },

  heroTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#111827',
  },

  heroSub: {
    marginTop: 6,
    fontSize: 13,
    color: '#6B7280',
  },

  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 8,
  },

  tab: {
    flex: 1,
    backgroundColor: '#F1F5FF',
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
  },

  tabActive: {
    backgroundColor: '#EF4444',
  },

  tabText: {
    color: '#64748B',
    fontWeight: '700',
    fontSize: 12,
  },

  tabTextActive: {
    color: '#fff',
  },

  content: {
    padding: 16,
  },

  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
  },

  sectionCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 16,
    marginTop: 18,
  },

  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 16,
  },

  facultyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },

  facultyDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },

  facultyText: {
    width: 90,
    fontWeight: '700',
    color: '#111827',
    fontSize: 12,
  },

  facultyBar: {
    flex: 1,
    height: 8,
    backgroundColor: '#E5E7EB',
    borderRadius: 20,
    overflow: 'hidden',
  },

  facultyFill: {
    height: '100%',
    borderRadius: 20,
  },

  facultyCount: {
    width: 40,
    textAlign: 'right',
    fontWeight: '800',
    color: '#111827',
  },

  searchBox: {
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingHorizontal: 16,
    marginBottom: 14,
  },

  searchInput: {
    height: 52,
    fontSize: 14,
  },

  userCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 16,
    marginBottom: 14,
  },

  userTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },

  avatarText: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 18,
  },

  userName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111827',
  },

  userEmail: {
    marginTop: 2,
    color: '#64748B',
    fontSize: 12,
  },

  userBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 14,
  },

  roleBadge: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
  },

  roleBadgeText: {
    color: '#2563EB',
    fontWeight: '700',
    fontSize: 12,
  },

  editBtn: {
    backgroundColor: '#EF4444',
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 12,
  },

  editBtnText: {
    color: '#fff',
    fontWeight: '700',
  },

  projectCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 16,
    marginBottom: 14,
  },

  projectHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },

  projectTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 8,
  },

  projectMeta: {
    color: '#64748B',
    fontSize: 12,
    marginBottom: 4,
  },

  milestoneCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 16,
    marginBottom: 14,
    borderLeftWidth: 5,
    borderLeftColor: '#F59E0B',
  },

  milestoneType: {
    fontSize: 13,
    fontWeight: '900',
    color: '#F59E0B',
  },

  modalRoot: {
    flex: 1,
    backgroundColor: '#F3F6FF',
  },

  modalContent: {
    padding: 20,
    paddingBottom: 100,
  },

  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },

  modalTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#111827',
  },

  close: {
    fontSize: 24,
    color: '#64748B',
  },

  fieldLabel: {
    marginTop: 16,
    marginBottom: 8,
    fontWeight: '700',
    color: '#111827',
  },

  roleOption: {
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 10,
  },

  roleOptionActive: {
    backgroundColor: '#EF4444',
  },

  roleOptionText: {
    color: '#111827',
    fontWeight: '700',
  },

  roleOptionTextActive: {
    color: '#fff',
  },

  facultyOption: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  facultyOptionActive: {
    backgroundColor: '#EF4444',
  },

  submitBtn: {
    marginTop: 20,
    backgroundColor: '#EF4444',
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
  },

  submitBtnText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 15,
  },

  input: {
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 54,
    marginTop: 10,
  },

  textRight: {
    textAlign: 'right',
  },
  deleteBtn: {
    marginTop: 12,
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FECACA',
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
  },

  deleteBtnText: {
    color: '#DC2626',
    fontSize: 14,
    fontWeight: '700',
  },
  // Modal
  modal:        { flex: 1, backgroundColor: '#F0F4FF' },
  modalClose:   { fontSize: 22, color: '#888', padding: 4 },
  textarea:    { textAlignVertical: 'top', minHeight: 90 },
  toggleRow:   { flexDirection: 'row', gap: 8, marginBottom: 4 },
  rowReverse:  { flexDirection: 'row-reverse' },
  toggleBtn: {
    flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center',
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#E0E8FF',
  },
  toggleBtnActive:  { backgroundColor: '#2E86FF', borderColor: '#2E86FF' },
  toggleText:       { fontSize: 13, fontWeight: '600', color: '#8899BB' },
  toggleTextActive: { color: '#fff' },
  // ── Add student styles ─────────────────────────────────────────────────────
  addStudentBtn: {
    marginTop: 10,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
  },
  addStudentBtnText: {
    color: '#2563EB',
    fontSize: 13,
    fontWeight: '700',
  },
  addStudentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  addStudentTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#111827',
  },
  addStudentSubtitle: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
    maxWidth: 260,
  },
  addStudentSearchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginVertical: 12,
    borderRadius: 14,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#E0E8FF',
    height: 52,
  },
  addStudentSearchIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  addStudentSearchInput: {
    flex: 1,
    fontSize: 14,
    color: '#111',
  },
  studentPickerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  studentPickerName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  studentPickerEmail: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  studentPickerArrow: {
    fontSize: 22,
    color: '#D1D5DB',
    fontWeight: '300',
  },
  facultyGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  facultyPickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#E0E8FF',
    marginBottom: 4,
  },
  facultyPickerDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  facultyPickerText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
  },
  supOption: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
    marginRight: 10,
    borderWidth: 1,
    borderColor: '#ddd',
    minWidth: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },

  supOptionActive: {
    backgroundColor: '#fff',
    borderColor: '#ff4444', // Using a red marker as you requested
    borderWidth: 2,
    // Optional: add a slight shadow for the active state
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
});
