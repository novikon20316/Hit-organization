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
import { MilestoneRoadmap, type RoadmapMilestone } from '@/components/MilestoneRoadmap';

interface StudentDetail {
  student: {
    id: string;
    name: string;
    facultyId: string | null;
    major: string | null;
    degreeType: 'bachelors' | 'masters' | null;
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
function majorLabel(facultyId: string | null, major: string | null, degreeType: string | null, lang: 'he' | 'en'): string {
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

  const loadDetail = () => {
    if (!studentId) return;
    setLoading(true);
    setError('');
    return apiClient.get(`/api/project-coordinator/students/${studentId}/detail`)
      .then((res: any) => { setData(res.data); })
      .catch((err: any) => {
        console.error('Failed to load student detail:', err);
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

  const student = data?.student ?? null;
  const project = data?.project ?? null;
  const currentMilestone = data?.currentMilestone ?? null;
  const submittedMilestones = data?.milestones ?? [];
  const milestoneRoadmap = data?.milestoneRoadmap ?? [];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F8FAFC' }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/administrative_coordinator/administrative_coordinator_dashboard' as any))}
          style={{ flexDirection: isRtl ? 'row-reverse' : 'row', alignItems: 'center', marginBottom: 16 }}
          accessibilityRole="button"
        >
          <Text style={{ fontSize: 15, fontWeight: '600', color: '#3E6C8C' }}>
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
                📚 {lang === 'he' ? 'מגמה:' : 'Major:'} {majorLabel(student.facultyId, student.major, student.degreeType, lang)}
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
                    style={{ borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 8, padding: 8, marginTop: 8, fontSize: 13 }}
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

            {/* Communication */}
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>☎️ {lang === 'he' ? 'פרטי התקשרות' : 'Communication'}</Text>
              {student.email ? (
                <Pressable onPress={() => Linking.openURL(`mailto:${student.email}`)} accessibilityRole="link">
                  <Text style={[styles.cardSub, { color: '#3E6C8C', fontWeight: '600' }]}>✉️ {student.email}</Text>
                </Pressable>
              ) : (
                <Text style={[styles.cardSub, { fontStyle: 'italic' }]}>{lang === 'he' ? 'לא הוגדר אימייל' : 'No email on file'}</Text>
              )}
              {student.phoneNumber ? (
                <Pressable onPress={() => Linking.openURL(`tel:${student.phoneNumber}`)} accessibilityRole="link">
                  <Text style={[styles.cardSub, { color: '#3E6C8C', fontWeight: '600' }]}>📞 {student.phoneNumber}</Text>
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
                    style={{ paddingVertical: 8, borderTopWidth: i > 0 ? 1 : 0, borderTopColor: '#E2E8F0' }}
                  >
                    <Text style={{ fontSize: 14, fontWeight: '600', color: '#1E293B' }}>{lang === 'he' ? m.nameHe : m.nameEn}</Text>
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

const styles = {
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cardTitle: { fontSize: 16, fontWeight: '700' as const, color: '#1E293B', marginBottom: 6 },
  sectionTitle: { fontSize: 14, fontWeight: '700' as const, color: '#1E293B', marginBottom: 6 },
  cardSub: { fontSize: 13, color: '#64748B', marginTop: 2 },
};
