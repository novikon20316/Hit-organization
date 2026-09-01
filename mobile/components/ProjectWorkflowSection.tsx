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
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { apiClient } from '../src/api/apiClient';
import type { Lang } from './i18n';
import StaffRecordModal from './modals/StaffRecordModal';
import SupervisorEvaluationModal from './modals/SupervisorEvaluationModal';
import FinalGradeDecisionModal from './modals/FinalGradeDecisionModal';

interface StaffFormField {
  key: string;
  labelHe: string;
  labelEn: string;
  type: 'text' | 'textarea' | 'date' | 'number' | 'table';
  required: boolean;
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

interface StudentMilestoneRow {
  id: string | null;
  type: string;
  status: string;
  dueDate: string | null;
  submittedAt: string | null;
  staffRecordMode: 'none' | 'upload_or_form' | null;
  staffRecordSubmitted: boolean;
  hasFinalGradeComponents: boolean;
  supervisorEvaluationSubmitted: boolean;
  autoCalculatedFinalGrade: number | null;
  finalGrade: number | null;
  gradeApproved: boolean;
  gradeOverrideStatus: 'pending' | 'approved' | 'rejected' | null;
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

interface Props {
  lang: Lang;
  projectId: string;
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

export default function ProjectWorkflowSection({ lang, projectId }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [templateMilestones, setTemplateMilestones] = useState<TemplateMilestone[]>([]);
  const [students, setStudents] = useState<StudentRow[]>([]);

  const [staffRecordFor, setStaffRecordFor] = useState<{ milestoneId: string; fields: StaffFormField[] } | null>(null);
  const [supervisorEvalFor, setSupervisorEvalFor] = useState<{ milestoneId: string; components: RubricComponent[] } | null>(null);
  const [finalGradeDecisionFor, setFinalGradeDecisionFor] = useState<{ milestoneId: string; autoGrade: number } | null>(null);

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
      <Text style={{ fontSize: 13, fontWeight: '700', color: '#1E293B', marginBottom: 8 }}>
        🧬 {lang === 'he' ? 'תהליך העבודה' : 'Workflow'}
      </Text>

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
    </View>
  );
}
