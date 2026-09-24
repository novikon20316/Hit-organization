// components/modals/AddRosterEntryModal.tsx
//
// Manual single-entry counterpart to pickAndImportStudentRoster's Excel
// import — the "+" button on the system_admin Student Roster tab
// (app/admin/panel.tsx), for adding one approved student without building a
// file. Posts via createStudentRosterEntry (src/api/studentRoster.ts) to
// POST /api/admin/student-roster.

import React, { useMemo, useState } from 'react';
import { Modal, View, Text, ScrollView, Pressable, TextInput, ActivityIndicator, Alert } from 'react-native';
import { createStudentRosterEntry } from '../../src/api/studentRoster';
import { adminPanelStyles, MaintenanceModalStyles } from '../../constants/styles';
import { degreeLevelsForFaculty } from '../../constants/permissions';
import { FACULTY_COLORS } from '../shared';

interface Props {
  visible: boolean;
  onClose: () => void;
  onCreated: () => void;
  lang: 'he' | 'en';
}

const s = MaintenanceModalStyles;
const ps = adminPanelStyles;

const SELECTABLE_FACULTIES = Object.entries(FACULTY_COLORS).filter(([k]) => k !== 'default' && k !== 'all');

export default function AddRosterEntryModal({ visible, onClose, onCreated, lang }: Props) {
  const isHe = lang === 'he';

  const [studentId, setStudentId] = useState('');
  const [fullName, setFullName] = useState('');
  const [facultyId, setFacultyId] = useState(SELECTABLE_FACULTIES[0]?.[0] ?? '');
  const [degreeType, setDegreeType] = useState<'bachelors' | 'masters'>(
    () => degreeLevelsForFaculty(SELECTABLE_FACULTIES[0]?.[0] ?? '')[0] ?? 'bachelors',
  );
  const [major, setMajor] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Some faculties only offer one degree level (e.g. data_science is
  // masters-only) — same lockout NewUserModal's own faculty picker uses.
  const availableDegreeLevels = useMemo(() => degreeLevelsForFaculty(facultyId), [facultyId]);

  const handleFacultyPress = (id: string) => {
    setFacultyId(id);
    const levels = degreeLevelsForFaculty(id);
    if (levels.length === 1) setDegreeType(levels[0]!);
  };

  const reset = () => {
    setStudentId('');
    setFullName('');
    const initialFaculty = SELECTABLE_FACULTIES[0]?.[0] ?? '';
    setFacultyId(initialFaculty);
    setDegreeType(degreeLevelsForFaculty(initialFaculty)[0] ?? 'bachelors');
    setMajor('');
  };

  const handleClose = () => {
    if (submitting) return;
    reset();
    onClose();
  };

  const handleSubmit = async () => {
    const errorTitle = isHe ? 'שגיאה' : 'Error';
    if (!/^\d{9}$/.test(studentId.trim())) {
      Alert.alert(errorTitle, isHe ? 'מספר ת.ז. חייב להיות בן 9 ספרות' : 'Student ID must be exactly 9 digits');
      return;
    }
    if (!fullName.trim()) {
      Alert.alert(errorTitle, isHe ? 'יש למלא שם מלא' : 'Full name is required');
      return;
    }
    setSubmitting(true);
    try {
      await createStudentRosterEntry({
        studentId: studentId.trim(),
        facultyId,
        degreeType,
        fullName: fullName.trim(),
        major: major.trim() || null,
      });
      reset();
      onCreated();
      onClose();
    } catch (e: any) {
      Alert.alert(errorTitle, e.response?.data?.message || e.message || (isHe ? 'הוספת הרשומה נכשלה' : 'Failed to add the entry'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <View style={s.overlay}>
        <View style={[s.sheet, { maxHeight: '92%' }]}>
          <View style={s.header}>
            <View style={s.headerLeft}>
              <View style={s.headerIcon}>
                <Text style={s.headerIconText}>🎓</Text>
              </View>
              <View>
                <Text style={s.headerTitle}>{isHe ? 'הוספת סטודנט מאושר' : 'Add Approved Student'}</Text>
                <Text style={s.headerSub}>
                  {isHe ? 'הסטודנט יופיע ברשימת המאושרים לרישום' : 'Adds this student to the pre-registration allowlist'}
                </Text>
              </View>
            </View>
            <Pressable style={s.closeBtn} onPress={handleClose} accessibilityRole="button" accessibilityLabel={isHe ? 'סגור' : 'Close'}>
              <Text style={s.closeBtnText}>✕</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
            <Text style={ps.fieldLabel}>{isHe ? 'מספר ת.ז.' : 'Student ID'}</Text>
            <TextInput
              style={ps.input}
              value={studentId}
              onChangeText={setStudentId}
              placeholder="123456789"
              placeholderTextColor="#94A3B8"
              keyboardType="number-pad"
              maxLength={9}
            />

            <Text style={[ps.fieldLabel, { marginTop: 12 }]}>{isHe ? 'שם מלא' : 'Full Name'}</Text>
            <TextInput
              style={ps.input}
              value={fullName}
              onChangeText={setFullName}
              placeholder={isHe ? 'שם הסטודנט' : "Student's name"}
              placeholderTextColor="#94A3B8"
            />

            <Text style={[ps.fieldLabel, { marginTop: 12 }]}>{isHe ? 'פקולטה' : 'Faculty'}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {SELECTABLE_FACULTIES.map(([id, fc]) => (
                <Pressable
                  key={id}
                  style={[ps.userFilterChip, facultyId === id && ps.userFilterChipActive]}
                  onPress={() => handleFacultyPress(id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: facultyId === id }}
                >
                  <Text style={[ps.userFilterChipText, facultyId === id && ps.userFilterChipTextActive]}>{fc.label[lang]}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={[ps.fieldLabel, { marginTop: 12 }]}>{isHe ? 'תואר' : 'Degree'}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {availableDegreeLevels.map((d) => (
                <Pressable
                  key={d}
                  style={[ps.userFilterChip, degreeType === d && ps.userFilterChipActive]}
                  onPress={() => setDegreeType(d)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: degreeType === d }}
                >
                  <Text style={[ps.userFilterChipText, degreeType === d && ps.userFilterChipTextActive]}>
                    {d === 'bachelors' ? (isHe ? 'תואר ראשון' : "Bachelor's") : (isHe ? 'תואר שני' : "Master's")}
                  </Text>
                </Pressable>
              ))}
            </View>
            {availableDegreeLevels.length === 1 && (
              <Text style={{ fontSize: 12, color: '#8899BB', marginTop: 4 }}>
                {isHe ? 'לפקולטה זו יש רק תואר אחד' : 'This faculty only offers one degree level'}
              </Text>
            )}

            <Text style={[ps.fieldLabel, { marginTop: 12 }]}>{isHe ? 'מגמה (אופציונלי)' : 'Major (optional)'}</Text>
            <TextInput
              style={ps.input}
              value={major}
              onChangeText={setMajor}
              placeholder={isHe ? 'מגמה' : 'Major'}
              placeholderTextColor="#94A3B8"
            />
          </ScrollView>

          <View style={s.footer}>
            <Pressable style={[s.saveBtn, submitting && s.saveBtnDisabled]} onPress={handleSubmit} disabled={submitting} accessibilityRole="button">
              {submitting ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.saveBtnText}>{isHe ? '➕ הוסף' : '➕ Add'}</Text>}
            </Pressable>
            <Pressable style={s.cancelBtn} onPress={handleClose} accessibilityRole="button">
              <Text style={s.cancelBtnText}>{isHe ? 'ביטול' : 'Cancel'}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
