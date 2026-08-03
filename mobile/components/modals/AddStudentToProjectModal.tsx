import React from 'react';
import {
  View,
  Text,
  Modal,
  ScrollView,
  TextInput,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface UserRecord {
  id: string;
  displayName: string;
  email: string;
  role: string;
  roles: string[];
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

type Lang = 'he' | 'en';

interface Props {
  visible: boolean;
  lang: Lang;
  isRtl: boolean;

  users: UserRecord[];
  project: ProjectRecord | null;
  studentSearch: string;
  setStudentSearch: (v: string) => void;

  setVisible: (v: boolean) => void;
  setProject: (p: ProjectRecord | null) => void;

  addingStudent: boolean;

  onAddStudent: (user: UserRecord) => void | Promise<void>;

  getFacultyColor: (id: string) => any;
  styles: any;
}

export default function AddStudentToProjectModal({
  visible,
  lang,
  isRtl,

  users,
  project,
  studentSearch,
  setStudentSearch,

  setVisible,
  setProject,

  addingStudent,
  onAddStudent,

  getFacultyColor,
  styles,
}: Props) {
  const filteredUsers = users.filter((u) => {
    if (u.role !== 'student') return false;
    if (project?.enrolledStudentIds?.includes(u.id)) return false;

    if (!studentSearch.trim()) return true;

    const q = studentSearch.toLowerCase();
    return (
      u.displayName.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q)
    );
  });

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <SafeAreaView style={styles.modalRoot}>

        {/* Header */}
        <View style={styles.addStudentHeader}>
          <View>
            <Text style={styles.addStudentTitle}>
              👤 {lang === 'he' ? 'הוסף סטודנט לפרויקט' : 'Add Student to Project'}
            </Text>

            {project && (
              <Text style={styles.addStudentSubtitle} numberOfLines={1}>
                📁 {lang === 'he' ? project.titleHe : project.titleEn}
              </Text>
            )}
          </View>

          <Pressable
            onPress={() => {
              setVisible(false);
              setProject(null);
              setStudentSearch('');
            }}
          >
            <Text style={styles.close}>✕</Text>
          </Pressable>
        </View>

        {/* Search */}
        <View style={styles.addStudentSearchBox}>
          <TextInput
            style={styles.addStudentSearchInput}
            placeholder={
              lang === 'he'
                ? 'חיפוש לפי שם או אימייל...'
                : 'Search by name or email...'
            }
            placeholderTextColor="#9BA8C0"
            value={studentSearch}
            onChangeText={setStudentSearch}
            textAlign={isRtl ? 'right' : 'left'}
            autoFocus
          />

          {studentSearch.length > 0 && (
            <Pressable onPress={() => setStudentSearch('')}>
              <Text style={{ color: '#9BA8C0', fontSize: 16 }}>✕</Text>
            </Pressable>
          )}
        </View>

        {/* List */}
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          {filteredUsers.map((u) => {
            const fc = getFacultyColor(u.facultyId);

            return (
              <Pressable
                key={u.id}
                style={styles.studentPickerCard}
                onPress={() => onAddStudent(u)}
                disabled={addingStudent}
              >
                <View
                  style={[
                    styles.avatar,
                    { backgroundColor: fc.primary, marginRight: 12 },
                  ]}
                >
                  <Text style={styles.avatarText}>
                    {(u.displayName || '?').charAt(0).toUpperCase()}
                  </Text>
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={styles.studentPickerName}>
                    {u.displayName}
                  </Text>
                  <Text style={styles.studentPickerEmail}>{u.email}</Text>
                </View>

                <Text style={styles.studentPickerArrow}>›</Text>
              </Pressable>
            );
          })}

          {/* Empty state */}
          {filteredUsers.length === 0 && (
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
  );
}