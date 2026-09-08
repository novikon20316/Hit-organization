// components/ProjectWorkflowSection.tsx
//
// Inline (always-visible) rendering of a supervisor's project workflow on
// its project card — the ordered milestone template and, per enrolled
// student, a submitted/not-submitted breakdown per milestone — plus, where
// configured (see workflowTemplates.ts), the staff-record action
// (research_proposal/progress_report) and the three-rubric final-grade
// workflow (defense): submit the supervisor's own evaluation, then once
// every evaluation is in, approve or override the computed grade.
// Data comes from GET /api/supervisor/projects/:id/detail — see
// server/src/controllers/supervisorController.ts's getSupervisorProjectDetail.
// Ports web/app/supervisor/dashboard/ProjectWorkflowSection.tsx.

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, TextInput } from 'react-native';
import { apiClient } from '../src/api/apiClient';
import { auth } from '../src/firebase/firebase';
import { roleLabel, type Lang, type AppRole } from './i18n';
import StaffRecordModal from './modals/StaffRecordModal';
import SupervisorEvaluationModal from './modals/SupervisorEvaluationModal';
import FinalGradeDecisionModal from './modals/FinalGradeDecisionModal';
import FinalGradeCertificateModal from './modals/FinalGradeCertificateModal';

interface StaffFormField {
  key: string;
  labelHe: string;
  labelEn: string;
  type: 'text' | 'textarea' | 'date' | 'number' | 'table';
  required: boolean;
  autoFill?: 'studentName' | 'studentIdNumber' | 'projectNameHe' | 'projectNameEn' | 'examinerNames' | 'supervisorName' | 'submissionDate';
  locked?: boolean;
}

interface RubricComponent { key: string; labelHe: string; labelEn: string; maxScore: number; weight: number }

interface TemplateMilestone {
  type: string;
  nameHe: string;
  nameEn: string;
  order: number;
  dateMode?: 'offset' | 'fixed';
  dueDaysFromStart: number;
  fixedDate?: string;
  /** The real computed due date for this project (from the actual milestone
   *  doc, set once at enrollment — see supervisorController.ts's
   *  getSupervisorProjectDetail) — null only if enrollment hasn't happened
   *  yet, in which case the day-offset below is the best available info. */
  dueDate?: string | null;
  requiresExaminers: boolean;
  percentOfFinalGrade?: number;
  staffFormFields?: StaffFormField[];
  finalGradeComponents?: {
    supervisorEvaluation: { components: RubricComponent[]; weight: number };
  };
}

interface RoutingStage {
  id: string;
  role: string;
  action: 'grade' | 'approve';
  formFields?: Array<{ key: string; labelHe: string; labelEn: string; type: 'text' | 'textarea' | 'date' | 'number' | 'table' | 'yesno'; required: boolean }>;
  requireAllAssignedSupervisors?: boolean;
}

interface StudentMilestoneRow {
  id: string | null;
  type: string;
  status: string;
  dueDate: string | null;
  submittedAt: string | null;
  /** The resolved defense date (only ever set on 'defense'-type milestones) —
   *  used by the data_science final-grade certificate. */
  defenseDate: string | null;
  staffRecordMode: 'none' | 'upload_or_form' | null;
  staffRecordSubmitted: boolean;
  hasFinalGradeComponents: boolean;
  supervisorEvaluationSubmitted: boolean;
  autoCalculatedFinalGrade: number | null;
  finalGrade: number | null;
  gradeApproved: boolean;
  gradeOverrideStatus: 'pending' | 'approved' | 'rejected' | null;
  /** The milestone's own snapshotted approval chain — see
   *  ChainStage in server/src/services/workflowTemplates.ts. Lets this
   *  screen render whichever stage's own formFields are currently active
   *  (research_proposal's supervisor_sign stage) and derive an accurate
   *  "awaiting X" label instead of guessing from the coarse status string. */
  routing?: RoutingStage[] | null;
  currentStageIndex?: number;
  /** Per-signer stamps for a requireAllAssignedSupervisors stage, keyed by
   *  uid — see server's getSupervisorProjectDetail. */
  supervisorApprovals?: Record<string, { signedAt: string | null; signedByName: string }> | null;
}

interface StudentRow {
  studentId: string;
  studentName: string;
  /** Weighted across every milestone by the template's own
   *  percentOfFinalGrade per type — see gradeEngine.ts's
   *  computeProjectFinalGrade. null until every nonzero-weighted milestone
   *  is graded. */
  overallFinalGrade: number | null;
  milestones: StudentMilestoneRow[];
}

interface CertificateProject {
  titleHe: string;
  titleEn: string;
  facultyId: string;
  academicYear: string;
  projectStartDate?: string | null;
  enrolledStudents?: Array<{ id: string; studentIdNumber?: string | null }>;
}

interface Props {
  lang: Lang;
  projectId: string;
  /** Project-level fields the final-grade certificate needs — not otherwise
   *  fetched by this component, which only loads per-milestone workflow
   *  data. Optional: omitting it simply hides the certificate button. */
  project?: CertificateProject;
}

function statusColor(status: string): string {
  if (status === 'coordinator_approved' || status === 'completed') return '#10B981';
  if (status === 'submitted' || status === 'supervisor_graded' || status === 'graded') return '#F59E0B';
  return '#8899BB';
}

function statusLabel(status: string, lang: Lang): string {
  if (status === 'coordinator_approved' || status === 'completed') return lang === 'he' ? 'אושר' : 'Approved';
  if (status === 'submitted' || status === 'supervisor_graded' || status === 'graded') return lang === 'he' ? 'הוגש' : 'Submitted';
  if (status === 'not_created') return lang === 'he' ? 'טרם נפתח' : 'Not started yet';
  return lang === 'he' ? 'טרם הוגש' : 'Not submitted yet';
}

function isCompletedStatus(status: string): boolean {
  return status === 'coordinator_approved' || status === 'completed';
}

// Mirrors web's ProjectWorkflowSection.tsx's formatShortDate.
function formatShortDate(iso: string | null | undefined, lang: Lang): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function ProjectWorkflowSection({ lang, projectId, project }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [templateMilestones, setTemplateMilestones] = useState<TemplateMilestone[]>([]);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [secondarySupervisorName, setSecondarySupervisorName] = useState<string | null>(null);
  // Needed alongside the name above to work out, from the CURRENT viewer's
  // own uid, which of the two is "me" and which is "the other supervisor" —
  // this screen is reachable by either one, so it can't be assumed the
  // viewer is always the primary. Mirrors web's identical addition.
  const [supervisorId, setSupervisorId] = useState<string | null>(null);
  const [secondarySupervisorId, setSecondarySupervisorId] = useState<string | null>(null);
  const [primarySupervisorName, setPrimarySupervisorName] = useState<string | null>(null);

  // research_proposal's supervisor_sign stage — mirrors web's
  // ProjectWorkflowSection.tsx's signingId/stageFormValues.
  const [signingId, setSigningId] = useState<string | null>(null);
  const [stageFormValues, setStageFormValues] = useState<Record<string, string>>({});

  const [staffRecordFor, setStaffRecordFor] = useState<{ milestoneId: string; fields: StaffFormField[] } | null>(null);
  const [supervisorEvalFor, setSupervisorEvalFor] = useState<{ milestoneId: string; components: RubricComponent[] } | null>(null);
  const [finalGradeDecisionFor, setFinalGradeDecisionFor] = useState<{ milestoneId: string; autoGrade: number } | null>(null);
  const [showCertificate, setShowCertificate] = useState(false);

  // The final-grade certificate (digitizing Project_final_grade.docx) is
  // data_science-only — that faculty's masters students are always on the
  // project track (see server's studentTrack.ts, project_only policy), so no
  // separate thesis-vs-project check is needed. Offered once every enrolled
  // student's defense milestone has a coordinator-approved final grade.
  const certificateAvailable =
    !!project &&
    project.facultyId === 'data_science' &&
    students.length > 0 &&
    students.every((s) => s.milestones.find((m) => m.type === 'defense')?.gradeApproved);

  // `silent` skips the loading flag — used after an evaluation/decision
  // submits, so the update lands on screen without the whole section
  // blanking to a spinner and back. Mirrors web's identical
  // ProjectWorkflowSection.tsx split.
  const fetchDetail = useCallback((opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    return apiClient.get(`/api/supervisor/projects/${projectId}/detail`)
      .then((res) => {
        setTemplateMilestones([...(res.data.templateMilestones ?? [])].sort((a: TemplateMilestone, b: TemplateMilestone) => a.order - b.order));
        setStudents(res.data.students ?? []);
        setSecondarySupervisorName(res.data.secondarySupervisorName ?? null);
        setSupervisorId(res.data.supervisorId ?? null);
        setSecondarySupervisorId(res.data.secondarySupervisorId ?? null);
        setPrimarySupervisorName(res.data.primarySupervisorName ?? null);
        setError('');
      })
      .catch((e: any) => {
        setError(e.response?.data?.message || (lang === 'he' ? 'טעינת הנתונים נכשלה' : 'Failed to load'));
      })
      .finally(() => { if (!opts?.silent) setLoading(false); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, lang]);

  const refreshDetailSilently = useCallback(() => fetchDetail({ silent: true }), [fetchDetail]);

  useEffect(() => {
    fetchDetail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  return (
    <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: '#E2E8F0', paddingTop: 12 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: '#1E293B' }}>
          🧬 {lang === 'he' ? 'תהליך העבודה' : 'Workflow'}
        </Text>
        {certificateAvailable && (
          <Pressable
            onPress={() => setShowCertificate(true)}
            style={{ borderRadius: 20, backgroundColor: '#00236f', paddingHorizontal: 12, paddingVertical: 5 }}
            accessibilityRole="button"
          >
            <Text style={{ fontSize: 11, fontWeight: '700', color: '#fff' }}>
              📜 {lang === 'he' ? 'תעודת ציון סופי' : 'Final Grade Certificate'}
            </Text>
          </Pressable>
        )}
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 8 }} />
      ) : error ? (
        <Text style={{ fontSize: 13, color: '#EF4444' }}>{error}</Text>
      ) : (
        <>
          <View style={{ borderRadius: 10, backgroundColor: '#fff', borderWidth: 1, borderColor: '#E2E8F0', padding: 12 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: '#1E293B', marginBottom: 8 }}>
              {lang === 'he' ? 'אבני הדרך של תבנית זו' : "This template's milestones"}
            </Text>
            {templateMilestones.length === 0 ? (
              <Text style={{ fontSize: 12, color: '#94A3B8' }}>{lang === 'he' ? 'לא נמצאה תבנית עבור פרויקט זה' : 'No template found for this project'}</Text>
            ) : (
              templateMilestones.map((m, idx) => (
                <View key={m.type} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 }}>
                  <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: '#EDE9FE', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: '#7C3AED' }}>{idx + 1}</Text>
                  </View>
                  <Text style={{ flex: 1, fontSize: 12, fontWeight: '600', color: '#1E293B' }} numberOfLines={1}>
                    {lang === 'he' ? m.nameHe : m.nameEn}
                  </Text>
                  <Text style={{ fontSize: 11, color: '#64748B' }}>
                    📅 {m.dateMode === 'fixed'
                      ? (lang === 'he' ? `תאריך קבוע: ${m.fixedDate ?? '—'}` : `Fixed: ${m.fixedDate ?? '—'}`)
                      : m.dueDate
                        ? (lang === 'he' ? `תאריך יעד: ${formatShortDate(m.dueDate, lang)}` : `Due: ${formatShortDate(m.dueDate, lang)}`)
                        : (lang === 'he' ? `יום ${m.dueDaysFromStart}` : `Day ${m.dueDaysFromStart}`)}
                    {m.requiresExaminers ? '  ·  👥' : ''}
                  </Text>
                </View>
              ))
            )}
          </View>

          <Text style={{ fontSize: 13, fontWeight: '700', color: '#1E293B', marginTop: 16, marginBottom: 8 }}>
            {lang === 'he' ? 'סטטוס הגשה לפי סטודנט' : 'Submission status per student'}
          </Text>
          {students.length === 0 && (
            <Text style={{ fontSize: 12, color: '#94A3B8' }}>{lang === 'he' ? 'אין סטודנטים רשומים' : 'No enrolled students'}</Text>
          )}
          {students.map((s) => (
            <View key={s.studentId} style={{ borderRadius: 10, backgroundColor: '#fff', borderWidth: 1, borderColor: '#E2E8F0', padding: 12, marginBottom: 10 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, flexWrap: 'wrap', gap: 6 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#1E293B' }}>👤 {s.studentName}</Text>
                {s.overallFinalGrade != null && (
                  <View style={{ backgroundColor: '#EDE9FE', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#7C3AED' }}>
                      🎓 {lang === 'he' ? `ציון סופי כולל: ${s.overallFinalGrade}` : `Overall final grade: ${s.overallFinalGrade}`}
                    </Text>
                  </View>
                )}
              </View>
              {(() => {
                const firstIncompleteIdx = s.milestones.findIndex((m) => !isCompletedStatus(m.status));
                // Only what the student has finished, plus the one they're
                // currently on — matches the web port
                // (app/supervisor/dashboard/ProjectWorkflowSection.tsx).
                const visibleMilestones = firstIncompleteIdx === -1 ? s.milestones : s.milestones.slice(0, firstIncompleteIdx + 1);
                return visibleMilestones.map((m, i) => {
                const spec = templateMilestones.find((t) => t.type === m.type);
                return (
                  <View
                    key={m.type}
                    style={{ paddingVertical: 6, borderTopWidth: i > 0 ? 1 : 0, borderTopColor: '#F1F5F9' }}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={{ fontSize: 12, fontWeight: '600', color: '#1E293B' }}>
                        {spec ? (lang === 'he' ? spec.nameHe : spec.nameEn) : m.type}
                      </Text>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: statusColor(m.status) }}>
                        {statusLabel(m.status, lang)}
                      </Text>
                    </View>

                    {/* research_proposal's supervisor_sign stage — a pure
                        sign-off (action: 'approve'), not a grade, so it's
                        rendered here rather than in the generic Grade
                        branch. Mirrors web's ProjectWorkflowSection.tsx. */}
                    {m.type === 'research_proposal' && m.id && m.finalGrade == null && (() => {
                      const currentStage = m.routing?.[m.currentStageIndex ?? 0];
                      const dualSignRequired = !!(
                        currentStage?.role === 'supervisor' && currentStage.requireAllAssignedSupervisors && secondarySupervisorId
                      );
                      const myUid = auth.currentUser?.uid;
                      const otherUid = myUid === secondarySupervisorId ? supervisorId : secondarySupervisorId;
                      const otherName = myUid === secondarySupervisorId ? primarySupervisorName : secondarySupervisorName;
                      const iHaveSigned = !!(myUid && m.supervisorApprovals?.[myUid]);
                      return (
                      m.status === 'submitted' ? (
                        dualSignRequired && iHaveSigned ? (
                          <Text style={{ marginTop: 4, fontSize: 12, color: '#F59E0B' }}>
                            ✓ {lang === 'he'
                              ? `חתמת — ממתין לחתימת ${otherName ?? 'המנחה הנוסף'}`
                              : `You signed — awaiting ${otherName ?? "the other supervisor"}'s signature`}
                          </Text>
                        ) : signingId === m.id ? (
                          <View style={{ marginTop: 6, borderRadius: 8, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#F8FAFC', padding: 8 }}>
                            {(() => {
                              const stage = m.routing?.[m.currentStageIndex ?? 0];
                              if (!stage || stage.role !== 'supervisor' || !stage.formFields?.length) return null;
                              return (
                                <View style={{ gap: 8, marginBottom: 8 }}>
                                  {stage.formFields.map((f) => (
                                    <View key={f.key}>
                                      <Text style={{ fontSize: 11, fontWeight: '600', color: '#64748B', marginBottom: 4 }}>
                                        {lang === 'he' ? f.labelHe : f.labelEn}{f.required ? ' *' : ''}
                                      </Text>
                                      {f.type === 'yesno' ? (
                                        <View style={{ flexDirection: 'row', gap: 8 }}>
                                          {(['yes', 'no'] as const).map((opt) => (
                                            <Pressable
                                              key={opt}
                                              onPress={() => setStageFormValues((v) => ({ ...v, [f.key]: opt }))}
                                              style={{ flex: 1, borderRadius: 6, padding: 6, alignItems: 'center', backgroundColor: stageFormValues[f.key] === opt ? '#D1FAE5' : '#F1F5F9' }}
                                              accessibilityRole="button"
                                            >
                                              <Text style={{ fontSize: 12, fontWeight: '600', color: '#1E293B' }}>
                                                {opt === 'yes' ? (lang === 'he' ? 'כן' : 'Yes') : (lang === 'he' ? 'לא' : 'No')}
                                              </Text>
                                            </Pressable>
                                          ))}
                                        </View>
                                      ) : (
                                        <TextInput
                                          value={stageFormValues[f.key] ?? ''}
                                          onChangeText={(t) => setStageFormValues((v) => ({ ...v, [f.key]: t }))}
                                          multiline={f.type === 'textarea'}
                                          style={{ borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 6, padding: 6, fontSize: 12, backgroundColor: '#fff' }}
                                        />
                                      )}
                                    </View>
                                  ))}
                                </View>
                              );
                            })()}
                            {dualSignRequired ? (
                              <Text style={{ fontSize: 11, color: '#64748B', marginBottom: 8 }}>
                                {lang === 'he'
                                  ? `${otherName ?? 'המנחה הנוסף'}: ${otherUid && m.supervisorApprovals?.[otherUid] ? 'חתם/ה ✓' : 'טרם חתם/ה — נדרשות שתי חתימות'}`
                                  : `${otherName ?? 'The other supervisor'}: ${otherUid && m.supervisorApprovals?.[otherUid] ? 'signed ✓' : "hasn't signed yet — both signatures are required"}`}
                              </Text>
                            ) : secondarySupervisorName && (
                              <Text style={{ fontSize: 11, color: '#64748B', marginBottom: 8 }}>
                                {lang === 'he' ? 'מנחה נוסף: ' : 'Secondary supervisor: '}{secondarySupervisorName}
                              </Text>
                            )}
                            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                              <Pressable
                                onPress={async () => {
                                  await apiClient.post(`/api/coordinator/${m.id}/approve`, { stageFormData: stageFormValues });
                                  setSigningId(null);
                                  setStageFormValues({});
                                  refreshDetailSilently();
                                }}
                                style={{ backgroundColor: '#00236f', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6 }}
                                accessibilityRole="button"
                              >
                                <Text style={{ fontSize: 12, fontWeight: '700', color: '#fff' }}>{lang === 'he' ? 'אשר וחתום' : 'Confirm & sign'}</Text>
                              </Pressable>
                              <Pressable onPress={() => { setSigningId(null); setStageFormValues({}); }} accessibilityRole="button">
                                <Text style={{ fontSize: 12, color: '#64748B' }}>{lang === 'he' ? 'ביטול' : 'Cancel'}</Text>
                              </Pressable>
                            </View>
                          </View>
                        ) : (
                          <Pressable onPress={() => setSigningId(m.id!)} style={{ marginTop: 4 }} accessibilityRole="button">
                            <Text style={{ fontSize: 12, fontWeight: '600', color: '#00236f' }}>✍️ {lang === 'he' ? 'חתום על הצעת המחקר' : 'Sign the research proposal'}</Text>
                          </Pressable>
                        )
                      ) : m.status === 'coordinator_approved' || m.status === 'completed' ? (
                        <Text style={{ marginTop: 4, fontSize: 12, fontWeight: '700', color: '#10B981' }}>✓ {lang === 'he' ? 'נחתם ואושר סופית' : 'Signed and finalized'}</Text>
                      ) : m.status === 'supervisor_graded' ? (
                        (() => {
                          const awaitingRole = m.routing?.[m.currentStageIndex ?? 0]?.role;
                          const label = awaitingRole ? roleLabel(awaitingRole as AppRole, lang) : (lang === 'he' ? 'הרכז/ת' : 'the coordinator');
                          return (
                            <Text style={{ marginTop: 4, fontSize: 12, color: '#F59E0B' }}>
                              ✓ {lang === 'he' ? `נחתם — ממתין ל${label}` : `Signed — awaiting ${label}`}
                            </Text>
                          );
                        })()
                      ) : null
                      );
                    })()}

                    {/* Staff record action (research_proposal/progress_report only). */}
                    {m.staffRecordMode === 'upload_or_form' && m.id && (
                      <Pressable onPress={() => setStaffRecordFor({ milestoneId: m.id!, fields: spec?.staffFormFields ?? [] })} style={{ marginTop: 4 }} accessibilityRole="button">
                        <Text style={{ fontSize: 12, fontWeight: '600', color: '#7C3AED' }}>
                          {m.staffRecordSubmitted
                            ? `✓ ${lang === 'he' ? 'רשומת מנחה הוגשה — עדכן' : 'Staff record submitted — update'}`
                            : `📎 ${lang === 'he' ? 'הגש רשומת מנחה' : 'Submit staff record'}`}
                        </Text>
                      </Pressable>
                    )}

                    {/* Three-rubric final-grade workflow (defense only). */}
                    {m.hasFinalGradeComponents && m.id && (
                      <View style={{ marginTop: 4 }}>
                        {m.gradeApproved ? (
                          <Text style={{ fontSize: 12, fontWeight: '700', color: '#10B981' }}>
                            🎓 {lang === 'he' ? `ציון סופי: ${m.finalGrade}` : `Final grade: ${m.finalGrade}`}
                          </Text>
                        ) : m.gradeOverrideStatus === 'pending' ? (
                          <Text style={{ fontSize: 12, color: '#F59E0B' }}>
                            ⏳ {lang === 'he' ? 'שינוי ציון ממתין לאישור הרכז/ת' : "Grade change pending the coordinator's review"}
                          </Text>
                        ) : m.autoCalculatedFinalGrade != null ? (
                          <Pressable onPress={() => setFinalGradeDecisionFor({ milestoneId: m.id!, autoGrade: m.autoCalculatedFinalGrade! })} accessibilityRole="button">
                            <Text style={{ fontSize: 12, fontWeight: '600', color: '#7C3AED' }}>
                              🎓 {lang === 'he' ? `ציון סופי מחושב: ${m.autoCalculatedFinalGrade} — לחץ להחלטה` : `Computed final grade: ${m.autoCalculatedFinalGrade} — tap to decide`}
                            </Text>
                          </Pressable>
                        ) : !m.supervisorEvaluationSubmitted ? (
                          <Pressable onPress={() => setSupervisorEvalFor({ milestoneId: m.id!, components: spec?.finalGradeComponents?.supervisorEvaluation.components ?? [] })} accessibilityRole="button">
                            <Text style={{ fontSize: 12, fontWeight: '600', color: '#7C3AED' }}>
                              📝 {lang === 'he' ? 'הגש הערכת מנחה' : 'Submit supervisor evaluation'}
                            </Text>
                          </Pressable>
                        ) : (
                          <Text style={{ fontSize: 12, color: '#94A3B8' }}>
                            {lang === 'he' ? 'ממתין להערכות בוחנים' : "Waiting on examiners' evaluations"}
                          </Text>
                        )}
                      </View>
                    )}
                  </View>
                );
              });
              })()}
            </View>
          ))}
        </>
      )}

      {staffRecordFor && (
        <StaffRecordModal
          visible
          lang={lang}
          milestoneId={staffRecordFor.milestoneId}
          fields={staffRecordFor.fields}
          context={{
            studentNames: students.map((s) => s.studentName),
            studentIdNumbers: (project?.enrolledStudents ?? []).map((s) => s.studentIdNumber ?? null),
            projectNameHe: project?.titleHe,
            projectNameEn: project?.titleEn,
            // TODO: no examinerIds are surfaced to this screen yet — wire this
            // once it's decided which milestone's examiner panel a given
            // staff-record form should read names from.
            examinerNames: [],
          }}
          onClose={() => setStaffRecordFor(null)}
          onSubmitted={refreshDetailSilently}
        />
      )}
      {supervisorEvalFor && (
        <SupervisorEvaluationModal
          visible
          lang={lang}
          milestoneId={supervisorEvalFor.milestoneId}
          components={supervisorEvalFor.components}
          onClose={() => setSupervisorEvalFor(null)}
          onSubmitted={refreshDetailSilently}
        />
      )}
      {finalGradeDecisionFor && (
        <FinalGradeDecisionModal
          visible
          lang={lang}
          milestoneId={finalGradeDecisionFor.milestoneId}
          autoCalculatedFinalGrade={finalGradeDecisionFor.autoGrade}
          onClose={() => setFinalGradeDecisionFor(null)}
          onDecided={refreshDetailSilently}
        />
      )}
      {project && (
        <FinalGradeCertificateModal
          visible={showCertificate}
          lang={lang}
          project={project}
          students={students}
          onClose={() => setShowCertificate(false)}
        />
      )}
    </View>
  );
}
