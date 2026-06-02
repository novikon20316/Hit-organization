import React from "react";
import {
  Modal,
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { FACULTY_COLORS } from '../../components/shared';

type RoleLabels = Record<string, Record<string, string>>;
type FacultyColors = Record<string, { primary: string; light?: string; label: Record<string, string> }>;

// Roles that can be added as additional (secondary) roles.
// Primary roles like 'student' and 'system_admin' are excluded —
// they don't make sense as an extra role on top of another.
const ADDITIONAL_ROLE_OPTIONS = [
  'supervisor',
  'faculty_admin',
  'head_of_masters',
  'head_of_bachelors',
  'committee_member',
];

type Props = {
  visible:    boolean;
  setVisible: (v: boolean) => void;
  lang:       "he" | "en";

  role:    string;
  setRole: (r: string) => void;

  // Additional roles beyond the primary one
  roles:    string[];
  setRoles: (r: string[]) => void;

  faculty:    string;
  setFaculty: (f: string) => void;

  roleLabels:    RoleLabels;
  facultyColors: FacultyColors;

  onSave:   () => void;
  saving?:  boolean;

  styles: any;
};

export default function EditUserModal({
  visible, setVisible,
  lang,
  role,    setRole,
  roles,   setRoles,
  faculty, setFaculty,
  roleLabels, facultyColors,
  onSave, saving,
  styles,
}: Props) {

  const toggleAdditionalRole = (r: string) => {
    if (r === role) return; // can't remove the primary role this way
    if (roles.includes(r)) {
      setRoles(roles.filter((x) => x !== r));
    } else {
      setRoles([...roles, r]);
    }
  };

  // Additional roles = everything except the primary role
  const additionalRoles = roles.filter((r) => r !== role);

  return (
    <Modal visible={visible} animationType="slide">
      <View style={styles.modalRoot}>
        <ScrollView contentContainerStyle={styles.modalContent}>

          {/* ── Header ── */}
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {lang === "he" ? "עריכת משתמש" : "Edit User"}
            </Text>
            <Pressable onPress={() => setVisible(false)}>
              <Text style={styles.close}>✕</Text>
            </Pressable>
          </View>

          {/* ── Primary Role ── */}
          <Text style={styles.fieldLabel}>
            {lang === "he" ? "תפקיד ראשי" : "Primary Role"}
          </Text>

          {Object.entries(roleLabels).map(([r, label]) => (
            <Pressable
              key={r}
              style={[styles.roleOption, role === r && styles.roleOptionActive]}
              onPress={() => {
                setRole(r);
                // Keep primary in roles array, remove old primary
                setRoles([r, ...roles.filter((x) => x !== role && x !== r)]);
              }}
            >
              <Text style={[styles.roleOptionText, role === r && styles.roleOptionTextActive]}>
                {label[lang]}
              </Text>
            </Pressable>
          ))}

          {/* ── Additional Roles ── */}
          <View style={editStyles.sectionHeader}>
            <Text style={styles.fieldLabel}>
              {lang === "he" ? "תפקידים נוספים" : "Additional Roles"}
            </Text>
            {additionalRoles.length > 0 && (
              <Pressable onPress={() => setRoles([role])}>
                <Text style={editStyles.clearAllText}>
                  {lang === "he" ? "נקה הכל" : "Clear all"}
                </Text>
              </Pressable>
            )}
          </View>

          <Text style={editStyles.hint}>
            {lang === "he"
              ? "ניתן להוסיף מספר תפקידים נוספים לאותו משתמש"
              : "A user can hold multiple roles simultaneously"}
          </Text>

          {ADDITIONAL_ROLE_OPTIONS
            .filter((r) => r !== role) // hide if it's already the primary role
            .map((r) => {
              const isActive = roles.includes(r);
              const label    = roleLabels[r]?.[lang] ?? r;
              return (
                <Pressable
                  key={r}
                  style={[editStyles.additionalRoleBtn, isActive && editStyles.additionalRoleBtnActive]}
                  onPress={() => toggleAdditionalRole(r)}
                >
                  <View style={[editStyles.checkbox, isActive && editStyles.checkboxActive]}>
                    {isActive && <Text style={editStyles.checkmark}>✓</Text>}
                  </View>
                  <Text style={[editStyles.additionalRoleText, isActive && editStyles.additionalRoleTextActive]}>
                    {label}
                  </Text>
                </Pressable>
              );
            })}

          {/* Active additional roles summary */}
          {additionalRoles.length > 0 && (
            <View style={editStyles.summaryBox}>
              <Text style={editStyles.summaryLabel}>
                {lang === "he" ? "תפקידים פעילים:" : "Active roles:"}
              </Text>
              <View style={editStyles.summaryChips}>
                {[role, ...additionalRoles].map((r) => (
                  <View key={r} style={editStyles.chip}>
                    <Text style={editStyles.chipText}>
                      {roleLabels[r]?.[lang] ?? r}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* ── Faculty ── */}
          <Text style={[styles.fieldLabel, { marginTop: 16 }]}>
            {lang === "he" ? "פקולטה" : "Faculty"}
          </Text>

          {Object.entries(FACULTY_COLORS)
            .filter(([k]) => k !== "default")
            .map(([fid, fc]) => (
              <Pressable
                key={fid}
                style={[styles.facultyOption, faculty === fid && styles.facultyOptionActive]}
                onPress={() => setFaculty(fid)}
              >
                <View style={[styles.facultyDot, { backgroundColor: fc.primary }]} />
                <Text>{fc.label[lang]}</Text>
              </Pressable>
            ))}

          {/* ── Save ── */}
          <Pressable style={[styles.submitBtn, { marginTop: 24 }]} onPress={onSave}>
            {saving
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.submitBtnText}>
                  {lang === "he" ? "שמור" : "Save"}
                </Text>
            }
          </Pressable>

        </ScrollView>
      </View>
    </Modal>
  );
}

const editStyles = StyleSheet.create({
  sectionHeader: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'center',
    marginTop:      16,
  },
  clearAllText: {
    fontSize:   13,
    color:      '#EF4444',
    fontWeight: '600',
  },
  hint: {
    fontSize:     12,
    color:        '#8899BB',
    marginBottom: 10,
    marginTop:    2,
  },
  additionalRoleBtn: {
    flexDirection:     'row',
    alignItems:        'center',
    paddingHorizontal: 14,
    paddingVertical:   11,
    borderRadius:      12,
    borderWidth:       1.5,
    borderColor:       '#D0DEFF',
    backgroundColor:   '#F8FAFF',
    marginBottom:      8,
    gap:               10,
  },
  additionalRoleBtnActive: {
    borderColor:     '#2E86FF',
    backgroundColor: '#EBF3FF',
  },
  checkbox: {
    width:           20,
    height:          20,
    borderRadius:    6,
    borderWidth:     2,
    borderColor:     '#9BA8C0',
    alignItems:      'center',
    justifyContent:  'center',
  },
  checkboxActive: {
    borderColor:     '#2E86FF',
    backgroundColor: '#2E86FF',
  },
  checkmark: {
    color:      '#fff',
    fontSize:   12,
    fontWeight: '700',
  },
  additionalRoleText: {
    fontSize:   14,
    color:      '#374151',
    fontWeight: '500',
  },
  additionalRoleTextActive: {
    color:      '#1A5FCC',
    fontWeight: '600',
  },
  summaryBox: {
    marginTop:       10,
    padding:         12,
    backgroundColor: '#F0F7FF',
    borderRadius:    12,
    borderWidth:     1,
    borderColor:     '#C7DCFF',
  },
  summaryLabel: {
    fontSize:     12,
    color:        '#5577AA',
    fontWeight:   '600',
    marginBottom: 8,
  },
  summaryChips: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           6,
  },
  chip: {
    backgroundColor: '#2E86FF',
    borderRadius:    20,
    paddingHorizontal: 10,
    paddingVertical:   4,
  },
  chipText: {
    color:      '#fff',
    fontSize:   12,
    fontWeight: '600',
  },
});