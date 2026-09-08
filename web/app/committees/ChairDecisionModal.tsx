'use client';

// app/committees/ChairDecisionModal.tsx
// Independent, parallel committee-chair decision (see workflowTemplates.ts's
// preGradeSignoffs doc comment) — item 7 of Electrical & Electronics
// Engineering's supervisor evaluation form ("החלטת יו"ר ועדה"), or any other
// faculty's milestone that configures preGradeSignoffs.committee. A single,
// one-shot continue/not-continue decision by the chairman alone — distinct
// from CommitteeReviewModal.tsx's sequential chain, which collects every
// member's vote before the chairman decides.

import { useRef, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient, type ChairDecisionPendingReview } from '@/lib/apiClient';
import { useModalA11y } from '@/hooks/useModalA11y';

interface ChairDecisionModalProps {
  review: ChairDecisionPendingReview;
  onClose: () => void;
  onActed: () => void;
}

export function ChairDecisionModal({ review, onClose, onActed }: ChairDecisionModalProps) {
  const { lang, t } = useLanguage();
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalA11y(dialogRef, true, onClose);
  const [decision, setDecision] = useState<'continue' | 'not_continue' | null>(null);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    setError('');
    if (!decision) {
      setError(lang === 'he' ? 'יש לבחור החלטה' : 'Choose a decision');
      return;
    }
    if (!reason.trim()) {
      setError(lang === 'he' ? 'יש לנמק את ההחלטה' : 'A reason is required');
      return;
    }
    setSubmitting(true);
    try {
      await apiClient.submitCommitteeChairDecision(review.milestoneId, decision, reason.trim());
      onActed();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : lang === 'he' ? 'השליחה נכשלה' : 'Submission failed');
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
          <h2 className="text-lg font-semibold text-ink">{lang === 'he' ? "החלטת יו\"ר ועדה" : 'Committee chair decision'}</h2>
          <button type="button" onClick={onClose} aria-label={lang === 'he' ? 'סגור' : 'Close'} className="text-muted hover:text-ink">✕</button>
        </div>

        <p className="mt-3 text-sm text-muted">
          {lang === 'he' ? review.nameHe : review.nameEn} — {lang === 'he' ? review.projectTitleHe : review.projectTitleEn}
        </p>
        {review.studentNames.length > 0 && (
          <p className="mt-1 text-xs text-muted">👤 {review.studentNames.join(', ')}</p>
        )}

        <div className="mt-4 flex gap-1.5">
          <button
            type="button"
            onClick={() => setDecision('continue')}
            className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${decision === 'continue' ? 'border-success bg-success-bg text-success' : 'border-line bg-paper text-ink'}`}
          >
            {lang === 'he' ? '✅ להמשיך' : '✅ Continue'}
          </button>
          <button
            type="button"
            onClick={() => setDecision('not_continue')}
            className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${decision === 'not_continue' ? 'border-danger bg-danger-bg text-danger' : 'border-line bg-paper text-ink'}`}
          >
            {lang === 'he' ? '⛔ לא להמשיך' : '⛔ Not continue'}
          </button>
        </div>

        <label className="mt-3 block">
          <span className="mb-1.5 block text-sm font-medium text-ink">{lang === 'he' ? 'נימוק' : 'Reason'}</span>
          <textarea
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink focus:border-primary focus:bg-surface focus:outline-none"
          />
        </label>

        {error && <p className="mt-3 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">{error}</p>}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className="mt-4 w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-ink hover:bg-primary-hover disabled:opacity-60"
        >
          {submitting ? '…' : t('submit')}
        </button>
      </div>
    </div>
  );
}
