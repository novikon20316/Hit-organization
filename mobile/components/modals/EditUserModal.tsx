import React, { useState } from "react";
import {
  Modal,
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { FACULTY_COLORS, getRoleAccent } from '../../components/shared';
import { EditUserModalExtraStyles } from '../../constants/styles';
import PermissionsEditorModal from './PermissionsEditorModal';
import CoordinatorScopesModal from './CoordinatorScopesModal';
import { majorsForFaculty } from '../../constants/permissions';
import type { ScopeRule, CoordinatorScope } from '../../constants/permissions';

type RoleLabels = Record<string, Record<string, string>>;
type FacultyColors = Record<string, { primary: string; light?: string; label: Record<string, string> }>;

// Roles that can be added as additional (secondary) roles — restricted to
// values other code actually treats as additive (checked via a `roles`
// array-contains query or getEffectiveRoles()-style union), per
// accountDeletion.ts, examinerController.getList, userImportExportController.ts.
// Primary-only roles like 'student', 'program_head', 'grad_school_head', and
// 'system_admin' are excluded — no code treats them as grantable on top of
// another role.
const ADDITIONAL_ROLE_OPTIONS = [
  'supervisor',
  'secondary_supervisor',
  'coordinator',
  'faculty_admin',
  'administrative_secretary',
  'internal_examiner',
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

  // Granular permissions (system_admin only) — optional so callers that
  // don't wire this up (e.g. faculty_admin/dashboard.tsx's own Edit User
  // flow) simply don't get the button. See constants/permissions.ts.
  permissionRules?:    ScopeRule[];
  setPermissionRules?: (rules: ScopeRule[]) => void;

  // Coordinator's own operational scope (system_admin only) — same
  // optional-prop pattern as permissionRules above; only shown when the
  // user being edited actually holds the coordinator role.
  coordinatorScopes?:    CoordinatorScope[];
  setCoordinatorScopes?: (scopes: CoordinatorScope[]) => void;

  // Majors restriction for supervisor/secondary_supervisor roles — optional
  // so callers that don't wire this up (e.g. faculty_admin/dashboard.tsx's
  // own Edit User flow) simply don't get the field. Unlike permissionRules/
  // coordinatorScopes above, this one IS sent to the server for real — see
  // adminController.ts's updateUserRoleAdmin.
  assignedMajors?:    string[];
  setAssignedMajors?: (majors: string[]) => void;

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
  permissionRules, setPermissionRules,
  coordinatorScopes, setCoordinatorScopes,
  assignedMajors, setAssignedMajors,
  styles,
}: Props) {
  const [permissionsModalVisible, setPermissionsModalVisible] = useState(false);
  const [scopesModalVisible, setScopesModalVisible] = useState(false);
  const showPermissions = permissionRules !== undefined && !!setPermissionRules;
  const showCoordinatorScopes =
    coordinatorScopes !== undefined && !!setCoordinatorScopes && (role === 'coordinator' || roles.includes('coordinator'));
  const showAssignedMajors =
    assignedMajors !== undefined && !!setAssignedMajors &&
    (role === 'supervisor' || role === 'secondary_supervisor' ||
      roles.includes('supervisor') || roles.includes('secondary_supervisor'));

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

          {Object.entries(roleLabels).map(([r, label]) => {
            const accent = getRoleAccent(r);
            const isActive = role === r;
            return (
              <Pressable
                key={r}
                style={[
                  styles.roleOption,
                  editStyles.roleOptionRow,
                  isActive && { backgroundColor: accent.bg, borderWidth: 1.5, borderColor: accent.text },
                ]}
                onPress={() => {
                  setRole(r);
                  // Keep primary in roles array, remove old primary
                  setRoles([r, ...roles.filter((x) => x !== role && x !== r)]);
                }}
              >
                <View style={[editStyles.roleDot, { backgroundColor: accent.text }]} />
                <Text style={[styles.roleOptionText, isActive && { color: accent.text }]}>
                  {label[lang]}
                </Text>
              </Pressable>
            );
          })}

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
                onPress={() => { setFaculty(fid); setAssignedMajors?.([]); }}
              >
                <View style={[styles.facultyDot, { backgroundColor: fc.primary }]} />
                <Text>{fc.label[lang]}</Text>
              </Pressable>
            ))}

          {/* ── Assigned Majors (supervisor / secondary_supervisor only) ── */}
          {showAssignedMajors && (
            <>
              <Text style={[styles.fieldLabel, { marginTop: 16 }]}>
                {lang === "he" ? "מגמות משויכות (אופציונלי)" : "Assigned Majors (optional)"}
              </Text>
              <Text style={editStyles.hint}>
                {lang === "he"
                  ? "השאר ריק כדי לאפשר גישה לכל המגמות בפקולטה"
                  : "Leave empty to allow all majors in the faculty"}
              </Text>
              {majorsForFaculty(faculty).map((m) => {
                const isSelected = assignedMajors!.includes(m.slug);
                return (
                  <Pressable
                    key={m.slug}
                    style={[editStyles.additionalRoleBtn, isSelected && editStyles.additionalRoleBtnActive]}
                    onPress={() =>
                      setAssignedMajors!(
                        isSelected
                          ? assignedMajors!.filter((s) => s !== m.slug)
                          : [...assignedMajors!, m.slug]
                      )
                    }
                  >
                    <View style={[editStyles.checkbox, isSelected && editStyles.checkboxActive]}>
                      {isSelected && <Text style={editStyles.checkmark}>✓</Text>}
                    </View>
                    <Text style={[editStyles.additionalRoleText, isSelected && editStyles.additionalRoleTextActive]}>
                      {m.label[lang]}
                    </Text>
                  </Pressable>
                );
              })}
              {majorsForFaculty(faculty).length === 0 && (
                <Text style={editStyles.hint}>
                  {lang === "he" ? "בחר פקולטה תחילה" : "Select a faculty first"}
                </Text>
              )}
            </>
          )}

          {/* ── Granular Permissions (system_admin only) ── */}
          {showPermissions && (
            <Pressable
              style={[editStyles.additionalRoleBtn, { marginTop: 16, justifyContent: 'space-between' }]}
              onPress={() => setPermissionsModalVisible(true)}
            >
              <Text style={editStyles.additionalRoleText}>
                🔐 {lang === "he" ? "הרשאות מפורטות" : "Granular Permissions"}
              </Text>
              <Text style={editStyles.clearAllText}>
                {(permissionRules ?? []).length > 0
                  ? (lang === "he" ? `${permissionRules!.length} כללים ›` : `${permissionRules!.length} rules ›`)
                  : '›'}
              </Text>
            </Pressable>
          )}

          {/* ── Coordinator Scope (system_admin only, coordinator role only) ── */}
          {showCoordinatorScopes && (
            <Pressable
              style={[editStyles.additionalRoleBtn, { marginTop: 12, justifyContent: 'space-between' }]}
              onPress={() => setScopesModalVisible(true)}
            >
              <Text style={editStyles.additionalRoleText}>
                📋 {lang === "he" ? "היקף אחריות רכז" : "Coordinator Scope"}
              </Text>
              <Text style={editStyles.clearAllText}>
                {(coordinatorScopes ?? []).length > 0
                  ? (lang === "he" ? `${coordinatorScopes!.length} תחומים ›` : `${coordinatorScopes!.length} scopes ›`)
                  : '›'}
              </Text>
            </Pressable>
          )}

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

        {showPermissions && (
          <PermissionsEditorModal
            visible={permissionsModalVisible}
            onClose={() => setPermissionsModalVisible(false)}
            lang={lang}
            rules={permissionRules ?? []}
            onChange={setPermissionRules!}
          />
        )}

        {showCoordinatorScopes && (
          <CoordinatorScopesModal
            visible={scopesModalVisible}
            onClose={() => setScopesModalVisible(false)}
            lang={lang}
            scopes={coordinatorScopes ?? []}
            onChange={setCoordinatorScopes!}
          />
        )}
      </View>
    </Modal>
  );
}

const editStyles = EditUserModalExtraStyles;