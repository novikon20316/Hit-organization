import React from "react";
import {
  Modal,
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from "react-native";

type RoleLabels = Record<string, Record<string, string>>;
type FacultyColors = Record<string, { primary: string; label: Record<string, string> }>;

type Props = {
  visible: boolean;
  setVisible: (v: boolean) => void;

  lang: "he" | "en";

  role: string;
  setRole: (r: string) => void;

  faculty: string;
  setFaculty: (f: string) => void;

  roleLabels: RoleLabels;
  facultyColors: FacultyColors;

  onSave: () => void;
  saving?: boolean;

  styles: any;
};

export default function EditUserModal({
  visible,
  setVisible,
  lang,
  role,
  setRole,
  faculty,
  setFaculty,
  roleLabels,
  facultyColors,
  onSave,
  saving,
  styles,
}: Props) {
  return (
    <Modal visible={visible} animationType="slide">
      <View style={styles.modalRoot}>
        <ScrollView contentContainerStyle={styles.modalContent}>

          {/* Header */}
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {lang === "he" ? "עריכת משתמש" : "Edit User"}
            </Text>

            <Pressable onPress={() => setVisible(false)}>
              <Text style={styles.close}>✕</Text>
            </Pressable>
          </View>

          {/* Role */}
          <Text style={styles.fieldLabel}>
            {lang === "he" ? "תפקיד" : "Role"}
          </Text>

          {Object.entries(roleLabels).map(([r, label]) => (
            <Pressable
              key={r}
              style={[
                styles.roleOption,
                role === r && styles.roleOptionActive,
              ]}
              onPress={() => setRole(r)}
            >
              <Text
                style={[
                  styles.roleOptionText,
                  role === r && styles.roleOptionTextActive,
                ]}
              >
                {label[lang]}
              </Text>
            </Pressable>
          ))}

          {/* Faculty */}
          <Text style={styles.fieldLabel}>
            {lang === "he" ? "פקולטה" : "Faculty"}
          </Text>

          {Object.entries(facultyColors)
            .filter(([k]) => k !== "default")
            .map(([fid, fc]) => (
              <Pressable
                key={fid}
                style={[
                  styles.facultyOption,
                  faculty === fid && styles.facultyOptionActive,
                ]}
                onPress={() => setFaculty(fid)}
              >
                <View
                  style={[styles.facultyDot, { backgroundColor: fc.primary }]}
                />
                <Text>{fc.label[lang]}</Text>
              </Pressable>
            ))}

          {/* Save */}
          <Pressable style={styles.submitBtn} onPress={onSave}>
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitBtnText}>
                {lang === "he" ? "שמור" : "Save"}
              </Text>
            )}
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}
