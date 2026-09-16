// components/modals/AddStudentModal.tsx
//
// Self-contained "Add Student" trigger + form for administrative_secretary
// ("administrative coordinator") and grad_school_head's own "Users"/
// "Students List" tabs (StudentsListSection.tsx and
// administrative_coordinator_dashboard.tsx). Lifts components/modals/
// NewUserModal's state internally (same lifted-state pattern
// ManagedStaffSection.tsx already uses for staff) and locks it to
// role: 'student'. `allowedScopes` (administrative_secretary only, passed
// from administrative_coordinator_dashboard.tsx's own coordinatorScopes)
// locks the faculty/major pickers to her scope client-side. Enforced for
// real server-side either way by adminController.ts's createAdminUser
// (isStudentWithinStaffScope) — StudentsListSection's grad_school_head usage
// omits `allowedScopes` and keeps the faculty picker fully open, same as
// before.

import React, { useState } from 'react';
import { Pressable, Text, Alert } from 'react-native';
import { apiClient } from '../../src/api/apiClient';
import { adminPanelStyles } from '../../constants/styles';
import NewUserModal from './NewUserModal';

interface Props {
  lang: 'he' | 'en';
  isRtl: boolean;
  onCreated: () => void;
  /** grad_school_head can only ever create masters students (see
   *  isStudentWithinStaffScope server-side) — omit for administrative_secretary,
   *  who isn't degree-restricted. */
  lockedDegreeType?: 'bachelors' | 'masters';
  /** administrative_secretary only — her own coordinatorScopes, grouped one
   *  entry per faculty (omitted `majors` = every major in that faculty).
   *  Exactly one entry pre-fills and hides the faculty picker; more than one
   *  restricts it to just those faculties. See NewUserModal's own doc for
   *  how this is applied. */
  allowedScopes?: { facultyId: string; majors?: string[] }[];
}

const s = adminPanelStyles;

function initialFaculty(allowedScopes?: { facultyId: string; majors?: string[] }[]): string {
  return allowedScopes?.length === 1 ? allowedScopes[0]!.facultyId : '';
}

export default function AddStudentModal({ lang, isRtl, onCreated, lockedDegreeType, allowedScopes }: Props) {
  const [visible, setVisible] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPhone, setNewUserPhone] = useState('');
  const [newUserFaculty, setNewUserFaculty] = useState(initialFaculty(allowedScopes));
  const [newUserDegree, setNewUserDegree] = useState<'bachelors' | 'masters' | ''>(lockedDegreeType ?? '');
  const [newUserYear, setNewUserYear] = useState('1');
  const [newUserMajor, setNewUserMajor] = useState('');
  const [newUserStudentId, setNewUserStudentId] = useState('');
  const [newUserTempPassword, setNewUserTempPassword] = useState('');
  const [creating, setCreating] = useState(false);

  const reset = () => {
    setNewUserName('');
    setNewUserEmail('');
    setNewUserPhone('');
    setNewUserFaculty(initialFaculty(allowedScopes));
    setNewUserDegree(lockedDegreeType ?? '');
    setNewUserYear('1');
    setNewUserMajor('');
    setNewUserStudentId('');
    setNewUserTempPassword('');
  };

  const handleCreate = async () => {
    const errorTitle = lang === 'he' ? 'שגיאה' : 'Error';
    if (!newUserName.trim() || !newUserEmail.trim()) {
      Alert.alert(errorTitle, lang === 'he' ? 'יש למלא שם ואימייל' : 'Name and email are required');
      return;
    }
    if (!newUserFaculty) {
      Alert.alert(errorTitle, lang === 'he' ? 'יש לבחור פקולטה' : 'Please select a faculty');
      return;
    }
    if (!newUserMajor) {
      Alert.alert(errorTitle, lang === 'he' ? 'יש לבחור מגמה' : 'Please select a major');
      return;
    }
    setCreating(true);
    try {
      await apiClient.post('/api/admin/users/create', {
        displayName: newUserName.trim(),
        email: newUserEmail.trim().toLowerCase(),
        phoneNumber: newUserPhone.trim() || null,
        role: 'student',
        facultyId: newUserFaculty,
        degreeType: newUserDegree || null,
        yearOfStudy: parseInt(newUserYear, 10) || 1,
        major: newUserMajor.trim(),
        studentId: newUserStudentId.trim() || null,
        tempPassword: newUserTempPassword.trim() || undefined,
      });
      setVisible(false);
      reset();
      onCreated();
    } catch (e: any) {
      Alert.alert(errorTitle, e.response?.data?.message || e.message || (lang === 'he' ? 'יצירת הסטודנט נכשלה' : 'Failed to create student'));
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <Pressable
        onPress={() => setVisible(true)}
        style={s.submitBtn}
        accessibilityRole="button"
      >
        <Text style={s.submitBtnText}>➕ {lang === 'he' ? 'סטודנט חדש' : 'Add Student'}</Text>
      </Pressable>

      <NewUserModal
        visible={visible}
        lang={lang}
        isRtl={isRtl}
        styles={s}
        newUserName={newUserName}
        newUserEmail={newUserEmail}
        newUserPhone={newUserPhone}
        newUserRole="student"
        newUserFaculty={newUserFaculty}
        newUserDegree={newUserDegree}
        newUserYear={newUserYear}
        newUserMajor={newUserMajor}
        newUserStudentId={newUserStudentId}
        newUserTempPassword={newUserTempPassword}
        newUserAssignedMajors={[]}
        setVisible={(v) => { setVisible(v); if (!v) reset(); }}
        setNewUserName={setNewUserName}
        setNewUserEmail={setNewUserEmail}
        setNewUserPhone={setNewUserPhone}
        setNewUserRole={() => {}}
        setNewUserFaculty={setNewUserFaculty}
        setNewUserDegree={setNewUserDegree}
        setNewUserYear={setNewUserYear}
        setNewUserMajor={setNewUserMajor}
        setNewUserStudentId={setNewUserStudentId}
        setNewUserTempPassword={setNewUserTempPassword}
        setNewUserAssignedMajors={() => {}}
        onCreate={handleCreate}
        creating={creating}
        selectableRoles={['student']}
        lockedDegreeType={lockedDegreeType}
        allowedScopes={allowedScopes}
      />
    </>
  );
}
