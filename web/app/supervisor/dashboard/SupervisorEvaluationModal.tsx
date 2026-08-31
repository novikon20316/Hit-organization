'use client';

// app/supervisor/dashboard/SupervisorEvaluationModal.tsx
// The supervisor's rubric within the three-rubric final-grade workflow (see
// workflowTemplates.ts's finalGradeComponents) — a dynamic form built from
// the defense milestone's configured supervisorEvaluation.components, mirroring
// GradeMilestoneModal.tsx's dynamic-rubric pattern but posting to the
// dedicated submitSupervisorEvaluation endpoint instead of submitMilestoneGrade
// (this milestone's overall grade is an aggregate of three graders' rubrics,
// not just this one).

import { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/apiClient';

interface RubricComponent { key: string; labelHe: string; labelEn: string; maxScore: number; weight: number }

interface SupervisorEvaluationModalProps {
  milestoneId: string;
  components: RubricComponent[];
  onClose: () => void;
  onSubmitted: () => void;
}

// Clamps to [0, max] on every keystroke — mirrors GradeMilestoneModal.tsx's
// identical helper — so a supervisor can never type/leave a criterion above
// its configured maxScore.
function clampScoreInput(raw: string, max: number): string {
  if (raw === '') return raw;
  const n = Number(raw);
  if (!Number.isFinite(n)) return raw;
  return String(Math.min(Math.max(n, 0), max));
}

export function SupervisorEvaluationModal({ milestoneId, components, onClose, onSubmitted }: SupervisorEvaluationModalProps) {
  const { lang, t } = useLanguage();
  const [scores, setScores] = useState<Record<string, string>>(() => Object.fromEntries(components.map((c) => [c.key, ''])));
  const [comment, setComment] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const total = Math.round(components.reduce((sum, c) => sum + ((Number(scores[c.key]) || 0) / c.maxScore) * c.weight, 0));

  const handleSubmit = async () => {
    setSubmitting(true);
    setError('');
    try {
      await apiClient.submitSupervisorEvaluation(milestoneId, {
        scores: Object.fromEntries(components.map((c) => [c.key, Number(scores[c.key]) || 0])),
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
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[var(--radius)] bg-surface p-6 shadow-lg">
        <div className="flex items-start justify-between">
          <h2 className="text-lg font-semibold text-ink">{lang === 'he' ? 'הערכת מנחה' : 'Supervisor Evaluation'}</h2>
          <button type="button" onClick={onClose} className="text-muted hover:text-ink">✕</button>
        </div>

        <div className="mt-4 grid gap-3">
          {components.map((c) => (
            <label key={c.key} className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink">
                {lang === 'he' ? c.labelHe : c.labelEn} (0–{c.maxScore})
              </span>
              <input
                type="number"
                min={0}
                max={c.maxScore}
                value={scores[c.key]}
                onChange={(e) => setScores({ ...scores, [c.key]: clampScoreInput(e.target.value, c.maxScore) })}
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

        <p className="mt-3 text-sm font-bold text-ink">{lang === 'he' ? 'סה"כ' : 'Total'}: {total}/100</p>

        <label className="mt-4 block">
          <span className="mb-1.5 block text-sm font-medium text-ink">
            {lang === 'he' ? 'קובץ מצורף (אופציונלי)' : 'Attached file (optional)'}
          </span>
          <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink" />
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
