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
    <div className="mt-5 rounded-examinor-lg border border-examinor-outline-variant bg-examinor-surface-container-lowest p-4 text-start shadow-sm">
      <h2 className="text-base font-semibold text-examinor-on-surface">{t('examinerSubmitOpinion')}</h2>

      <div className="mt-3 grid gap-3">
        {activeFields.map((f) => (
          <div key={f.key}>
            <div className="mb-1 flex items-baseline justify-between">
              <label className="text-xs font-semibold text-examinor-on-surface-variant">{lang === 'he' ? f.he : f.en}</label>
              <span className="text-xs text-examinor-on-surface-variant">/ {f.max}</span>
            </div>
            <input
              type="number"
              min={0}
              max={f.max}
              value={scores[f.key]}
              onChange={(e) => setScores((prev) => ({ ...prev, [f.key]: e.target.value }))}
              placeholder="0"
              className="w-full rounded-examinor border border-examinor-outline-variant bg-examinor-surface-container-low px-3.5 py-2 text-sm text-examinor-on-surface transition-colors focus:border-examinor-primary focus:bg-examinor-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-examinor-primary/15"
            />
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-examinor-outline-variant pt-3">
        <span className="text-sm font-medium text-examinor-on-surface">{t('examinerTotalLabel')}</span>
        <span className={`text-base font-semibold ${totalScore >= 60 ? 'text-success' : 'text-danger'}`}>{totalScore} / 100</span>
      </div>

      <div className="mt-4">
        <label className="mb-1.5 block text-xs font-semibold text-examinor-on-surface-variant">{t('examinerRecommendationLabel')}</label>
        <div className="grid gap-2">
          {RECOMMENDATION_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setRecommendation(opt.value)}
              className={`flex items-center gap-2.5 rounded-examinor border px-3.5 py-2.5 text-start text-sm transition-colors ${
                recommendation === opt.value ? 'border-examinor-primary bg-examinor-primary/5 font-medium text-examinor-primary' : 'border-examinor-outline-variant bg-examinor-surface-container-low text-examinor-on-surface hover:border-examinor-primary/40'
              }`}
            >
              <span
                className={`h-3.5 w-3.5 shrink-0 rounded-full border-2 ${recommendation === opt.value ? 'border-examinor-primary bg-examinor-primary' : 'border-examinor-outline-variant'}`}
              />
              {lang === 'he' ? opt.he : opt.en}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4">
        <label className="mb-1.5 block text-xs font-semibold text-examinor-on-surface-variant">{t('gradeComments')}</label>
        <textarea
          value={overallComments}
          onChange={(e) => setOverallComments(e.target.value)}
          rows={5}
          dir={lang === 'he' ? 'rtl' : 'ltr'}
          placeholder={t('examinerCommentsPlaceholder')}
          className="w-full resize-y rounded-examinor border border-examinor-outline-variant bg-examinor-surface-container-low px-3.5 py-2.5 text-sm text-examinor-on-surface transition-colors focus:border-examinor-primary focus:bg-examinor-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-examinor-primary/15"
        />
      </div>

      {!!formError && <p className="mt-3 rounded-examinor bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">{formError}</p>}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={submitting}
        className="mt-4 w-full rounded-examinor-lg bg-examinor-primary py-2.5 text-sm font-semibold text-examinor-on-primary shadow-sm transition-colors hover:bg-examinor-primary-container disabled:opacity-40"
      >
        {submitting ? '…' : t('examinerSubmitOpinion')}
      </button>
    </div>
  );
}
