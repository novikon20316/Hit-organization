import React from "react";
import {
  Modal,
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
} from "react-native";

interface AppUser {
  id: string;
  displayName?: string;
  email?: string;
  role?: string;
  facultyId?: string;
  expoPushToken?: string;
}

type FacultyColors = Record<
  string,
  { primary: string; label: Record<string, string> }
>;

type Props = {
  visible: boolean;
  setVisible: (v: boolean) => void;

  mode: "admin" | "supervisor" | "faculty_admin"; // ✅ NEW

  lang: "he" | "en";
  isRtl?: boolean;

  // fields
  titleHe: string;
  setTitleHe: (v: string) => void;
  titleEn: string;
  setTitleEn: (v: string) => void;

  descHe: string;
  setDescHe: (v: string) => void;
  descEn: string;
  setDescEn: (v: string) => void;

  skills: string;
  setSkills: (v: string) => void;

  // supervisor mode → fixed faculty (no setter needed)
  faculty?: string;
  setFaculty?: (v: string) => void;

  degree: "bachelors" | "masters" | "both";
  setDegree: (v: "bachelors" | "masters" ) => void;

  type: "project" | "thesis";
  setType: (v: "project" | "thesis") => void;

  // admin-only
  supervisors?: AppUser[];
  selectedSupervisor?: AppUser | null;
  setSelectedSupervisor?: (s: AppUser) => void;

  onCreate: () => void;
  creating: boolean;

  setShowConfirm?: (v: boolean) => void;

  maxStudents: number;
  setMaxStudents: (v: number) => void;

  facultyColors: FacultyColors;
  styles: any;
};

export default function NewProjectModal({
  visible,
  setVisible,
  mode,

  lang,
  isRtl,

  titleHe,
  setTitleHe,
  titleEn,
  setTitleEn,

  descHe,
  setDescHe,
  descEn,
  setDescEn,

  skills,
  setSkills,

  faculty,
  setFaculty,

  degree,
  setDegree,

  type,
  setType,

  supervisors,
  selectedSupervisor,
  setSelectedSupervisor,
  setShowConfirm,

  onCreate,
  creating,

  maxStudents,
  setMaxStudents,

  facultyColors,
  styles,
}: Props) {
  const isAdmin = mode === "admin";
  
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <ScrollView style={styles.modal} contentContainerStyle={styles.modalContent}>

        {/* Header */}
        <View style={[styles.modalHeader, isRtl && styles.rowReverse]}>
          <Text style={styles.modalTitle}>
            {lang === "he" ? "פרסום פרויקט חדש" : "Post New Project"}
          </Text>

          <Pressable onPress={() => setVisible(false)}>
            <Text style={styles.modalClose}>✕</Text>
          </Pressable>
        </View>

        {/* Inputs */}
        {[
          { label: lang === "he" ? "כותרת בעברית *" : "Hebrew Title *", value: titleHe, set: setTitleHe, dir: "rtl" },
          { label: lang === "he" ? "כותרת באנגלית *" : "English Title *", value: titleEn, set: setTitleEn, dir: "ltr" },
          { label: lang === "he" ? "תיאור בעברית" : "Hebrew Description", value: descHe, set: setDescHe, dir: "rtl", multi: true },
          { label: lang === "he" ? "תיאור באנגלית" : "English Description", value: descEn, set: setDescEn, dir: "ltr", multi: true },
          { label: lang === "he" ? "טכנולוגיות" : "Technologies", value: skills, set: setSkills, dir: "ltr" },
        ].map((f) => (
          <View key={f.label}>
            <Text style={[styles.fieldLabel, isRtl && styles.textRight]}>
              {f.label}
            </Text>
            <TextInput
              style={[
                styles.input,
                f.multi && styles.textarea,
                { textAlign: f.dir === "rtl" ? "right" : "left" },
              ]}
              value={f.value}
              onChangeText={f.set}
              multiline={f.multi}
            />
          </View>
        ))}

        {/* Faculty (ADMIN ONLY) */}
        {isAdmin && (
          <>
            <Text style={[styles.fieldLabel, isRtl && styles.textRight]}>
              {lang === "he" ? "פקולטה *" : "Faculty *"}
            </Text>

            <View style={styles.facultyGrid}>
              {Object.entries(facultyColors)
                .filter(([k]) => k !== "default")
                .map(([fid, fc]) => (
                  <Pressable
                    key={fid}
                    style={[
                      styles.facultyPickerBtn,
                      faculty === fid && {
                        backgroundColor: fc.primary,
                        borderColor: fc.primary,
                      },
                    ]}
                    onPress={() => setFaculty?.(fid)}
                  >
                    <View style={[styles.facultyPickerDot, { backgroundColor: fc.primary }]} />
                    <Text
                      style={[
                        styles.facultyPickerText,
                        faculty === fid && { color: "#fff" },
                      ]}
                    >
                      {fc.label[lang]}
                    </Text>
                  </Pressable>
                ))}
            </View>
          </>
        )}
        {/* Max students */}
        <Text style={[styles.fieldLabel, isRtl && styles.textRight]}>
          {lang === "he" ? "מספר סטודנטים" : "Max Students"}
        </Text>

        <View style={[styles.toggleRow, isRtl && styles.rowReverse]}>
          {[1, 2, 3, 4].map((num) => (
            <Pressable
              key={num}
              style={[
                styles.toggleBtn,
                maxStudents === num && styles.toggleBtnActive,
              ]}
              onPress={() => setMaxStudents(num)}
            >
              <Text
                style={[
                  styles.toggleText,
                  maxStudents === num && styles.toggleTextActive,
                ]}
              >
                {num}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Degree */}
        <Text style={[styles.fieldLabel, isRtl && styles.textRight]}>
          {lang === "he" ? "סוג תואר" : "Degree Type"}
        </Text>

        <View style={[styles.toggleRow, isRtl && styles.rowReverse]}>
          {["bachelors", "masters"].map((d) => (
            <Pressable
              key={d}
              style={[styles.toggleBtn, degree === d && styles.toggleBtnActive]}
              onPress={() => setDegree(d as any)}
            >
              <Text style={[styles.toggleText, degree === d && styles.toggleTextActive]}>
                {d}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Type */}
        <Text style={[styles.fieldLabel, isRtl && styles.textRight]}>
          {lang === "he" ? "סוג פרויקט" : "Project Type"}
        </Text>

        <View style={[styles.toggleRow, isRtl && styles.rowReverse]}>
          {["project", "thesis"].map((t) => (
            <Pressable
              key={t}
              style={[styles.toggleBtn, type === t && styles.toggleBtnActive]}
              onPress={() => setType(t as any)}
            >
              <Text style={[styles.toggleText, type === t && styles.toggleTextActive]}>
                {t}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Supervisors (ADMIN ONLY) */}
        {isAdmin && supervisors?.length ? (
          <>
            <Text style={styles.fieldLabel}>
              {lang === "he" ? "בחר מנחה" : "Select Supervisor"}
            </Text>

            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {supervisors.map((s) => (
                <Pressable
                  key={s.id}
                  style={[
                    styles.supOption,
                    selectedSupervisor?.id === s.id && styles.supOptionActive,
                  ]}
                  onPress={() => {
                    setSelectedSupervisor?.(s);
                    setShowConfirm?.(true);
                  }}
                >
                  <Text>{s.displayName}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </>
        ) : null}

        {/* Submit */}
        <Pressable style={styles.submitBtn} onPress={onCreate} disabled={creating}>
          {creating ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitBtnText}>
              {lang === "he" ? "פרסם פרויקט" : "Publish Project"}
            </Text>
          )}
        </Pressable>

      </ScrollView>
    </Modal>
  );
}