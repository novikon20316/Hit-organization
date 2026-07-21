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
import { FACULTY_COLORS, getRoleAccent } from '../../components/shared'; // adjust path if needed
import { CROSS_FACULTY_ROLES } from '../../firebase/roles';
import { getFilteredPrograms } from '../../constants/faculties';
import { majorsForFaculty } from '../../constants/permissions';

// Roles that can optionally be restricted to a subset of their faculty's
// majors (see constants/permissions.ts's majorsForFaculty) — mirrors the
// server's own check in adminController.createAdminUser/updateUserRoleAdmin.
const MAJOR_RESTRICTABLE_ROLES = ['supervisor', 'secondary_supervisor'];

type Lang = 'he' | 'en';

// Client-side convenience default only — purely cosmetic. The real
// generate-if-blank behavior always happens server-side (generateTempPassword
// in server/src/services/userImportExport.ts); this just gives the admin
// something readable to start from if they tap "Generate" instead of typing
// their own.
function generateReadableTempPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < 10; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return `${out}Aa1!`;
}

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
  newUserTempPassword: string;
  // Optional majors restriction for supervisor/secondary_supervisor roles —
  // empty = unrestricted (all majors in the faculty). See
  // constants/permissions.ts's majorsForFaculty.
  newUserAssignedMajors: string[];

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
  setNewUserTempPassword: (v: string) => void;
  setNewUserAssignedMajors: (v: string[]) => void;

  // actions
  onCreate: () => void;
  creating: boolean;

  // Narrows this modal for a delegate (faculty_admin/program_head/
  // grad_school_head) instead of system_admin: only these roles are
  // offered, and the Faculty section is hidden entirely when
  // lockedFacultyId is set (state stays fixed at whatever the caller
  // initialized newUserFaculty to) — omit lockedFacultyId for
  // grad_school_head, who can create staff in any faculty. Enforced for
  // real server-side by createAdminUser's delegate scope check.
  selectableRoles?: string[];
  lockedFacultyId?: string;

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
  newUserTempPassword,
  newUserAssignedMajors,

  setNewUserName,
  setNewUserEmail,
  setNewUserPhone,
  setNewUserRole,
  setNewUserFaculty,
  setNewUserDegree,
  setNewUserYear,
  setNewUserMajor,
  setNewUserStudentId,
  setNewUserTempPassword,
  setNewUserAssignedMajors,

  onCreate,
  creating,
  selectableRoles,
  lockedFacultyId,
  styles,
}: Props) {
  const roleEntries = selectableRoles?.length
    ? Object.entries(ROLE_LABELS).filter(([r]) => selectableRoles.includes(r))
    : Object.entries(ROLE_LABELS);
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
              setNewUserTempPassword('');
              setNewUserAssignedMajors([]);
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

        {/* Temporary password (optional) */}
        <Text style={[styles.fieldLabel, isRtl && styles.textRight]}>
          {lang === 'he' ? 'סיסמה זמנית (אופציונלי)' : 'Temporary Password (optional)'}
        </Text>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <TextInput
            style={[styles.input, { flex: 1 }]}
            value={newUserTempPassword}
            onChangeText={setNewUserTempPassword}
            placeholder={lang === 'he' ? 'השאר ריק ליצירה אוטומטית' : 'Leave blank to auto-generate'}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Pressable
            onPress={() => setNewUserTempPassword(generateReadableTempPassword())}
            style={{
              borderWidth: 1,
              borderColor: '#CBD5E1',
              borderRadius: 10,
              paddingHorizontal: 14,
              paddingVertical: 11,
              backgroundColor: '#fff',
            }}
          >
            <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151' }}>
              {lang === 'he' ? 'צור' : 'Generate'}
            </Text>
          </Pressable>
        </View>
        <Text style={{ fontSize: 12, color: '#8899BB', marginTop: 4, marginBottom: 8 }}>
          {lang === 'he'
            ? 'השאר ריק כדי שהמערכת תיצור סיסמה זמנית אוטומטית'
            : 'Leave blank and the system will auto-generate a temporary password'}
        </Text>

        {/* Role */}
        <Text style={styles.sectionDivider}>
          {lang === 'he' ? 'תפקיד' : 'Role'}
        </Text>

        {roleEntries.map(([role, label]) => {
          const accent = getRoleAccent(role);
          const isActive = newUserRole === role;
          return (
            <Pressable
              key={role}
              style={[
                styles.roleOption,
                { flexDirection: 'row', alignItems: 'center', gap: 10 },
                isActive && { backgroundColor: accent.bg, borderWidth: 1.5, borderColor: accent.text },
              ]}
              onPress={() => setNewUserRole(role)}
            >
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: accent.text }} />
              <Text style={isActive ? { color: accent.text, fontWeight: '700' } : undefined}>
                {label[lang]}
              </Text>
            </Pressable>
          );
        })}

        {/* Faculty (hidden entirely when locked to a delegate's own faculty) */}
        {!lockedFacultyId && (
          <>
            <Text style={styles.sectionDivider}>
              {lang === 'he' ? 'פקולטה' : 'Faculty'}
            </Text>

            {CROSS_FACULTY_ROLES.includes(newUserRole as any) ? (
              <Text style={{ opacity: 0.7 }}>
                {lang === 'he'
                  ? 'תפקיד זה חוצה פקולטות — יוגדר אוטומטית לצפייה בכל הפקולטות.'
                  : 'This role is cross-faculty — it will automatically see all faculties.'}
              </Text>
            ) : (
              Object.entries(FACULTY_COLORS)
                .filter(([k]) => k !== 'default' && k !== 'all')
                .map(([fid, fc]) => (
                  <Pressable
                    key={fid}
                    style={[
                      styles.facultyPickerBtn,
                      newUserFaculty === fid && { backgroundColor: fc.primary },
                    ]}
                    onPress={() => { setNewUserFaculty(fid); setNewUserMajor(''); setNewUserAssignedMajors([]); }}
                  >
                    <Text>{fc.label[lang]}</Text>
                  </Pressable>
                ))
            )}
          </>
        )}

        {/* Assigned Majors (optional) — restricts a supervisor /
            secondary_supervisor to specific majors within their faculty;
            empty = unrestricted (all majors), matching today's implicit
            default. Validated server-side too — see adminController.ts's
            createAdminUser. */}
        {MAJOR_RESTRICTABLE_ROLES.includes(newUserRole) && newUserFaculty && (
          <>
            <Text style={styles.sectionDivider}>
              {lang === 'he' ? 'מגמות משויכות (אופציונלי)' : 'Assigned Majors (optional)'}
            </Text>
            <Text style={{ fontSize: 12, color: '#8899BB', marginBottom: 8 }}>
              {lang === 'he'
                ? 'השאר ריק כדי לאפשר גישה לכל המגמות בפקולטה'
                : 'Leave empty to allow all majors in the faculty'}
            </Text>
            {majorsForFaculty(newUserFaculty).map((m) => {
              const isSelected = newUserAssignedMajors.includes(m.slug);
              return (
                <Pressable
                  key={m.slug}
                  style={[
                    styles.facultyPickerBtn,
                    isSelected && { backgroundColor: '#2E86FF' },
                  ]}
                  onPress={() =>
                    setNewUserAssignedMajors(
                      isSelected
                        ? newUserAssignedMajors.filter((s) => s !== m.slug)
                        : [...newUserAssignedMajors, m.slug]
                    )
                  }
                >
                  <Text style={isSelected ? { color: '#fff' } : undefined}>
                    {m.label[lang]}
                  </Text>
                </Pressable>
              );
            })}
          </>
        )}

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

            {/* Degree level */}
            <Text style={[styles.fieldLabel, isRtl && styles.textRight, { marginTop: 12 }]}>
              {lang === 'he' ? 'תואר' : 'Degree Level'}
            </Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {(['bachelors', 'masters'] as const).map((d) => (
                <Pressable
                  key={d}
                  style={[
                    styles.facultyPickerBtn,
                    { flex: 1 },
                    newUserDegree === d && { backgroundColor: '#2E86FF' },
                  ]}
                  onPress={() => { setNewUserDegree(d); setNewUserMajor(''); }}
                >
                  <Text style={newUserDegree === d ? { color: '#fff' } : undefined}>
                    {d === 'bachelors'
                      ? (lang === 'he' ? 'תואר ראשון' : "Bachelor's")
                      : (lang === 'he' ? 'תואר שני' : "Master's")}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Major — validated picker (not free text), filtered to this
                faculty + degree level so the stored value is always one of
                constants/faculties.ts's canonical slugs. */}
            {newUserFaculty && newUserDegree && (
              <>
                <Text style={[styles.fieldLabel, isRtl && styles.textRight, { marginTop: 12 }]}>
                  {lang === 'he' ? 'מגמה *' : 'Major *'}
                </Text>
                {getFilteredPrograms(newUserFaculty, newUserDegree).map((program) => (
                  <Pressable
                    key={program.slug}
                    style={[
                      styles.facultyPickerBtn,
                      newUserMajor === program.slug && { backgroundColor: '#2E86FF' },
                    ]}
                    onPress={() => setNewUserMajor(program.slug)}
                  >
                    <Text style={newUserMajor === program.slug ? { color: '#fff' } : undefined}>
                      {program.label[lang]}
                    </Text>
                  </Pressable>
                ))}
                {getFilteredPrograms(newUserFaculty, newUserDegree).length === 0 && (
                  <Text style={{ opacity: 0.7, fontSize: 12 }}>
                    {lang === 'he'
                      ? 'אין מגמות זמינות לתואר זה בפקולטה הנבחרת'
                      : 'No programs available for this degree level in the selected faculty'}
                  </Text>
                )}
              </>
            )}
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