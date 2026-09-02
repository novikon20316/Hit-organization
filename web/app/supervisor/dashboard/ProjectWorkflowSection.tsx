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

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { apiClient } from '@/lib/apiClient';
import { examinerSignatureStyle } from '@/lib/examinerSignature';
import { StaffRecordModal } from './StaffRecordModal';
import { SupervisorEvaluationModal } from './SupervisorEvaluationModal';
import { FinalGradeDecisionModal } from './FinalGradeDecisionModal';
import { UpdateGradeModal } from './UpdateGradeModal';
import { FinalGradeCertificateModal } from './FinalGradeCertificateModal';
import { MilestoneFilePanel, FilePreviewFrame } from '@/components/MilestoneFilePanel';
import type { MyProject, SupervisorPendingMilestone } from './types';

interface ProjectWorkflowSectionProps {
  project: MyProject;
  // The dashboard-wide list of milestones awaiting a grade — matched here by
  // milestone id so the "Grade" action (formerly the standalone Grading tab)
  // can be triggered straight from this milestone row.
  pendingGrades: SupervisorPendingMilestone[];
  onGrade: (milestone: SupervisorPendingMilestone) => void;
}

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
  staffFormFields?: Array<{ key: string; labelHe: string; labelEn: string; type: 'text' | 'textarea' | 'date' | 'number' | 'table'; required: boolean }>;
  finalGradeComponents?: {
    supervisorEvaluation: { components: Array<{ key: string; labelHe: string; labelEn: string; maxScore: number; weight: number }>; weight: number };
  };
}

export interface StudentMilestoneRow {
  id: string | null;
  type: string;
  status: string;
  dueDate: string | null;
  submittedAt: string | null;
  /** The resolved defense date (only ever set on 'defense'-type milestones) —
   *  see server's defenseScheduling.ts. Used by the data_science final-grade
   *  certificate. */
  defenseDate: string | null;
  fileUrls: string[];
  submissionNote: string;
  staffRecordMode: 'none' | 'upload_or_form' | null;
  staffRecordSubmitted: boolean;
  hasFinalGradeComponents: boolean;
  supervisorEvaluationSubmitted: boolean;
  autoCalculatedFinalGrade: number | null;
  finalGrade: number | null;
  /** The supervisor's own last-submitted score for this milestone (distinct
   *  from finalGrade, which may blend in examiner scores) — used to prefill
   *  the "Update grade" modal. */
  supervisorScore: number | null;
  gradeApproved: boolean;
  gradeOverrideStatus: 'pending' | 'approved' | 'rejected' | null;
  /** research_proposal's own online form — field spec + the student's
   *  submitted values (see addResearchProposalStudentForm.ts). */
  studentFormFields?: Array<{
    key: string; labelHe: string; labelEn: string;
    type: 'text' | 'textarea' | 'date' | 'number' | 'table';
    tableColumns?: Array<{ key: string; labelHe: string; labelEn: string }>;
    locked?: boolean;
  }> | null;
  studentFormData?: Record<string, unknown> | null;
}

export interface StudentRow {
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

function isCompletedStatus(status: string): boolean {
  return status === 'coordinator_approved' || status === 'completed';
}

// Fetches the file into a Blob and saves it via a throwaway object-URL
// anchor — a plain <a download> is ignored by the browser for a
// cross-origin href (Cloudinary is a different origin), so without this a
// "download" link just opens the file in a new tab instead of actually
// saving it. Falls back to that same open-in-new-tab behavior if the fetch
// itself fails (e.g. a CORS-restricted resource) — still better than a dead
// click.
async function downloadFile(url: string, fileName: string) {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objectUrl);
  } catch {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

// Derives a human-readable file name from a Cloudinary/Storage URL for the
// "Submitted Files" chip list — same approach as components/MilestoneTimeline
// .tsx's fileNameFromUrl, ported here since this section has its own status
// row markup rather than reusing that shared component.
function fileNameFromUrl(url: string, index: number, lang: 'he' | 'en'): string {
  try {
    const path = decodeURIComponent(new URL(url).pathname);
    const last = path.split('/').filter(Boolean).pop();
    if (last) return last;
  } catch {
    // fall through to generic label below
  }
  return lang === 'he' ? `קובץ ${index + 1}` : `File ${index + 1}`;
}

function formatShortDate(iso: string | null, lang: 'he' | 'en'): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function ProjectWorkflowSection({ project, pendingGrades, onGrade }: ProjectWorkflowSectionProps) {
  // The "Grade" button for an ordinary milestone opens GradeMilestoneModal at
  // the dashboard-page level (see page.tsx's gradingTarget), not inside this
  // component — after it submits, the page only refetches its own
  // dashboard-wide state (myProjects/pendingGrades), which never reaches this
  // component's own `students` state on its own. `pendingGrades` gets a new
  // array reference on every such page-level refetch (grading included), so
  // reusing it as a dependency below — instead of plumbing a dedicated
  // "refresh me" signal through ProjectCard.tsx — is what makes a just-
  // submitted grade actually appear here without navigating away and back.
  const isFirstLoadRef = useRef(true);
  const { lang } = useLanguage();
  const { userData } = useAuth();
  const [templateMilestones, setTemplateMilestones] = useState<TemplateMilestone[]>([]);
  const [signingId, setSigningId] = useState<string | null>(null);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [staffRecordFor, setStaffRecordFor] = useState<{ milestoneId: string; fields: TemplateMilestone['staffFormFields'] } | null>(null);
  const [supervisorEvalFor, setSupervisorEvalFor] = useState<{ milestoneId: string; components: NonNullable<TemplateMilestone['finalGradeComponents']>['supervisorEvaluation']['components'] } | null>(null);
  const [finalGradeDecisionFor, setFinalGradeDecisionFor] = useState<{ milestoneId: string; autoGrade: number } | null>(null);
  const [previewFor, setPreviewFor] = useState<{ title: string; subtitle: string; submissionNote: string; fileUrls: string[] } | null>(null);
  const [updateGradeFor, setUpdateGradeFor] = useState<{ milestoneId: string; type: string; score: number | null } | null>(null);
  const [showCertificate, setShowCertificate] = useState(false);

  // A grade can only be revised while the project is still in progress —
  // once every milestone is done there's nothing left to reopen. Mirrors
  // ProjectCard.tsx/QuickTasksPanel.tsx's own use of currentMilestone as the
  // "project finished" signal (null once nothing's left to do, but also
  // when no student is enrolled yet — excluded here since that can't have a
  // graded milestone in the first place).
  const projectFinished = project.enrolledStudentIds.length > 0 && project.currentMilestone == null;

  // The final-grade certificate (digitizing Project_final_grade.docx) is
  // data_science-only — that faculty's masters students are always on the
  // project track (see server's studentTrack.ts, project_only policy), so no
  // separate thesis-vs-project check is needed. Offered once every enrolled
  // student's defense milestone has a coordinator-approved final grade —
  // before that the certificate would have missing/pending data.
  const certificateAvailable =
    project.facultyId === 'data_science' &&
    students.length > 0 &&
    students.every((s) => s.milestones.find((m) => m.type === 'defense')?.gradeApproved);

  // Click-vs-double-click disambiguation for the per-file chips below — a
  // single click opens the preview panel, a double click downloads that one
  // file instead. One component-level ref (not per-chip state/hooks, since
  // these chips are created inside nested .map()s) keyed by a per-file id.
  const fileClickState = useRef<Record<string, { count: number; timer: ReturnType<typeof setTimeout> | null }>>({});
  const handleFileClick = useCallback((key: string, onSingle: () => void, onDouble: () => void) => {
    const state = fileClickState.current[key] ?? (fileClickState.current[key] = { count: 0, timer: null });
    state.count += 1;
    if (state.count === 1) {
      state.timer = setTimeout(() => {
        if (state.count === 1) onSingle();
        state.count = 0;
      }, 250);
    } else {
      if (state.timer) clearTimeout(state.timer);
      state.count = 0;
      onDouble();
    }
  }, []);

  // `silent` skips the loading flag — used after a grade/evaluation submit
  // so the just-graded milestone updates on screen as soon as the response
  // comes back, instead of the whole section blanking out to "…" and back.
  // Only the very first load (mount) shows that loading state.
  const fetchDetail = useCallback((opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
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
      .finally(() => { if (!opts?.silent) setLoading(false); });
  }, [project.id, lang]);

  const refreshDetailSilently = useCallback(() => fetchDetail({ silent: true }), [fetchDetail]);

  useEffect(() => {
    fetchDetail({ silent: !isFirstLoadRef.current });
    isFirstLoadRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchDetail, pendingGrades]);

  return (
    <div className="mt-3 border-t border-[#c5c5d3] pt-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-[#1a1b21]">🧬 {lang === 'he' ? 'תהליך העבודה' : 'Workflow'}</p>
        {certificateAvailable && (
          <button
            type="button"
            onClick={() => setShowCertificate(true)}
            className="rounded-full bg-[#00236f] px-3 py-1 text-xs font-semibold text-white hover:bg-[#001a52]"
          >
            📜 {lang === 'he' ? 'תעודת ציון סופי' : 'Final Grade Certificate'}
          </button>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-[#444651]">…</p>
      ) : error ? (
        <p className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">{error}</p>
      ) : (
        <>
          <div className="rounded-lg border border-[#c5c5d3] bg-[#eeedf4] p-3">
            <p className="mb-2 text-sm font-semibold text-[#1a1b21]">{lang === 'he' ? 'אבני הדרך של תבנית זו' : 'This template\'s milestones'}</p>
            <div className="grid gap-1.5">
              {templateMilestones.map((m, idx) => (
                <div key={m.type} className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#EDE9FE] font-bold text-[#00236f]">{idx + 1}</span>
                  <span className="min-w-0 flex-1 truncate font-medium text-[#1a1b21]">{lang === 'he' ? m.nameHe : m.nameEn}</span>
                  <span className="shrink-0 whitespace-nowrap text-[#444651]">
                    📅 {m.dateMode === 'fixed'
                      ? (lang === 'he' ? `תאריך קבוע: ${m.fixedDate ?? '—'}` : `Fixed: ${m.fixedDate ?? '—'}`)
                      : m.dueDate
                        ? (lang === 'he' ? `תאריך יעד: ${formatShortDate(m.dueDate, lang)}` : `Due: ${formatShortDate(m.dueDate, lang)}`)
                        : (lang === 'he' ? `יום ${m.dueDaysFromStart}` : `Day ${m.dueDaysFromStart}`)}
                    {m.requiresExaminers ? ` · 👥` : ''}
                  </span>
                </div>
              ))}
              {templateMilestones.length === 0 && (
                <p className="text-xs text-[#444651]">{lang === 'he' ? 'לא נמצאה תבנית עבור פרויקט זה' : 'No template found for this project'}</p>
              )}
            </div>
          </div>

          <div className="mt-4">
            <p className="mb-2 text-sm font-semibold text-[#1a1b21]">{lang === 'he' ? 'סטטוס הגשה לפי סטודנט' : 'Submission status per student'}</p>
            {students.length === 0 && (
              <p className="text-sm text-[#444651]">{lang === 'he' ? 'אין סטודנטים רשומים' : 'No enrolled students'}</p>
            )}
            <div className="grid gap-3">
              {students.map((s) => (
                <div key={s.studentId} className="rounded-lg border border-[#c5c5d3] bg-white p-3">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-[#1a1b21]">👤 {s.studentName}</p>
                    {s.overallFinalGrade != null && (
                      <span className="rounded-full bg-[#EDE9FE] px-2.5 py-1 text-xs font-semibold text-[#00236f]">
                        🎓 {lang === 'he' ? `ציון סופי כולל: ${s.overallFinalGrade}` : `Overall final grade: ${s.overallFinalGrade}`}
                      </span>
                    )}
                  </div>
                  <div className="grid gap-2.5">
                    {(() => {
                      const firstIncompleteIdx = s.milestones.findIndex((m) => !isCompletedStatus(m.status));
                      // Only what the student has finished, plus the one
                      // they're currently on — not the rest of the roadmap,
                      // which they haven't reached yet and so has no real
                      // data to show. firstIncompleteIdx === -1 means every
                      // milestone is done (project finished), so nothing to
                      // trim. Slicing from the start keeps each row's
                      // original index intact, so isCurrent below still
                      // lines up correctly.
                      const visibleMilestones = firstIncompleteIdx === -1 ? s.milestones : s.milestones.slice(0, firstIncompleteIdx + 1);
                      return visibleMilestones.map((m, idx) => {
                      const spec = templateMilestones.find((t) => t.type === m.type);
                      const color = statusColor(m.status);
                      const isCompleted = isCompletedStatus(m.status);
                      const isCurrent = !isCompleted && idx === firstIncompleteIdx;
                      const isFuture = !isCompleted && !isCurrent;
                      const dueLabel = formatShortDate(m.dueDate, lang);
                      const submittedLabel = formatShortDate(m.submittedAt, lang);
                      return (
                        <div
                          key={m.type}
                          className={`role-rail relative rounded-lg border bg-white p-2.5 transition-opacity ${
                            isCurrent ? 'border-2' : 'border-[#c5c5d3]'
                          } ${isFuture ? 'opacity-75 hover:opacity-100' : ''}`}
                          style={{ '--rail-color': color, borderColor: isCurrent ? '#00236f' : undefined } as React.CSSProperties}
                        >
                          <div className="flex items-start justify-between gap-2 text-xs">
                            {m.fileUrls.length > 0 ? (
                              <button
                                type="button"
                                onClick={() =>
                                  setPreviewFor({
                                    title: spec ? (lang === 'he' ? spec.nameHe : spec.nameEn) : m.type,
                                    subtitle: s.studentName,
                                    submissionNote: m.submissionNote,
                                    fileUrls: m.fileUrls,
                                  })
                                }
                                className="min-w-0 truncate font-semibold text-[#00236f] hover:underline"
                              >
                                {spec ? (lang === 'he' ? spec.nameHe : spec.nameEn) : m.type}
                              </button>
                            ) : (
                              <span className="min-w-0 truncate font-semibold text-[#1a1b21]">{spec ? (lang === 'he' ? spec.nameHe : spec.nameEn) : m.type}</span>
                            )}
                            <span
                              className="shrink-0 whitespace-nowrap rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                              style={{ backgroundColor: `${color}1A`, color }}
                            >
                              {statusLabel(m.status, lang)}
                            </span>
                          </div>

                          {/* Due / submitted stat row — icon-labeled, matching
                              components/MilestoneTimeline.tsx's card layout. */}
                          {(dueLabel || submittedLabel) && (
                            <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 border-t border-[#c5c5d3]/60 pt-1.5 text-[11px] text-[#444651]">
                              {dueLabel && <span>📅 {lang === 'he' ? 'תאריך יעד:' : 'Due:'} {dueLabel}</span>}
                              {submittedLabel && <span>📤 {lang === 'he' ? 'הוגש:' : 'Submitted:'} {submittedLabel}</span>}
                            </div>
                          )}

                          {/* Submitted files — chip list. Single click opens
                              the same file-preview panel the title link
                              already opens; double click downloads that one
                              file straight to the supervisor's computer. */}
                          {m.fileUrls.length > 0 && (
                            <div className="mt-1.5 flex flex-wrap gap-1.5">
                              {m.fileUrls.map((url, i) => {
                                const fileName = fileNameFromUrl(url, i, lang);
                                return (
                                  <button
                                    key={i}
                                    type="button"
                                    title={lang === 'he' ? 'לחיצה: תצוגה מקדימה · לחיצה כפולה: הורדה' : 'Click: preview · Double-click: download'}
                                    onClick={() =>
                                      handleFileClick(
                                        `${s.studentId}-${m.type}-${i}`,
                                        () =>
                                          setPreviewFor({
                                            title: spec ? (lang === 'he' ? spec.nameHe : spec.nameEn) : m.type,
                                            subtitle: s.studentName,
                                            submissionNote: m.submissionNote,
                                            fileUrls: m.fileUrls,
                                          }),
                                        () => downloadFile(url, fileName)
                                      )
                                    }
                                    className="flex items-center gap-1 rounded-md border border-[#c5c5d3] bg-[#f4f3fa] px-2 py-1 text-[11px] text-[#1a1b21] hover:border-[#00236f] hover:text-[#00236f]"
                                  >
                                    📄 <span className="max-w-[10rem] truncate">{fileName}</span>
                                  </button>
                                );
                              })}
                            </div>
                          )}

                          {/* Sign-off action for research_proposal — the supervisor's
                              stage on this milestone is 'approve' (a pure sign-off), not
                              'grade' (see addResearchProposalStudentForm.ts), so it's kept
                              out of the generic Grade branch below entirely: submitting a
                              score against an 'approve' stage would 400. */}
                          {m.type === 'research_proposal' && m.id && (
                            m.finalGrade == null && m.status === 'submitted' ? (
                              signingId === m.id ? (
                                <div className="mt-1 rounded-md border border-supervisor-outline-variant bg-supervisor-surface-container-low p-2">
                                  {m.studentFormFields && m.studentFormFields.length > 0 && (
                                    <div className="mb-2 grid max-h-64 gap-1.5 overflow-y-auto">
                                      {m.studentFormFields.filter((f) => !f.locked).map((f) => {
                                        const v = m.studentFormData?.[f.key];
                                        return (
                                          <div key={f.key}>
                                            <p className="text-[11px] font-medium text-supervisor-on-surface-variant">{lang === 'he' ? f.labelHe : f.labelEn}</p>
                                            {f.type === 'table' ? (
                                              (Array.isArray(v) ? v : []).map((row: Record<string, unknown>, i: number) => (
                                                <p key={i} className="text-xs text-supervisor-on-surface">
                                                  {(f.tableColumns ?? []).map((c) => String(row[c.key] ?? '')).join(' · ')}
                                                </p>
                                              ))
                                            ) : (
                                              <p className="whitespace-pre-wrap text-xs text-supervisor-on-surface">{v != null && v !== '' ? String(v) : '—'}</p>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                {/* The actual uploaded document (distinct from the online
                                    form fields above, which some projects use instead of/
                                    alongside a file) — shown right here so signing never
                                    requires leaving to go find it first. */}
                                {m.fileUrls.length > 0 && (
                                  <div className="mb-2 grid gap-1.5">
                                    {m.fileUrls.map((url, i) => (
                                      <div key={i} className="overflow-hidden rounded-md border border-supervisor-outline-variant">
                                        <div className="flex items-center justify-between border-b border-supervisor-outline-variant bg-supervisor-surface-container-lowest px-2 py-1">
                                          <span className="min-w-0 truncate text-[11px] font-medium text-supervisor-on-surface">📄 {fileNameFromUrl(url, i, lang)}</span>
                                        </div>
                                        <FilePreviewFrame url={url} index={i} />
                                      </div>
                                    ))}
                                  </div>
                                )}
                                <div className="flex items-center gap-2">
                                  <span
                                    className="text-sm"
                                    style={
                                      userData
                                        ? examinerSignatureStyle(userData.displayName, userData.facultyId, 'supervisor', userData.major ?? null)
                                        : undefined
                                    }
                                  >
                                    {userData?.displayName}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      await apiClient.coordinatorApproveMilestone(m.id!);
                                      setSigningId(null);
                                      fetchDetail();
                                    }}
                                    className="rounded-md bg-supervisor-primary px-2 py-1 text-xs font-semibold text-supervisor-on-primary hover:opacity-90"
                                  >
                                    {lang === 'he' ? 'אשר וחתום' : 'Confirm & sign'}
                                  </button>
                                  <button type="button" onClick={() => setSigningId(null)} className="text-xs text-supervisor-on-surface-variant hover:text-supervisor-on-surface">
                                    {lang === 'he' ? 'ביטול' : 'Cancel'}
                                  </button>
                                </div>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setSigningId(m.id!)}
                                  className="mt-1 text-xs font-medium text-[#00236f] hover:underline"
                                >
                                  ✍️ {lang === 'he' ? 'חתום על הצעת המחקר' : 'Sign the research proposal'}
                                </button>
                              )
                            ) : m.status === 'coordinator_approved' || m.status === 'completed' ? (
                              <p className="mt-1 text-xs font-semibold text-success">✓ {lang === 'he' ? 'נחתם ואושר סופית' : 'Signed and finalized'}</p>
                            ) : m.status === 'supervisor_graded' ? (
                              <p className="mt-1 text-xs text-accent">✓ {lang === 'he' ? 'נחתם ע"י המנחה — ממתין לרכז/ת' : "Signed — awaiting the coordinator"}</p>
                            ) : null
                          )}

                          {/* Grade action/display for ordinary milestones — the
                              three-rubric defense workflow below handles its own,
                              and research_proposal is handled by the sign-off
                              block above. */}
                          {!m.hasFinalGradeComponents && m.type !== 'research_proposal' && m.id && (() => {
                            const pending = pendingGrades.find((pg) => pg.id === m.id);
                            if (m.finalGrade != null) {
                              return (
                                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                  <p className="text-xs font-semibold text-success">
                                    🎓 {lang === 'he' ? `ציון: ${m.finalGrade}` : `Grade: ${m.finalGrade}`}
                                  </p>
                                  {!m.gradeApproved && !projectFinished && (
                                    <button
                                      type="button"
                                      onClick={() => setUpdateGradeFor({ milestoneId: m.id!, type: m.type, score: m.supervisorScore })}
                                      className="text-xs font-medium text-[#00236f] hover:underline"
                                    >
                                      ✏️ {lang === 'he' ? 'עדכן ציון' : 'Update grade'}
                                    </button>
                                  )}
                                </div>
                              );
                            }
                            if (pending) {
                              return (
                                <button
                                  type="button"
                                  onClick={() => onGrade(pending)}
                                  className="mt-1 text-xs font-medium text-[#00236f] hover:underline"
                                >
                                  ✏️ {lang === 'he' ? 'תן ציון' : 'Grade'}
                                </button>
                              );
                            }
                            return null;
                          })()}

                          {/* Staff record action (research_proposal/progress_report only). */}
                          {m.staffRecordMode === 'upload_or_form' && m.id && (
                            <button
                              type="button"
                              onClick={() => setStaffRecordFor({ milestoneId: m.id!, fields: spec?.staffFormFields ?? [] })}
                              className="mt-1 text-xs font-medium text-[#00236f] hover:underline"
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
                                  className="font-medium text-[#00236f] hover:underline"
                                >
                                  🎓 {lang === 'he' ? `ציון סופי מחושב: ${m.autoCalculatedFinalGrade} — לחץ להחלטה` : `Computed final grade: ${m.autoCalculatedFinalGrade} — click to decide`}
                                </button>
                              ) : !m.supervisorEvaluationSubmitted ? (
                                <button
                                  type="button"
                                  onClick={() => setSupervisorEvalFor({ milestoneId: m.id!, components: spec?.finalGradeComponents?.supervisorEvaluation.components ?? [] })}
                                  className="font-medium text-[#00236f] hover:underline"
                                >
                                  📝 {lang === 'he' ? 'הגש הערכת מנחה' : 'Submit supervisor evaluation'}
                                </button>
                              ) : (
                                <span className="text-[#444651]">{lang === 'he' ? 'ממתין להערכות בוחנים' : "Waiting on examiners' evaluations"}</span>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    });
                    })()}
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
          onSubmitted={refreshDetailSilently}
        />
      )}
      {supervisorEvalFor && (
        <SupervisorEvaluationModal
          milestoneId={supervisorEvalFor.milestoneId}
          components={supervisorEvalFor.components}
          onClose={() => setSupervisorEvalFor(null)}
          onSubmitted={refreshDetailSilently}
        />
      )}
      {finalGradeDecisionFor && (
        <FinalGradeDecisionModal
          milestoneId={finalGradeDecisionFor.milestoneId}
          autoCalculatedFinalGrade={finalGradeDecisionFor.autoGrade}
          onClose={() => setFinalGradeDecisionFor(null)}
          onDecided={refreshDetailSilently}
        />
      )}
      {previewFor && (
        <MilestoneFilePanel
          title={previewFor.title}
          subtitle={previewFor.subtitle}
          submissionNote={previewFor.submissionNote}
          fileUrls={previewFor.fileUrls}
          onClose={() => setPreviewFor(null)}
        />
      )}
      {updateGradeFor && (
        <UpdateGradeModal
          milestoneId={updateGradeFor.milestoneId}
          projectId={project.id}
          milestoneType={updateGradeFor.type}
          currentScore={updateGradeFor.score}
          onClose={() => setUpdateGradeFor(null)}
          onUpdated={refreshDetailSilently}
        />
      )}
      {showCertificate && (
        <FinalGradeCertificateModal
          project={project}
          students={students}
          onClose={() => setShowCertificate(false)}
        />
      )}
    </div>
  );
}
