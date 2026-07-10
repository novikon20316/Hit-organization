// components/modals/NewProjectModal.tsx
import React from "react";
import {AppUser, GradingCriterion, DegreeLevel, Program, Faculty, UserRole }from '@/types'
import { tx } from '../../components/i18n';
import { HIT_FACULTIES, getFacultyByKey, getFilteredPrograms } from '../../constants/faculties';
import {
  Modal, View, Text, ScrollView, Pressable,
  TextInput, ActivityIndicator, StyleSheet
} from "react-native";

// Returns true if the user holds a given role (checks both roles[] and the
// legacy single role field so old data keeps working)
function userHasRole(user: AppUser | undefined, role: UserRole): boolean {
  if (!user) return false;
  if (user.roles?.includes(role)) return true;
  return user.role === role;
}

type FacultyColors = Record<string, { primary: string; light?: string; label: Record<string, string> }>;

export const DEFAULT_CRITERIA: GradingCriterion[] = [
  { key: 'clarity',     label: 'Research Clarity', maxScore: 20 },
  { key: 'methodology', label: 'Methodology',       maxScore: 25 },
  { key: 'feasibility', label: 'Feasibility',       maxScore: 20 },
  { key: 'innovation',  label: 'Innovation',        maxScore: 15 },
  { key: 'writing',     label: 'Writing Quality',   maxScore: 20 },
];

// HIT_FACULTIES / getFacultyByKey / getFilteredPrograms now live in
// constants/faculties.ts (shared with student signup) — re-exported here so
// any existing external import of these names from this file keeps working.
export { HIT_FACULTIES, getFacultyByKey, getFilteredPrograms };

// ─── Props ────────────────────────────────────────────────────────────────────

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
  prerequisites: string; setPrerequisites: (v: string) => void;

  faculty?:    string;
  setFaculty?: (v: string) => void;

  degree:    "bachelors" | "masters" | "both";
  setDegree: (v: "bachelors" | "masters") => void;
  type:      "project" | "thesis";
  setType:   (v: "project" | "thesis") => void;

  // NEW: selected program
  selectedProgram?:    string | null;
  setSelectedProgram?: (v: string | null) => void;

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

  gradingCriteria:    GradingCriterion[];
  setGradingCriteria: (v: GradingCriterion[]) => void;

  // The logged-in user — used to lock faculty scope for supervisors
  currentUser?:  AppUser;

  facultyColors: FacultyColors;
  styles:        any;
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function NewProjectModal({
  visible, setVisible, mode, lang, isRtl,
  titleHe, setTitleHe, titleEn, setTitleEn,
  descHe,  setDescHe,  descEn,  setDescEn,
  skills,  setSkills,
  prerequisites, setPrerequisites,
  faculty, setFaculty,
  degree,  setDegree,
  type,    setType,
  selectedProgram, setSelectedProgram,
  supervisors, selectedSupervisor, setSelectedSupervisor, setShowConfirm,
  onCreate, creating,
  maxStudents, setMaxStudents,
  projectName, setProjectName,
  projectFile, setProjectFile,
  pickFile,
  gradingCriteria, setGradingCriteria,
  currentUser,
  facultyColors, styles,
}: Props) {

  const isAdmin = mode === "admin";

  // A user is treated as a supervisor (faculty-locked) when:
  //   - the screen passes mode="supervisor", OR
  //   - the currentUser holds the "supervisor" role (even alongside other roles)
  // Admins and faculty_admins are never locked even if they also supervise.
  const isSupervisor =
    mode === "supervisor" ||
    (!isAdmin && mode !== "faculty_admin" && userHasRole(currentUser, "supervisor"));

  // ── For supervisors: faculty is fixed to their own facultyId ────────────────
  // The parent should still pass faculty / setFaculty; we just auto-lock it.
  const effectiveFaculty = isSupervisor ? (currentUser?.facultyId ?? faculty) : faculty;
  const supervisorFacultyObj = isSupervisor
    ? getFacultyByKey(effectiveFaculty ?? "")
    : null;

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

  // ── Faculty selection handler: reset program when faculty changes ────────────
  const handleFacultyChange = (fid: string) => {
    setFaculty?.(fid);
    setSelectedProgram?.(null); // reset program selection
  };

  // ── Degree selection handler: reset program when degree changes ─────────────
  const handleDegreeChange = (d: "bachelors" | "masters") => {
    setDegree(d);
    setSelectedProgram?.(null); // reset program selection
  };


  const hasOnlySupervisorRole =
    currentUser &&
    userHasRole(currentUser, "supervisor") &&
    !userHasRole(currentUser, "system_admin") &&
    !userHasRole(currentUser, "faculty_admin");

  // ── Programs available for current faculty + degree ─────────────────────────
  const availablePrograms: Program[] = effectiveFaculty
    ? getFilteredPrograms(effectiveFaculty, degree)
    : [];

  const showProgramPicker = availablePrograms.length > 0;

  const shouldShowClassSelection =
    hasOnlySupervisorRole && effectiveFaculty && !showProgramPicker;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <ScrollView style={styles.modal} contentContainerStyle={styles.modalContent}>

        {/* ── Header ──────────────────────────────────────────────────────────── */}
        <View style={[styles.modalHeader, isRtl && styles.rowReverse]}>
          <Text style={styles.modalTitle}>
            {lang === "he" ? "פרסום פרויקט חדש" : "Post New Project"}
          </Text>
          <Pressable onPress={() => setVisible(false)}>
            <Text style={styles.modalClose}>✕</Text>
          </Pressable>
        </View>

        {/* ── Basic text fields ────────────────────────────────────────────────── */}
        {[
          { label: lang === "he" ? "כותרת בעברית *"   : "Hebrew Title *",       value: titleHe, set: setTitleHe, dir: "rtl" },
          { label: lang === "he" ? "כותרת באנגלית *"  : "English Title *",      value: titleEn, set: setTitleEn, dir: "ltr" },
          { label: lang === "he" ? "תיאור בעברית"     : "Hebrew Description",   value: descHe,  set: setDescHe,  dir: "rtl", multi: true },
          { label: lang === "he" ? "תיאור באנגלית"    : "English Description",  value: descEn,  set: setDescEn,  dir: "ltr", multi: true },
        ].map((f) => (
          <View key={f.label} style={{ marginBottom: 12 }}>
            <Text style={[styles.fieldLabel, !isRtl && styles.textRight, { marginTop: 4, marginBottom: 4 }]}>{f.label}</Text>
            <TextInput
              style={[styles.input, f.multi && styles.textarea, { textAlign: f.dir === "rtl" ? "right" : "left" }, { marginBottom: 20 }]}
              value={f.value}
              onChangeText={f.set}
              multiline={f.multi}
            />
          </View>
        ))}

        {/* ── File upload ──────────────────────────────────────────────────────── */}
        <Text style={[styles.fieldLabel, !isRtl && styles.textRight, { marginTop: 4, marginBottom: 4 }]}>
          {tx('uploadProjectInfo', lang)}
        </Text>
        <Pressable
          style={[{
            backgroundColor: projectFile ? '#F1FFF3' : '#fff',
            borderRadius:    12,
            padding:         16,
            borderWidth:     2,
            borderColor:     projectFile ? '#4CAF50' : '#D0DEFF',
            borderStyle:     projectFile ? 'solid' : 'dashed',
            alignItems:      'center',
            marginBottom:    16,
          }]}
          onPress={() => pickFile(true)}
        >
          <Text style={styles.uploadBtnText}>
            {projectFile ? `✓ ${projectName}` : `📄 ${tx('tapToUpload', lang)}`}
          </Text>
        </Pressable>

        {/* ── Faculty: picker for admin, read-only badge for supervisor ──────── */}
        {isAdmin && (
          <>
            <Text style={[styles.fieldLabel, !isRtl && styles.textRight]}>
              {lang === "he" ? "פקולטה *" : "Faculty *"}
            </Text>
            <View style={programStyles.facultyList}>
              {HIT_FACULTIES.map((f) => {
                const isSelected = faculty === f.key;
                const fc = facultyColors[f.key] ?? facultyColors["default"];
                const accentColor = fc?.primary ?? "#2E86FF";
                return (
                  <Pressable
                    key={f.key}
                    style={[
                      programStyles.facultyBtn,
                      isSelected && { backgroundColor: accentColor, borderColor: accentColor },
                    ]}
                    onPress={() => handleFacultyChange(f.key)}
                  >
                    <View style={[programStyles.facultyDot, { backgroundColor: accentColor }]} />
                    <Text style={[programStyles.facultyBtnText, isSelected && { color: "#fff" }]}>
                      {f.label[lang]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        )}

        {isSupervisor && supervisorFacultyObj && (
          <>
            <Text style={[styles.fieldLabel, !isRtl && styles.textRight]}>
              {lang === "he" ? "פקולטה" : "Faculty"}
            </Text>
            {(() => {
              const fc = facultyColors[supervisorFacultyObj.key] ?? facultyColors["default"];
              const accentColor = fc?.primary ?? "#2E86FF";
              return (
                <View style={[programStyles.supervisorFacultyBadge, { borderColor: accentColor, backgroundColor: fc?.light ?? "#F8FAFF" }]}>
                  <View style={[programStyles.facultyDot, { backgroundColor: accentColor }]} />
                  <Text style={[programStyles.supervisorFacultyText, { color: accentColor }]}>
                    {supervisorFacultyObj.label[lang]}
                  </Text>
                  <Text style={programStyles.supervisorFacultyLock}>🔒</Text>
                </View>
              );
            })()}
          </>
        )}

        {/* ── Max students ─────────────────────────────────────────────────────── */}
        <Text style={[styles.fieldLabel, !isRtl && styles.textRight]}>
          {lang === "he" ? "מספר סטודנטים" : "Max Students"}
        </Text>
        <View style={[styles.toggleRow, !isRtl && styles.rowReverse]}>
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

        {/* ── Degree ───────────────────────────────────────────────────────────── */}
        <Text style={[styles.fieldLabel, !isRtl && styles.textRight]}>
          {lang === "he" ? "סוג תואר" : "Degree Type"}
        </Text>
        <View style={[styles.toggleRow, !isRtl && styles.rowReverse]}>
          {(["bachelors", "masters"] as const).map((d) => (
            <Pressable
              key={d}
              style={[styles.toggleBtn, degree === d && styles.toggleBtnActive]}
              onPress={() => handleDegreeChange(d)}
            >
              <Text style={[styles.toggleText, degree === d && styles.toggleTextActive]}>
                {d === "bachelors"
                  ? (lang === "he" ? "תואר ראשון" : "Bachelor's")
                  : (lang === "he" ? "תואר שני"   : "Master's")}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* ── Program picker (shown when faculty + degree are selected) ───────── */}
        {showProgramPicker && (
          <View style={programStyles.section}>
            <Text style={[programStyles.sectionTitle, { marginBottom: 10 }]}>
              {lang === "he" ? "מסלול לימודים *" : "Study Program *"}
            </Text>

            {availablePrograms.map((p) => {
              const isSelected = selectedProgram === p.key;
              return (
                <Pressable
                  key={p.key}
                  style={[programStyles.programBtn, isSelected && programStyles.programBtnActive]}
                  onPress={() => setSelectedProgram?.(isSelected ? null : p.key)}
                >
                  <View style={[programStyles.programRadio, isSelected && programStyles.programRadioActive]}>
                    {isSelected && <View style={programStyles.programRadioDot} />}
                  </View>
                  <Text style={[programStyles.programBtnText, isSelected && programStyles.programBtnTextActive]}>
                    {p.label[lang]}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}

        {/* Hint when faculty is selected but no programs match degree */}
        {effectiveFaculty && !showProgramPicker && (
          hasOnlySupervisorRole ? (
            <View style={programStyles.section}>
              <Text style={[programStyles.sectionTitle, { marginBottom: 10 }]}>
                {lang === "he"
                  ? "בחר מסלול"
                  : "Select Program"}
              </Text>

              {(
                getFacultyByKey(currentUser?.facultyId ?? "")?.programs || []
              ).map((p) => {
                const isSelected = selectedProgram === p.key;

                return (
                  <Pressable
                    key={p.key}
                    style={[
                      programStyles.programBtn,
                      isSelected && programStyles.programBtnActive,
                    ]}
                    onPress={() =>
                      setSelectedProgram?.(isSelected ? null : p.key)
                    }
                  >
                    <View
                      style={[
                        programStyles.programRadio,
                        isSelected && programStyles.programRadioActive,
                      ]}
                    >
                      {isSelected && (
                        <View style={programStyles.programRadioDot} />
                      )}
                    </View>

                    <Text
                      style={[
                        programStyles.programBtnText,
                        isSelected && programStyles.programBtnTextActive,
                      ]}
                    >
                      {p.label[lang]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <View style={programStyles.emptyHint}>
              <Text style={programStyles.emptyHintText}>
                {lang === "he"
                  ? "אין מסלולים זמינים לפקולטה זו עבור הדרגה שנבחרה."
                  : "No programs available for this faculty at the selected degree level."}
              </Text>
            </View>
          )
        )}
        {/* ── Type ─────────────────────────────────────────────────────────────── */}
        <Text style={[styles.fieldLabel, !isRtl && styles.textRight]}>
          {lang === "he" ? "סוג פרויקט" : "Project Type"}
        </Text>
        <View style={[styles.toggleRow, !isRtl && styles.rowReverse]}>
          {(["project", "thesis"] as const).map((t) => (
            <Pressable
              key={t}
              style={[styles.toggleBtn, type === t && styles.toggleBtnActive]}
              onPress={() => setType(t)}
            >
              <Text style={[styles.toggleText, type === t && styles.toggleTextActive]}>
                {t === "project"
                  ? (lang === "he" ? "פרויקט" : "Project")
                  : (lang === "he" ? "תזה"    : "Thesis")}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* ── Prerequisites ─────────────────────────────────────────────────────── */}
        <Text style={[styles.fieldLabel, !isRtl && styles.textRight, { marginTop: 4, marginBottom: 4 }]}>
          {lang === "he" ? "קורסי דרישת קדם" : "Prerequisites"}
        </Text>
        <Text style={{ fontSize: 12, color: '#8899BB', marginBottom: 8, textAlign: isRtl ? 'right' : 'left' }}>
          {lang === "he"
            ? "רשום את שמות הקורסים שהסטודנט חייב להשלים כדי להיות זכאי, מופרדים בפסיקים"
            : "List the course names a student must have completed to be eligible, separated by commas"}
        </Text>
        <TextInput
          style={[styles.input, styles.textarea, { textAlign: isRtl ? "right" : "left", marginBottom: 20 }]}
          value={prerequisites}
          onChangeText={setPrerequisites}
          multiline
          placeholder={lang === "he" ? "לדוגמה: מבני נתונים, אלגוריתמים" : "e.g. Data Structures, Algorithms"}
          placeholderTextColor="#9BA8C0"
        />

        {/* ── Supervisors (admin only) ─────────────────────────────────────────── */}
        {isAdmin && supervisors?.length ? (
          <>
            <Text style={styles.fieldLabel}>
              {lang === "he" ? "בחר מנחה" : "Select Supervisor"}
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ marginBottom: 8 }}
              contentContainerStyle={{ paddingVertical: 4, paddingHorizontal: 2 }}
            >
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
                  {lang === 'he' ? "מקס'" : 'Max'}
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

        {/* ── Submit ───────────────────────────────────────────────────────────── */}
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

// ─── Program picker styles ────────────────────────────────────────────────────

const programStyles = StyleSheet.create({
  facultyList: {
    gap:          8,
    marginBottom: 16,
  },
  facultyBtn: {
    flexDirection:     'row',
    alignItems:        'center',
    paddingHorizontal: 14,
    paddingVertical:   10,
    borderRadius:      12,
    borderWidth:       1.5,
    borderColor:       '#D0DEFF',
    backgroundColor:   '#F8FAFF',
    gap:               8,
  },
  facultyDot: {
    width:        10,
    height:       10,
    borderRadius: 5,
  },
  facultyBtnText: {
    fontSize:   14,
    color:      '#374151',
    fontWeight: '500',
    flexShrink: 1,
  },
  section: {
    marginTop:       12,
    marginBottom:    8,
    backgroundColor: '#F8FAFF',
    borderRadius:    16,
    padding:         16,
    borderWidth:     1,
    borderColor:     '#E0E8FF',
  },
  sectionTitle: {
    fontSize:   15,
    fontWeight: '700',
    color:      '#111827',
  },
  programBtn: {
    flexDirection:     'row',
    alignItems:        'center',
    paddingHorizontal: 14,
    paddingVertical:   11,
    borderRadius:      12,
    borderWidth:       1.5,
    borderColor:       '#D0DEFF',
    backgroundColor:   '#fff',
    marginBottom:      8,
    gap:               10,
  },
  programBtnActive: {
    borderColor:     '#2E86FF',
    backgroundColor: '#EBF3FF',
  },
  programBtnText: {
    fontSize:   14,
    color:      '#374151',
    fontWeight: '500',
    flexShrink: 1,
  },
  programBtnTextActive: {
    color:      '#1A5FCC',
    fontWeight: '600',
  },
  programRadio: {
    width:           18,
    height:          18,
    borderRadius:    9,
    borderWidth:     2,
    borderColor:     '#9BA8C0',
    alignItems:      'center',
    justifyContent:  'center',
  },
  programRadioActive: {
    borderColor: '#2E86FF',
  },
  programRadioDot: {
    width:           8,
    height:          8,
    borderRadius:    4,
    backgroundColor: '#2E86FF',
  },
  supervisorFacultyBadge: {
    flexDirection:     'row',
    alignItems:        'center',
    alignSelf:         'flex-start',
    paddingHorizontal: 14,
    paddingVertical:   10,
    borderRadius:      12,
    borderWidth:       1.5,
    gap:               8,
    marginBottom:      16,
  },
  supervisorFacultyText: {
    fontSize:   14,
    fontWeight: '600',
  },
  supervisorFacultyLock: {
    fontSize: 13,
    marginLeft: 2,
  },
  emptyHint: {
    padding:         12,
    backgroundColor: '#FFFBEB',
    borderRadius:    10,
    borderWidth:     1,
    borderColor:     '#FDE68A',
    marginBottom:    12,
  },
  emptyHintText: {
    fontSize: 13,
    color:    '#92400E',
  },
});

// ─── Criteria section styles ──────────────────────────────────────────────────

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
    justifyContent:  'space-between',
    alignItems:       'center',
    marginBottom:     12,
  },
  sectionTitle: {
    fontSize:   15,
    fontWeight: '700',
    color:      '#111827',
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
    flexDirection: 'row',
    alignItems:    'flex-end',
    marginBottom:  10,
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