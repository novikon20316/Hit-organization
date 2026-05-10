// app/admin/home.tsx
import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet,
  SafeAreaView, ActivityIndicator, Modal, TextInput, Alert, Switch,
} from 'react-native';
import {
  collection, query, where, onSnapshot, getDocs,
  doc, updateDoc, addDoc, serverTimestamp, getDoc, orderBy,
} from 'firebase/firestore';
import { db, auth } from '../../src/firebase/firebase';
import { useRouter } from 'expo-router';
import type { Lang } from '../../components/i18n';
import {
  TopBar, StatCard, FacultyBadge, StatusBadge,
  getFacultyColor, FACULTY_COLORS,
} from '../../components/shared';
import { sendPushNotification } from '../../components/pushNotifications';
import { Picker } from '@react-native-picker/picker';

interface SystemStats {
  totalUsers: number; totalProjects: number;
  activeProjects: number; totalMilestones: number;
  pendingMilestones: number; totalApplications: number;
}

interface UserRecord {
  id: string; displayName: string; email: string;
  role: string; facultyId: string; isActive: boolean;
}

interface ProjectRecord {
  id: string; titleHe: string; titleEn: string;
  facultyId: string; status: string; supervisorName: string;
  degreeType: string; projectType: string; academicYear: string;
  enrolledStudentIds: string[];
}

interface MilestoneRecord {
  id: string; type: string; status: string;
  projectTitleHe: string; projectTitleEn: string;
  facultyId: string; dueDate: any; studentNames: string[];
}

const ROLE_LABELS: Record<string, { he: string; en: string }> = {
  student:       { he: 'סטודנט',        en: 'Student' },
  supervisor:    { he: 'מנחה',           en: 'Supervisor' },
  examiner:      { he: 'בוחן',           en: 'Examiner' },
  coordinator:   { he: 'רכז פרויקטים',  en: 'Coordinator' },
  faculty_admin: { he: 'מנהל פקולטה',   en: 'Faculty Admin' },
  system_admin:  { he: 'מנהל מערכת',    en: 'System Admin' },
};

export default function AdminHome() {
  const router = useRouter();
  const [lang, setLang] = useState<Lang>('he');
  const isRtl = lang === 'he';

  const [stats,      setStats]      = useState<SystemStats | null>(null);
  const [users,      setUsers]      = useState<UserRecord[]>([]);
  const [projects,   setProjects]   = useState<ProjectRecord[]>([]);
  const [milestones, setMilestones] = useState<MilestoneRecord[]>([]);
  const [adminName,  setAdminName]  = useState('');
  const [loading,    setLoading]    = useState(true);
  const [activeTab,  setActiveTab]  = useState<'overview' | 'users' | 'projects' | 'milestones'>('overview');
  const [unreadCount,setUnreadCount]= useState(0);

  // Filters
  const [userSearch,    setUserSearch]    = useState('');
  const [projectFilter, setProjectFilter] = useState('all');
  const [facultyFilter, setFacultyFilter] = useState('all');

  // User edit modal
  const [userModal,  setUserModal]  = useState(false);
  const [editUser,   setEditUser]   = useState<UserRecord | null>(null);
  const [editRole,   setEditRole]   = useState('');
  const [editFaculty,setEditFaculty]= useState('');
  const [saving,     setSaving]     = useState(false);

  const uid = auth.currentUser?.uid;

  // MAINTINANCE MODE
  const [maintenanceModal, setMaintenanceModal] = useState(false);
  const [maintenanceTitle, setMaintenanceTitle] = useState('');
  const [maintenanceDays, setMaintenanceDays] = useState(0);
  const [maintenanceHours, setMaintenanceHours] = useState(0);
  const [maintenanceMinutes, setMaintenanceMinutes] = useState(0);
  const [maintenanceSaving, setMaintenanceSaving] = useState(false);

  const saveMaintenance = async () => {
    try {
      setMaintenanceSaving(true);

      if (!maintenanceTitle) {
        Alert.alert('Error', 'Missing maintenance title');
        return;
      }

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
        createdAt: serverTimestamp(),
        active: true,
      });

      Alert.alert(
        'Success',
        lang === 'he'
          ? 'מצב תחזוקה הופעל ונשלח לכל המשתמשים'
          : 'Maintenance mode activated'
      );

      setMaintenanceModal(false);
      setMaintenanceTitle('');
      setMaintenanceDays(0);
      setMaintenanceHours(0);
      setMaintenanceMinutes(0);
    } catch (e) {
      console.log('Maintenance error:', e);
      Alert.alert('Error', 'Failed to save maintenance mode');
    } finally {
      setMaintenanceSaving(false);
    }
  };

  useEffect(() => {
    if (!uid) return;
    getDoc(doc(db, 'users', uid)).then((snap) => {
      if (snap.exists()) setAdminName(snap.data().displayName ?? '');
    });
  }, [uid]);

  // Load all users
  useEffect(() => {
    return onSnapshot(collection(db, 'users'), (snap) => {
      setUsers(snap.docs.map((d) => ({
        id: d.id,
        displayName: d.data().displayName ?? '',
        email:       d.data().email ?? '',
        role:        d.data().role ?? 'student',
        facultyId:   d.data().facultyId ?? '',
        isActive:    d.data().isActive ?? true,
      })));
    });
  }, []);

  // Load all projects
  useEffect(() => {
    const q = query(collection(db, 'projects'), where('isArchived', '==', false), orderBy('createdAt', 'desc'));
    return onSnapshot(q, async (snap) => {
      const items: ProjectRecord[] = [];
      for (const d of snap.docs) {
        const data = d.data();
        const supervisorSnap = await getDoc(doc(db, 'users', data.supervisorId ?? ''));
        items.push({
          id:                 d.id,
          titleHe:            data.titleHe,
          titleEn:            data.titleEn,
          facultyId:          data.facultyId,
          status:             data.status,
          supervisorName:     supervisorSnap.data()?.displayName ?? '',
          degreeType:         data.degreeType,
          projectType:        data.projectType,
          academicYear:       data.academicYear,
          enrolledStudentIds: data.enrolledStudentIds ?? [],
        });
      }
      setProjects(items);
    });
  }, []);

  // Load all milestones
  useEffect(() => {
    const q = query(
      collection(db, 'milestones'),
      where('status', 'in', ['pending', 'submitted', 'supervisor_graded'])
    );
    return onSnapshot(q, async (snap) => {
      const items: MilestoneRecord[] = [];
      for (const d of snap.docs) {
        const data = d.data();
        const projSnap = await getDoc(doc(db, 'projects', data.projectId));
        const studentNames: string[] = [];
        for (const sid of (data.studentIds ?? [])) {
          const sSnap = await getDoc(doc(db, 'users', sid));
          if (sSnap.exists()) studentNames.push(sSnap.data().displayName);
        }
        items.push({
          id:             d.id,
          type:           data.type,
          status:         data.status,
          projectTitleHe: projSnap.data()?.titleHe ?? '',
          projectTitleEn: projSnap.data()?.titleEn ?? '',
          facultyId:      projSnap.data()?.facultyId ?? '',
          dueDate:        data.dueDate,
          studentNames,
        });
      }
      setMilestones(items);
      setLoading(false);
    });
  }, []);

  // Compute stats from loaded data
  useEffect(() => {
    if (!users.length && !projects.length) return;
    setStats({
      totalUsers:        users.length,
      totalProjects:     projects.length,
      activeProjects:    projects.filter((p) => p.status === 'in_progress').length,
      totalMilestones:   milestones.length,
      pendingMilestones: milestones.filter((m) => m.status === 'submitted').length,
      totalApplications: 0,
    });
  }, [users, projects, milestones]);

  // Notifications
  useEffect(() => {
    if (!uid) return;
    const q = query(
      collection(db, 'notifications'),
      where('recipientId', '==', uid),
      where('isRead', '==', false)
    );
    return onSnapshot(q, (snap) => setUnreadCount(snap.size));
  }, [uid]);

  const handleSaveUser = async () => {
    if (!editUser) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, 'users', editUser.id), {
        role:      editRole,
        facultyId: editFaculty,
      });
      setUserModal(false);
      Alert.alert('✅', lang === 'he' ? 'המשתמש עודכן בהצלחה' : 'User updated successfully');
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const toggleUserActive = async (userId: string, current: boolean) => {
    await updateDoc(doc(db, 'users', userId), { isActive: !current });
  };

  const openEditUser = (user: UserRecord) => {
    setEditUser(user);
    setEditRole(user.role);
    setEditFaculty(user.facultyId);
    setUserModal(true);
  };

  // Filtered data
  const filteredUsers = users.filter((u) => {
    const q = userSearch.toLowerCase();
    return (
      u.displayName.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      u.role.toLowerCase().includes(q)
    );
  });

  const filteredProjects = projects.filter((p) => {
    const statusOk  = projectFilter === 'all' || p.status === projectFilter;
    const facultyOk = facultyFilter === 'all' || p.facultyId === facultyFilter;
    return statusOk && facultyOk;
  });

  const MILESTONE_LABEL: Record<string, { he: string; en: string }> = {
    research_proposal: { he: 'הצעת מחקר',    en: 'Research Proposal' },
    progress_report:   { he: 'דו"ח התקדמות', en: 'Progress Report' },
    final_report:      { he: 'דו"ח מסכם',    en: 'Final Report' },
    defense:           { he: 'הגנה',          en: 'Defense' },
  };

  if (loading) {
    return (
      <View style={a.centered}>
        <ActivityIndicator size="large" color="#EF4444" />
      </View>
    );
  }

  const deleteProject = async (projectId: string) => {
    Alert.alert(
      'Delete Project',
      'Are you sure you want to delete this project?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await updateDoc(doc(db, 'projects', projectId), {
              isArchived: true,
              deletedAt: serverTimestamp(),
            });
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={a.root}>
      <TopBar
        name={adminName}
        role="system_admin"
        lang={lang}
        isRtl={isRtl}
        unreadCount={unreadCount}
        onToggleLang={() => setLang(lang === 'he' ? 'en' : 'he')}
        onBell={() => router.push('/(tabs)/Notificationsscreen')}
        onMaintenance = {() => setMaintenanceModal(true)}
      />

      {/* Tabs */}
      <View style={a.tabBar}>
        {([
          { key: 'overview',   he: 'סקירה',       en: 'Overview' },
          { key: 'users',      he: 'משתמשים',     en: 'Users',       badge: users.length },
          { key: 'projects',   he: 'פרויקטים',    en: 'Projects',    badge: projects.length },
          { key: 'milestones', he: 'אבני דרך',    en: 'Milestones',  badge: milestones.filter(m => m.status === 'submitted').length },
        ] as const).map((tab) => (
          <Pressable
            key={tab.key}
            style={[a.tab, activeTab === tab.key && a.tabActive]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Text style={[a.tabText, activeTab === tab.key && a.tabTextActive]}>
              {lang === 'he' ? tab.he : tab.en}
            </Text>
            {(tab as any).badge > 0 && (
              <View style={[a.tabBadge, activeTab === tab.key && a.tabBadgeActive]}>
                <Text style={[a.tabBadgeText, activeTab === tab.key && { color: '#fff' }]}>
                  {(tab as any).badge}
                </Text>
              </View>
            )}
          </Pressable>
        ))}
      </View>

      <ScrollView contentContainerStyle={a.content} showsVerticalScrollIndicator={false}>

        {/* ════ OVERVIEW ════ */}
        {activeTab === 'overview' && stats && (
          <>
            <Text style={[a.sectionTitle, isRtl && a.textRight]}>
              🏛️ {lang === 'he' ? 'סקירת מערכת' : 'System Overview'}
            </Text>

            <View style={a.statsGrid}>
              <View style={[a.statsRow]}>
                <StatCard emoji="👥" value={stats.totalUsers}
                  label={lang === 'he' ? 'משתמשים' : 'Total Users'} color="#EF4444" />
                <View style={{ width: 10 }} />
                <StatCard emoji="📁" value={stats.totalProjects}
                  label={lang === 'he' ? 'פרויקטים' : 'Projects'} color="#2E86FF" />
              </View>
              <View style={{ height: 10 }} />
              <View style={[a.statsRow]}>
                <StatCard emoji="🔥" value={stats.activeProjects}
                  label={lang === 'he' ? 'פרויקטים פעילים' : 'Active Projects'} color="#F59E0B" />
                <View style={{ width: 10 }} />
                <StatCard emoji="⏳" value={stats.pendingMilestones}
                  label={lang === 'he' ? 'ממתינות לציון' : 'Awaiting Grading'} color="#8B5CF6" />
              </View>
            </View>

            {/* Faculty breakdown */}
            <Text style={[a.sectionTitle, isRtl && a.textRight, { marginTop: 16 }]}>
              🎨 {lang === 'he' ? 'פרויקטים לפי פקולטה' : 'Projects by Faculty'}
            </Text>
            {Object.entries(FACULTY_COLORS).filter(([k]) => k !== 'default').map(([id, fc]) => {
              const count = projects.filter((p) => p.facultyId === id).length;
              if (count === 0) return null;
              return (
                <View key={id} style={[a.facultyRow, isRtl && a.rowReverse]}>
                  <View style={[a.facultyDot, { backgroundColor: fc.primary }]} />
                  <Text style={[a.facultyName, { color: fc.primary }]}>{fc.label[lang]}</Text>
                  <View style={a.facultyBar}>
                    <View style={[a.facultyBarFill, {
                      width: `${Math.min(100, (count / Math.max(projects.length, 1)) * 100)}%`,
                      backgroundColor: fc.primary,
                    }]} />
                  </View>
                  <Text style={a.facultyCount}>{count}</Text>
                </View>
              );
            })}

            {/* Role distribution */}
            <Text style={[a.sectionTitle, isRtl && a.textRight, { marginTop: 16 }]}>
              👤 {lang === 'he' ? 'משתמשים לפי תפקיד' : 'Users by Role'}
            </Text>
            {Object.entries(ROLE_LABELS).map(([role, label]) => {
              const count = users.filter((u) => u.role === role).length;
              if (count === 0) return null;
              return (
                <View key={role} style={[a.roleRow, isRtl && a.rowReverse]}>
                  <Text style={[a.roleLabel, isRtl && a.textRight]}>{label[lang]}</Text>
                  <View style={a.roleGap} />
                  <View style={a.rolePill}>
                    <Text style={a.rolePillText}>{count}</Text>
                  </View>
                </View>
              );
            })}
          </>
        )}

        {/* ════ USERS ════ */}
        {activeTab === 'users' && (
          <>
            <View style={a.searchBar}>
              <TextInput
                style={[a.searchInput, isRtl && a.textRight]}
                placeholder={lang === 'he' ? 'חפש משתמש...' : 'Search user...'}
                placeholderTextColor="#9BA8C0"
                value={userSearch}
                onChangeText={setUserSearch}
                textAlign={isRtl ? 'right' : 'left'}
              />
              <Text style={a.searchIcon}>🔍</Text>
            </View>

            <Text style={[a.resultCount, isRtl && a.textRight]}>
              {filteredUsers.length} {lang === 'he' ? 'משתמשים' : 'users'}
            </Text>

            {filteredUsers.map((u) => {
              const fc = getFacultyColor(u.facultyId);
              return (
                <View key={u.id} style={[a.userCard, !u.isActive && a.userCardInactive]}>
                  <View style={[a.row, isRtl && a.rowReverse]}>
                    <View style={[a.userAvatar, { backgroundColor: u.isActive ? fc.primary : '#CBD5E1' }]}>
                      <Text style={a.userAvatarText}>{u.displayName?.charAt(0)?.toUpperCase()}</Text>
                    </View>
                    <View style={{ marginLeft: isRtl ? 0 : 10, marginRight: isRtl ? 10 : 0, flex: 1 }}>
                      <Text style={[a.userName, isRtl && a.textRight]}>{u.displayName}</Text>
                      <Text style={[a.userEmail, isRtl && a.textRight]}>{u.email}</Text>
                    </View>
                    <Switch
                      value={u.isActive}
                      onValueChange={() => toggleUserActive(u.id, u.isActive)}
                      trackColor={{ false: '#F1F5F9', true: '#BBF7D0' }}
                      thumbColor={u.isActive ? '#10B981' : '#94A3B8'}
                    />
                  </View>

                  <View style={[a.row, isRtl && a.rowReverse, { marginTop: 8 }]}>
                    <View style={[a.userRoleBadge, { backgroundColor: fc.light }]}>
                      <View style={[a.dot, { backgroundColor: fc.primary }]} />
                      <Text style={[a.userRoleText, { color: fc.primary }]}>
                        {ROLE_LABELS[u.role]?.[lang] ?? u.role}
                      </Text>
                    </View>
                    {u.facultyId && (
                      <View style={[a.userRoleBadge, { backgroundColor: fc.light, marginLeft: 6 }]}>
                        <Text style={[a.userRoleText, { color: fc.primary }]}>
                          {getFacultyColor(u.facultyId).label[lang]}
                        </Text>
                      </View>
                    )}
                    <View style={a.rowGap} />
                    <Pressable style={a.editBtn} onPress={() => openEditUser(u)}>
                      <Text style={a.editBtnText}>✏️ {lang === 'he' ? 'ערוך' : 'Edit'}</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </>
        )}

        {/* ════ PROJECTS ════ */}
        {activeTab === 'projects' && (
          <>
            {/* Filters */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              <View style={[a.row, { gap: 8, paddingRight: 8 }]}>
                {['all', 'published', 'in_progress', 'completed'].map((f) => (
                  <Pressable
                    key={f}
                    style={[a.filterChip, projectFilter === f && a.filterChipActive]}
                    onPress={() => setProjectFilter(f)}
                  >
                    <Text style={[a.filterChipText, projectFilter === f && a.filterChipTextActive]}>
                      {f === 'all'         ? (lang === 'he' ? 'הכל'    : 'All')
                       : f === 'published'  ? (lang === 'he' ? 'פורסם'  : 'Published')
                       : f === 'in_progress'? (lang === 'he' ? 'פעיל'   : 'Active')
                       :                     (lang === 'he' ? 'הושלם'  : 'Completed')}
                    </Text>
                  </Pressable>
                ))}
                <View style={a.filterDivider} />
                {['all', ...Object.keys(FACULTY_COLORS).filter(k => k !== 'default')].map((fid) => (
                  <Pressable
                    key={fid}
                    style={[
                      a.filterChip,
                      facultyFilter === fid && [a.filterChipActive, { backgroundColor: getFacultyColor(fid).primary }],
                    ]}
                    onPress={() => setFacultyFilter(fid)}
                  >
                    <Text style={[
                      a.filterChipText,
                      facultyFilter === fid && { color: '#fff' },
                    ]}>
                      {fid === 'all' ? (lang === 'he' ? 'כל הפקולטות' : 'All Faculties')
                        : getFacultyColor(fid).label[lang]}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>

            <Text style={[a.resultCount, isRtl && a.textRight]}>
              {filteredProjects.length} {lang === 'he' ? 'פרויקטים' : 'projects'}
            </Text>

            {filteredProjects.map((p) => {
              const fc = getFacultyColor(p.facultyId);
              return (
                <View key={p.id} style={[a.projectCard, { borderLeftColor: fc.primary }]}>
                  <View style={[a.row, isRtl && a.rowReverse, { marginBottom: 6 }]}>
                    <FacultyBadge facultyId={p.facultyId} lang={lang} />
                    <View style={a.rowGap} />
                    <StatusBadge status={p.status} lang={lang} />
                  </View>
                  <Text style={[a.projectTitle, isRtl && a.textRight]}>
                    {lang === 'he' ? p.titleHe : p.titleEn}
                  </Text>
                  <Text style={[a.projectMeta, isRtl && a.textRight]}>
                    👨‍🏫 {p.supervisorName}
                    {' · '}
                    {lang === 'he'
                      ? p.degreeType === 'bachelors' ? 'תואר ראשון' : p.degreeType === 'masters' ? 'תואר שני' : 'שניהם'
                      : p.degreeType === 'bachelors' ? "B.Sc." : p.degreeType === 'masters' ? "M.Sc." : 'Both'}
                    {' · '}
                    {p.academicYear}
                    {' · '}
                    👥 {p.enrolledStudentIds.length}
                  </Text>
                </View>
              );
            })}
          </>
        )}

        {/* ════ MILESTONES ════ */}
        {activeTab === 'milestones' && (
          <>
            <Text style={[a.sectionTitle, isRtl && a.textRight]}>
              {lang === 'he' ? 'אבני דרך הדורשות טיפול' : 'Milestones Requiring Attention'}
            </Text>

            {milestones.length === 0 ? (
              <View style={a.empty}>
                <Text style={a.emptyEmoji}>🎉</Text>
                <Text style={a.emptyText}>
                  {lang === 'he' ? 'כל אבני הדרך בסדר!' : 'All milestones are on track!'}
                </Text>
              </View>
            ) : (
              milestones.map((m) => {
                const fc      = getFacultyColor(m.facultyId);
                const label   = MILESTONE_LABEL[m.type]?.[lang] ?? m.type;
                const dueDate = m.dueDate?.toDate?.();
                const isOverdue = dueDate && dueDate < new Date() && m.status === 'pending';
                return (
                  <View key={m.id} style={[a.milestoneCard, { borderLeftColor: fc.primary }, isOverdue && a.milestoneOverdue]}>
                    <View style={[a.row, isRtl && a.rowReverse, { marginBottom: 6 }]}>
                      <Text style={[a.milestoneType, { color: fc.primary }]}>{label}</Text>
                      <View style={a.rowGap} />
                      <StatusBadge status={m.status} lang={lang} />
                    </View>
                    <Text style={[a.milestoneProject, isRtl && a.textRight]}>
                      📁 {lang === 'he' ? m.projectTitleHe : m.projectTitleEn}
                    </Text>
                    <Text style={[a.milestoneMeta, isRtl && a.textRight]}>
                      👤 {m.studentNames.join(', ')}
                    </Text>
                    {dueDate && (
                      <Text style={[a.milestoneMeta, isRtl && a.textRight, isOverdue && { color: '#EF4444', fontWeight: '700' }]}>
                        📅 {dueDate.toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-GB', {
                          day: 'numeric', month: 'short', year: 'numeric',
                        })}
                        {isOverdue && (lang === 'he' ? ' — באיחור!' : ' — Overdue!')}
                      </Text>
                    )}
                    <FacultyBadge facultyId={m.facultyId} lang={lang} />
                  </View>
                );
              })
            )}
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ── User Edit Modal ── */}
      <Modal visible={userModal} animationType="slide" presentationStyle="formSheet">
        <View style={a.modal}>
          <ScrollView contentContainerStyle={a.modalContent}>
            <View style={[a.modalHeader, isRtl && a.rowReverse]}>
              <Text style={a.modalTitle}>
                {lang === 'he' ? 'עריכת משתמש' : 'Edit User'}
              </Text>
              <Pressable onPress={() => setUserModal(false)}>
                <Text style={a.modalClose}>✕</Text>
              </Pressable>
            </View>

            {editUser && (
              <View style={a.editUserInfo}>
                <Text style={[a.editUserName, isRtl && a.textRight]}>{editUser.displayName}</Text>
                <Text style={[a.editUserEmail, isRtl && a.textRight]}>{editUser.email}</Text>
              </View>
            )}

            <Text style={[a.fieldLabel, isRtl && a.textRight]}>
              {lang === 'he' ? 'תפקיד' : 'Role'}
            </Text>
            <View style={a.roleGrid}>
              {Object.entries(ROLE_LABELS).map(([role, label]) => (
                <Pressable
                  key={role}
                  style={[a.roleOption, editRole === role && a.roleOptionActive]}
                  onPress={() => setEditRole(role)}
                >
                  <Text style={[a.roleOptionText, editRole === role && a.roleOptionTextActive]}>
                    {label[lang]}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={[a.fieldLabel, isRtl && a.textRight]}>
              {lang === 'he' ? 'פקולטה' : 'Faculty'}
            </Text>
            <View style={a.facultyGrid}>
              {Object.entries(FACULTY_COLORS).filter(([k]) => k !== 'default').map(([fid, fc]) => (
                <Pressable
                  key={fid}
                  style={[
                    a.facultyOption,
                    editFaculty === fid && [a.facultyOptionActive, { borderColor: fc.primary, backgroundColor: fc.light }],
                  ]}
                  onPress={() => setEditFaculty(fid)}
                >
                  <View style={[a.dot, { backgroundColor: fc.primary }]} />
                  <Text style={[a.facultyOptionText, { color: editFaculty === fid ? fc.primary : '#8899BB' }]}>
                    {fc.label[lang]}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Pressable
              style={[a.submitBtn, saving && { opacity: 0.6 }]}
              onPress={handleSaveUser}
              disabled={saving}
            >
              {saving
                ? <ActivityIndicator color="#fff" />
                : <Text style={a.submitBtnText}>{lang === 'he' ? 'שמור שינויים' : 'Save Changes'}</Text>
              }
            </Pressable>
          </ScrollView>
        </View>
      </Modal>
      <Modal visible={maintenanceModal} animationType="slide">
        <View style={a.modal}>
          <ScrollView contentContainerStyle={a.modalContent}>

            <Text style={a.modalTitle}>
              🛠️ {lang === 'he' ? 'מצב תחזוקה' : 'Maintenance Mode'}
            </Text>

            <TextInput
              placeholder={lang === 'he' ? 'כותרת תחזוקה' : 'Maintenance Title'}
              value={maintenanceTitle}
              onChangeText={setMaintenanceTitle}
              style={a.input}
            />

            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              {/* Days */}
              <View style={{ flex: 1 }}>
                <Text style={a.fieldLabel}>
                  {lang === 'he' ? 'ימים' : 'Days'}
                </Text>
                <Picker
                  selectedValue={maintenanceDays}
                  onValueChange={(v) => setMaintenanceDays(v)}
                >
                  {[...Array(8).keys()].map((d) => (
                    <Picker.Item key={d} label={`${d}`} value={d} />
                  ))}
                </Picker>
              </View>

              {/* Hours */}
              <View style={{ flex: 1 }}>
                <Text style={a.fieldLabel}>
                  {lang === 'he' ? 'שעות' : 'Hours'}
                </Text>
                <Picker
                  selectedValue={maintenanceHours}
                  onValueChange={(v) => setMaintenanceHours(v)}
                >
                  {[...Array(24).keys()].map((h) => (
                    <Picker.Item key={h} label={`${h}`} value={h} />
                  ))}
                </Picker>
              </View>

              {/* Minutes */}
              <View style={{ flex: 1 }}>
                <Text style={a.fieldLabel}>
                  {lang === 'he' ? 'דקות' : 'Minutes'}
                </Text>
                <Picker
                  selectedValue={maintenanceMinutes}
                  onValueChange={(v) => setMaintenanceMinutes(v)}
                >
                  {[0, 5, 10, 15, 30, 45, 50, 55].map((m) => (
                    <Picker.Item key={m} label={`${m}`} value={m} />
                  ))}
                </Picker>
              </View>

            </View>

            <View style={a.infoBox}>
              <Text style={a.infoText}>
                {lang === 'he'
                  ? 'הודעה קבועה: מצטערים על אי הנוחות'
                  : 'Fixed message: Sorry for the inconvenience'}
              </Text>
            </View>

            <Pressable
              onPress={saveMaintenance}
              style={a.submitBtn}
              disabled={maintenanceSaving}
            >
              <Text style={a.submitBtnText}>
                {maintenanceSaving
                  ? '...'
                  : lang === 'he'
                    ? 'שמור ושלח'
                    : 'Save & Send'}
              </Text>
            </Pressable>

            <Pressable onPress={() => setMaintenanceModal(false)}>
              <Text style={{ textAlign: 'center', marginTop: 20 }}>
                {lang === 'he' ? 'סגור' : 'Close'}
              </Text>
            </Pressable>

          </ScrollView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const a = StyleSheet.create({
  root:      { flex: 1, backgroundColor: '#F0F4FF' },
  centered:  { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content:   { padding: 16 },
  row:       { flexDirection: 'row', alignItems: 'center' },
  rowReverse:{ flexDirection: 'row-reverse' },
  rowGap:    { flex: 1 },
  textRight: { textAlign: 'right' },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: '#111', marginBottom: 12 },

  // Tabs
  tabBar: {
    flexDirection: 'row', backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#E0E8FF',
  },
  tab: {
    flex: 1, paddingVertical: 11, alignItems: 'center',
    flexDirection: 'row', justifyContent: 'center', gap: 4,
    borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  tabActive:      { borderBottomColor: '#EF4444' },
  tabText:        { fontSize: 11, fontWeight: '600', color: '#8899BB' },
  tabTextActive:  { color: '#EF4444' },
  tabBadge: {
    backgroundColor: '#FEE2E2', borderRadius: 8,
    minWidth: 18, height: 18, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 4,
  },
  tabBadgeActive: { backgroundColor: '#EF4444' },
  tabBadgeText:   { fontSize: 10, fontWeight: '800', color: '#EF4444' },

  // Stats grid
  statsGrid: { marginBottom: 4 },
  statsRow:  { flexDirection: 'row' },

  // Faculty bar chart
  facultyRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  facultyDot: { width: 10, height: 10, borderRadius: 5, marginRight: 8 },
  facultyName:{ fontSize: 12, fontWeight: '600', width: 100 },
  facultyBar: { flex: 1, height: 8, backgroundColor: '#E0E8FF', borderRadius: 4, overflow: 'hidden', marginHorizontal: 8 },
  facultyBarFill: { height: '100%', borderRadius: 4 },
  facultyCount: { fontSize: 12, fontWeight: '800', color: '#111', width: 24, textAlign: 'right' },

  // Role rows
  roleRow:   { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F0F4FF' },
  roleLabel: { fontSize: 13, fontWeight: '600', color: '#445' },
  roleGap:   { flex: 1 },
  rolePill:  { backgroundColor: '#EFF6FF', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 3 },
  rolePillText: { fontSize: 13, fontWeight: '800', color: '#2E86FF' },

  // Search
  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 14, paddingHorizontal: 14,
    borderWidth: 1, borderColor: '#E0E8FF', marginBottom: 10,
  },
  searchInput: { flex: 1, paddingVertical: 12, fontSize: 14, color: '#111' },
  searchIcon:  { fontSize: 18 },
  resultCount: { fontSize: 12, color: '#8899BB', marginBottom: 10, fontWeight: '500' },

  // User card
  userCard: {
    backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: '#E0E8FF',
    shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 4, elevation: 1,
  },
  userCardInactive: { opacity: 0.6 },
  userAvatar: {
    width: 36, height: 36, borderRadius: 18,
    justifyContent: 'center', alignItems: 'center',
  },
  userAvatarText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  userName:       { fontSize: 14, fontWeight: '700', color: '#111' },
  userEmail:      { fontSize: 12, color: '#8899BB' },
  userRoleBadge: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3,
  },
  dot:          { width: 6, height: 6, borderRadius: 3, marginRight: 5 },
  userRoleText: { fontSize: 11, fontWeight: '600' },
  editBtn: {
    backgroundColor: '#EFF6FF', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1, borderColor: '#BFDBFE',
  },
  editBtnText: { fontSize: 12, color: '#2E86FF', fontWeight: '600' },

  // Filter chips
  filterChip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#D0DEFF',
  },
  filterChipActive:    { backgroundColor: '#2E86FF', borderColor: '#2E86FF' },
  filterChipText:      { fontSize: 12, fontWeight: '600', color: '#555' },
  filterChipTextActive:{ color: '#fff' },
  filterDivider:       { width: 1, height: 28, backgroundColor: '#E0E8FF', marginHorizontal: 4, alignSelf: 'center' },

  // Project card
  projectCard: {
    backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 10,
    borderLeftWidth: 4, borderWidth: 1, borderColor: '#E0E8FF',
    shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 4, elevation: 1,
  },
  projectTitle: { fontSize: 14, fontWeight: '700', color: '#111', marginBottom: 4 },
  projectMeta:  { fontSize: 12, color: '#8899BB' },

  // Milestone card
  milestoneCard: {
    backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 10,
    borderLeftWidth: 4, borderWidth: 1, borderColor: '#E0E8FF',
  },
  milestoneOverdue: { backgroundColor: '#FEF2F2' },
  milestoneType:    { fontSize: 13, fontWeight: '800', letterSpacing: 0.3 },
  milestoneProject: { fontSize: 14, fontWeight: '600', color: '#111', marginBottom: 4 },
  milestoneMeta:    { fontSize: 12, color: '#8899BB', marginBottom: 4 },

  // Empty
  empty:     { alignItems: 'center', paddingVertical: 50 },
  emptyEmoji:{ fontSize: 40, marginBottom: 10 },
  emptyText: { fontSize: 15, color: '#8899BB' },

  // Modal
  modal:       { flex: 1, backgroundColor: '#F0F4FF' },
  modalContent:{ padding: 20, paddingBottom: 60 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle:  { fontSize: 18, fontWeight: '800', color: '#111' },
  modalClose:  { fontSize: 22, color: '#888', padding: 4 },
  editUserInfo:{ backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: '#E0E8FF' },
  editUserName:{ fontSize: 16, fontWeight: '700', color: '#111', marginBottom: 2 },
  editUserEmail:{ fontSize: 13, color: '#8899BB' },
  fieldLabel:  { fontSize: 13, fontWeight: '600', color: '#445', marginBottom: 8, marginTop: 14 },

  roleGrid:    { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  roleOption: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10,
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#E0E8FF',
  },
  roleOptionActive:    { backgroundColor: '#EF4444', borderColor: '#EF4444' },
  roleOptionText:      { fontSize: 13, fontWeight: '600', color: '#8899BB' },
  roleOptionTextActive:{ color: '#fff' },

  facultyGrid: { gap: 8 },
  facultyOption: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10,
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#E0E8FF',
  },
  facultyOptionActive: {},
  facultyOptionText:   { fontSize: 13, fontWeight: '600', marginLeft: 8 },

  submitBtn: {
    backgroundColor: '#EF4444', borderRadius: 14, paddingVertical: 15,
    alignItems: 'center', marginTop: 20,
    shadowColor: '#EF4444', shadowOpacity: 0.3, shadowRadius: 10, elevation: 4,
  },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  // Maintenance modal
  maintenanceBtn: {
    backgroundColor: '#111827',
    padding: 12,
    borderRadius: 12,
    marginBottom: 10,
    alignItems: 'center',
  },

  maintenanceBtnText: {
    color: '#fff',
    fontWeight: '700',
  },

  deleteBtn: {
    marginTop: 10,
    backgroundColor: '#FEE2E2',
    padding: 8,
    borderRadius: 10,
    alignItems: 'center',
  },

  deleteBtnText: {
    color: '#EF4444',
    fontWeight: '700',
  },

  input: {
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 10,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: '#E0E8FF',
  },

  infoBox: {
    backgroundColor: '#EFF6FF',
    padding: 10,
    borderRadius: 10,
    marginVertical: 10,
  },

  infoText: {
    fontSize: 12,
    color: '#2E86FF',
    fontWeight: '600',
  },
});