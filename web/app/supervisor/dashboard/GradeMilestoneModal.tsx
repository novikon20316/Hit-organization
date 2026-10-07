'use client';

// app/supervisor/dashboard/GradeMilestoneModal.tsx
import { useRef, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/apiClient';
import { useModalA11y } from '@/hooks/useModalA11y';
import { downloadFile, fileNameFromUrl } from '@/lib/fileClickPreview';
import { FilePreviewFrame } from '@/components/MilestoneFilePanel';
import { GRADING_CRITERIA, MILESTONE_LABEL, type SupervisorPendingMilestone } from './types';
import { milestoneDisplayName } from '@/lib/milestoneLabel';
import { InfoTooltip } from '@/components/InfoTooltip';
import { FieldGuideOverlay } from '@/components/guidance/FieldGuideOverlay';
import { GRADE_MILESTONE_FIELD_GUIDE, GRADE_MILESTONE_GUIDE_KEY } from './fieldGuide';

function gradeGuideEntry(key: string) {
  return GRADE_MILESTONE_FIELD_GUIDE.find((s) => s.key === key)!;
}

interface GradeMilestoneModalProps {
  milestone: SupervisorPendingMilestone;
  onClose: () => void;
  onGraded: () => void;
}

// A unified {key, max, weight, he, en} shape covers both the legacy fixed
// rubric and a milestone's configured gradingComponents — for the legacy
// rubric, weight === max, which makes the shared weighted-total formula
// below ((score/max)*weight) collapse to a plain sum, exactly matching
// today's behavior. See server/src/services/milestoneRouting.ts's
// computeGradingComponentsScore for the server-side twin of this formula.
interface ActiveGradingField {
  key: string;
  max: number;
  weight: number;
  he: string;
  en: string;
}

// Clamps to [0, max] on every keystroke rather than only at submit time —
// typing e.g. 20 into a 15-point field lands on 15, so a supervisor can
// never end up with (or move on with) an out-of-range criterion score.
function clampScoreInput(raw: string, max: number): string {
  if (raw === '') return raw;
  const n = Number(raw);
  if (!Number.isFinite(n)) return raw;
  return String(Math.min(Math.max(n, 0), max));
}

export function GradeMilestoneModal({ milestone: m, onClose, onGraded }: GradeMilestoneModalProps) {
  const { lang, t } = useLanguage();
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalA11y(dialogRef, true, onClose);

  // The milestone's own configured chain may route the supervisor's current
  // turn through a plain approve/reject sign-off instead of a numeric grade
  // (see workflowTemplates.ts's ChainStage.action) — e.g. a custom milestone
  // type whose staff reviews it without scoring it. A legacy/non-chain-driven
  // milestone (no `routing` snapshot) always behaves as "grade", matching
  // every milestone created before this feature existed.
  const currentStage = m.routing?.[m.currentStageIndex ?? 0] ?? null;
  const isApproveStage = currentStage?.action === 'approve';
  // A research_proposal milestone's supervisor stage (grade OR approve —
  // which one depends on the faculty's own routing) requires the supervisor
  // to explicitly confirm they read the student's proposal thoroughly
  // before their grade/decision is accepted — enforced server-side too (see
  // submitMilestoneGrade/approveChainMilestone/rejectChainMilestone's own
  // confirmedProposalRead gate), this is just the UI for it.
  const requiresReadConfirmation = m.type === 'research_proposal' && currentStage?.role === 'supervisor';

  const activeFields: ActiveGradingField[] = m.gradingComponents?.length
    ? m.gradingComponents.map((c) => ({ key: c.key, max: c.maxScore, weight: c.weight, he: c.labelHe, en: c.labelEn }))
    : GRADING_CRITERIA.map((c) => ({ key: c.key, max: c.max, weight: c.max, he: c.he, en: c.en }));

  const [criteria, setCriteria] = useState<Record<string, string>>(() =>
    Object.fromEntries(activeFields.map((f) => [f.key, '']))
  );
  const [comment, setComment] = useState('');
  // Group projects only (studentIds.length > 1) — optional per-student score
  // layered on top of the shared group score above, keyed by studentId.
  const [individualScores, setIndividualScores] = useState<Record<string, string>>({});
  // Optional — never required to grade, or to approve/reject. Accepts PDF/Word,
  // same as the student's own submission (see uploadMiddleware's shared mime
  // allowlist).
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  // Approve-stage only — reveals the mandatory reason field below "Reject".
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  // Only meaningful when requiresReadConfirmation — gates every submit
  // action below (grade/approve/reject) until checked.
  const [confirmedRead, setConfirmedRead] = useState(false);
  // Set on a 200 response that didn't fully finalize the stage (e.g. a
  // dual-sign stage this actor wasn't the last required signer for) —
  // shown instead of silently closing, since there's a message worth reading.
  const [notice, setNotice] = useState('');

  const totalScore = Math.round(
    activeFields.reduce((sum, f) => sum + ((Number(criteria[f.key]) || 0) / f.max) * f.weight, 0)
  );
  // Dynamic denominator — every existing rubric happens to sum its weights
  // to 100, so this is a no-op everywhere except a rubric that legitimately
  // sums higher (e.g. Industrial Engineering & Management's 1-105 rubric).
  const maxTotal = activeFields.reduce((sum, f) => sum + f.weight, 0);
  const isGroupProject = m.studentIds.length > 1;

  const handleSubmit = async () => {
    setSubmitting(true);
    setError('');
    try {
      await apiClient.submitMilestoneGrade(m.id, {
        givenScore: totalScore,
        comments: comment,
        projectId: m.projectId,
        criteria: Object.fromEntries(activeFields.map((f) => [f.key, Number(criteria[f.key]) || 0])),
        ...(requiresReadConfirmation ? { confirmedProposalRead: confirmedRead } : {}),
      }, attachedFiles);

      // Individual components are optional per student and independent of
      // the group score above — submit each filled-in one, but a failure
      // here shouldn't hide that the (already-saved) group grade succeeded.
      if (isGroupProject) {
        const individualFailures: string[] = [];
        for (const studentId of m.studentIds) {
          const raw = individualScores[studentId];
          if (raw === undefined || raw.trim() === '') continue;
          try {
            await apiClient.submitIndividualGrade(m.id, { studentId, score: Number(raw) });
          } catch (err) {
            individualFailures.push(m.studentNames[m.studentIds.indexOf(studentId)] ?? studentId);
          }
        }
        if (individualFailures.length > 0) {
          setError(
            lang === 'he'
              ? `הציון הקבוצתי נשמר, אך הציון האישי נכשל עבור: ${individualFailures.join(', ')}`
              : `Group grade saved, but the individual score failed for: ${individualFailures.join(', ')}`,
          );
          // The group grade above did save — refresh the underlying list
          // (this milestone is no longer "pending") without closing the
          // modal, so the error stays visible.
          onGraded();
          setSubmitting(false);
          return;
        }
      }

      onGraded();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : lang === 'he' ? 'שגיאה בשמירת הציון' : 'Failed to submit grade');
    } finally {
      setSubmitting(false);
    }
  };

  const handleApprove = async () => {
    setSubmitting(true);
    setError('');
    try {
      const result = await apiClient.coordinatorApproveMilestone(m.id, comment || undefined, undefined, undefined, attachedFiles, requiresReadConfirmation ? confirmedRead : undefined);
      if (result.partialSignoff) {
        setNotice(result.message);
        onGraded();
      } else {
        onGraded();
        onClose();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : lang === 'he' ? 'האישור נכשל' : 'Failed to approve');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) {
      setError(lang === 'he' ? 'יש לציין סיבה לדחייה' : 'A reason is required to reject');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await apiClient.coordinatorRejectMilestone(m.id, rejectReason.trim(), attachedFiles, requiresReadConfirmation ? confirmedRead : undefined);
      onGraded();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : lang === 'he' ? 'הדחייה נכשלה' : 'Failed to reject');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-supervisor bg-supervisor-surface-container-lowest p-6 shadow-lg outline-none"
      >
        <FieldGuideOverlay
          guideKey={GRADE_MILESTONE_GUIDE_KEY}
          steps={GRADE_MILESTONE_FIELD_GUIDE.filter((s) =>
            (s.key !== 'submittedDocument' || m.fileUrls.length > 0)
            && (s.key !== 'individualGrade' || (isGroupProject && !isApproveStage))
            && (s.key !== 'criteria' || !isApproveStage)
            && (s.key !== 'decision' || isApproveStage)
          )}
        />
        <div className="flex items-start justify-between">
          <h2 className="text-lg font-semibold text-supervisor-on-surface">
            {isApproveStage ? (lang === 'he' ? 'אישור אבן דרך' : 'Milestone Approval') : (lang === 'he' ? 'טופס ציון' : 'Grading Form')}
          </h2>
          <button type="button" onClick={onClose} aria-label={lang === 'he' ? 'סגור' : 'Close'} className="text-supervisor-on-surface-variant hover:text-supervisor-on-surface">
            ✕
          </button>
        </div>

        <div className="mt-3 rounded-lg bg-supervisor-surface-container-low p-3">
          <p className="text-sm font-semibold text-supervisor-on-surface">{milestoneDisplayName(m, lang, MILESTONE_LABEL)}</p>
          <p className="mt-0.5 text-xs text-supervisor-on-surface-variant">{lang === 'he' ? m.projectTitleHe : m.projectTitleEn}</p>
          <p className="mt-0.5 text-xs text-supervisor-on-surface-variant">👤 {m.studentNames.join(', ')}</p>
          {m.submissionNote && <p className="mt-2 whitespace-pre-wrap text-sm text-supervisor-on-surface">💬 {m.submissionNote}</p>}
        </div>

        {/* The actual submitted document, rendered right here rather than
            requiring a trip back to ProjectWorkflowSection's own file chips
            — the supervisor should never have to grade blind or hunt down
            the file in a separate view first. */}
        {m.fileUrls.length > 0 && (
          <div data-field-guide-id="submittedDocument" className="mt-4 grid gap-3">
            <p className="text-sm font-semibold text-supervisor-on-surface">
              {lang === 'he' ? 'המסמך שהוגש' : 'Submitted document'}
              <InfoTooltip text={gradeGuideEntry('submittedDocument').description} />
            </p>
            {m.fileUrls.map((url, i) => (
              <div key={i} className="overflow-hidden rounded-lg border border-supervisor-outline-variant">
                <div className="flex items-center justify-between border-b border-supervisor-outline-variant bg-supervisor-surface-container-low px-3 py-2">
                  <span className="min-w-0 truncate text-xs font-medium text-supervisor-on-surface">📄 {fileNameFromUrl(url, i, lang)}</span>
                  <button
                    type="button"
                    onClick={() => downloadFile(url, fileNameFromUrl(url, i, lang))}
                    className="shrink-0 text-xs font-medium text-supervisor-primary hover:underline"
                  >
                    📥 {lang === 'he' ? 'הורדה' : 'Download'}
                  </button>
                </div>
                <FilePreviewFrame url={url} index={i} />
              </div>
            ))}
          </div>
        )}

        {requiresReadConfirmation && (
          <label className="mt-4 flex items-start gap-2 rounded-lg border border-supervisor-outline-variant bg-supervisor-surface-container-low p-3">
            <input
              type="checkbox"
              checked={confirmedRead}
              onChange={(e) => setConfirmedRead(e.target.checked)}
              className="mt-0.5"
            />
            <span className="text-sm font-medium text-supervisor-on-surface">
              {lang === 'he'
                ? 'אני מאשר/ת שקראתי את הצעת המחקר לעומק, ועומד/ת מאחורי הציון/ההחלטה שאני מגיש/ה.'
                : 'I confirm that I have read the proposal thoroughly, and I stand behind the grade/decision I am submitting.'}
            </span>
          </label>
        )}

        {!isApproveStage && (
          <div data-field-guide-id="criteria" className="mt-4 grid gap-3">
            <p className="flex items-center text-sm font-semibold text-supervisor-on-surface">
              {lang === 'he' ? 'מדדי ציון' : 'Grading criteria'}
              <InfoTooltip text={gradeGuideEntry('criteria').description} />
            </p>
            {activeFields.map((field) => (
              <label key={field.key} className="block">
                <span className="mb-1.5 block text-sm font-medium text-supervisor-on-surface">
                  {lang === 'he' ? field.he : field.en} (0–{field.max})
                </span>
                <input
                  type="number"
                  min={0}
                  max={field.max}
                  value={criteria[field.key]}
                  onChange={(e) => setCriteria({ ...criteria, [field.key]: clampScoreInput(e.target.value, field.max) })}
                  className="w-full rounded-lg border border-supervisor-outline-variant bg-supervisor-surface-container-low px-3 py-2 text-sm text-supervisor-on-surface focus:border-supervisor-primary focus:bg-supervisor-surface-container-lowest focus:outline-none"
                />
              </label>
            ))}
          </div>
        )}

        {/* Group projects only: personal component per student, on top of
            the shared group score above — final grades can differ within
            the group. Not meaningful for a plain approve/reject sign-off. */}
        {isGroupProject && !isApproveStage && (
          <div data-field-guide-id="individualGrade" className="mt-4">
            <span className="mb-1.5 block text-sm font-medium text-supervisor-on-surface">
              {lang === 'he' ? 'ציון אישי (לצד הציון הקבוצתי)' : 'Individual grade (on top of the group score)'}
              <InfoTooltip text={gradeGuideEntry('individualGrade').description} />
            </span>
            <div className="grid gap-2.5">
              {m.studentIds.map((studentId, idx) => (
                <label key={studentId} className="block">
                  <span className="mb-1 block text-xs text-supervisor-on-surface-variant">👤 {m.studentNames[idx] ?? studentId}</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    placeholder={lang === 'he' ? 'ציון אישי 0–100 (אופציונלי)' : 'Individual score 0–100 (optional)'}
                    value={individualScores[studentId] ?? ''}
                    onChange={(e) => setIndividualScores({ ...individualScores, [studentId]: clampScoreInput(e.target.value, 100) })}
                    className="w-full rounded-lg border border-supervisor-outline-variant bg-supervisor-surface-container-low px-3 py-2 text-sm text-supervisor-on-surface focus:border-supervisor-primary focus:bg-supervisor-surface-container-lowest focus:outline-none"
                  />
                </label>
              ))}
            </div>
          </div>
        )}

        <label data-field-guide-id="comment" className="mt-4 block">
          <span className="mb-1.5 block text-sm font-medium text-supervisor-on-surface">
            {isApproveStage ? (lang === 'he' ? 'הערות (אופציונלי)' : 'Comments (optional)') : (lang === 'he' ? 'הערות לסטודנט' : 'Comments to Student')}
            <InfoTooltip text={gradeGuideEntry('comment').description} />
          </span>
          <textarea
            rows={4}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            className="w-full rounded-lg border border-supervisor-outline-variant bg-supervisor-surface-container-low px-3 py-2 text-sm text-supervisor-on-surface focus:border-supervisor-primary focus:bg-supervisor-surface-container-lowest focus:outline-none"
          />
        </label>

        <label data-field-guide-id="attachFile" className="mt-4 block">
          <span className="mb-1.5 block text-sm font-medium text-supervisor-on-surface">
            {lang === 'he' ? 'צירוף קובץ (אופציונלי)' : 'Attach a file (optional)'}
            <InfoTooltip text={gradeGuideEntry('attachFile').description} />
          </span>
          <input
            type="file"
            accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            multiple
            onChange={(e) => setAttachedFiles(Array.from(e.target.files ?? []))}
            className="block w-full text-sm text-supervisor-on-surface file:me-3 file:rounded-lg file:border-0 file:bg-supervisor-primary file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-supervisor-on-primary hover:file:opacity-90"
          />
          {attachedFiles.length > 0 && (
            <ul className="mt-1.5 grid gap-0.5">
              {attachedFiles.map((f, i) => (
                <li key={i} className="text-xs text-supervisor-on-surface-variant">📎 {f.name}</li>
              ))}
            </ul>
          )}
        </label>

        {!isApproveStage && <p className="mt-3 text-sm font-bold text-supervisor-on-surface">Total: {totalScore}/{maxTotal}</p>}

        {isApproveStage && rejecting && (
          <label className="mt-4 block">
            <span className="mb-1.5 block text-sm font-medium text-supervisor-on-surface">
              {lang === 'he' ? 'סיבת דחייה (חובה)' : 'Reason for rejection (required)'}
            </span>
            <textarea
              rows={3}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="w-full rounded-lg border border-supervisor-outline-variant bg-supervisor-surface-container-low px-3 py-2 text-sm text-supervisor-on-surface focus:border-supervisor-primary focus:bg-supervisor-surface-container-lowest focus:outline-none"
            />
          </label>
        )}

        {notice && <p className="mt-3 rounded-md bg-supervisor-surface-container-low px-3 py-2 text-sm text-supervisor-on-surface" role="status">{notice}</p>}
        {error && <p className="mt-3 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">{error}</p>}

        {isApproveStage ? (
          <div data-field-guide-id="decision" className="mt-4 flex gap-2.5">
            {rejecting ? (
              <>
                <button
                  type="button"
                  onClick={() => { setRejecting(false); setRejectReason(''); setError(''); }}
                  disabled={submitting}
                  className="rounded-lg border border-supervisor-outline-variant px-4 py-2.5 text-sm font-semibold text-supervisor-on-surface disabled:opacity-60"
                >
                  {lang === 'he' ? 'ביטול' : 'Cancel'}
                </button>
                <button
                  type="button"
                  onClick={handleReject}
                  disabled={submitting || (requiresReadConfirmation && !confirmedRead)}
                  className="flex-1 rounded-lg bg-danger py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
                >
                  {submitting ? '…' : lang === 'he' ? 'אשר דחייה' : 'Confirm rejection'}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setRejecting(true)}
                  disabled={submitting}
                  className="flex-1 rounded-lg border border-danger py-2.5 text-sm font-semibold text-danger hover:bg-danger-bg disabled:opacity-60"
                >
                  👎 {lang === 'he' ? 'דחה' : 'Disapprove'}
                </button>
                <button
                  type="button"
                  onClick={handleApprove}
                  disabled={submitting || (requiresReadConfirmation && !confirmedRead)}
                  className="flex-1 rounded-lg bg-supervisor-primary py-2.5 text-sm font-semibold text-supervisor-on-primary hover:opacity-90 disabled:opacity-60"
                >
                  {submitting ? '…' : `👍 ${lang === 'he' ? 'אשר' : 'Approve'}`}
                </button>
              </>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || (requiresReadConfirmation && !confirmedRead)}
            className="mt-4 w-full rounded-lg bg-supervisor-primary py-2.5 text-sm font-semibold text-supervisor-on-primary hover:opacity-90 disabled:opacity-60"
          >
            {submitting ? '…' : lang === 'he' ? 'שלח ציון' : t('submit')}
          </button>
        )}
      </div>
    </div>
  );
}
