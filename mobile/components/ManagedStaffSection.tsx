// components/ManagedStaffSection.tsx
//
// Shared "Staff" tab body for faculty_admin/program_head/grad_school_head's
// own dashboards — list + search, "+ New Staff", per-row Edit
// (role/faculty/permissions) and active-toggle. Reuses the exact same
// modals system_admin's own panel already has (components/modals/
// NewUserModal, EditUserModal — both now accept optional scope-narrowing
// props) and the same adminPanelStyles system_admin's panel already uses,
// rather than forking a parallel set of components/styles. See
// server/src/config/permissionScopes.ts's DELEGATE_ADMIN_ROLES for the
// three roles this powers, and server/src/controllers/adminController.ts's
// createAdminUser/updateUserRoleAdmin for the matching server-side scope
// enforcement.

import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, Switch, Alert } from 'react-native';
import { apiClient } from '../src/api/apiClient';
import { ROLE_LABELS } from '../constants';
import { FACULTY_COLORS } from './shared';
import { facultyLabel, type FacultyId } from './i18n';
import { adminPanelStyles } from '../constants/styles';
import NewUserModal from './modals/NewUserModal';
import EditUserModal from './modals/EditUserModal';
import { staffFacultyMajorLabel, type ScopeRule, type CoordinatorScope, type ActionType } from '../constants/permissions';

export interface ManagedStaffScope {
  selectableRoles: string[];
  /** Omit for grad_school_head — cross-faculty, so staff can be created in
   *  (and edited into) any faculty. Set for faculty_admin/program_head. */
  lockedFacultyId?: string;
  restrictedActions?: ActionType[];
}

export interface ManagedStaffRecord {
  id: string;
  displayName: string;
  email: string;
  role: string;
  roles?: string[];
  facultyId: string;
  isActive: boolean;
  assignedMajors?: string[];
  permissionRules?: ScopeRule[];
  coordinatorScopes?: CoordinatorScope[];
  primaryStatus?: string | null;
  secondaryStatus?: string | null;
}

interface Props {
  staff: ManagedStaffRecord[];
  onRefresh: () => void;
  scope: ManagedStaffScope;
  lang: 'he' | 'en';
  isRtl: boolean;
}

const s = adminPanelStyles;

export default function ManagedStaffSection({ staff, onRefresh, scope, lang, isRtl }: Props) {
  const [search, setSearch] = useState('');
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // ── New staff ──────────────────────────────────────────────────────────
  const [showNew, setShowNew] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPhone, setNewUserPhone] = useState('');
  const [newUserRole, setNewUserRole] = useState(scope.selectableRoles[0] ?? 'coordinator');
  const [newUserFaculty, setNewUserFaculty] = useState(scope.lockedFacultyId ?? '');
  const [newUserAssignedMajors, setNewUserAssignedMajors] = useState<string[]>([]);
  const [newUserTempPassword, setNewUserTempPassword] = useState('');
  const [creating, setCreating] = useState(false);

  const resetNewUserForm = () => {
    setNewUserName('');
    setNewUserEmail('');
    setNewUserPhone('');
    setNewUserRole(scope.selectableRoles[0] ?? 'coordinator');
    setNewUserFaculty(scope.lockedFacultyId ?? '');
    setNewUserAssignedMajors([]);
    setNewUserTempPassword('');
  };

  const handleCreate = async () => {
    if (!newUserName.trim() || !newUserEmail.trim()) {
      Alert.alert(lang === 'he' ? 'שגיאה' : 'Error', lang === 'he' ? 'יש למלא שם ואימייל' : 'Name and email are required');
      return;
    }
    setCreating(true);
    try {
      await apiClient.post('/api/admin/users/create', {
        displayName: newUserName.trim(),
        email: newUserEmail.trim().toLowerCase(),
        phoneNumber: newUserPhone.trim() || null,
        role: newUserRole,
        facultyId: scope.lockedFacultyId ?? newUserFaculty,
        assignedMajors: newUserAssignedMajors,
        tempPassword: newUserTempPassword.trim() || undefined,
      });
      setShowNew(false);
      resetNewUserForm();
      onRefresh();
    } catch (e: any) {
      Alert.alert(lang === 'he' ? 'שגיאה' : 'Error', e.response?.data?.message || e.message || (lang === 'he' ? 'יצירת המשתמש נכשלה' : 'Failed to create user'));
    } finally {
      setCreating(false);
    }
  };

  // ── Edit staff ─────────────────────────────────────────────────────────
  const [editUser, setEditUser] = useState<ManagedStaffRecord | null>(null);
  const [editRole, setEditRole] = useState('');
  const [editRoles, setEditRoles] = useState<string[]>([]);
  const [editFaculty, setEditFaculty] = useState('');
  const [editAssignedMajors, setEditAssignedMajors] = useState<string[]>([]);
  const [editPermissionRules, setEditPermissionRules] = useState<ScopeRule[]>([]);
  const [editCoordinatorScopes, setEditCoordinatorScopes] = useState<CoordinatorScope[]>([]);
  const [editPrimaryStatus, setEditPrimaryStatus] = useState<string | null>(null);
  const [editSecondaryStatus, setEditSecondaryStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const openEdit = (u: ManagedStaffRecord) => {
    setEditUser(u);
    setEditRole(u.role);
    setEditRoles(u.roles?.length ? u.roles : [u.role]);
    setEditFaculty(u.facultyId);
    setEditAssignedMajors(u.assignedMajors ?? []);
    setEditPermissionRules(u.permissionRules ?? []);
    setEditCoordinatorScopes(u.coordinatorScopes ?? []);
    setEditPrimaryStatus(u.primaryStatus ?? null);
    setEditSecondaryStatus(u.secondaryStatus ?? null);
  };

  const handleSaveEdit = async () => {
    if (!editUser) return;
    setSaving(true);
    try {
      await apiClient.post(`/api/admin/users/${editUser.id}/role-update`, {
        role: editRole,
        roles: editRoles,
        facultyId: scope.lockedFacultyId ?? editFaculty,
        assignedMajors: editAssignedMajors,
        permissionRules: editPermissionRules,
        coordinatorScopes: editCoordinatorScopes,
      });
      if (editRole === 'student' || editRoles.includes('student')) {
        await apiClient.post(`/api/admin/users/${editUser.id}/status`, {
          primaryStatus: editPrimaryStatus,
          secondaryStatus: editSecondaryStatus,
        });
      }
      setEditUser(null);
      onRefresh();
    } catch (e: any) {
      Alert.alert(lang === 'he' ? 'שגיאה' : 'Error', e.response?.data?.message || e.message || (lang === 'he' ? 'העדכון נכשל' : 'Update failed'));
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (u: ManagedStaffRecord) => {
    setTogglingId(u.id);
    try {
      await apiClient.post(`/api/admin/users/${u.id}/toggle-active`, { isActive: !u.isActive });
      onRefresh();
    } catch (e: any) {
      Alert.alert(lang === 'he' ? 'שגיאה' : 'Error', e.response?.data?.message || e.message || (lang === 'he' ? 'הפעולה נכשלה' : 'Action failed'));
    } finally {
      setTogglingId(null);
    }
  };

  // Always includes the target's current role even if it's outside the
  // delegate's manageable set (e.g. opening this on a student whose only
  // actual reason to be here is the primary/secondary status fields) —
  // never silently offer every role to a delegate.
  const editRoleLabels: Record<string, Record<string, string>> = editUser
    ? Object.fromEntries(Object.entries(ROLE_LABELS).filter(([r]) => r === editUser.role || scope.selectableRoles.includes(r)))
    : {};

  const filtered = staff.filter((u) => {
    const q = search.trim().toLowerCase();
    return !q || u.displayName?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q);
  });

  return (
    <View>
      <View style={s.searchBox}>
        <TextInput
          placeholder={lang === 'he' ? 'חפש איש סגל...' : 'Search staff...'}
          value={search}
          onChangeText={setSearch}
          style={s.searchInput}
        />
      </View>

      <Pressable style={[s.submitBtn, { marginBottom: 12 }]} onPress={() => setShowNew(true)} accessibilityRole="button">
        <Text style={s.submitBtnText}>+ {lang === 'he' ? 'איש סגל חדש' : 'New Staff'}</Text>
      </Pressable>

      <ScrollView>
        {filtered.map((u) => (
          <View key={u.id} style={s.projectMilestoneCard}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <View style={{ flex: 1 }}>
                <Text style={s.projectTitle}>{u.displayName}</Text>
                <Text style={s.projectMeta}>{u.email}</Text>
              </View>
              <Switch value={u.isActive} onValueChange={() => handleToggleActive(u)} disabled={togglingId === u.id} />
            </View>
            <Text style={s.projectMeta}>{(ROLE_LABELS as Record<string, { he: string; en: string }>)[u.role]?.[lang] ?? u.role}</Text>
            {u.role !== 'system_admin' && (
              <Text style={[s.projectMeta, { marginTop: 0 }]}>
                {staffFacultyMajorLabel(u.facultyId, u.assignedMajors, lang, (id) => facultyLabel(id as FacultyId, lang))}
              </Text>
            )}
            <Pressable style={[s.submitBtn, { marginTop: 10 }]} onPress={() => openEdit(u)} accessibilityRole="button">
              <Text style={s.submitBtnText}>✏️ {lang === 'he' ? 'ערוך' : 'Edit'}</Text>
            </Pressable>
          </View>
        ))}
        {filtered.length === 0 && <Text style={s.projectMeta}>{lang === 'he' ? 'לא נמצא סגל' : 'No staff found'}</Text>}
      </ScrollView>

      <NewUserModal
        visible={showNew}
        lang={lang}
        isRtl={isRtl}
        styles={s}
        newUserName={newUserName}
        newUserEmail={newUserEmail}
        newUserPhone={newUserPhone}
        newUserRole={newUserRole}
        newUserFaculty={newUserFaculty}
        newUserDegree=""
        newUserYear="1"
        newUserMajor=""
        newUserStudentId=""
        newUserTempPassword={newUserTempPassword}
        newUserAssignedMajors={newUserAssignedMajors}
        setVisible={(v) => { setShowNew(v); if (!v) resetNewUserForm(); }}
        setNewUserName={setNewUserName}
        setNewUserEmail={setNewUserEmail}
        setNewUserPhone={setNewUserPhone}
        setNewUserRole={setNewUserRole}
        setNewUserFaculty={setNewUserFaculty}
        setNewUserDegree={() => {}}
        setNewUserYear={() => {}}
        setNewUserMajor={() => {}}
        setNewUserStudentId={() => {}}
        setNewUserTempPassword={setNewUserTempPassword}
        setNewUserAssignedMajors={setNewUserAssignedMajors}
        onCreate={handleCreate}
        creating={creating}
        selectableRoles={scope.selectableRoles}
        lockedFacultyId={scope.lockedFacultyId}
      />

      {editUser && (
        <EditUserModal
          visible={!!editUser}
          setVisible={(v) => { if (!v) setEditUser(null); }}
          lang={lang}
          role={editRole}
          setRole={setEditRole}
          roles={editRoles}
          setRoles={setEditRoles}
          faculty={editFaculty}
          setFaculty={setEditFaculty}
          roleLabels={editRoleLabels}
          facultyColors={FACULTY_COLORS}
          onSave={handleSaveEdit}
          saving={saving}
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
          lockedFacultyId={scope.lockedFacultyId}
          restrictedActions={scope.restrictedActions}
          styles={s}
        />
      )}
    </View>
  );
}
