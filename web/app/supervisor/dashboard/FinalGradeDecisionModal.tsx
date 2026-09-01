'use client';

// app/supervisor/dashboard/FinalGradeDecisionModal.tsx
// Once every rubric (supervisor + all examiners' project/defense evaluations)
// is in, the defense milestone's autoCalculatedFinalGrade is computed
// server-side (see projectController.ts's maybeFinalizeAutoCalculatedGrade).
// The supervisor either approves it as-is (finalizes immediately, no further
// sign-off needed) or proposes a different grade with a mandatory reason,
// which then goes to the coordinator's grade-override queue — see
// supervisorController.ts's decideFinalGrade / gradSchoolHeadController.ts's
// decideGradeOverride.

import { useRef, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/apiClient';
import { useModalA11y } from '@/hooks/useModalA11y';

interface FinalGradeDecisionModalProps {
  milestoneId: string;
  autoCalculatedFinalGrade: number;
  onClose: () => void;
  onDecided: () => void;
}

export function FinalGradeDecisionModal({ milestoneId, autoCalculatedFinalGrade, onClose, onDecided }: FinalGradeDecisionModalProps) {
  const { lang } = useLanguage();
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalA11y(dialogRef, true, onClose);
  const [mode, setMode] = useState<'choose' | 'override'>('choose');
  const [overrideGrade, setOverrideGrade] = useState(String(autoCalculatedFinalGrade));
  const [reason, setReason] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleApprove = async () => {
    setSubmitting(true);
    setError('');
    try {
      await apiClient.decideFinalGrade(milestoneId, { decision: 'approve' }, file ? [file] : undefined);
      onDecided();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : lang === 'he' ? 'הפעולה נכשלה' : 'The action failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleOverride = async () => {
    const grade = Number(overrideGrade);
    if (!Number.isFinite(grade) || grade < 0 || grade > 100) {
      setError(lang === 'he' ? 'יש להזין ציון בין 0 ל-100' : 'Enter a grade between 0 and 100');
      return;
    }
    if (!reason.trim()) {
      setError(lang === 'he' ? 'יש לנמק את השינוי' : 'A reason for the change is required');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await apiClient.decideFinalGrade(milestoneId, { decision: 'override', grade, reason: reason.trim() }, file ? [file] : undefined);
      onDecided();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : lang === 'he' ? 'הפעולה נכשלה' : 'The action failed');
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
        className="w-full max-w-md rounded-[var(--radius)] bg-surface p-6 shadow-lg outline-none"
      >
        <div className="flex items-start justify-between">
          <h2 className="text-lg font-semibold text-ink">{lang === 'he' ? 'ציון סופי מחושב' : 'Computed Final Grade'}</h2>
          <button type="button" onClick={onClose} aria-label={lang === 'he' ? 'סגור' : 'Close'} className="text-muted hover:text-ink">✕</button>
        </div>

        <div className="mt-4 rounded-lg bg-paper p-4 text-center">
          <p className="text-xs text-muted">{lang === 'he' ? 'הציון המחושב אוטומטית' : 'Automatically calculated grade'}</p>
          <p className="mt-1 text-3xl font-bold text-ink">{autoCalculatedFinalGrade}</p>
        </div>

        <label className="mt-4 block">
          <span className="mb-1.5 block text-sm font-medium text-ink">
            {lang === 'he' ? 'קובץ מצורף (אופציונלי — למשל טופס הציון הסופי החתום)' : 'Attached file (optional — e.g. the signed final-grade form)'}
          </span>
          <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink" />
        </label>

        {mode === 'choose' ? (
          <div className="mt-4 grid gap-2">
            <button
              type="button"
              onClick={handleApprove}
              disabled={submitting}
              className="w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-ink hover:bg-primary-hover disabled:opacity-60"
            >
              {submitting ? '…' : lang === 'he' ? '✓ אשר את הציון המחושב' : '✓ Approve the computed grade'}
            </button>
            <button
              type="button"
              onClick={() => setMode('override')}
              className="w-full rounded-lg border border-line px-3.5 py-2.5 text-sm font-medium text-ink hover:bg-paper"
            >
              {lang === 'he' ? 'שנה את הציון' : 'Change the grade'}
            </button>
          </div>
        ) : (
          <div className="mt-4 grid gap-3">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink">{lang === 'he' ? 'ציון חדש' : 'New grade'}</span>
              <input
                type="number"
                min={0}
                max={100}
                value={overrideGrade}
                onChange={(e) => setOverrideGrade(e.target.value)}
                className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink focus:border-primary focus:bg-surface focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink">{lang === 'he' ? 'נימוק לשינוי (חובה)' : 'Reason for the change (required)'}</span>
              <textarea
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink focus:border-primary focus:bg-surface focus:outline-none"
              />
            </label>
            <p className="text-xs text-muted">
              {lang === 'he'
                ? 'השינוי יישלח לאישור הרכז/ת — עד להחלטתו/ה הציון לא ייכנס לתוקף.'
                : "This change will be sent to the coordinator for approval — it won't take effect until they decide."}
            </p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setMode('choose')} className="flex-1 rounded-lg border border-line px-3.5 py-2 text-sm font-medium text-ink hover:bg-paper">
                {lang === 'he' ? 'חזרה' : 'Back'}
              </button>
              <button
                type="button"
                onClick={handleOverride}
                disabled={submitting}
                className="flex-1 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-ink hover:bg-primary-hover disabled:opacity-60"
              >
                {submitting ? '…' : lang === 'he' ? 'שלח לאישור' : 'Submit for approval'}
              </button>
            </div>
          </div>
        )}

        {error && <p className="mt-3 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">{error}</p>}
      </div>
    </div>
  );
}
