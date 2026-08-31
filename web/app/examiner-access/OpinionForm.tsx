'use client';

// app/examiner-access/OpinionForm.tsx
// Criteria scoring, recommendation, comments, and submission — the external
// examiner's actual review. Writes directly to Firestore via
// lib/examinerTokens.ts's submitExaminerOpinion, same as accept/decline
// (this document has no server-mediated write path; see firestore.rules).

import { useState } from 'react';
import { submitExaminerOpinion } from '@/lib/examinerTokens';
import { useLanguage } from '@/contexts/LanguageContext';
import { OPINION_CRITERIA, RECOMMENDATION_OPTIONS, type Recommendation, type GradingComponentSpec } from './types';

interface OpinionFormProps {
  token: string;
  examinerName: string;
  gradingComponents?: GradingComponentSpec[];
  onSubmitted: () => void;
}

// See supervisor/dashboard/GradeMilestoneModal.tsx's identical
// ActiveGradingField for why weight === max exactly reproduces today's
// plain-sum legacy behavior.
interface ActiveGradingField {
  key: string;
  max: number;
  weight: number;
  he: string;
  en: string;
}

export function OpinionForm({ token, examinerName, gradingComponents, onSubmitted }: OpinionFormProps) {
  const { lang, t } = useLanguage();

  const activeFields: ActiveGradingField[] = gradingComponents?.length
    ? gradingComponents.map((c) => ({ key: c.key, max: c.maxScore, weight: c.weight, he: c.labelHe, en: c.labelEn }))
    : OPINION_CRITERIA.map((c) => ({ key: c.key, max: c.max, weight: c.max, he: c.he, en: c.en }));

  const [scores, setScores] = useState<Record<string, string>>(() =>
    Object.fromEntries(activeFields.map((f) => [f.key, '']))
  );
  const [overallComments, setOverallComments] = useState('');
  const [recommendation, setRecommendation] = useState<Recommendation | ''>('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  const totalScore = Math.round(
    activeFields.reduce((sum, f) => sum + ((parseFloat(scores[f.key]) || 0) / f.max) * f.weight, 0)
  );

  const handleSubmit = async () => {
    setFormError('');

    for (const f of activeFields) {
      const v = parseFloat(scores[f.key] || '');
      const label = lang === 'he' ? f.he : f.en;
      if (isNaN(v) || v < 0 || v > f.max) {
        setFormError(
          lang === 'he'
            ? `הציון עבור "${label}" חייב להיות בין 0 ל-${f.max}`
            : `Score for "${label}" must be between 0 and ${f.max}`
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

    setSubmitting(true);
    try {
      await submitExaminerOpinion(token, {
        criteria: Object.fromEntries(activeFields.map((f) => [f.key, parseFloat(scores[f.key])])),
        totalScore,
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
        {activeFields.map((f) => (
          <div key={f.key}>
            <div className="mb-1 flex items-baseline justify-between">
              <label className="text-sm font-medium text-ink">{lang === 'he' ? f.he : f.en}</label>
              <span className="text-xs text-muted">/ {f.max}</span>
            </div>
            <input
              type="number"
              min={0}
              max={f.max}
              value={scores[f.key]}
              onChange={(e) => setScores((prev) => ({ ...prev, [f.key]: e.target.value }))}
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

      {!!formError && <p className="mt-3 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">{formError}</p>}

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
