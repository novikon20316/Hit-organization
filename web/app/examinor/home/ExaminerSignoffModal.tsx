'use client';

// app/examinor/home/ExaminerSignoffModal.tsx
// Independent, parallel signoff (see workflowTemplates.ts's preGradeSignoffs
// doc comment) — a plain one-shot approval by this milestone's examinerIds[0]
// ("examiner #1"), unlocked the instant the student submits, decoupled from
// every other examiner grading path in this app (GradeExaminerModal /
// ExaminerEvaluationModal / ExaminerFormFieldsModal). No fields to fill —
// item 9 of the paper form ("אישור בוחן ראשי") has no reject alternative.

import { useRef, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { apiClient } from '@/lib/apiClient';
import { useModalA11y } from '@/hooks/useModalA11y';
import { examinerSignatureStyle } from '@/lib/examinerSignature';
import type { AssignedMilestone } from './types';
import { MILESTONE_LABEL } from './types';

interface ExaminerSignoffModalProps {
  milestone: AssignedMilestone;
  onClose: () => void;
  onSubmitted: () => void;
}

export function ExaminerSignoffModal({ milestone: m, onClose, onSubmitted }: ExaminerSignoffModalProps) {
  const { lang, t } = useLanguage();
  const { userData } = useAuth();
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalA11y(dialogRef, true, onClose);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const examinerName = (lang === 'he' ? userData?.displayNameHe : userData?.displayNameEn) || userData?.displayName || '';
  const sig = userData ? examinerSignatureStyle(examinerName, userData.facultyId, 'examiner', userData.major ?? null) : undefined;

  const handleSubmit = async () => {
    setError('');
    setSubmitting(true);
    try {
      await apiClient.submitExaminerOneSignoff(m.id);
      onSubmitted();
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
        className="w-full max-w-md rounded-examinor bg-examinor-surface-container-lowest p-6 shadow-lg outline-none"
      >
        <div className="flex items-start justify-between">
          <h2 className="text-lg font-semibold text-examinor-on-surface">
            {lang === 'he' ? 'אישור כבוחן ראשי' : 'Sign off as examiner #1'}
          </h2>
          <button type="button" onClick={onClose} aria-label={lang === 'he' ? 'סגור' : 'Close'} className="text-examinor-on-surface-variant hover:text-examinor-on-surface">✕</button>
        </div>

        <p className="mt-3 text-sm text-examinor-on-surface-variant">
          {lang === 'he'
            ? `אישור זה עבור "${MILESTONE_LABEL[m.type]?.he ?? m.type}" — ${lang === 'he' ? m.projectTitleHe : m.projectTitleEn}.`
            : `This approves "${MILESTONE_LABEL[m.type]?.en ?? m.type}" — ${m.projectTitleEn}.`}
        </p>
        <p className="mt-1 text-xs text-examinor-on-surface-variant">
          {lang === 'he' ? 'לא ניתן לבטל לאחר האישור.' : 'This cannot be undone once submitted.'}
        </p>

        <div className="mt-4 flex items-center gap-2 border-t border-examinor-outline-variant pt-3">
          <span className="text-xs text-examinor-on-surface-variant">{lang === 'he' ? 'חתימה: ' : 'Signature: '}</span>
          <span style={sig} className="text-base">{examinerName}</span>
        </div>

        {error && <p className="mt-3 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">{error}</p>}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className="mt-4 w-full rounded-lg bg-examinor-primary py-2.5 text-sm font-semibold text-examinor-on-primary hover:opacity-90 disabled:opacity-60"
        >
          {submitting ? '…' : lang === 'he' ? 'אשר' : t('submit')}
        </button>
      </div>
    </div>
  );
}
