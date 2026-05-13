import React from 'react';
import {
  View,
  Text,
  Modal,
  ScrollView,
  TextInput,
  Pressable,
  ActivityIndicator,
} from 'react-native';

import { ROLE_LABELS } from '../../constants'; // adjust path if needed
import { FACULTY_COLORS } from '../../components/shared'; // adjust path if needed

type Lang = 'he' | 'en';

interface Props {
  visible: boolean;
  lang: Lang;
  isRtl: boolean;

  // state
  newUserName: string;
  newUserEmail: string;
  newUserPhone: string;
  newUserRole: string;
  newUserFaculty: string;
  newUserDegree: 'bachelors' | 'masters' | '';
  newUserYear: string;
  newUserMajor: string;
  newUserStudentId: string;

  // setters
  setVisible: (v: boolean) => void;
  setNewUserName: (v: string) => void;
  setNewUserEmail: (v: string) => void;
  setNewUserPhone: (v: string) => void;
  setNewUserRole: (v: string) => void;
  setNewUserFaculty: (v: string) => void;
  setNewUserDegree: (v: 'bachelors' | 'masters' | '') => void;
  setNewUserYear: (v: string) => void;
  setNewUserMajor: (v: string) => void;
  setNewUserStudentId: (v: string) => void;

  // actions
  onCreate: () => void;
  creating: boolean;

  styles: any;
}

export default function NewUserModal({
  visible,
  lang,
  isRtl,
  setVisible,

  newUserName,
  newUserEmail,
  newUserPhone,
  newUserRole,
  newUserFaculty,
  newUserDegree,
  newUserYear,
  newUserMajor,
  newUserStudentId,

  setNewUserName,
  setNewUserEmail,
  setNewUserPhone,
  setNewUserRole,
  setNewUserFaculty,
  setNewUserDegree,
  setNewUserYear,
  setNewUserMajor,
  setNewUserStudentId,

  onCreate,
  creating,
  styles,
}: Props) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <ScrollView style={styles.modal} contentContainerStyle={styles.modalContent}>

        {/* Header */}
        <View style={[styles.modalHeader, isRtl && styles.rowReverse]}>
          <Text style={styles.modalTitle}>
            👤 {lang === 'he' ? 'הוספת משתמש חדש' : 'Add New User'}
          </Text>

          <Pressable
            onPress={() => {
              setVisible(false);
              setNewUserName('');
              setNewUserEmail('');
              setNewUserPhone('');
              setNewUserRole('student');
              setNewUserFaculty('');
              setNewUserDegree('bachelors');
              setNewUserYear('1');
              setNewUserMajor('');
              setNewUserStudentId('');
            }}
          >
            <Text style={styles.modalClose}>✕</Text>
          </Pressable>
        </View>

        {/* Basic fields */}
        {[
          {
            label: lang === 'he' ? 'שם מלא *' : 'Full Name *',
            value: newUserName,
            set: setNewUserName,
            placeholder: lang === 'he' ? 'ישראל ישראלי' : 'John Doe',
            keyboard: 'default',
          },
          {
            label: lang === 'he' ? 'אימייל *' : 'Email *',
            value: newUserEmail,
            set: setNewUserEmail,
            placeholder: 'user@university.ac.il',
            keyboard: 'email-address',
          },
          {
            label: lang === 'he' ? 'מספר טלפון' : 'Phone Number',
            value: newUserPhone,
            set: setNewUserPhone,
            placeholder: '050-0000000',
            keyboard: 'phone-pad',
          },
        ].map((f) => (
          <View key={f.label}>
            <Text style={[styles.fieldLabel, isRtl && styles.textRight]}>
              {f.label}
            </Text>
            <TextInput
              style={styles.input}
              value={f.value}
              onChangeText={f.set}
              placeholder={f.placeholder}
              keyboardType={f.keyboard as any}
            />
          </View>
        ))}

        {/* Role */}
        <Text style={styles.sectionDivider}>
          {lang === 'he' ? 'תפקיד' : 'Role'}
        </Text>

        {Object.entries(ROLE_LABELS).map(([role, label]) => (
          <Pressable
            key={role}
            style={[
              styles.roleOption,
              newUserRole === role && styles.roleOptionActive,
            ]}
            onPress={() => setNewUserRole(role)}
          >
            <Text>{label[lang]}</Text>
          </Pressable>
        ))}

        {/* Faculty */}
        <Text style={styles.sectionDivider}>
          {lang === 'he' ? 'פקולטה' : 'Faculty'}
        </Text>

        {Object.entries(FACULTY_COLORS)
          .filter(([k]) => k !== 'default')
          .map(([fid, fc]) => (
            <Pressable
              key={fid}
              style={[
                styles.facultyPickerBtn,
                newUserFaculty === fid && { backgroundColor: fc.primary },
              ]}
              onPress={() => setNewUserFaculty(fid)}
            >
              <Text>{fc.label[lang]}</Text>
            </Pressable>
          ))}

        {/* Student fields */}
        {newUserRole === 'student' && (
          <>
            <Text style={styles.sectionDivider}>
              {lang === 'he' ? 'פרטי סטודנט' : 'Student Details'}
            </Text>

            <TextInput
              style={styles.input}
              value={newUserStudentId}
              onChangeText={setNewUserStudentId}
              placeholder="Student ID"
            />
          </>
        )}

        {/* Submit */}
        <Pressable
          style={styles.submitBtn}
          onPress={onCreate}
          disabled={creating}
        >
          {creating ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitBtnText}>
              ➕ {lang === 'he' ? 'צור משתמש' : 'Create User'}
            </Text>
          )}
        </Pressable>

        <View style={{ height: 40 }} />
      </ScrollView>
    </Modal>
  );
}