// components/modals/NewProjectModal.tsx
import React, { useState } from "react";
import { tx } from '../../components/i18n';
import {
  Modal, View, Text, ScrollView, Pressable,
  TextInput, ActivityIndicator,
} from "react-native";

interface AppUser {
  id: string;
  displayName?: string;
  email?: string;
  role?: string;
  facultyId?: string;
  expoPushToken?: string;
}

type FacultyColors = Record<string, { primary: string; label: Record<string, string> }>;

// ─── Criterion shape ──────────────────────────────────────────────────────────
export interface GradingCriterion {
  key:   string; // unique identifier, e.g. 'clarity'
  label: string; // display name, e.g. 'Research Clarity'
  maxScore: number;
}

export const DEFAULT_CRITERIA: GradingCriterion[] = [
  { key: 'clarity',     label: 'Research Clarity', maxScore: 20 },
  { key: 'methodology', label: 'Methodology',       maxScore: 25 },
  { key: 'feasibility', label: 'Feasibility',       maxScore: 20 },
  { key: 'innovation',  label: 'Innovation',        maxScore: 15 },
  { key: 'writing',     label: 'Writing Quality',   maxScore: 20 },
];

type Props = {
  visible:    boolean;
  setVisible: (v: boolean) => void;
  mode:       "admin" | "supervisor" | "faculty_admin";
  lang:       "he" | "en";
  isRtl?:     boolean;

  titleHe: string; setTitleHe: (v: string) => void;
  titleEn: string; setTitleEn: (v: string) => void;
  descHe:  string; setDescHe:  (v: string) => void;
  descEn:  string; setDescEn:  (v: string) => void;
  skills:  string; setSkills:  (v: string) => void;

  faculty?:    string;
  setFaculty?: (v: string) => void;

  degree:    "bachelors" | "masters" | "both";
  setDegree: (v: "bachelors" | "masters") => void;
  type:      "project" | "thesis";
  setType:   (v: "project" | "thesis") => void;

  supervisors?:           AppUser[];
  selectedSupervisor?:    AppUser | null;
  setSelectedSupervisor?: (s: AppUser) => void;

  onCreate:  () => void;
  creating:  boolean;

  setShowConfirm?: (v: boolean) => void;

  maxStudents:    number;
  setMaxStudents: (v: number) => void;

  projectName: string | null; setProjectName: (v: string | null) => void;
  projectFile: string | null; setProjectFile: (v: string | null) => void;
  pickFile:    (v: boolean) => void;

  // ── NEW: grading criteria ────────────────────────────────────────────────
  gradingCriteria:    GradingCriterion[];
  setGradingCriteria: (v: GradingCriterion[]) => void;

  facultyColors: FacultyColors;
  styles:        any;
};

export default function NewProjectModal({
  visible, setVisible, mode, lang, isRtl,
  titleHe, setTitleHe, titleEn, setTitleEn,
  descHe,  setDescHe,  descEn,  setDescEn,
  skills,  setSkills,
  faculty, setFaculty,
  degree,  setDegree,
  type,    setType,
  supervisors, selectedSupervisor, setSelectedSupervisor, setShowConfirm,
  onCreate, creating,
  maxStudents, setMaxStudents,
  projectName, setProjectName,
  projectFile, setProjectFile,
  pickFile,
  gradingCriteria, setGradingCriteria,
  facultyColors, styles,
}: Props) {

  const isAdmin = mode === "admin";

  // ── Criteria helpers ────────────────────────────────────────────────────────
  const totalMax = gradingCriteria.reduce((s, c) => s + (Number(c.maxScore) || 0), 0);

  const updateCriterion = (index: number, field: keyof GradingCriterion, value: string) => {
    const updated = [...gradingCriteria];
    if (field === 'maxScore') {
      updated[index] = { ...updated[index], maxScore: Number(value) || 0 };
    } else {
      updated[index] = { ...updated[index], [field]: value };
    }
    setGradingCriteria(updated);
  };

  const addCriterion = () => {
    setGradingCriteria([
      ...gradingCriteria,
      { key: `criterion_${Date.now()}`, label: '', maxScore: 10 },
    ]);
  };

  const removeCriterion = (index: number) => {
    setGradingCriteria(gradingCriteria.filter((_, i) => i !== index));
  };

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

        {/* Basic text fields */}
        {[
          { label: lang === "he" ? "כותרת בעברית *" : "Hebrew Title *",          value: titleHe, set: setTitleHe, dir: "rtl" },
          { label: lang === "he" ? "כותרת באנגלית *" : "English Title *",         value: titleEn, set: setTitleEn, dir: "ltr" },
          { label: lang === "he" ? "תיאור בעברית" : "Hebrew Description",         value: descHe,  set: setDescHe,  dir: "rtl", multi: true },
          { label: lang === "he" ? "תיאור באנגלית" : "English Description",       value: descEn,  set: setDescEn,  dir: "ltr", multi: true },
        ].map((f) => (
          <View key={f.label}>
            <Text style={[styles.fieldLabel, isRtl && styles.textRight]}>{f.label}</Text>
            <TextInput
              style={[styles.input, f.multi && styles.textarea, { textAlign: f.dir === "rtl" ? "right" : "left" }]}
              value={f.value}
              onChangeText={f.set}
              multiline={f.multi}
            />
          </View>
        ))}

        {/* File upload */}
        <Text style={[styles.fieldLabel, isRtl && styles.textRight]}>
          {tx('uploadProjectInfo', lang)}
        </Text>
        <Pressable
          style={[styles.uploadBtn, projectFile && styles.uploadBtnDone]}
          onPress={() => pickFile(true)}
        >
          <Text style={styles.uploadBtnText}>
            {projectFile ? `✓ ${projectName}` : `📄 ${tx('tapToUpload', lang)}`}
          </Text>
        </Pressable>

        {/* Faculty (admin only) */}
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
                      faculty === fid && { backgroundColor: fc.primary, borderColor: fc.primary },
                    ]}
                    onPress={() => setFaculty?.(fid)}
                  >
                    <View style={[styles.facultyPickerDot, { backgroundColor: fc.primary }]} />
                    <Text style={[styles.facultyPickerText, faculty === fid && { color: "#fff" }]}>
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
              style={[styles.toggleBtn, maxStudents === num && styles.toggleBtnActive]}
              onPress={() => setMaxStudents(num)}
            >
              <Text style={[styles.toggleText, maxStudents === num && styles.toggleTextActive]}>
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
              <Text style={[styles.toggleText, degree === d && styles.toggleTextActive]}>{d}</Text>
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
              <Text style={[styles.toggleText, type === t && styles.toggleTextActive]}>{t}</Text>
            </Pressable>
          ))}
        </View>

        {/* Supervisors (admin only) */}
        {isAdmin && supervisors?.length ? (
          <>
            <Text style={styles.fieldLabel}>
              {lang === "he" ? "בחר מנחה" : "Select Supervisor"}
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {supervisors.map((s) => (
                <Pressable
                  key={s.id}
                  style={[styles.supOption, selectedSupervisor?.id === s.id && styles.supOptionActive]}
                  onPress={() => { setSelectedSupervisor?.(s); setShowConfirm?.(true); }}
                >
                  <Text>{s.displayName}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </>
        ) : null}

        {/* ── Grading Criteria ─────────────────────────────────────────────────── */}
        <View style={criteriaStyles.section}>
          <View style={criteriaStyles.sectionHeader}>
            <Text style={criteriaStyles.sectionTitle}>
              {lang === 'he' ? '📊 קריטריוני הערכה' : '📊 Grading Criteria'}
            </Text>
            <View style={[
              criteriaStyles.totalBadge,
              { backgroundColor: totalMax === 100 ? '#ECFDF5' : '#FEF2F2' },
            ]}>
              <Text style={[
                criteriaStyles.totalBadgeText,
                { color: totalMax === 100 ? '#10B981' : '#EF4444' },
              ]}>
                {lang === 'he' ? `סה"כ: ${totalMax}/100` : `Total: ${totalMax}/100`}
              </Text>
            </View>
          </View>

          {totalMax !== 100 && (
            <Text style={criteriaStyles.warning}>
              {lang === 'he'
                ? `⚠️ סכום הנקודות חייב להיות 100 (כרגע: ${totalMax})`
                : `⚠️ Total must equal 100 (currently: ${totalMax})`}
            </Text>
          )}

          {gradingCriteria.map((c, i) => (
            <View key={c.key} style={criteriaStyles.criterionRow}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text style={criteriaStyles.criterionLabel}>
                  {lang === 'he' ? 'שם קריטריון' : 'Criterion Name'}
                </Text>
                <TextInput
                  style={criteriaStyles.criterionInput}
                  value={c.label}
                  onChangeText={(v) => updateCriterion(i, 'label', v)}
                  placeholder={lang === 'he' ? 'למשל: בהירות' : 'e.g. Clarity'}
                  placeholderTextColor="#9BA8C0"
                />
              </View>
              <View style={{ width: 70 }}>
                <Text style={criteriaStyles.criterionLabel}>
                  {lang === 'he' ? 'מקס׳' : 'Max'}
                </Text>
                <TextInput
                  style={[criteriaStyles.criterionInput, { textAlign: 'center' }]}
                  value={String(c.maxScore)}
                  onChangeText={(v) => updateCriterion(i, 'maxScore', v)}
                  keyboardType="numeric"
                />
              </View>
              <Pressable
                style={criteriaStyles.removeBtn}
                onPress={() => removeCriterion(i)}
              >
                <Text style={criteriaStyles.removeBtnText}>✕</Text>
              </Pressable>
            </View>
          ))}

          <Pressable style={criteriaStyles.addBtn} onPress={addCriterion}>
            <Text style={criteriaStyles.addBtnText}>
              + {lang === 'he' ? 'הוסף קריטריון' : 'Add Criterion'}
            </Text>
          </Pressable>
        </View>

        {/* Submit */}
        <Pressable style={styles.submitBtn} onPress={onCreate} disabled={creating}>
          {creating
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.submitBtnText}>
                {lang === "he" ? "פרסם פרויקט" : "Publish Project"}
              </Text>
          }
        </Pressable>

      </ScrollView>
    </Modal>
  );
}

// ─── Criteria section styles ──────────────────────────────────────────────────
import { StyleSheet } from 'react-native';

const criteriaStyles = StyleSheet.create({
  section: {
    marginTop:        20,
    marginBottom:     8,
    backgroundColor:  '#F8FAFF',
    borderRadius:     16,
    padding:          16,
    borderWidth:      1,
    borderColor:      '#E0E8FF',
  },
  sectionHeader: {
    flexDirection:    'row',
    justifyContent:   'space-between',
    alignItems:       'center',
    marginBottom:     12,
  },
  sectionTitle: {
    fontSize:         15,
    fontWeight:       '700',
    color:            '#111827',
  },
  totalBadge: {
    paddingHorizontal: 10,
    paddingVertical:   4,
    borderRadius:      20,
  },
  totalBadgeText: {
    fontSize:   12,
    fontWeight: '700',
  },
  warning: {
    fontSize:     12,
    color:        '#EF4444',
    marginBottom: 10,
    fontWeight:   '600',
  },
  criterionRow: {
    flexDirection:  'row',
    alignItems:     'flex-end',
    marginBottom:   10,
  },
  criterionLabel: {
    fontSize:     11,
    color:        '#8899BB',
    fontWeight:   '600',
    marginBottom: 4,
  },
  criterionInput: {
    backgroundColor:   '#fff',
    borderRadius:      10,
    borderWidth:       1,
    borderColor:       '#D0DEFF',
    paddingHorizontal: 10,
    paddingVertical:   8,
    fontSize:          14,
    color:             '#111',
  },
  removeBtn: {
    marginLeft:      8,
    marginBottom:    2,
    width:           32,
    height:          36,
    borderRadius:    10,
    backgroundColor: '#FEE2E2',
    justifyContent:  'center',
    alignItems:      'center',
  },
  removeBtnText: {
    color:      '#EF4444',
    fontWeight: '700',
    fontSize:   14,
  },
  addBtn: {
    marginTop:       8,
    paddingVertical: 10,
    borderRadius:    12,
    borderWidth:     1,
    borderColor:     '#2E86FF',
    borderStyle:     'dashed',
    alignItems:      'center',
  },
  addBtnText: {
    color:      '#2E86FF',
    fontWeight: '700',
    fontSize:   14,
  },
});