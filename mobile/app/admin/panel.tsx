// app/admin/panel.tsx
import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
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
import { adminPanelStyles } from '../../constants/styles';

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

  const handleCreateUser = async () => {
    if (!newUserName.trim()) {
      Alert.alert(lang === 'he' ? 'שגיאה' : 'Error',
        lang === 'he' ? 'יש למלא שם' : 'Name is required');
      return;
    }
    if (!newUserEmail.trim()) {
      Alert.alert(lang === 'he' ? 'שגיאה' : 'Error',
        lang === 'he' ? 'יש למלא אימייל' : 'Email is required');
      return;
    }
    if (!newUserFaculty) {
      Alert.alert(lang === 'he' ? 'שגיאה' : 'Error',
        lang === 'he' ? 'יש לבחור פקולטה' : 'Please select a faculty');
      return;
    }

    setCreatingUser(true);
    try {
      const tempDocRef = doc(collection(db, 'users'));
      const isStudent = newUserRole === 'student';

      await setDoc(tempDocRef, {
        uid:             tempDocRef.id,
        displayName:     newUserName.trim(),
        displayNameHe:   newUserName.trim(),
        displayNameEn:   newUserName.trim(),
        email:           newUserEmail.trim().toLowerCase(),
        phoneNumber:     newUserPhone.trim() || null,
        role:            newUserRole,
        facultyId:       newUserFaculty,
        additionalRoles: [],
        isActive:        true,
        profileComplete: false,
        hasActiveProject: false,
        language:        'he',
        expoPushToken:   null,
        createdAt:       serverTimestamp(),

        // Student-specific
        degreeType:  isStudent ? newUserDegree : null,
        yearOfStudy: isStudent ? parseInt(newUserYear) || 1 : null,
        major:       isStudent ? (newUserMajor.trim() || newUserFaculty) : null,
        studentId:   isStudent ? (newUserStudentId.trim() || null) : null,
      });

      await addDoc(collection(db, 'notifications'), {
        recipientId: tempDocRef.id,
        type:        'account_created',
        titleHe:     '👋 ברוך הבא למערכת',
        titleEn:     '👋 Welcome to the System',
        bodyHe:      'חשבונך נוצר על ידי מנהל המערכת',
        bodyEn:      'Your account was created by the system admin',
        isRead:      false,
        createdAt:   serverTimestamp(),
      });

      // Reset all fields
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

      Alert.alert('✅', lang === 'he'
        ? `המשתמש ${newUserName} נוצר בהצלחה`
        : `User ${newUserName} created successfully`);
    } catch (e) {
      console.error('Create user error:', e);
      Alert.alert('Error', String(e));
    } finally {
      setCreatingUser(false);
    }
  };

  // ── Create project ─────────────────────────────────────────────────────────
  const handleCreateProject = async () => {
    if((newUserPhone.trim() && !/^\+?\d{10,15}$/.test(newUserPhone.trim())) || newUserPhone.length > 10){
      Alert.alert(lang === 'he' ? 'שגיאה' : 'Error',
        lang === 'he' ? 'מספר טלפון לא תקין' : 'Invalid phone number');
      return;
    }
    else if(newUserStudentId && !/^\d{5,}$/.test(newUserStudentId.trim()) && newUserStudentId.length >= 5){
      Alert.alert(lang === 'he' ? 'שגיאה' : 'Error',
        lang === 'he' ? 'מספר סטודנט לא תקין' : 'Invalid student ID');
      return;
    }
    else if (!selectedSupervisor) {
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
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                🛠️ {lang === 'he' ? 'מצב תחזוקה' : 'Maintenance'}
              </Text>
              <Pressable onPress={() => setMaintenanceModal(false)}>
                <Text style={styles.close}>✕</Text>
              </Pressable>
            </View>
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
      <Modal visible={showNewUser} animationType="slide" presentationStyle="pageSheet">
        <ScrollView style={styles.modal} contentContainerStyle={styles.modalContent}>

          {/* Header */}
          <View style={[styles.modalHeader, isRtl && styles.rowReverse]}>
            <Text style={styles.modalTitle}>
              👤 {lang === 'he' ? 'הוספת משתמש חדש' : 'Add New User'}
            </Text>
            <Pressable onPress={() => {
              setShowNewUser(false);
              setNewUserName(''); setNewUserEmail(''); setNewUserPhone('');
              setNewUserRole('student'); setNewUserFaculty('');
              setNewUserDegree('bachelors'); setNewUserYear('1');
              setNewUserMajor(''); setNewUserStudentId('');
            }}>
              <Text style={styles.modalClose}>✕</Text>
            </Pressable>
          </View>

          {/* ── Basic info ── */}
          <Text style={styles.sectionDivider}>
            {lang === 'he' ? '📋 פרטים בסיסיים' : '📋 Basic Info'}
          </Text>

          {[
            {
              label:       lang === 'he' ? 'שם מלא *'   : 'Full Name *',
              value:       newUserName,
              set:         setNewUserName,
              placeholder: lang === 'he' ? 'ישראל ישראלי' : 'John Doe',
              keyboard:    'default' as const,
              dir:         'auto',
            },
            {
              label:       lang === 'he' ? 'אימייל *'   : 'Email *',
              value:       newUserEmail,
              set:         setNewUserEmail,
              placeholder: 'user@university.ac.il',
              keyboard:    'email-address' as const,
              dir:         'ltr',
            },
            {
              label:       lang === 'he' ? 'מספר טלפון' : 'Phone Number',
              value:       newUserPhone,
              set:         setNewUserPhone,
              placeholder: lang === 'he' ? '050-0000000' : '050-0000000',
              keyboard:    'phone-pad' as const,
              dir:         'ltr',
            },
          ].map((field) => (
            <View key={field.label}>
              <Text style={[styles.fieldLabel, isRtl && styles.textRight]}>
                {field.label}
              </Text>
              <TextInput
                style={[styles.input, { textAlign: field.dir === 'ltr' ? 'left' : (isRtl ? 'right' : 'left') }]}
                value={field.value}
                onChangeText={field.set}
                placeholder={field.placeholder}
                placeholderTextColor="#9BA8C0"
                keyboardType={field.keyboard}
                autoCapitalize="none"
              />
            </View>
          ))}

          {/* ── Role ── */}
          <Text style={styles.sectionDivider}>
            {lang === 'he' ? '🎭 תפקיד ופקולטה' : '🎭 Role & Faculty'}
          </Text>

          <Text style={[styles.fieldLabel, isRtl && styles.textRight]}>
            {lang === 'he' ? 'תפקיד *' : 'Role *'}
          </Text>
          <View style={{ gap: 8 }}>
            {Object.entries(ROLE_LABELS)
              .filter(([r]) => r !== 'system_admin')
              .map(([role, label]) => (
                <Pressable
                  key={role}
                  style={[styles.roleOption, newUserRole === role && styles.roleOptionActive]}
                  onPress={() => setNewUserRole(role)}
                >
                  <Text style={[styles.roleOptionText, newUserRole === role && styles.roleOptionTextActive]}>
                    {label[lang]}
                  </Text>
                </Pressable>
              ))}
          </View>

          {/* ── Faculty ── */}
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
                    newUserFaculty === fid && { backgroundColor: fc.primary, borderColor: fc.primary },
                  ]}
                  onPress={() => setNewUserFaculty(fid)}
                >
                  <View style={[styles.facultyPickerDot, { backgroundColor: fc.primary }]} />
                  <Text style={[
                    styles.facultyPickerText,
                    newUserFaculty === fid && { color: '#fff' },
                  ]}>
                    {fc.label[lang]}
                  </Text>
                </Pressable>
              ))}
          </View>

          {/* ── Student-only fields ── */}
          {newUserRole === 'student' && (
            <>
              <Text style={styles.sectionDivider}>
                {lang === 'he' ? '🎓 פרטי סטודנט' : '🎓 Student Details'}
              </Text>

              {/* Student ID */}
              <Text style={[styles.fieldLabel, isRtl && styles.textRight]}>
                {lang === 'he' ? 'מספר סטודנט' : 'Student ID'}
              </Text>
              <TextInput
                style={[styles.input, { textAlign: 'left' }]}
                value={newUserStudentId}
                onChangeText={setNewUserStudentId}
                placeholder="123456789"
                placeholderTextColor="#9BA8C0"
                keyboardType="number-pad"
              />

              {/* Degree type */}
              <Text style={[styles.fieldLabel, isRtl && styles.textRight]}>
                {lang === 'he' ? 'סוג תואר *' : 'Degree Type *'}
              </Text>
              <View style={[styles.toggleRow, isRtl && styles.rowReverse]}>
                {(['bachelors', 'masters'] as const).map((d) => (
                  <Pressable
                    key={d}
                    style={[styles.toggleBtn, newUserDegree === d && styles.toggleBtnActive]}
                    onPress={() => {
                      setNewUserDegree(d);
                      // If switching to masters, reset year to 1 or 2 only
                      if (d === 'masters' && (newUserYear === '3' || newUserYear === '4')) {
                        setNewUserYear('1');
                      }
                    }}
                  >
                    <Text style={[styles.toggleText, newUserDegree === d && styles.toggleTextActive]}>
                      {d === 'bachelors'
                        ? (lang === 'he' ? 'תואר ראשון' : 'B.Sc.')
                        : (lang === 'he' ? 'תואר שני'   : 'M.Sc.')}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {/* Year of study */}
              <Text style={[styles.fieldLabel, isRtl && styles.textRight]}>
                {lang === 'he' ? 'שנת לימוד' : 'Year of Study'}
              </Text>
              <View style={[styles.toggleRow, isRtl && styles.rowReverse]}>
                {(['1', '2', '3', '4'] as const).map((y) => {
                  const isMastersOnly = newUserDegree === 'masters';
                  const engineeringFaculties = ['הנדסת חשמל ואלקטרוניקה', 'הנדסת תעשייה וניהול טכנולוגיה'];
                  const isDisabled = ((isMastersOnly && (y === '3' || y === '4'))||(y === '4' && !engineeringFaculties.includes(newUserFaculty))); // Year 4 is only for bachelors, Year 3 and 4 are only for masters
                  return (
                    <Pressable
                      key={y}
                      style={[
                        styles.toggleBtn,
                        newUserYear === y && styles.toggleBtnActive,
                        isDisabled && styles.toggleBtnDisabled,
                      ]}
                      onPress={() => {
                        if (!isDisabled) setNewUserYear(y);
                      }}
                      disabled={isDisabled}
                    >
                      <Text style={[
                        styles.toggleText,
                        newUserYear === y && styles.toggleTextActive,
                        isDisabled && styles.toggleTextDisabled,
                      ]}>
                        {lang === 'he' ? `שנה ${y}` : `Year ${y}`}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {/* Major */}
              <Text style={[styles.fieldLabel, isRtl && styles.textRight]}>
                {lang === 'he' ? 'מגמה / התמחות *' : 'Major / Specialization *'}
              </Text>
              <View style={{ gap: 8 }}>
                {[
                  { id: 'science',              he: 'מדעים',                                      en: 'Science'                                     },
                  { id: 'electrical',           he: 'הנדסת חשמל ואלקטרוניקה',                    en: 'Electrical & Electronics Engineering'        },
                  { id: 'learning_technology',  he: 'טכנולוגיות למידה',                           en: 'Learning Technologies'                       },
                  { id: 'design',               he: 'עיצוב',                                      en: 'Design'                                      },
                  { id: 'industrial',           he: 'הנדסת תעשייה וניהול טכנולוגיה',              en: 'Industrial Engineering & Technology Management'},
                  { id: 'medical_technologies', he: 'טכנולוגיות רפואיות',                         en: 'Medical Technologies'                        },
                ].map((major) => (
                  <Pressable
                    key={major.id}
                    style={[
                      styles.majorOption,
                      newUserMajor === major.id && styles.majorOptionActive,
                    ]}
                    onPress={() => setNewUserMajor(major.id)}
                  >
                    <View style={styles.majorOptionInner}>
                      <Text style={[
                        styles.majorOptionText,
                        newUserMajor === major.id && styles.majorOptionTextActive,
                      ]}>
                        {lang === 'he' ? major.he : major.en}
                      </Text>
                      {newUserMajor === major.id && (
                        <Text style={styles.majorCheckmark}>✓</Text>
                      )}
                    </View>
                    {/* Always show both languages as subtitle */}
                    <Text style={[
                      styles.majorOptionSub,
                      newUserMajor === major.id && styles.majorOptionSubActive,
                    ]}>
                      {lang === 'he' ? major.en : major.he}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </>
          )}

          {/* ── Preview ── */}
          {newUserName.trim() && newUserFaculty && (
            <View style={styles.userPreview}>
              <Text style={styles.userPreviewTitle}>
                {lang === 'he' ? 'תצוגה מקדימה' : 'Preview'}
              </Text>
              <Text style={styles.userPreviewRow}>👤 {newUserName}</Text>
              <Text style={styles.userPreviewRow}>📧 {newUserEmail || '—'}</Text>
              {newUserPhone ? <Text style={styles.userPreviewRow}>📞 {newUserPhone}</Text> : null}
              <Text style={styles.userPreviewRow}>🎭 {ROLE_LABELS[newUserRole]?.[lang]}</Text>
              <Text style={styles.userPreviewRow}>🏛️ {FACULTY_COLORS[newUserFaculty]?.label[lang]}</Text>
              {newUserRole === 'student' && (
                <>
                  {newUserStudentId ? <Text style={styles.userPreviewRow}>🪪 {newUserStudentId}</Text> : null}
                  <Text style={styles.userPreviewRow}>
                    🎓 {newUserDegree === 'bachelors'
                      ? (lang === 'he' ? 'תואר ראשון' : "B.Sc.")
                      : (lang === 'he' ? 'תואר שני'   : "M.Sc.")}
                    {' · '}
                    {lang === 'he' ? `שנה ${newUserYear}` : `Year ${newUserYear}`}
                  </Text>
                  {newUserMajor ? <Text style={styles.userPreviewRow}>📚 {newUserMajor}</Text> : null}
                </>
              )}
            </View>
          )}

          <Pressable
            style={[styles.submitBtn, creatingUser && { opacity: 0.6 }]}
            onPress={handleCreateUser}
            disabled={creatingUser}
          >
            {creatingUser
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.submitBtnText}>
                  ➕ {lang === 'he' ? 'צור משתמש' : 'Create User'}
                </Text>
            }
          </Pressable>

          <View style={{ height: 40 }} />
        </ScrollView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = adminPanelStyles;
