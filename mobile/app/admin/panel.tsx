// app/admin/panel.tsx
import React, { useState, useEffect, useMemo, useRef } from 'react';
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
import {ROLE_LABELS} from '../../constants';
import {NewUserModal, AddStudentToProjectModal, MaintenanceModal, EditUserModal, NewProjectModal} from '@/components/modals';

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
  projectId: string;
  type: string;
  status: string;
  projectTitleHe: string;
  projectTitleEn: string;
  facultyId: string;
  dueDate: any;
  studentNames: string[];
}



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
  const [newDegree,   setNewDegree]   = useState<'bachelors' | 'masters'>('bachelors');
  const [newType,     setNewType]     = useState<'project' | 'thesis'>('project');
  const [newSkills,   setNewSkills]   = useState('');
  const [creating,    setCreating]    = useState(false);
  const [allSupervisors, setAllSupervisors] = useState<AppUser[]>([]);
  const [selectedSupervisor, setSelectedSupervisor] = useState<AppUser | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [maxStudents, setMaxStudents] = useState<number>(1);
  
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
    if (!auth.currentUser) return;
    unsubUsersRef.current = onSnapshot(collection(db, 'users'), (snap) => {
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
    return () => unsubUsersRef.current?.();
  }, []);

  useEffect(() => {
    if (!auth.currentUser) return;
    const q = query(
      collection(db, 'projects'),
      where('isArchived', '==', false),
      orderBy('createdAt', 'desc')
    );

    unsubProjectsRef.current = onSnapshot(q, async (snap) => {
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
    return () => unsubProjectsRef.current?.();
  }, []);

  useEffect(() => {
    if (!auth.currentUser) return;
    const statuses = ['pending', 'submitted', 'supervisor_graded'];
    const q = query(
      collection(db, 'milestones'),
      where('status', 'in', statuses)
    );

    unsubMilestonesRef.current = onSnapshot(q, async (snap) => {
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
          projectId: data.projectId,
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
    return () => unsubMilestonesRef.current?.();
  }, []);

  useEffect(() => {
    if (!auth.currentUser) return;
    const q = query(
      collection(db, 'notifications'),
      where('recipientId', '==', uid),
      where('isRead', '==', false)
    );

    unsubNotifsRef.current = onSnapshot(q, (snap) => {
      setUnreadCount(snap.size);
    });
    return () => unsubNotifsRef.current?.();
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
        maxStudents:        maxStudents,
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
      const expoPushToken = (await getDoc(doc(db, 'users', uid!))).data()?.expoPushToken;
      if (expoPushToken) {
        await sendPushNotification(expoPushToken, lang === 'he' ? '📢 תחזוקה קרוב' : '📢 Maintenance Incoming!',
          lang === 'he'
            ? 'תוחזוקה מערכת מתוכננת. שימו לב עדכון בקרוב.'
            : 'System maintenance is scheduled. Stay tuned for updates.',
            { type: 'maintenance' }
        );
      }
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
        onBell={() => router.push('/(tabs)/notifications')}
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
