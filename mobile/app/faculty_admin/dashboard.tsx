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
  StyleSheet,
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
import { GradingCriterion, AppUser, SystemStats, UserRecord, ProjectRecord, MilestoneRecord } from '@/types'
import { ROLE_LABELS } from '../../constants';

import {
  NewUserModal,
  AddStudentToProjectModal,
  EditUserModal,
  NewProjectModal,
} from '@/components/modals';

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

  const [activeTab, setActiveTab] = useState<
    'overview' | 'users' | 'projects' | 'milestones' | 'deadlines'
  >('overview');

  const [deadlines, setDeadlines] = useState<any[]>([]);
  const [loadingDeadlines, setLoadingDeadlines] = useState(false);

  const [userModal, setUserModal] = useState(false);
  const [editUser, setEditUser] = useState<UserRecord | null>(null);
  const [editFaculty, setEditFaculty] = useState<string>('');
  const [editRole , setEditRole] = useState<string>('');
  const [editRoles, setEditRoles] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [selectedProgram, setSelectedProgram] = React.useState<string | null>(null);
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
  const [newPrerequisites, setNewPrerequisites] = useState('');
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

  useEffect(() => {
    if (activeTab !== 'deadlines') return;
    const fetchDeadlines = async () => {
      try {
        setLoadingDeadlines(true);
        const res = await apiClient.get(`/api/staff/${uid}/deadlines`);
        setDeadlines(res.data.rows || []);
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
        prerequisites: newPrerequisites.split(',').map((s) => s.trim()).filter(Boolean),
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
      />

      <Pressable
        style={{ marginHorizontal: 16, marginTop: 4, marginBottom: 8, backgroundColor: '#EDE9FE', borderRadius: 10, paddingVertical: 10, alignItems: 'center' }}
        onPress={() => router.push('/WorkflowTemplateManager' as any)}
      >
        <Text style={{ color: '#7C3AED', fontWeight: '700', fontSize: 13 }}>
          🧬 {lang === 'he' ? 'ניהול תבניות אבני דרך' : 'Manage Milestone Templates'}
        </Text>
      </Pressable>

      <Pressable
        style={{ marginHorizontal: 16, marginBottom: 8, backgroundColor: '#DBEAFE', borderRadius: 10, paddingVertical: 10, alignItems: 'center' }}
        onPress={() => router.push('/Reports' as any)}
      >
        <Text style={{ color: '#2E86FF', fontWeight: '700', fontSize: 13 }}>
          📊 {lang === 'he' ? 'דוחות' : 'Reports'}
        </Text>
      </Pressable>

      <Pressable style={localStyles.tabBar} onPress={() => setActiveTab('overview')}>
        <Text style={localStyles.tabLabel}>Overview</Text>
      </Pressable>
      <Pressable style={localStyles.tabBar} onPress={() => setActiveTab('deadlines')}> 
        <Text style={localStyles.tabLabel}>{lang === 'he' ? 'מועדי הגשה' : 'DeadLines'}</Text>
      </Pressable>

      <ScrollView>
        {activeTab === 'deadlines' ? (
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
                      <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#E2E8F0' }}>
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
        ) : (
          /* USERS */
          users.map((u) => (
            <View key={u.id}>
              <Text>{u.displayName}</Text>

              <Switch
                value={u.isActive}
                onValueChange={() => toggleUserActive(u.id, u.isActive)}
              />
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

        selectedProgram={selectedProgram}
        setSelectedProgram={setSelectedProgram}

        pickFile={(b) => pickFile(b)}

        facultyColors={FACULTY_COLORS}
        styles={{}}
      />
    </SafeAreaView>
  );
}

const localStyles = StyleSheet.create({
  tabBar: { padding: 10, backgroundColor: '#F3F4F6' },
  tabLabel: { fontSize: 16, fontWeight: '600' },
  deadlineRow: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#F59E0B',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  studentName: { fontSize: 16, fontWeight: '700', color: '#111827' },
  label: { fontSize: 13, fontWeight: '600', color: '#6B7280', marginBottom: 4 },
  value: { fontSize: 13, fontWeight: '500', color: '#111827' },
  small: { fontSize: 13, color: '#666', marginTop: 2 },
  daysLeft: { fontSize: 18, fontWeight: '700' },
});