'use client';

// app/examinor/home/ExaminerEvaluationModal.tsx
// One examiner's half of the three-rubric final-grade workflow (see
// workflowTemplates.ts's finalGradeComponents) — 'project' scores the written
// project/thesis, 'defense' scores the oral defense performance; each
// examiner submits both, independently, mirroring GradeExaminerModal.tsx's
// dynamic-rubric pattern but posting to submitExaminerEvaluation instead of
// submitMilestoneGrade (this milestone's overall grade is an aggregate of
// three graders' rubrics, not just this examiner's).

import { useRef, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/apiClient';
import { useModalA11y } from '@/hooks/useModalA11y';
import type { AssignedMilestone, GradingComponentSpec } from './types';

interface ExaminerEvaluationModalProps {
  milestone: AssignedMilestone;
  kind: 'project' | 'defense';
  onClose: () => void;
  onSubmitted: () => void;
}

export function ExaminerEvaluationModal({ milestone: m, kind, onClose, onSubmitted }: ExaminerEvaluationModalProps) {
  const { lang, t } = useLanguage();
  const rubric: GradingComponentSpec[] = kind === 'project'
    ? m.finalGradeComponents?.examinerProjectEvaluation.components ?? []
    : m.finalGradeComponents?.examinerDefenseEvaluation.components ?? [];

  const [scores, setScores] = useState<Record<string, string>>(() => Object.fromEntries(rubric.map((c) => [c.key, ''])));
  const [comment, setComment] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalA11y(dialogRef, true, onClose);

  const total = Math.round(rubric.reduce((sum, c) => sum + ((Number(scores[c.key]) || 0) / c.maxScore) * c.weight, 0));

  const handleSubmit = async () => {
    setSubmitting(true);
    setError('');
    try {
      await apiClient.submitExaminerEvaluation(m.id, {
        kind,
        scores: Object.fromEntries(rubric.map((c) => [c.key, Number(scores[c.key]) || 0])),
        comment,
      }, file ? [file] : undefined);
      onSubmitted();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : lang === 'he' ? 'שליחת ההערכה נכשלה' : 'Failed to submit the evaluation');
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
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[var(--radius)] bg-surface p-6 shadow-lg outline-none"
      >
        <h2 className="text-lg font-semibold text-ink">
          {kind === 'project'
            ? (lang === 'he' ? '📄 הערכת בוחן — עבודת הגמר' : '📄 Examiner Evaluation — The Project')
            : (lang === 'he' ? '🛡 הערכת בוחן — בחינת ההגנה' : '🛡 Examiner Evaluation — The Defense Exam')}
        </h2>

        <div className="mt-3 rounded-lg bg-paper p-3">
          <p className="text-sm font-semibold text-ink">{lang === 'he' ? m.projectTitleHe : m.projectTitleEn}</p>
          <p className="mt-0.5 text-xs text-muted">👤 {m.studentNames.join(', ')}</p>
        </div>

        <div className="mt-4 grid gap-3">
          {rubric.map((c) => (
            <label key={c.key} className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink">
                {lang === 'he' ? c.labelHe : c.labelEn} (0–{c.maxScore})
              </span>
              <input
                type="number"
                min={0}
                max={c.maxScore}
                value={scores[c.key]}
                onChange={(e) => setScores({ ...scores, [c.key]: e.target.value })}
                className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink focus:border-primary focus:bg-surface focus:outline-none"
              />
            </label>
          ))}
        </div>

        <label className="mt-4 block">
          <span className="mb-1.5 block text-sm font-medium text-ink">{lang === 'he' ? 'הערכה מילולית והערות' : 'Written evaluation and comments'}</span>
          <textarea
            rows={4}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink focus:border-primary focus:bg-surface focus:outline-none"
          />
        </label>

        <div className="mt-4 flex items-center justify-between rounded-lg bg-paper px-3 py-2">
          <span className="text-sm font-semibold text-ink">{lang === 'he' ? 'סה"כ' : 'Total'}</span>
          <span className="text-sm font-bold" style={{ color: total >= 60 ? 'var(--success)' : 'var(--danger)' }}>
            {total} / 100
          </span>
        </div>

        <label className="mt-4 block">
          <span className="mb-1.5 block text-sm font-medium text-ink">
            {lang === 'he' ? 'קובץ מצורף (אופציונלי)' : 'Attached file (optional)'}
          </span>
          <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink" />
        </label>

        {error && <p className="mt-3 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">{error}</p>}

        <div className="mt-4 flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 rounded-lg border border-line px-3.5 py-2.5 text-sm font-medium text-ink hover:bg-paper">
            {t('cancel')}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="flex-1 rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-ink hover:bg-primary-hover disabled:opacity-60"
          >
            {submitting ? '…' : t('submit')}
          </button>
        </div>
      </div>
    </div>
  );
}
