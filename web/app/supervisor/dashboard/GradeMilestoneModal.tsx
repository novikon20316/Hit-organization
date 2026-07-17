'use client';

// app/supervisor/dashboard/GradeMilestoneModal.tsx
import { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/apiClient';
import { GRADING_CRITERIA, MILESTONE_LABEL, type GradingCriterionKey, type SupervisorPendingMilestone } from './types';

interface GradeMilestoneModalProps {
  milestone: SupervisorPendingMilestone;
  onClose: () => void;
  onGraded: () => void;
}

export function GradeMilestoneModal({ milestone: m, onClose, onGraded }: GradeMilestoneModalProps) {
  const { lang, t } = useLanguage();
  const [criteria, setCriteria] = useState<Record<GradingCriterionKey, string>>({
    clarity: '',
    methodology: '',
    feasibility: '',
    innovation: '',
    writing: '',
  });
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const totalScore = GRADING_CRITERIA.reduce((sum, c) => sum + (Number(criteria[c.key]) || 0), 0);

  const handleSubmit = async () => {
    setSubmitting(true);
    setError('');
    try {
      await apiClient.submitMilestoneGrade(m.id, {
        givenScore: totalScore,
        comments: comment,
        projectId: m.projectId,
        criteria: {
          clarity: Number(criteria.clarity) || 0,
          methodology: Number(criteria.methodology) || 0,
          feasibility: Number(criteria.feasibility) || 0,
          innovation: Number(criteria.innovation) || 0,
          writing: Number(criteria.writing) || 0,
        },
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
        <div className="flex items-start justify-between">
          <h2 className="text-lg font-semibold text-ink">{lang === 'he' ? 'טופס ציון' : 'Grading Form'}</h2>
          <button type="button" onClick={onClose} className="text-muted hover:text-ink">
            ✕
          </button>
        </div>

        <div className="mt-3 rounded-lg bg-paper p-3">
          <p className="text-sm font-semibold text-ink">{MILESTONE_LABEL[m.type]?.[lang] ?? m.type}</p>
          <p className="mt-0.5 text-xs text-muted">{lang === 'he' ? m.projectTitleHe : m.projectTitleEn}</p>
          <p className="mt-0.5 text-xs text-muted">👤 {m.studentNames.join(', ')}</p>
        </div>

        <div className="mt-4 grid gap-3">
          {GRADING_CRITERIA.map((field) => (
            <label key={field.key} className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink">{field[lang]}</span>
              <input
                type="number"
                min={0}
                max={field.max}
                value={criteria[field.key]}
                onChange={(e) => setCriteria({ ...criteria, [field.key]: e.target.value })}
                className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink focus:border-primary focus:bg-surface focus:outline-none"
              />
            </label>
          ))}
        </div>

        <label className="mt-4 block">
          <span className="mb-1.5 block text-sm font-medium text-ink">{lang === 'he' ? 'הערות לסטודנט' : 'Comments to Student'}</span>
          <textarea
            rows={4}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink focus:border-primary focus:bg-surface focus:outline-none"
          />
        </label>

        <p className="mt-3 text-sm font-bold text-ink">Total: {totalScore}/100</p>

        {error && <p className="mt-3 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className="mt-4 w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-ink hover:bg-primary-hover disabled:opacity-60"
        >
          {submitting ? '…' : lang === 'he' ? 'שלח ציון' : t('submit')}
        </button>
      </div>
    </div>
  );
}
