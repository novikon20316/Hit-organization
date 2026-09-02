'use client';

// app/examinor/home/GradeExaminerModal.tsx
import { useRef, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/apiClient';
import { useModalA11y } from '@/hooks/useModalA11y';
import { EXAMINER_GRADING_CRITERIA, MILESTONE_LABEL, type AssignedMilestone } from './types';

interface GradeExaminerModalProps {
  milestone: AssignedMilestone;
  onClose: () => void;
  onGraded: () => void;
}

// See GradeMilestoneModal.tsx's identical ActiveGradingField for why weight
// === max exactly reproduces today's plain-sum legacy behavior.
interface ActiveGradingField {
  key: string;
  max: number;
  weight: number;
  he: string;
  en: string;
  groupHe?: string;
  groupEn?: string;
  // True means this field is scored/validated like any other but excluded
  // from totalScore — e.g. a poster score recorded independently alongside
  // a presentation rubric. See workflowTemplates.ts's excludeFromTotal.
  excludeFromTotal?: boolean;
}

export function GradeExaminerModal({ milestone: m, onClose, onGraded }: GradeExaminerModalProps) {
  const { lang, t } = useLanguage();

  const activeFields: ActiveGradingField[] = m.gradingComponents?.length
    ? m.gradingComponents.map((c) => ({ key: c.key, max: c.maxScore, weight: c.weight, he: c.labelHe, en: c.labelEn, groupHe: c.groupHe, groupEn: c.groupEn, excludeFromTotal: c.excludeFromTotal }))
    : EXAMINER_GRADING_CRITERIA.map((c) => ({ key: c.key, max: c.max, weight: c.max, he: c.he, en: c.en }));
  const totalFields = activeFields.filter((f) => !f.excludeFromTotal);
  const excludedFields = activeFields.filter((f) => f.excludeFromTotal);
  // Dynamic denominator — every existing rubric happens to sum its weights to
  // 100, so this is a no-op everywhere except a rubric that legitimately
  // sums higher (e.g. Industrial Engineering & Management's 1-105 rubric).
  const maxTotal = totalFields.reduce((sum, f) => sum + f.weight, 0);

  const [scores, setScores] = useState<Record<string, string>>(() =>
    Object.fromEntries(activeFields.map((f) => [f.key, '']))
  );
  const [comments, setComments] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalA11y(dialogRef, true, onClose);

  const totalScore = Math.round(
    totalFields.reduce((sum, f) => sum + ((parseFloat(scores[f.key]) || 0) / f.max) * f.weight, 0)
  );

  const handleSubmit = async () => {
    for (const f of activeFields) {
      const v = parseFloat(scores[f.key]);
      if (isNaN(v) || v < 0 || v > f.max) {
        const label = lang === 'he' ? f.he : f.en;
        setError(lang === 'he' ? `ציון עבור "${label}" חייב להיות בין 0 ל-${f.max}` : `Score for "${label}" must be between 0 and ${f.max}`);
        return;
      }
    }
    setSubmitting(true);
    setError('');
    try {
      await apiClient.submitMilestoneGrade(m.id, {
        projectId: m.projectId,
        givenScore: totalScore,
        comments,
        criteria: Object.fromEntries(activeFields.map((f) => [f.key, parseFloat(scores[f.key]) || 0])),
      });
      onGraded();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : lang === 'he' ? 'שגיאה בשמירת הציון' : 'Failed to submit grade');
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
        <h2 className="text-lg font-semibold text-examinor-on-surface">✏️ {lang === 'he' ? 'טופס ציון בוחן' : 'Examiner Grading Form'}</h2>

        <div className="mt-3 rounded-lg bg-examinor-surface-container-low p-3">
          <p className="text-sm font-semibold text-examinor-on-surface">{lang === 'he' ? m.projectTitleHe : m.projectTitleEn}</p>
          <p className="mt-0.5 text-xs text-examinor-on-surface-variant">👤 {m.studentNames.join(', ')}</p>
          {m.defenseDate && <p className="mt-0.5 text-xs text-examinor-on-surface-variant">📅 {new Date(m.defenseDate).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-US')}</p>}
        </div>

        <div className="mt-4 grid gap-3">
          {totalFields.map((f, idx) => {
            const group = lang === 'he' ? f.groupHe : f.groupEn;
            const prevGroup = idx > 0 ? (lang === 'he' ? totalFields[idx - 1]!.groupHe : totalFields[idx - 1]!.groupEn) : undefined;
            const showGroupHeader = !!group && group !== prevGroup;
            return (
              <div key={f.key}>
                {showGroupHeader && (
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-examinor-on-surface-variant">{group}</p>
                )}
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-sm font-medium text-examinor-on-surface">{lang === 'he' ? f.he : f.en}</span>
                  <span className="text-xs text-examinor-on-surface-variant">/ {f.max}</span>
                </div>
                <input
                  type="number"
                  min={0}
                  max={f.max}
                  value={scores[f.key]}
                  onChange={(e) => setScores({ ...scores, [f.key]: e.target.value })}
                  className="w-full rounded-lg border border-examinor-outline-variant bg-examinor-surface-container-low px-3 py-2 text-sm text-examinor-on-surface focus:border-examinor-primary focus:bg-examinor-surface-container-lowest focus:outline-none"
                />
              </div>
            );
          })}
        </div>

        {excludedFields.length > 0 && (
          <div className="mt-4 grid gap-3 border-t border-examinor-outline-variant pt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-examinor-on-surface-variant">
              {lang === 'he' ? 'ציונים נפרדים (לא נכללים בסיכום)' : 'Separate scores (not included in the total)'}
            </p>
            {excludedFields.map((f) => (
              <div key={f.key}>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-sm font-medium text-examinor-on-surface">{lang === 'he' ? f.he : f.en}</span>
                  <span className="text-xs text-examinor-on-surface-variant">/ {f.max}</span>
                </div>
                <input
                  type="number"
                  min={0}
                  max={f.max}
                  value={scores[f.key]}
                  onChange={(e) => setScores({ ...scores, [f.key]: e.target.value })}
                  className="w-full rounded-lg border border-examinor-outline-variant bg-examinor-surface-container-low px-3 py-2 text-sm text-examinor-on-surface focus:border-examinor-primary focus:bg-examinor-surface-container-lowest focus:outline-none"
                />
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 flex items-center justify-between rounded-lg bg-examinor-surface-container-low px-3 py-2">
          <span className="text-sm font-semibold text-examinor-on-surface">{lang === 'he' ? 'סה"כ' : 'Total'}</span>
          <span className="text-sm font-bold" style={{ color: totalScore >= maxTotal * 0.6 ? 'var(--success)' : 'var(--danger)' }}>
            {totalScore} / {maxTotal}
          </span>
        </div>

        <label className="mt-4 block">
          <span className="mb-1.5 block text-sm font-medium text-examinor-on-surface">{lang === 'he' ? 'הערות' : 'Comments'}</span>
          <textarea
            rows={4}
            value={comments}
            onChange={(e) => setComments(e.target.value)}
            placeholder={lang === 'he' ? 'הערות לסטודנט...' : 'Comments to student...'}
            className="w-full rounded-lg border border-examinor-outline-variant bg-examinor-surface-container-low px-3 py-2 text-sm text-examinor-on-surface focus:border-examinor-primary focus:bg-examinor-surface-container-lowest focus:outline-none"
          />
        </label>

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
            {submitting ? '…' : lang === 'he' ? 'שלח ציון' : 'Submit Grade'}
          </button>
        </div>
        <p className="mt-2 text-center text-xs text-examinor-on-surface-variant">{MILESTONE_LABEL[m.type]?.[lang]}</p>
      </div>
    </div>
  );
}
