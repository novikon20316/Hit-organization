// components/modals/NewProjectModal.tsx
//
// Faculty (admin/faculty_admin modes), degree type, and project type are all
// checkbox multi-selects — a project can now be posted open to more than one
// faculty (admin/faculty_admin only — see FacultyCheckboxes, options scoped
// to GET /api/permissions/my-grants) and more than one degree/track
// simultaneously. Supervisor mode keeps faculty locked/single (unaffected —
// not one of the multi-faculty roles), but also gets the degree/type
// checkbox conversion. Every selected combination must resolve to an
// approved workflow template — see WorkflowTemplatePreview.
import React from "react";
import {AppUser, DegreeLevel, Program, Faculty, UserRole }from '@/types'
import { tx } from '../../components/i18n';
import { HIT_FACULTIES, getFacultyByKey, getFilteredPrograms } from '../../constants/faculties';
import {
  Modal, View, Text, ScrollView, Pressable,
  TextInput, ActivityIndicator
} from "react-native";
import { NewProjectModalStyles } from '../../constants/styles';
import FacultyCheckboxes from '../FacultyCheckboxes';
import WorkflowTemplatePreview from '../WorkflowTemplatePreview';
import type { PrerequisiteSpec } from '../Prerequisites';

// Returns true if the user holds a given role (checks both roles[] and the
// legacy single role field so old data keeps working)
function userHasRole(user: AppUser | undefined, role: UserRole): boolean {
  if (!user) return false;
  if (user.roles?.includes(role)) return true;
  return user.role === role;
}

type FacultyColors = Record<string, { primary: string; light?: string; label: Record<string, string> }>;

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
  prerequisites: PrerequisiteSpec[]; setPrerequisites: (v: PrerequisiteSpec[]) => void;

  // Supervisor mode only — locked/single, unaffected by the multi-faculty
  // feature (supervisor isn't one of the allowed roles).
  faculty?:    string;
  setFaculty?: (v: string) => void;

  // Admin/faculty_admin modes — multi-select, options scoped to whatever
  // add_projects grants the caller holds (see FacultyCheckboxes). Unused in
  // supervisor mode (faculty stays locked/single there — see faculty above).
  facultyIds?:    string[];
  setFacultyIds?: (v: string[]) => void;

  degreeTypes:    ("bachelors" | "masters")[];
  setDegreeTypes: (v: ("bachelors" | "masters")[]) => void;
  projectTypes:   ("project" | "thesis")[];
  setProjectTypes: (v: ("project" | "thesis")[]) => void;

  // NEW: selected program
  selectedProgram?:    string | null;
  setSelectedProgram?: (v: string | null) => void;

  // Supervisor's own majors restriction (assignedMajors, slugs — see
  // constants/permissions.ts's majorsForFaculty), when the caller is a
  // supervisor posting their own project. Undefined/empty = unrestricted:
  // every major of the faculty stays selectable, plus an explicit "no
  // restriction" option. Not used in admin mode.
  restrictedMajors?: string[];

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
  uploadingFile?: boolean;

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
  faculty,
  facultyIds = [], setFacultyIds,
  degreeTypes, setDegreeTypes,
  projectTypes, setProjectTypes,
  selectedProgram, setSelectedProgram,
  restrictedMajors,
  supervisors, selectedSupervisor, setSelectedSupervisor, setShowConfirm,
  onCreate, creating,
  maxStudents, setMaxStudents,
  projectName, setProjectName,
  projectFile, setProjectFile,
  pickFile,
  uploadingFile,
  currentUser,
  facultyColors, styles,
}: Props) {

  const isAdmin = mode === "admin";
  const isFacultyAdmin = mode === "faculty_admin";

  // A user is treated as a supervisor (faculty-locked) when:
  //   - the screen passes mode="supervisor", OR
  //   - the currentUser holds the "supervisor" role (even alongside other roles)
  // Admins and faculty_admins are never locked even if they also supervise.
  const isSupervisor =
    mode === "supervisor" ||
    (!isAdmin && !isFacultyAdmin && userHasRole(currentUser, "supervisor"));

  // ── For supervisors: faculty is fixed to their own facultyId ────────────────
  const effectiveFaculty = isSupervisor ? (currentUser?.facultyId ?? faculty) : undefined;
  const supervisorFacultyObj = isSupervisor
    ? getFacultyByKey(effectiveFaculty ?? "")
    : null;

  // The program/major picker only makes unambiguous sense against exactly
  // one faculty + one degree type — with more than one of either selected,
  // there's no single program list to show, so the picker is hidden and
  // major stays unset (open to every major across every selected combo),
  // same simplification the web port makes for its own major dropdown.
  const singleFaculty = isSupervisor ? effectiveFaculty : (facultyIds.length === 1 ? facultyIds[0] : undefined);
  const singleDegreeType = degreeTypes.length === 1 ? degreeTypes[0] : undefined;

  const toggleDegreeType = (d: "bachelors" | "masters") => {
    setDegreeTypes(degreeTypes.includes(d) ? degreeTypes.filter((x) => x !== d) : [...degreeTypes, d]);
    setSelectedProgram?.(null);
  };
  const toggleProjectType = (t: "project" | "thesis") => {
    setProjectTypes(projectTypes.includes(t) ? projectTypes.filter((x) => x !== t) : [...projectTypes, t]);
  };

  const hasOnlySupervisorRole =
    currentUser &&
    userHasRole(currentUser, "supervisor") &&
    !userHasRole(currentUser, "system_admin") &&
    !userHasRole(currentUser, "faculty_admin");

  // ── Programs available for current faculty + degree ─────────────────────────
  const availablePrograms: Program[] = singleFaculty && singleDegreeType
    ? getFilteredPrograms(singleFaculty, singleDegreeType)
    : [];

  // A supervisor restricted to specific majors (restrictedMajors, set by
  // system_admin) only sees those within the picker and must pick one;
  // an unrestricted supervisor (or admin, who is never restricted here)
  // sees every program for the faculty + degree, plus an explicit
  // "no restriction" option below.
  const isMajorRestricted = isSupervisor && !!restrictedMajors && restrictedMajors.length > 0;
  const visiblePrograms: Program[] = isMajorRestricted
    ? availablePrograms.filter((p) => restrictedMajors!.includes(p.slug))
    : availablePrograms;

  const showProgramPicker = visiblePrograms.length > 0;

  const shouldShowClassSelection =
    hasOnlySupervisorRole && singleFaculty && !showProgramPicker;

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
          disabled={uploadingFile}
        >
          {uploadingFile ? (
            <ActivityIndicator color="#2E86FF" />
          ) : (
            <Text style={styles.uploadBtnText}>
              {projectFile ? `✓ ${projectName}` : `📄 ${tx('tapToUpload', lang)}`}
            </Text>
          )}
        </Pressable>

        {/* ── Faculty: checkboxes for admin/faculty_admin, read-only badge for supervisor ──── */}
        {(isAdmin || isFacultyAdmin) && (
          <>
            <Text style={[styles.fieldLabel, !isRtl && styles.textRight]}>
              {lang === "he" ? "פקולטה/ות *" : "Faculty/Faculties *"}
            </Text>
            <FacultyCheckboxes
              selected={facultyIds}
              onChange={(ids) => {
                setFacultyIds?.(ids);
                setSelectedProgram?.(null);
              }}
              lang={lang}
            />
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
          {(["bachelors", "masters"] as const).map((d) => {
            const isSelected = degreeTypes.includes(d);
            return (
              <Pressable
                key={d}
                style={[styles.toggleBtn, isSelected && styles.toggleBtnActive]}
                onPress={() => toggleDegreeType(d)}
              >
                <Text style={[styles.toggleText, isSelected && styles.toggleTextActive]}>
                  {isSelected ? "✓ " : ""}
                  {d === "bachelors"
                    ? (lang === "he" ? "תואר ראשון" : "Bachelor's")
                    : (lang === "he" ? "תואר שני"   : "Master's")}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* ── Program picker (shown when exactly one faculty + one degree are selected) ── */}
        {showProgramPicker && (
          <View style={programStyles.section}>
            <Text style={[programStyles.sectionTitle, { marginBottom: 10 }]}>
              {lang === "he" ? "מסלול לימודים *" : "Study Program *"}
            </Text>

            {isSupervisor && !isMajorRestricted && (
              <Pressable
                style={[programStyles.programBtn, selectedProgram === null && programStyles.programBtnActive]}
                onPress={() => setSelectedProgram?.(null)}
              >
                <View style={[programStyles.programRadio, selectedProgram === null && programStyles.programRadioActive]}>
                  {selectedProgram === null && <View style={programStyles.programRadioDot} />}
                </View>
                <Text style={[programStyles.programBtnText, selectedProgram === null && programStyles.programBtnTextActive]}>
                  {lang === "he" ? "ללא הגבלה — פתוח לכל המגמות" : "No restriction — open to all majors"}
                </Text>
              </Pressable>
            )}

            {visiblePrograms.map((p) => {
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
        {singleFaculty && !showProgramPicker && (
          hasOnlySupervisorRole ? (
            <View style={programStyles.section}>
              <Text style={[programStyles.sectionTitle, { marginBottom: 10 }]}>
                {lang === "he"
                  ? "בחר מסלול"
                  : "Select Program"}
              </Text>

              {(
                getFacultyByKey(currentUser?.facultyId ?? "")?.programs || []
              ).filter((p) => !isMajorRestricted || restrictedMajors!.includes(p.slug))
                .map((p) => {
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
          {(["project", "thesis"] as const).map((t) => {
            const isSelected = projectTypes.includes(t);
            return (
              <Pressable
                key={t}
                style={[styles.toggleBtn, isSelected && styles.toggleBtnActive]}
                onPress={() => toggleProjectType(t)}
              >
                <Text style={[styles.toggleText, isSelected && styles.toggleTextActive]}>
                  {isSelected ? "✓ " : ""}
                  {t === "project"
                    ? (lang === "he" ? "פרויקט" : "Project")
                    : (lang === "he" ? "תזה"    : "Thesis")}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* ── Workflow template preview ───────────────────────────────────────── */}
        <WorkflowTemplatePreview
          facultyIds={isSupervisor ? (singleFaculty ? [singleFaculty] : []) : facultyIds}
          degreeTypes={degreeTypes}
          projectTypes={projectTypes}
          major={selectedProgram ? getFilteredPrograms(singleFaculty ?? "", singleDegreeType ?? "bachelors").find((p) => p.key === selectedProgram)?.slug ?? null : null}
          lang={lang}
        />

        {/* ── Prerequisites ─────────────────────────────────────────────────────── */}
        <Text style={[styles.fieldLabel, !isRtl && styles.textRight, { marginTop: 4, marginBottom: 4 }]}>
          {lang === "he" ? "קורסי דרישת קדם" : "Prerequisites"}
        </Text>
        <Text style={{ fontSize: 12, color: '#8899BB', marginBottom: 8, textAlign: isRtl ? 'right' : 'left' }}>
          {lang === "he"
            ? "לכל קורס ניתן להוסיף ציון מינימלי נדרש (אופציונלי) — למשל \"מדעי המחשב\" עם ציון מינימלי 80."
            : 'Each course can optionally have a minimum grade — e.g. "Computer Science" with a minimum grade of 80.'}
        </Text>
        {prerequisites.map((row, idx) => (
          <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <TextInput
              style={[styles.input, { flex: 7, textAlign: isRtl ? "right" : "left" }]}
              value={row.subject}
              onChangeText={(v) => setPrerequisites(prerequisites.map((r, i) => (i === idx ? { ...r, subject: v } : r)))}
              placeholder={lang === "he" ? "שם הקורס" : "Course name"}
              placeholderTextColor="#9BA8C0"
            />
            <TextInput
              style={[styles.input, { flex: 3, textAlign: isRtl ? "right" : "left" }]}
              value={row.minGrade != null ? String(row.minGrade) : ''}
              onChangeText={(v) => setPrerequisites(prerequisites.map((r, i) => (i === idx ? { ...r, minGrade: v === '' ? undefined : Number(v) } : r)))}
              keyboardType="numeric"
              placeholder={lang === "he" ? "ציון מינ׳" : "Min grade"}
              placeholderTextColor="#9BA8C0"
            />
            <Pressable onPress={() => setPrerequisites(prerequisites.filter((_, i) => i !== idx))}>
              <Text style={{ fontSize: 16 }}>🗑️</Text>
            </Pressable>
          </View>
        ))}
        <Pressable
          onPress={() => setPrerequisites([...prerequisites, { subject: '' }])}
          style={{ alignSelf: isRtl ? 'flex-end' : 'flex-start', backgroundColor: '#7C3AED', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, marginBottom: 20 }}
        >
          <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>＋ {lang === "he" ? "הוסף קורס" : "Add course"}</Text>
        </Pressable>

        {/* ── Supervisors (admin/faculty_admin only) ────────────────────────────── */}
        {(isAdmin || isFacultyAdmin) && supervisors?.length ? (
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

const programStyles = NewProjectModalStyles;
