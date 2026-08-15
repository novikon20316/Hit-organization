'use client';

// app/supervisor/dashboard/ProjectWorkflowSection.tsx
// Inline (always-visible) rendering of a supervisor's project workflow on
// its ProjectCard — the ordered milestone template and, per enrolled
// student, a submitted/not-submitted breakdown per milestone — plus, where
// configured (see workflowTemplates.ts), the staff-record action
// (research_proposal/progress_report) and the three-rubric final-grade
// workflow (defense): submit the supervisor's own evaluation, then once
// every evaluation is in, approve or override the computed grade.
// Data comes from GET /api/supervisor/projects/:id/detail — see
// server/src/controllers/supervisorController.ts's getSupervisorProjectDetail.

import { useCallback, useEffect, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/apiClient';
import { StaffRecordModal } from './StaffRecordModal';
import { SupervisorEvaluationModal } from './SupervisorEvaluationModal';
import { FinalGradeDecisionModal } from './FinalGradeDecisionModal';
import type { MyProject } from './types';

interface ProjectWorkflowSectionProps {
  project: MyProject;
}

interface TemplateMilestone {
  type: string;
  nameHe: string;
  nameEn: string;
  order: number;
  dateMode?: 'offset' | 'fixed';
  dueDaysFromStart: number;
  fixedDate?: string;
  requiresExaminers: boolean;
  staffFormFields?: Array<{ key: string; labelHe: string; labelEn: string; type: 'text' | 'textarea' | 'date' | 'number' | 'table'; required: boolean }>;
  finalGradeComponents?: {
    supervisorEvaluation: { components: Array<{ key: string; labelHe: string; labelEn: string; maxScore: number; weight: number }>; weight: number };
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

// Same status colors/labels as coordinator/home/InProgressTab.tsx, plus a
// 'not_created' case that view doesn't need (a coordinator's InProgress list
// only ever includes milestones that already exist).
function statusColor(status: string): string {
  if (status === 'coordinator_approved' || status === 'completed') return '#10B981';
  if (status === 'submitted' || status === 'supervisor_graded' || status === 'graded') return '#F59E0B';
  return '#8899BB';
}

function statusLabel(status: string, lang: 'he' | 'en'): string {
  if (status === 'coordinator_approved' || status === 'completed') return lang === 'he' ? 'אושר' : 'Approved';
  if (status === 'submitted' || status === 'supervisor_graded' || status === 'graded') return lang === 'he' ? 'הוגש' : 'Submitted';
  if (status === 'not_created') return lang === 'he' ? 'טרם נפתח' : 'Not started yet';
  return lang === 'he' ? 'טרם הוגש' : 'Not submitted yet';
}

export function ProjectWorkflowSection({ project }: ProjectWorkflowSectionProps) {
  const { lang } = useLanguage();
  const [templateMilestones, setTemplateMilestones] = useState<TemplateMilestone[]>([]);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [staffRecordFor, setStaffRecordFor] = useState<{ milestoneId: string; fields: TemplateMilestone['staffFormFields'] } | null>(null);
  const [supervisorEvalFor, setSupervisorEvalFor] = useState<{ milestoneId: string; components: NonNullable<TemplateMilestone['finalGradeComponents']>['supervisorEvaluation']['components'] } | null>(null);
  const [finalGradeDecisionFor, setFinalGradeDecisionFor] = useState<{ milestoneId: string; autoGrade: number } | null>(null);

  const fetchDetail = useCallback(() => {
    setLoading(true);
    return apiClient
      .getSupervisorProjectDetail(project.id)
      .then((res) => {
        setTemplateMilestones([...res.templateMilestones].sort((a, b) => a.order - b.order));
        setStudents(res.students);
        setError('');
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : (lang === 'he' ? 'טעינת הנתונים נכשלה' : 'Failed to load'));
      })
      .finally(() => setLoading(false));
  }, [project.id, lang]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  return (
    <div className="mt-3 border-t border-line pt-3">
      <p className="mb-2 text-sm font-semibold text-ink">🧬 {lang === 'he' ? 'תהליך העבודה' : 'Workflow'}</p>

      {loading ? (
        <p className="text-sm text-muted">…</p>
      ) : error ? (
        <p className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>
      ) : (
        <>
          <div className="rounded-lg border border-line bg-paper p-3">
            <p className="mb-2 text-sm font-semibold text-ink">{lang === 'he' ? 'אבני הדרך של תבנית זו' : 'This template\'s milestones'}</p>
            <div className="grid gap-1.5">
              {templateMilestones.map((m, idx) => (
                <div key={m.type} className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#EDE9FE] font-bold text-primary">{idx + 1}</span>
                  <span className="min-w-0 flex-1 truncate font-medium text-ink">{lang === 'he' ? m.nameHe : m.nameEn}</span>
                  <span className="shrink-0 whitespace-nowrap text-muted">
                    📅 {m.dateMode === 'fixed'
                      ? (lang === 'he' ? `תאריך קבוע: ${m.fixedDate ?? '—'}` : `Fixed: ${m.fixedDate ?? '—'}`)
                      : (lang === 'he' ? `יום ${m.dueDaysFromStart}` : `Day ${m.dueDaysFromStart}`)}
                    {m.requiresExaminers ? ` · 👥` : ''}
                  </span>
                </div>
              ))}
              {templateMilestones.length === 0 && (
                <p className="text-xs text-muted">{lang === 'he' ? 'לא נמצאה תבנית עבור פרויקט זה' : 'No template found for this project'}</p>
              )}
            </div>
          </div>

          <div className="mt-4">
            <p className="mb-2 text-sm font-semibold text-ink">{lang === 'he' ? 'סטטוס הגשה לפי סטודנט' : 'Submission status per student'}</p>
            {students.length === 0 && (
              <p className="text-sm text-muted">{lang === 'he' ? 'אין סטודנטים רשומים' : 'No enrolled students'}</p>
            )}
            <div className="grid gap-3">
              {students.map((s) => (
                <div key={s.studentId} className="rounded-lg border border-line bg-surface p-3">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-ink">👤 {s.studentName}</p>
                    {s.overallFinalGrade != null && (
                      <span className="rounded-full bg-[#EDE9FE] px-2.5 py-1 text-xs font-semibold text-primary">
                        🎓 {lang === 'he' ? `ציון סופי כולל: ${s.overallFinalGrade}` : `Overall final grade: ${s.overallFinalGrade}`}
                      </span>
                    )}
                  </div>
                  <div className="grid gap-1">
                    {s.milestones.map((m) => {
                      const spec = templateMilestones.find((t) => t.type === m.type);
                      return (
                        <div key={m.type} className="border-t border-line py-1.5 first:border-t-0">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-medium text-ink">{spec ? (lang === 'he' ? spec.nameHe : spec.nameEn) : m.type}</span>
                            <span className="font-semibold" style={{ color: statusColor(m.status) }}>
                              {statusLabel(m.status, lang)}
                            </span>
                          </div>

                          {/* Staff record action (research_proposal/progress_report only). */}
                          {m.staffRecordMode === 'upload_or_form' && m.id && (
                            <button
                              type="button"
                              onClick={() => setStaffRecordFor({ milestoneId: m.id!, fields: spec?.staffFormFields ?? [] })}
                              className="mt-1 text-xs font-medium text-primary hover:underline"
                            >
                              {m.staffRecordSubmitted
                                ? `✓ ${lang === 'he' ? 'רשומת מנחה הוגשה — עדכן' : 'Staff record submitted — update'}`
                                : `📎 ${lang === 'he' ? 'הגש רשומת מנחה' : 'Submit staff record'}`}
                            </button>
                          )}

                          {/* Three-rubric final-grade workflow (defense only). */}
                          {m.hasFinalGradeComponents && m.id && (
                            <div className="mt-1 text-xs">
                              {m.gradeApproved ? (
                                <span className="font-semibold text-success">
                                  🎓 {lang === 'he' ? `ציון סופי: ${m.finalGrade}` : `Final grade: ${m.finalGrade}`}
                                </span>
                              ) : m.gradeOverrideStatus === 'pending' ? (
                                <span className="text-accent">⏳ {lang === 'he' ? 'שינוי ציון ממתין לאישור הרכז/ת' : "Grade change pending the coordinator's review"}</span>
                              ) : m.autoCalculatedFinalGrade != null ? (
                                <button
                                  type="button"
                                  onClick={() => setFinalGradeDecisionFor({ milestoneId: m.id!, autoGrade: m.autoCalculatedFinalGrade! })}
                                  className="font-medium text-primary hover:underline"
                                >
                                  🎓 {lang === 'he' ? `ציון סופי מחושב: ${m.autoCalculatedFinalGrade} — לחץ להחלטה` : `Computed final grade: ${m.autoCalculatedFinalGrade} — click to decide`}
                                </button>
                              ) : !m.supervisorEvaluationSubmitted ? (
                                <button
                                  type="button"
                                  onClick={() => setSupervisorEvalFor({ milestoneId: m.id!, components: spec?.finalGradeComponents?.supervisorEvaluation.components ?? [] })}
                                  className="font-medium text-primary hover:underline"
                                >
                                  📝 {lang === 'he' ? 'הגש הערכת מנחה' : 'Submit supervisor evaluation'}
                                </button>
                              ) : (
                                <span className="text-muted">{lang === 'he' ? 'ממתין להערכות בוחנים' : "Waiting on examiners' evaluations"}</span>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {staffRecordFor && (
        <StaffRecordModal
          milestoneId={staffRecordFor.milestoneId}
          fields={staffRecordFor.fields ?? []}
          onClose={() => setStaffRecordFor(null)}
          onSubmitted={fetchDetail}
        />
      )}
      {supervisorEvalFor && (
        <SupervisorEvaluationModal
          milestoneId={supervisorEvalFor.milestoneId}
          components={supervisorEvalFor.components}
          onClose={() => setSupervisorEvalFor(null)}
          onSubmitted={fetchDetail}
        />
      )}
      {finalGradeDecisionFor && (
        <FinalGradeDecisionModal
          milestoneId={finalGradeDecisionFor.milestoneId}
          autoCalculatedFinalGrade={finalGradeDecisionFor.autoGrade}
          onClose={() => setFinalGradeDecisionFor(null)}
          onDecided={fetchDetail}
        />
      )}
    </div>
  );
}
