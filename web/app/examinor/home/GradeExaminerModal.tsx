'use client';

// app/examinor/home/GradeExaminerModal.tsx
import { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/apiClient';
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
}

export function GradeExaminerModal({ milestone: m, onClose, onGraded }: GradeExaminerModalProps) {
  const { lang, t } = useLanguage();

  const activeFields: ActiveGradingField[] = m.gradingComponents?.length
    ? m.gradingComponents.map((c) => ({ key: c.key, max: c.maxScore, weight: c.weight, he: c.labelHe, en: c.labelEn }))
    : EXAMINER_GRADING_CRITERIA.map((c) => ({ key: c.key, max: c.max, weight: c.max, he: c.he, en: c.en }));

  const [scores, setScores] = useState<Record<string, string>>(() =>
    Object.fromEntries(activeFields.map((f) => [f.key, '']))
  );
  const [comments, setComments] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const totalScore = Math.round(
    activeFields.reduce((sum, f) => sum + ((parseFloat(scores[f.key]) || 0) / f.max) * f.weight, 0)
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
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[var(--radius)] bg-surface p-6 shadow-lg">
        <h2 className="text-lg font-semibold text-ink">✏️ {lang === 'he' ? 'טופס ציון בוחן' : 'Examiner Grading Form'}</h2>

        <div className="mt-3 rounded-lg bg-paper p-3">
          <p className="text-sm font-semibold text-ink">{lang === 'he' ? m.projectTitleHe : m.projectTitleEn}</p>
          <p className="mt-0.5 text-xs text-muted">👤 {m.studentNames.join(', ')}</p>
          {m.defenseDate && <p className="mt-0.5 text-xs text-muted">📅 {new Date(m.defenseDate).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-US')}</p>}
        </div>

        <div className="mt-4 grid gap-3">
          {activeFields.map((f) => (
            <div key={f.key}>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-sm font-medium text-ink">{lang === 'he' ? f.he : f.en}</span>
                <span className="text-xs text-muted">/ {f.max}</span>
              </div>
              <input
                type="number"
                min={0}
                max={f.max}
                value={scores[f.key]}
                onChange={(e) => setScores({ ...scores, [f.key]: e.target.value })}
                className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink focus:border-primary focus:bg-surface focus:outline-none"
              />
            </div>
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between rounded-lg bg-paper px-3 py-2">
          <span className="text-sm font-semibold text-ink">{lang === 'he' ? 'סה"כ' : 'Total'}</span>
          <span className="text-sm font-bold" style={{ color: totalScore >= 60 ? 'var(--success)' : 'var(--danger)' }}>
            {totalScore} / 100
          </span>
        </div>

        <label className="mt-4 block">
          <span className="mb-1.5 block text-sm font-medium text-ink">{lang === 'he' ? 'הערות' : 'Comments'}</span>
          <textarea
            rows={4}
            value={comments}
            onChange={(e) => setComments(e.target.value)}
            placeholder={lang === 'he' ? 'הערות לסטודנט...' : 'Comments to student...'}
            className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink focus:border-primary focus:bg-surface focus:outline-none"
          />
        </label>

        {error && <p className="mt-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>}

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
            {submitting ? '…' : lang === 'he' ? 'שלח ציון' : 'Submit Grade'}
          </button>
        </div>
        <p className="mt-2 text-center text-xs text-muted">{MILESTONE_LABEL[m.type]?.[lang]}</p>
      </div>
    </div>
  );
}
