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
  orderBy,
} from 'firebase/firestore';

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

import { ROLE_LABELS } from '../../constants';

import {
  NewUserModal,
  AddStudentToProjectModal,
  EditUserModal,
  NewProjectModal,
} from '@/components/modals';

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
  studentNames: string[];
}

export default function PanelScreen() {
  const router = useRouter();

  const [lang, setLang] = useState<Lang>('he');
  const isRtl = lang === 'he';

  const [loading, setLoading] = useState(true);
  const [adminName, setAdminName] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);

  const [users, setUsers] = useState<UserRecord[]>([]);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [milestones, setMilestones] = useState<MilestoneRecord[]>([]);

  const [activeTab, setActiveTab] = useState<
    'overview' | 'users' | 'projects' | 'milestones'
  >('overview');

  const [userModal, setUserModal] = useState(false);
  const [editUser, setEditUser] = useState<UserRecord | null>(null);

  const [saving, setSaving] = useState(false);

  const [showNewUser, setShowNewUser] = useState(false);

  const [newProjectFaculty, setNewProjectFaculty] = useState('');
  const [showNewProject, setShowNewProject] = useState(false);

  const [newTitleHe, setNewTitleHe] = useState('');
  const [newTitleEn, setNewTitleEn] = useState('');
  const [newDescHe, setNewDescHe] = useState('');
  const [newDescEn, setNewDescEn] = useState('');
  const [newDegree, setNewDegree] = useState<'bachelors' | 'masters'>('bachelors');
  const [newType, setNewType] = useState<'project' | 'thesis'>('project');
  const [newSkills, setNewSkills] = useState('');
  const [creating, setCreating] = useState(false);

  const [allSupervisors, setAllSupervisors] = useState<AppUser[]>([]);
  const [selectedSupervisor, setSelectedSupervisor] = useState<AppUser | null>(null);

  const uid = auth.currentUser?.uid;

  const [adminFacultyId, setAdminFacultyId] = useState('');

  // ───────────────────────────────
  // LOAD ADMIN
  // ───────────────────────────────
  useEffect(() => {
    if (!uid) return;

    getDoc(doc(db, 'users', uid)).then((snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setAdminName(data.displayName || 'Admin');
        setAdminFacultyId(data.facultyId || '');
      }
    });
  }, [uid]);

  // ───────────────────────────────
  // USERS (FACULTY ONLY)
  // ───────────────────────────────
  useEffect(() => {
    if (!adminFacultyId) return;

    const q = query(
      collection(db, 'users'),
      where('facultyId', '==', adminFacultyId)
    );

    return onSnapshot(q, (snap) => {
      setUsers(
        snap.docs.map((d) => ({
          id: d.id,
          displayName: d.data().displayName || '',
          email: d.data().email || '',
          role: d.data().role || 'student',
          facultyId: d.data().facultyId || '',
          isActive: d.data().isActive ?? true,
        }))
      );
    });
  }, [adminFacultyId]);

  // ───────────────────────────────
  // PROJECTS (FACULTY ONLY)
  // ───────────────────────────────
  useEffect(() => {
    if (!adminFacultyId) return;

    const q = query(
      collection(db, 'projects'),
      where('isArchived', '==', false),
      where('facultyId', '==', adminFacultyId),
      orderBy('createdAt', 'desc')
    );

    return onSnapshot(q, async (snap) => {
      const items: ProjectRecord[] = [];

      for (const d of snap.docs) {
        const data = d.data();

        let supervisorName = '';
        if (data.supervisorId) {
          const s = await getDoc(doc(db, 'users', data.supervisorId));
          supervisorName = s.data()?.displayName || '';
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
      setLoading(false);
    });
  }, [adminFacultyId]);

  // ───────────────────────────────
  // UPDATE USER (ONLY ACTIVE)
  // ───────────────────────────────
  const toggleUserActive = async (userId: string, current: boolean) => {
    await updateDoc(doc(db, 'users', userId), {
      isActive: !current,
    });
  };

  const openEditUser = (user: UserRecord) => {
    setEditUser(user);
    setUserModal(true);
  };

  const handleSaveUser = async () => {
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
  };

  // ───────────────────────────────
  // CREATE PROJECT
  // ───────────────────────────────
  const handleCreateProject = async () => {
    if (!selectedSupervisor || !adminFacultyId) return;

    setCreating(true);
    try {
      const ref = await addDoc(collection(db, 'projects'), {
        supervisorId: selectedSupervisor.id,
        facultyId: adminFacultyId,
        titleHe: newTitleHe,
        titleEn: newTitleEn,
        descriptionHe: newDescHe,
        descriptionEn: newDescEn,
        degreeType: newDegree,
        projectType: newType,
        requiredSkills: newSkills.split(',').map((s) => s.trim()),
        status: 'published',
        enrolledStudentIds: [],
        isArchived: false,
        createdAt: serverTimestamp(),
      });

      setShowNewProject(false);

      await createMilestonesOnApproval({
        projectId: ref.id,
        studentIds: [],
        facultyId: adminFacultyId,
        supervisorId: selectedSupervisor.id,
      });
    } catch (e) {
      console.log(e);
    } finally {
      setCreating(false);
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
        unreadCount={unreadCount}
        onToggleLang={() => setLang(lang === 'he' ? 'en' : 'he')}
        onBell={() => router.push('/(tabs)/notifications')}
      />

      <ScrollView>

        {/* USERS */}
        {users.map((u) => (
          <View key={u.id}>
            <Text>{u.displayName}</Text>

            <Switch
              value={u.isActive}
              onValueChange={() => toggleUserActive(u.id, u.isActive)}
            />
          </View>
        ))}

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

        faculty={adminFacultyId}
        setFaculty={() => {}}

        degree={newDegree}
        setDegree={setNewDegree}

        type={newType}
        setType={setNewType}

        supervisors={allSupervisors}
        selectedSupervisor={selectedSupervisor}
        setSelectedSupervisor={setSelectedSupervisor}

        onCreate={handleCreateProject}
        creating={creating}

        facultyColors={FACULTY_COLORS}
        styles={{}}
      />
    </SafeAreaView>
  );
}