// app/administrative_coordinator/students/[studentId].tsx
// Drill-down reached by tapping a student's card in the Students Report tab
// (administrative_coordinator_dashboard.tsx). Read-only — no grading/approval
// actions live here, those stay on the Project Groups tab. Data comes from a
// single consolidated call, GET /api/project-coordinator/students/:id/detail
// (see server/src/controllers/projectCoordinatorController.ts's
// getStudentDetail) — mirrors web's students/[studentId]/page.tsx.

import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, Linking, TextInput, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { apiClient } from '@/src/api/apiClient';
import { facultyLabel, type FacultyId } from '@/components/i18n';
import { HIT_FACULTIES } from '@/constants/faculties';
import { majorsForFaculty } from '@/constants/permissions';
import { specializationLabel, SPECIALIZATION_LABELS } from '@/constants/specialization';
import { MilestoneRoadmap, type RoadmapMilestone } from '@/components/MilestoneRoadmap';
import { ap } from '@/constants/theme';
import { auth } from '@/src/firebase/firebase';

interface StudentDetail {
  student: {
    id: string;
    name: string;
    facultyId: string | null;
    major: string | null;
    degreeType: 'bachelors' | 'masters' | null;
    specialization?: string | null;
    specializationOptions?: string[];
    completedCourses?: { subject: string; grade?: number }[];
    prerequisiteSubjects?: string[];
    email: string;
    phoneNumber: string | null;
    yearOfStudy: number | null;
    trackPolicy: 'coordinator_gated' | 'signup_choice' | 'project_only';
    track: 'thesis' | 'project' | null;
    trackLocked: boolean;
    thesisEligibility: { eligible: boolean; reason?: string | null; decidedAt?: string | null } | null;
  };
  project: { id: string; titleHe: string; titleEn: string; supervisorName: string | null; academicYear: string | null } | null;
  currentMilestone: { id: string; type: string; nameHe: string; nameEn: string; status: string; dueDate: string | null } | null;
  milestones: Array<{
    id: string;
    type: string;
    nameHe: string;
    nameEn: string;
    status: string;
    dueDate: string | null;
    submittedAt: string | null;
    finalGrade: number | null;
    gradeApproved: boolean;
  }>;
  /** Every milestone on the track, pending ones included — the same field
   *  web's students/[studentId]/page.tsx already renders via
   *  components/MilestoneTimeline. Powers the visual roadmap below;
   *  `milestones` above stays as the flat submitted/graded table it already
   *  was. */
  milestoneRoadmap?: RoadmapMilestone[];
}

// More tabs are expected here later — add a key + label and a branch below.
// Mirrors web's students/[studentId]/page.tsx DETAIL_TABS.
type DetailTab = 'personal' | 'messages';
const DETAIL_TABS: Array<{ key: DetailTab; icon: string; he: string; en: string }> = [
  { key: 'personal', icon: '👤', he: 'פרטים אישיים', en: 'Personal Data' },
  { key: 'messages', icon: '💬', he: 'הודעות', en: 'Messages' },
];

const MILESTONE_STATUS_LABEL: Record<string, { he: string; en: string }> = {
  pending:               { he: 'טרם הוגש',      en: 'Not submitted yet' },
  submitted:             { he: 'הוגש, בבדיקה',  en: 'Submitted, under review' },
  rejected:              { he: 'נדחה',           en: 'Rejected' },
  supervisor_graded:     { he: 'צוין ע"י מנחה',  en: 'Graded by supervisor' },
  graded:                { he: 'צוין',           en: 'Graded' },
  coordinator_approved:  { he: 'אושר',           en: 'Approved' },
  examiners_assigned:    { he: 'בוחנים שובצו',   en: 'Examiners assigned' },
  examiner_graded:       { he: 'צוין ע"י בוחן',  en: 'Graded by examiner' },
  both_examiners_graded: { he: 'שני הבוחנים ציינו', en: 'Both examiners graded' },
  awaiting_defense_date: { he: 'ממתין למועד הגנה', en: 'Awaiting defense date' },
  date_conflict:         { he: 'התנגשות מועדים', en: 'Date conflict' },
  defense_date_set:      { he: 'מועד הגנה נקבע', en: 'Defense date set' },
  scheduled:             { he: 'מתוזמן',         en: 'Scheduled' },
  completed:             { he: 'הושלם',          en: 'Completed' },
};

function statusLabel(status: string, lang: 'he' | 'en'): string {
  return MILESTONE_STATUS_LABEL[status]?.[lang] ?? status;
}

function formatDate(iso: string | null, lang: 'he' | 'en'): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

// Mirrors web's StudentsReportTab.tsx majorCellText — only worth showing for
// a faculty that actually splits into more than one major.
function majorLabel(facultyId: string | null, major: string | null, degreeType: string | null, lang: 'he' | 'en', specialization?: string | null): string {
  const spec = specializationLabel(specialization, lang);
  if (spec) return spec;
  if (!facultyId) return '—';
  const majors = majorsForFaculty(facultyId);
  if (majors.length <= 1) return '—';
  const faculty = HIT_FACULTIES.find((f) => f.key === facultyId);
  const program =
    faculty?.programs.find((p: any) => p.slug === major && p.level === degreeType) ??
    faculty?.programs.find((p: any) => p.slug === major);
  if (program) return program.label[lang];
  const match = majors.find((m) => m.slug === major);
  return match ? match.label[lang] : '—';
}

export default function StudentDetailScreen() {
  const router = useRouter();
  const { studentId, lang: langParam } = useLocalSearchParams<{ studentId: string; lang?: string }>();
  const lang: 'he' | 'en' = langParam === 'en' ? 'en' : 'he';
  const isRtl = lang === 'he';

  const [data, setData] = useState<StudentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [eligibilityReason, setEligibilityReason] = useState('');
  const [savingEligibility, setSavingEligibility] = useState(false);
  const [savingSpecialization, setSavingSpecialization] = useState(false);
  const [activeTab, setActiveTab] = useState<DetailTab>('personal');

  const loadDetail = () => {
    if (!studentId) return;
    setLoading(true);
    setError('');
    return apiClient.get(`/api/project-coordinator/students/${studentId}/detail`)
      .then((res: any) => { setData(res.data); })
      .catch((err: any) => {
        setError(lang === 'he' ? 'טעינת נתוני הסטודנט נכשלה' : 'Failed to load student data');
      })
      .finally(() => { setLoading(false); });
  };

  useEffect(() => {
    loadDetail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId, lang]);

  const handleSetEligibility = async (eligible: boolean) => {
    setSavingEligibility(true);
    try {
      await apiClient.post(`/api/project-coordinator/students/${studentId}/thesis-eligibility`, {
        eligible,
        reason: eligibilityReason.trim() || undefined,
      });
      setEligibilityReason('');
      await loadDetail();
    } catch (err: any) {
      Alert.alert(
        lang === 'he' ? 'שגיאה' : 'Error',
        err?.response?.data?.message || (lang === 'he' ? 'העדכון נכשל' : 'Update failed')
      );
    } finally {
      setSavingEligibility(false);
    }
  };

  // Coordinator / admin coordinator / system_admin only — the server
  // (studentTrackController.ts's setStudentSpecialization) enforces the role
  // and scope; anyone else gets its error message back here.
  const handleSetSpecialization = async (specialization: string | null) => {
    setSavingSpecialization(true);
    try {
      await apiClient.post(`/api/project-coordinator/students/${studentId}/specialization`, { specialization });
      await loadDetail();
    } catch (err: any) {
      Alert.alert(
        lang === 'he' ? 'שגיאה' : 'Error',
        err?.response?.data?.message || (lang === 'he' ? 'העדכון נכשל' : 'Update failed')
      );
    } finally {
      setSavingSpecialization(false);
    }
  };

  const student = data?.student ?? null;
  const project = data?.project ?? null;
  const currentMilestone = data?.currentMilestone ?? null;
  const submittedMilestones = data?.milestones ?? [];
  const milestoneRoadmap = data?.milestoneRoadmap ?? [];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: ap.surface }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/administrative_coordinator/administrative_coordinator_dashboard' as any))}
          style={{ flexDirection: isRtl ? 'row-reverse' : 'row', alignItems: 'center', marginBottom: 16 }}
          accessibilityRole="button"
        >
          <Text style={{ fontSize: 15, fontWeight: '600', color: ap.primary }}>
            {isRtl ? '→' : '←'} {lang === 'he' ? 'חזרה לדוח הסטודנטים' : 'Back to Students Report'}
          </Text>
        </Pressable>

        {loading && <ActivityIndicator style={{ marginTop: 24 }} />}
        {!!error && (
          <View style={{ backgroundColor: '#FEF2F2', borderRadius: 10, padding: 12 }}>
            <Text style={{ color: '#EF4444', fontSize: 13 }}>{error}</Text>
          </View>
        )}

        {!loading && !error && student && (
          <View style={{ flexDirection: isRtl ? 'row-reverse' : 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }} accessibilityRole="tablist">
            {DETAIL_TABS.map((t) => {
              const active = activeTab === t.key;
              return (
                <Pressable
                  key={t.key}
                  onPress={() => setActiveTab(t.key)}
                  style={{
                    borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6,
                    borderColor: active ? ap.primary : ap.outlineVariant,
                    backgroundColor: active ? ap.primary : 'transparent',
                  }}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                >
                  <Text style={{ fontSize: 12, fontWeight: '600', color: active ? '#fff' : ap.onSurface }}>{t.icon} {t[lang]}</Text>
                </Pressable>
              );
            })}
          </View>
        )}

        {!loading && !error && student && activeTab === 'messages' && (
          <StudentMessagesSection studentId={student.id} studentName={student.name} lang={lang} />
        )}

        {!loading && !error && student && activeTab === 'personal' && (
          <View style={{ gap: 12 }}>
            {/* Student profile */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>👤 {student.name}</Text>
              <Text style={styles.cardSub}>
                🏛️ {lang === 'he' ? 'פקולטה:' : 'Faculty:'} {student.facultyId ? facultyLabel(student.facultyId as FacultyId, lang) : '—'}
              </Text>
              <Text style={styles.cardSub}>
                🎓 {lang === 'he' ? 'תואר:' : 'Degree:'} {student.degreeType ? (student.degreeType === 'masters' ? (lang === 'he' ? 'תואר שני' : "Master's") : (lang === 'he' ? 'תואר ראשון' : "Bachelor's")) : '—'}
              </Text>
              <Text style={styles.cardSub}>
                📚 {lang === 'he' ? 'מגמה:' : 'Major:'} {majorLabel(student.facultyId, student.major, student.degreeType, lang, student.specialization)}
              </Text>
              <Text style={styles.cardSub}>
                📆 {lang === 'he' ? 'שנת לימודים:' : 'Year of study:'} {student.yearOfStudy ?? '—'}
              </Text>
            </View>

            {/* Thesis/project track — see server/src/config/studentTrack.ts */}
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>🧭 {lang === 'he' ? 'מסלול (תזה/פרויקט)' : 'Track (Thesis/Project)'}</Text>
              {student.trackPolicy === 'coordinator_gated' ? (
                <>
                  <Text style={styles.cardSub}>
                    {lang === 'he' ? 'זכאות לתזה כרגע:' : 'Currently thesis-eligible:'}{' '}
                    {student.thesisEligibility?.eligible
                      ? (lang === 'he' ? 'כן ✅' : 'Yes ✅')
                      : (lang === 'he' ? 'לא' : 'No')}
                  </Text>
                  <Text style={styles.cardSub}>
                    {lang === 'he' ? 'מסלול שנבחר:' : 'Chosen track:'}{' '}
                    {student.track
                      ? (student.track === 'thesis' ? (lang === 'he' ? 'תזה' : 'Thesis') : (lang === 'he' ? 'פרויקט' : 'Project'))
                      : (lang === 'he' ? 'טרם נבחר' : 'Not chosen yet')}
                    {student.trackLocked ? ` 🔒` : ''}
                  </Text>
                  <TextInput
                    value={eligibilityReason}
                    onChangeText={setEligibilityReason}
                    placeholder={lang === 'he' ? 'סיבה (אופציונלי)' : 'Reason (optional)'}
                    style={{ borderWidth: 1, borderColor: ap.outlineVariant, borderRadius: 8, padding: 8, marginTop: 8, fontSize: 13 }}
                  />
                  <View style={{ flexDirection: isRtl ? 'row-reverse' : 'row', gap: 8, marginTop: 8 }}>
                    <Pressable
                      disabled={savingEligibility}
                      onPress={() => handleSetEligibility(true)}
                      style={{ flex: 1, backgroundColor: '#10B981', borderRadius: 8, paddingVertical: 10, alignItems: 'center', opacity: savingEligibility ? 0.6 : 1 }}
                      accessibilityRole="button"
                      accessibilityState={{ disabled: savingEligibility }}
                    >
                      <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>
                        {lang === 'he' ? 'סמן כזכאי/ת לתזה' : 'Mark thesis-eligible'}
                      </Text>
                    </Pressable>
                    <Pressable
                      disabled={savingEligibility}
                      onPress={() => handleSetEligibility(false)}
                      style={{ flex: 1, backgroundColor: '#EF4444', borderRadius: 8, paddingVertical: 10, alignItems: 'center', opacity: savingEligibility ? 0.6 : 1 }}
                      accessibilityRole="button"
                      accessibilityState={{ disabled: savingEligibility }}
                    >
                      <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>
                        {lang === 'he' ? 'סמן כלא זכאי/ת' : 'Mark not eligible'}
                      </Text>
                    </Pressable>
                  </View>
                </>
              ) : (
                <Text style={styles.cardSub}>
                  {student.trackPolicy === 'signup_choice'
                    ? (lang === 'he'
                      ? `מסלול: ${student.track === 'thesis' ? 'תזה' : 'פרויקט'} (נבחר בהרשמה, נעול)`
                      : `Track: ${student.track === 'thesis' ? 'Thesis' : 'Project'} (chosen at signup, locked)`)
                    : (lang === 'he' ? 'מסלול: פרויקט בלבד (אין אפשרות תזה בתוכנית זו)' : 'Track: Project only (no thesis option in this program)')}
                </Text>
              )}
            </View>

            {/* Specialization (תחום) — see constants/specialization.ts */}
            {(student.specializationOptions?.length ?? 0) > 0 && (
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>🎯 {lang === 'he' ? 'תחום התמחות' : 'Specialization'}</Text>
                {student.specializationOptions!.map((key) => {
                  const selected = student.specialization === key;
                  return (
                    <Pressable
                      key={key}
                      disabled={savingSpecialization || selected}
                      onPress={() => handleSetSpecialization(key)}
                      style={{
                        borderWidth: 1, borderRadius: 8, padding: 10, marginTop: 6,
                        borderColor: selected ? ap.primary : ap.outlineVariant,
                        backgroundColor: selected ? 'rgba(0,35,111,0.08)' : 'transparent',
                        opacity: savingSpecialization ? 0.6 : 1,
                      }}
                      accessibilityRole="button"
                      accessibilityState={{ selected, disabled: savingSpecialization }}
                    >
                      <Text style={{ fontSize: 13, fontWeight: selected ? '700' : '500', color: ap.onSurface, textAlign: isRtl ? 'right' : 'left' }}>
                        {selected ? '✓ ' : ''}{SPECIALIZATION_LABELS[key]?.[lang] ?? key}
                      </Text>
                    </Pressable>
                  );
                })}
                {!student.specialization && (
                  <Text style={styles.cardSub}>{lang === 'he' ? 'טרם הוגדר — הקש/י על תחום כדי לשמור' : 'Not set yet — tap one to save'}</Text>
                )}
              </View>
            )}

            {/* Completed courses — what project prerequisites are checked
                against when the student browses/applies. */}
            <CompletedCoursesCard
              key={`${student.id}-${JSON.stringify(student.completedCourses ?? [])}`}
              studentId={student.id}
              initial={student.completedCourses ?? []}
              suggestions={student.prerequisiteSubjects ?? []}
              lang={lang}
              isRtl={isRtl}
              onSaved={loadDetail}
            />

            {/* Communication */}
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>☎️ {lang === 'he' ? 'פרטי התקשרות' : 'Communication'}</Text>
              {student.email ? (
                <Pressable onPress={() => Linking.openURL(`mailto:${student.email}`)} accessibilityRole="link">
                  <Text style={[styles.cardSub, { color: ap.primary, fontWeight: '600' }]}>✉️ {student.email}</Text>
                </Pressable>
              ) : (
                <Text style={[styles.cardSub, { fontStyle: 'italic' }]}>{lang === 'he' ? 'לא הוגדר אימייל' : 'No email on file'}</Text>
              )}
              {student.phoneNumber ? (
                <Pressable onPress={() => Linking.openURL(`tel:${student.phoneNumber}`)} accessibilityRole="link">
                  <Text style={[styles.cardSub, { color: ap.primary, fontWeight: '600' }]}>📞 {student.phoneNumber}</Text>
                </Pressable>
              ) : (
                <Text style={[styles.cardSub, { fontStyle: 'italic' }]}>{lang === 'he' ? 'לא הוגדר טלפון' : 'No phone number on file'}</Text>
              )}
            </View>

            {/* Project */}
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>📁 {lang === 'he' ? 'הפרויקט/התזה' : 'Project/Thesis'}</Text>
              {project ? (
                <>
                  <Text style={styles.cardSub}>{lang === 'he' ? project.titleHe : project.titleEn}</Text>
                  <Text style={styles.cardSub}>👨‍🏫 {project.supervisorName || (lang === 'he' ? 'ללא מנחה' : 'No supervisor')}</Text>
                  <Text style={styles.cardSub}>📆 {lang === 'he' ? 'שנת לימודים (תחילת הפרויקט):' : 'Study year (project start):'} {project.academicYear || '—'}</Text>
                </>
              ) : (
                <Text style={styles.cardSub}>{lang === 'he' ? 'הסטודנט אינו רשום כרגע לפרויקט/תזה' : 'Student is not currently enrolled in a project/thesis'}</Text>
              )}
            </View>

            {/* Current milestone */}
            {project && (
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>📍 {lang === 'he' ? 'אבן דרך נוכחית' : 'Current Milestone'}</Text>
                {currentMilestone ? (
                  <>
                    <Text style={styles.cardSub}>{lang === 'he' ? currentMilestone.nameHe : currentMilestone.nameEn}</Text>
                    <Text style={styles.cardSub}>
                      {statusLabel(currentMilestone.status, lang)} · 📅 {lang === 'he' ? 'תאריך יעד:' : 'Due:'} {formatDate(currentMilestone.dueDate, lang)}
                    </Text>
                  </>
                ) : (
                  <Text style={styles.cardSub}>{lang === 'he' ? 'אין אבן דרך פעילה' : 'No active milestone'}</Text>
                )}
              </View>
            )}

            {/* Visual roadmap — the whole track at a glance: what's done, what's
                current, and what's still ahead, including submitted files.
                Read-only, same as web's equivalent MilestoneTimeline embed —
                no grading/approval actions live on this drill-down. */}
            {project && milestoneRoadmap.length > 0 && (
              <View>
                <Text style={[styles.sectionTitle, { marginBottom: 8 }]}>
                  🗺️ {lang === 'he' ? 'מסלול אבני הדרך' : 'Milestone Roadmap'}
                </Text>
                <MilestoneRoadmap milestones={milestoneRoadmap} lang={lang} isRtl={isRtl} />
              </View>
            )}

            {/* Submitted milestones + grades */}
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>📤 {lang === 'he' ? 'אבני דרך שהוגשו' : 'Submitted Milestones'}</Text>
              {submittedMilestones.length === 0 ? (
                <Text style={styles.cardSub}>{lang === 'he' ? 'הסטודנט טרם הגיש אבני דרך' : 'The student has not submitted any milestones yet'}</Text>
              ) : (
                submittedMilestones.map((m, i) => (
                  <View
                    key={m.id}
                    style={{ paddingVertical: 8, borderTopWidth: i > 0 ? 1 : 0, borderTopColor: ap.outlineVariant }}
                  >
                    <Text style={{ fontSize: 14, fontWeight: '600', color: ap.onSurface }}>{lang === 'he' ? m.nameHe : m.nameEn}</Text>
                    <Text style={styles.cardSub}>
                      {lang === 'he' ? 'הוגש:' : 'Submitted:'} {formatDate(m.submittedAt, lang)} · {statusLabel(m.status, lang)}
                    </Text>
                    <Text style={[styles.cardSub, { fontWeight: '700' }]}>
                      {lang === 'he' ? 'ציון:' : 'Grade:'} {m.finalGrade !== null ? `${m.finalGrade}${m.gradeApproved ? ' ✅' : ''}` : '—'}
                    </Text>
                  </View>
                ))
              )}
            </View>
          </View>
        )}

        {!loading && !error && !student && (
          <Text style={styles.cardSub}>{lang === 'he' ? 'הסטודנט לא נמצא' : 'Student not found'}</Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// Coordinator / admin coordinator / system_admin only — the server
// (studentTrackController.ts's setStudentCompletedCourses) enforces the role
// and scope; anyone else gets its error message back on save. Replaces the
// whole list. Mirrors web's CompletedCoursesCard on students/[studentId].
function CompletedCoursesCard({
  studentId, initial, suggestions, lang, isRtl, onSaved,
}: {
  studentId: string;
  initial: { subject: string; grade?: number }[];
  suggestions: string[];
  lang: 'he' | 'en';
  isRtl: boolean;
  onSaved: () => Promise<void> | undefined;
}) {
  const [rows, setRows] = useState(initial);
  const [subject, setSubject] = useState('');
  const [grade, setGrade] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const dirty = JSON.stringify(rows) !== JSON.stringify(initial);

  // Prerequisite names are matched exactly, so surface the faculty's
  // existing ones as tappable suggestions while typing.
  const query = subject.trim().toLowerCase();
  const matches = query
    ? suggestions.filter((s) => s.toLowerCase().includes(query) && s !== subject.trim()).slice(0, 5)
    : [];

  const addRow = () => {
    const trimmed = subject.trim();
    if (!trimmed) {
      setError(lang === 'he' ? 'יש להזין שם קורס' : 'Enter a course name');
      return;
    }
    const g = Number(grade);
    if (grade.trim() === '' || !Number.isFinite(g) || g < 0 || g > 100) {
      setError(lang === 'he' ? 'ציון חייב להיות בין 0 ל-100' : 'Grade must be between 0 and 100');
      return;
    }
    setRows((prev) => [...prev.filter((r) => r.subject !== trimmed), { subject: trimmed, grade: g }]);
    setSubject('');
    setGrade('');
    setError('');
  };

  const handleSave = async () => {
    const missing = rows.find((r) => r.grade == null);
    if (missing) {
      setError(lang === 'he' ? `לקורס "${missing.subject}" אין ציון — הסר/י והוסף/י אותו מחדש עם ציון` : `"${missing.subject}" has no grade — remove it and add it again with a grade`);
      return;
    }
    setSaving(true);
    setError('');
    try {
      await apiClient.put(`/api/project-coordinator/students/${studentId}/completed-courses`, {
        completedCourses: rows.map((r) => ({ subject: r.subject, grade: r.grade })),
      });
      await onSaved();
    } catch (err: any) {
      setError(err?.response?.data?.message || (lang === 'he' ? 'העדכון נכשל' : 'Update failed'));
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = { borderWidth: 1, borderColor: ap.outlineVariant, borderRadius: 8, padding: 8, fontSize: 13, color: ap.onSurface, textAlign: (isRtl ? 'right' : 'left') as 'right' | 'left' };

  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>📚 {lang === 'he' ? 'קורסים שהושלמו' : 'Completed Courses'} ({rows.length})</Text>
      <Text style={[styles.cardSub, { fontSize: 11 }]}>
        {lang === 'he'
          ? 'דרישות הקדם של פרויקטים נבדקות מול רשימה זו. שם הקורס חייב להיות זהה בדיוק לשם בדרישת הקדם — בחר/י מההצעות כשאפשר.'
          : "Project prerequisites are checked against this list. The course name must match the prerequisite's name exactly — pick from the suggestions when possible."}
      </Text>

      {rows.length === 0 && (
        <Text style={[styles.cardSub, { marginTop: 8 }]}>{lang === 'he' ? 'טרם נרשמו קורסים' : 'No courses on record yet'}</Text>
      )}
      {rows.map((r) => (
        <View key={r.subject} style={{ flexDirection: isRtl ? 'row-reverse' : 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: ap.surfaceContainerLow, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, marginTop: 6 }}>
          <Text style={{ flex: 1, fontSize: 13, color: ap.onSurface, textAlign: isRtl ? 'right' : 'left' }}>{r.subject}</Text>
          <Text style={{ fontSize: 12, color: ap.onSurfaceVariant, marginHorizontal: 8 }}>{lang === 'he' ? 'ציון:' : 'Grade:'} {r.grade ?? '—'}</Text>
          <Pressable
            onPress={() => setRows((prev) => prev.filter((x) => x.subject !== r.subject))}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`${lang === 'he' ? 'הסר' : 'Remove'} ${r.subject}`}
          >
            <Text style={{ color: '#EF4444', fontSize: 14 }}>✕</Text>
          </Pressable>
        </View>
      ))}

      <View style={{ flexDirection: isRtl ? 'row-reverse' : 'row', gap: 8, marginTop: 10 }}>
        <TextInput
          value={subject}
          onChangeText={setSubject}
          placeholder={lang === 'he' ? 'שם הקורס' : 'Course name'}
          accessibilityLabel={lang === 'he' ? 'שם הקורס' : 'Course name'}
          style={[inputStyle, { flex: 1 }]}
        />
        <TextInput
          value={grade}
          onChangeText={setGrade}
          keyboardType="numeric"
          placeholder={lang === 'he' ? 'ציון' : 'Grade'}
          accessibilityLabel={lang === 'he' ? 'ציון' : 'Grade'}
          style={[inputStyle, { width: 70 }]}
        />
      </View>
      {matches.length > 0 && (
        <View style={{ flexDirection: isRtl ? 'row-reverse' : 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
          {matches.map((m) => (
            <Pressable
              key={m}
              onPress={() => setSubject(m)}
              style={{ borderWidth: 1, borderColor: ap.primary, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 4 }}
              accessibilityRole="button"
            >
              <Text style={{ fontSize: 12, color: ap.primary }}>{m}</Text>
            </Pressable>
          ))}
        </View>
      )}
      <Pressable
        onPress={addRow}
        style={{ borderWidth: 1, borderColor: ap.primary, borderRadius: 8, paddingVertical: 8, alignItems: 'center', marginTop: 8 }}
        accessibilityRole="button"
      >
        <Text style={{ color: ap.primary, fontWeight: '700', fontSize: 13 }}>{lang === 'he' ? '+ הוסף קורס' : '+ Add course'}</Text>
      </Pressable>

      {!!error && (
        <View style={{ backgroundColor: '#FEF2F2', borderRadius: 8, padding: 8, marginTop: 8 }}>
          <Text style={{ color: '#EF4444', fontSize: 12 }}>{error}</Text>
        </View>
      )}

      <Pressable
        disabled={saving || !dirty}
        onPress={handleSave}
        style={{ backgroundColor: ap.primary, borderRadius: 8, paddingVertical: 10, alignItems: 'center', marginTop: 8, opacity: saving || !dirty ? 0.5 : 1 }}
        accessibilityRole="button"
        accessibilityState={{ disabled: saving || !dirty }}
      >
        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>{saving ? '…' : lang === 'he' ? 'שמור קורסים' : 'Save courses'}</Text>
      </Pressable>
      {dirty && !saving && (
        <Pressable onPress={() => { setRows(initial); setError(''); }} style={{ alignItems: 'center', marginTop: 6 }} accessibilityRole="button">
          <Text style={{ fontSize: 12, color: ap.onSurfaceVariant }}>{lang === 'he' ? 'בטל שינויים' : 'Discard changes'}</Text>
        </Pressable>
      )}
    </View>
  );
}

interface ChatMessage {
  id: string;
  type: 'text' | 'image';
  text: string;
  imageUrl: string | null;
  senderId: string;
  createdAt: string | null;
}

/** The staff member's own direct conversation with this student — the same
 *  thread as the Chats tab on the notifications screen (including messages
 *  sent from the Students Report's "Send message"). Shown inline here; the
 *  button opens the regular chat screen to reply. */
function StudentMessagesSection({ studentId, studentName, lang }: { studentId: string; studentName: string; lang: 'he' | 'en' }) {
  const router = useRouter();
  const isRtl = lang === 'he';
  const myUid = auth.currentUser?.uid;
  const [chatId, setChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiClient.get('/api/chats/dashboard');
        const chat = (res.data?.chats ?? []).find((c: any) => c.otherUid === studentId && (c.type ?? 'direct') === 'direct');
        if (cancelled) return;
        setChatId(chat?.chatId ?? null);
        if (chat?.chatId) {
          const msgs = await apiClient.get(`/api/chats/${chat.chatId}/messages`);
          if (!cancelled) setMessages(Array.isArray(msgs.data?.messages) ? msgs.data.messages : Array.isArray(msgs.data) ? msgs.data : []);
        }
      } catch {
        if (!cancelled) setError(lang === 'he' ? 'טעינת השיחות נכשלה' : 'Failed to load conversations');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [studentId, lang]);

  const openChat = (id: string) => {
    router.push({ pathname: '/message/[chatId]', params: { chatId: id, otherName: studentName, otherRole: 'student', lang } } as any);
  };

  // Only creates the chat when staff explicitly asks to start one.
  const startChat = async () => {
    setStarting(true);
    try {
      const res = await apiClient.post('/api/chats', { recipientId: studentId });
      openChat(res.data.chatId);
    } catch (err: any) {
      Alert.alert(lang === 'he' ? 'שגיאה' : 'Error', err?.response?.data?.message || (lang === 'he' ? 'פתיחת השיחה נכשלה' : 'Could not start the conversation'));
    } finally {
      setStarting(false);
    }
  };

  if (loading) return <ActivityIndicator style={{ marginTop: 24 }} />;

  return (
    <View style={styles.card}>
      {!!error && <Text style={{ color: '#EF4444', fontSize: 13, marginBottom: 8 }}>{error}</Text>}
      {!chatId || messages.length === 0 ? (
        <Text style={[styles.cardSub, { textAlign: isRtl ? 'right' : 'left' }]}>
          💬 {lang === 'he' ? 'עדיין לא נשלחו הודעות לסטודנט/ית זה/זו.' : 'No messages with this student yet.'}
        </Text>
      ) : (
        <View style={{ gap: 6 }}>
          {messages.map((m) => {
            const mine = m.senderId === myUid;
            return (
              <View key={m.id} style={{ alignItems: mine ? 'flex-end' : 'flex-start' }}>
                <View style={{ maxWidth: '85%', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: mine ? ap.primary : ap.surfaceContainer }}>
                  {m.type === 'image' && m.imageUrl ? (
                    <Pressable onPress={() => Linking.openURL(m.imageUrl!)} accessibilityRole="link">
                      <Text style={{ fontSize: 13, color: mine ? '#fff' : ap.onSurface }}>🖼️ {lang === 'he' ? 'תמונה' : 'Image'}</Text>
                    </Pressable>
                  ) : (
                    <Text style={{ fontSize: 13, color: mine ? '#fff' : ap.onSurface }}>{m.text}</Text>
                  )}
                </View>
                {!!m.createdAt && (
                  <Text style={{ fontSize: 10, color: ap.onSurfaceVariant, marginTop: 2 }}>
                    {new Date(m.createdAt).toLocaleString(lang === 'he' ? 'he-IL' : 'en-GB', { dateStyle: 'short', timeStyle: 'short' })}
                  </Text>
                )}
              </View>
            );
          })}
        </View>
      )}
      <Pressable
        disabled={starting}
        onPress={() => (chatId ? openChat(chatId) : startChat())}
        style={{ marginTop: 12, backgroundColor: ap.primary, borderRadius: 8, paddingVertical: 10, alignItems: 'center', opacity: starting ? 0.6 : 1 }}
        accessibilityRole="button"
        accessibilityState={{ disabled: starting }}
      >
        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>
          {starting ? '…' : chatId ? (lang === 'he' ? 'פתיחת השיחה' : 'Open conversation') : (lang === 'he' ? 'התחלת שיחה' : 'Start a conversation')}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = {
  card: {
    backgroundColor: ap.surfaceContainerLowest,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: ap.outlineVariant,
  },
  cardTitle: { fontSize: 16, fontWeight: '700' as const, color: ap.onSurface, marginBottom: 6 },
  sectionTitle: { fontSize: 14, fontWeight: '700' as const, color: ap.onSurface, marginBottom: 6 },
  cardSub: { fontSize: 13, color: ap.onSurfaceVariant, marginTop: 2 },
};
