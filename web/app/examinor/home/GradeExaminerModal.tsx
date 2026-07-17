'use client';

// app/examinor/home/GradeExaminerModal.tsx
import { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/apiClient';
import { EXAMINER_GRADING_CRITERIA, MILESTONE_LABEL, type AssignedMilestone, type ExaminerCriterionKey } from './types';

interface GradeExaminerModalProps {
  milestone: AssignedMilestone;
  onClose: () => void;
  onGraded: () => void;
}

export function GradeExaminerModal({ milestone: m, onClose, onGraded }: GradeExaminerModalProps) {
  const { lang, t } = useLanguage();
  const [scores, setScores] = useState<Record<ExaminerCriterionKey, string>>({
    understanding: '',
    methodology: '',
    presentation: '',
    answers: '',
  });
  const [comments, setComments] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const totalScore = EXAMINER_GRADING_CRITERIA.reduce((sum, c) => sum + (parseFloat(scores[c.key]) || 0), 0);

  const handleSubmit = async () => {
    for (const c of EXAMINER_GRADING_CRITERIA) {
      const v = parseFloat(scores[c.key]);
      if (isNaN(v) || v < 0 || v > c.max) {
        setError(lang === 'he' ? `ציון עבור "${c.he}" חייב להיות בין 0 ל-${c.max}` : `Score for "${c.en}" must be between 0 and ${c.max}`);
        return;
      }
    }
    setSubmitting(true);
    setError('');
    try {
      await apiClient.submitMilestoneGrade(m.id, { projectId: m.projectId, givenScore: totalScore, comments });
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
          {EXAMINER_GRADING_CRITERIA.map((c) => (
            <div key={c.key}>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-sm font-medium text-ink">{lang === 'he' ? c.he : c.en}</span>
                <span className="text-xs text-muted">/ {c.max}</span>
              </div>
              <input
                type="number"
                min={0}
                max={c.max}
                value={scores[c.key]}
                onChange={(e) => setScores({ ...scores, [c.key]: e.target.value })}
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
