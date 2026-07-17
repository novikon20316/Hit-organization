'use client';

// app/examiner-access/OpinionForm.tsx
// Criteria scoring, recommendation, comments, and submission — the external
// examiner's actual review. Writes directly to Firestore via
// lib/examinerTokens.ts's submitExaminerOpinion, same as accept/decline
// (this document has no server-mediated write path; see firestore.rules).

import { useState } from 'react';
import { submitExaminerOpinion } from '@/lib/examinerTokens';
import { useLanguage } from '@/contexts/LanguageContext';
import { OPINION_CRITERIA, RECOMMENDATION_OPTIONS, type CriterionKey, type Recommendation } from './types';

interface OpinionFormProps {
  token: string;
  examinerName: string;
  onSubmitted: () => void;
}

export function OpinionForm({ token, examinerName, onSubmitted }: OpinionFormProps) {
  const { lang, t } = useLanguage();

  const [scores, setScores] = useState<Record<CriterionKey, string>>({
    originality: '',
    methodology: '',
    presentation: '',
    knowledge: '',
  });
  const [overallComments, setOverallComments] = useState('');
  const [recommendation, setRecommendation] = useState<Recommendation | ''>('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  const totalScore = OPINION_CRITERIA.reduce((sum, c) => sum + (parseFloat(scores[c.key] || '0') || 0), 0);

  const handleSubmit = async () => {
    setFormError('');

    for (const c of OPINION_CRITERIA) {
      const v = parseFloat(scores[c.key] || '');
      if (isNaN(v) || v < 0 || v > c.max) {
        setFormError(
          lang === 'he'
            ? `הציון עבור "${c.he}" חייב להיות בין 0 ל-${c.max}`
            : `Score for "${c.en}" must be between 0 and ${c.max}`
        );
        return;
      }
    }
    if (!recommendation) {
      setFormError(t('examinerMissingRecommendationBody'));
      return;
    }
    if (!overallComments.trim()) {
      setFormError(t('examinerCommentsRequiredBody'));
      return;
    }

    const total = OPINION_CRITERIA.reduce((sum, c) => sum + parseFloat(scores[c.key] || '0'), 0);

    setSubmitting(true);
    try {
      await submitExaminerOpinion(token, {
        criteria: Object.fromEntries(OPINION_CRITERIA.map((c) => [c.key, parseFloat(scores[c.key])])),
        totalScore: total,
        overallComments: overallComments.trim(),
        recommendation,
        submittedBy: examinerName,
        submittedAt: new Date().toISOString(),
      });
      onSubmitted();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mt-5 rounded-[var(--radius)] border border-line bg-surface p-4 text-start shadow-sm">
      <h2 className="text-base font-semibold text-ink">{t('examinerSubmitOpinion')}</h2>

      <div className="mt-3 grid gap-3">
        {OPINION_CRITERIA.map((c) => (
          <div key={c.key}>
            <div className="mb-1 flex items-baseline justify-between">
              <label className="text-sm font-medium text-ink">{lang === 'he' ? c.he : c.en}</label>
              <span className="text-xs text-muted">/ {c.max}</span>
            </div>
            <input
              type="number"
              min={0}
              max={c.max}
              value={scores[c.key]}
              onChange={(e) => setScores((prev) => ({ ...prev, [c.key]: e.target.value }))}
              placeholder="0"
              className="w-full rounded-lg border border-line bg-paper px-3.5 py-2 text-sm text-ink focus:border-primary focus:bg-surface focus:outline-none"
            />
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-line pt-3">
        <span className="text-sm font-medium text-ink">{t('examinerTotalLabel')}</span>
        <span className={`text-base font-semibold ${totalScore >= 60 ? 'text-success' : 'text-danger'}`}>{totalScore} / 100</span>
      </div>

      <div className="mt-4">
        <label className="mb-1.5 block text-sm font-medium text-ink">{t('examinerRecommendationLabel')}</label>
        <div className="grid gap-2">
          {RECOMMENDATION_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setRecommendation(opt.value)}
              className={`flex items-center gap-2.5 rounded-lg border px-3.5 py-2.5 text-start text-sm transition-colors ${
                recommendation === opt.value ? 'border-primary bg-primary/5 font-medium text-primary' : 'border-line bg-paper text-ink hover:border-primary/40'
              }`}
            >
              <span
                className={`h-3.5 w-3.5 shrink-0 rounded-full border-2 ${recommendation === opt.value ? 'border-primary bg-primary' : 'border-line'}`}
              />
              {lang === 'he' ? opt.he : opt.en}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4">
        <label className="mb-1.5 block text-sm font-medium text-ink">{t('gradeComments')}</label>
        <textarea
          value={overallComments}
          onChange={(e) => setOverallComments(e.target.value)}
          rows={5}
          dir={lang === 'he' ? 'rtl' : 'ltr'}
          placeholder={t('examinerCommentsPlaceholder')}
          className="w-full resize-y rounded-lg border border-line bg-paper px-3.5 py-2.5 text-sm text-ink focus:border-primary focus:bg-surface focus:outline-none"
        />
      </div>

      {!!formError && <p className="mt-3 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{formError}</p>}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={submitting}
        className="mt-4 w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-ink hover:bg-primary-hover disabled:opacity-60"
      >
        {submitting ? '…' : t('examinerSubmitOpinion')}
      </button>
    </div>
  );
}
