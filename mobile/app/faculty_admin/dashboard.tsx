import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  Alert,
  Switch,
  Dimensions,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  serverTimestamp,
} from 'firebase/firestore';
import { apiClient } from '@/src/api/apiClient';
import { auth } from '../../src/firebase/firebase';
import { useRouter } from 'expo-router';
import type { Lang } from '../../components/i18n';

import {
  TopBar,
  FACULTY_COLORS,
} from '../../components/shared';
import { GradingCriterion } from '../../components/modals/NewProjectModal'
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
  const [gradingCriteria, setGradingCriteria] = useState<GradingCriterion[]>([])
  const [newProjectFaculty, setNewProjectFaculty] = useState('');
  const [showNewProject, setShowNewProject] = useState(false);
  const [projectFile, setProjectFile] = useState<string | null>(null);
  const [projectName, setProjectName] = useState<string | null>(null);
  const [newTitleHe, setNewTitleHe] = useState('');
  const [newTitleEn, setNewTitleEn] = useState('');
  const [newDescHe, setNewDescHe] = useState('');
  const [newDescEn, setNewDescEn] = useState('');
  const [newDegree, setNewDegree] = useState<'bachelors' | 'masters'>('bachelors');
  const [newType, setNewType] = useState<'project' | 'thesis'>('project');
  const [newSkills, setNewSkills] = useState('');
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
      setUnreadCount(response.data.unreadCount || 0);
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

  // ─── 🆕 CRUD Request Actions ──────────────────────────────────────────────
  
  // ─── 🆕 Fix: handleSaveUser Parameters Matching () => void ──────────────
  const handleSaveUser = async () => {
    if (!editUser) return;

    try {
      setSaving(true);
      // Synchronize modal changes seamlessly to the API backend
      await apiClient.post(`/api/admin/users/${editUser.id}`, {
        isActive: editUser.isActive,
        role: editUser.role,
        facultyId: editUser.facultyId
      });

      Alert.alert('Success', 'User metadata aligned successfully');
      setUserModal(false);
      await fetchAdminDashboard();
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Failed to execute user schema updates');
    } finally {
      setSaving(false);
    }
  };

  // ─── 🆕 Fix: toggleUserActive Definition ───────────────────────────────
  const toggleUserActive = async (userId: string, currentStatus: boolean) => {
    try {
      await apiClient.post(`/api/admin/users/${userId}/toggle-active`, {
        isActive: !currentStatus,
      });
      // Perform hot reloading update directly on state items array
      setUsers((prevUsers) =>
        prevUsers.map((u) => (u.id === userId ? { ...u, isActive: !currentStatus } : u))
      );
    } catch (err) {
      console.error(err);
      Alert.alert('Error', 'Failed to update user accessibility permission');
    }
  };

  const openEditUser = (user: UserRecord) => {
    setEditUser(user);
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
    if (!selectedSupervisor || !adminFacultyId) return;

    try {
      setSaving(true);
      await apiClient.post('/api/admin/projects', {
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

      /*
      await createMilestonesOnApproval({
        projectId: ref.id,
        studentIds: [],
        facultyId: adminFacultyId,
        supervisorId: selectedSupervisor.id,
      });*/

      await fetchAdminDashboard();
    } catch (e) {
      console.log(e);
    } finally {
      setCreating(false);
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

        maxStudents={maxStudents}
        setMaxStudents={setMaxStudents}

        projectName={projectName}
        setProjectName={setProjectName}
        
        projectFile={projectFile}
        setProjectFile={setProjectFile}

        gradingCriteria={gradingCriteria}
        setGradingCriteria={setGradingCriteria}

        pickFile={(b) => pickFile(b)}

        facultyColors={FACULTY_COLORS}
        styles={{}}
      />
    </SafeAreaView>
  );
}