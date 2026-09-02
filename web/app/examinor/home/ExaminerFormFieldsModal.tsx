'use client';

// app/examinor/home/ExaminerFormFieldsModal.tsx
// Generic (not faculty-specific) renderer for a milestone's examinerFormFields
// (see workflowTemplates.ts) — a non-scored Q&A form every assigned examiner
// fills independently, e.g. the Industrial Engineering & Management
// "Presentation 1" form (4 yes/no screening questions, each with a comment
// that becomes mandatory only for a specific answer — see each field's own
// commentRequiredOn). A sibling of GradeExaminerModal.tsx for the non-numeric
// shape, dispatched from AssignmentCard.tsx whenever a milestone has
// examinerFormFields instead of (or alongside an empty) gradingComponents.

import { useRef, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { apiClient } from '@/lib/apiClient';
import { useModalA11y } from '@/hooks/useModalA11y';
import type { AssignedMilestone } from './types';
import { MILESTONE_LABEL } from './types';

interface ExaminerFormFieldsModalProps {
  milestone: AssignedMilestone;
  onClose: () => void;
  onSubmitted: () => void;
}

interface AnswerState {
  value: 'yes' | 'no' | '';
  comment: string;
}

export function ExaminerFormFieldsModal({ milestone: m, onClose, onSubmitted }: ExaminerFormFieldsModalProps) {
  const { lang, t } = useLanguage();
  const { userData } = useAuth();
  const fields = m.examinerFormFields ?? [];

  const [answers, setAnswers] = useState<Record<string, AnswerState>>(() =>
    Object.fromEntries(fields.map((f) => [f.key, { value: '' as const, comment: '' }]))
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalA11y(dialogRef, true, onClose);

  const examinerName = (lang === 'he' ? userData?.displayNameHe : userData?.displayNameEn) || userData?.displayName || '';
  const today = new Date();

  const setAnswer = (key: string, value: 'yes' | 'no') => {
    setAnswers((prev) => {
      const field = fields.find((f) => f.key === key);
      // Switching to the answer that doesn't require a comment clears
      // whatever was typed — matches the paper form's "disabled entirely"
      // behavior for a non-triggering answer, not just "now optional".
      const keepComment = field?.commentRequiredOn === value ? prev[key]?.comment ?? '' : '';
      return { ...prev, [key]: { value, comment: keepComment } };
    });
  };

  const setComment = (key: string, comment: string) => {
    setAnswers((prev) => ({ ...prev, [key]: { ...prev[key], comment } }));
  };

  const handleSubmit = async () => {
    setError('');
    for (const f of fields) {
      const a = answers[f.key];
      if (a?.value !== 'yes' && a?.value !== 'no') {
        setError(lang === 'he' ? `יש לבחור כן/לא עבור "${f.labelHe}"` : `Choose yes/no for "${f.labelEn}"`);
        return;
      }
      if (f.commentRequiredOn === a.value && !a.comment.trim()) {
        setError(lang === 'he' ? `יש להוסיף הסבר עבור "${f.labelHe}"` : `An explanation is required for "${f.labelEn}"`);
        return;
      }
    }
    setSubmitting(true);
    try {
      const payload = Object.fromEntries(
        fields.map((f) => {
          const a = answers[f.key];
          const comment = a.comment.trim();
          return [f.key, comment ? { value: a.value as 'yes' | 'no', comment } : { value: a.value as 'yes' | 'no' }];
        })
      );
      await apiClient.submitExaminerFormAnswers(m.id, payload);
      onSubmitted();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : lang === 'he' ? 'שליחת הטופס נכשלה' : 'Failed to submit the form');
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
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-examinor bg-examinor-surface-container-lowest p-6 shadow-lg outline-none"
      >
        <h2 className="text-lg font-semibold text-examinor-on-surface">📝 {MILESTONE_LABEL[m.type]?.[lang] ?? (lang === 'he' ? 'טופס הערכה' : 'Evaluation Form')}</h2>

        <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 rounded-lg bg-examinor-surface-container-low p-3 text-xs">
          <p className="col-span-2 text-sm font-semibold text-examinor-on-surface">{lang === 'he' ? m.projectTitleHe : m.projectTitleEn}</p>
          <span className="text-examinor-on-surface-variant">👤 {m.studentNames.join(', ') || '—'}</span>
          <span className="text-examinor-on-surface-variant">👨‍🏫 {lang === 'he' ? 'מנחה:' : 'Supervisor:'} {m.supervisorName}</span>
          <span className="text-examinor-on-surface-variant">🖊 {lang === 'he' ? 'מעריך:' : 'Evaluator:'} {examinerName}</span>
          <span className="text-examinor-on-surface-variant">📅 {today.toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-US')}</span>
        </div>

        <div className="mt-4 grid gap-4">
          {fields.map((f, idx) => {
            const a = answers[f.key] ?? { value: '', comment: '' };
            const commentEnabled = f.commentRequiredOn ? a.value === f.commentRequiredOn : a.value !== '';
            const commentRequired = f.commentRequiredOn ? a.value === f.commentRequiredOn : false;
            return (
              <div key={f.key} className="rounded-lg border border-examinor-outline-variant p-3">
                <p className="text-sm font-medium text-examinor-on-surface">
                  {idx + 1}. {lang === 'he' ? f.labelHe : f.labelEn}
                </p>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setAnswer(f.key, 'yes')}
                    className={`flex-1 rounded-lg border px-3 py-1.5 text-sm font-semibold ${a.value === 'yes' ? 'border-examinor-primary bg-examinor-primary text-examinor-on-primary' : 'border-examinor-outline-variant text-examinor-on-surface hover:bg-examinor-surface-container-low'}`}
                  >
                    {lang === 'he' ? 'כן' : 'Yes'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setAnswer(f.key, 'no')}
                    className={`flex-1 rounded-lg border px-3 py-1.5 text-sm font-semibold ${a.value === 'no' ? 'border-examinor-primary bg-examinor-primary text-examinor-on-primary' : 'border-examinor-outline-variant text-examinor-on-surface hover:bg-examinor-surface-container-low'}`}
                  >
                    {lang === 'he' ? 'לא' : 'No'}
                  </button>
                </div>
                <textarea
                  rows={2}
                  value={a.comment}
                  disabled={!commentEnabled}
                  onChange={(e) => setComment(f.key, e.target.value)}
                  placeholder={
                    !commentEnabled
                      ? lang === 'he' ? 'אין צורך בהסבר עבור תשובה זו' : 'No explanation needed for this answer'
                      : lang === 'he' ? 'הסבר במשפט אחד...' : 'One-sentence explanation...'
                  }
                  className="mt-2 w-full rounded-lg border border-examinor-outline-variant bg-examinor-surface-container-low px-3 py-2 text-sm text-examinor-on-surface focus:border-examinor-primary focus:bg-examinor-surface-container-lowest focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                />
                {commentRequired && <p className="mt-1 text-[11px] text-examinor-on-surface-variant">{lang === 'he' ? '* הסבר חובה עבור תשובה זו' : '* An explanation is required for this answer'}</p>}
              </div>
            );
          })}
        </div>

        {error && <p className="mt-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">{error}</p>}

        <div className="mt-4 flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 rounded-lg border border-examinor-outline-variant px-3.5 py-2.5 text-sm font-medium text-examinor-on-surface hover:bg-examinor-surface-container-low">
            {t('cancel')}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="flex-1 rounded-lg bg-examinor-primary py-2.5 text-sm font-semibold text-examinor-on-primary hover:opacity-90 disabled:opacity-60"
          >
            {submitting ? '…' : t('submit')}
          </button>
        </div>
      </div>
    </div>
  );
}
