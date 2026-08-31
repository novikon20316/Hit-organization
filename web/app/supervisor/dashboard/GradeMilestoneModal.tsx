'use client';

// app/supervisor/dashboard/GradeMilestoneModal.tsx
import { useRef, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/apiClient';
import { useModalA11y } from '@/hooks/useModalA11y';
import { GRADING_CRITERIA, MILESTONE_LABEL, type SupervisorPendingMilestone } from './types';

interface GradeMilestoneModalProps {
  milestone: SupervisorPendingMilestone;
  onClose: () => void;
  onGraded: () => void;
}

// A unified {key, max, weight, he, en} shape covers both the legacy fixed
// rubric and a milestone's configured gradingComponents — for the legacy
// rubric, weight === max, which makes the shared weighted-total formula
// below ((score/max)*weight) collapse to a plain sum, exactly matching
// today's behavior. See server/src/services/milestoneRouting.ts's
// computeGradingComponentsScore for the server-side twin of this formula.
interface ActiveGradingField {
  key: string;
  max: number;
  weight: number;
  he: string;
  en: string;
}

// Clamps to [0, max] on every keystroke rather than only at submit time —
// typing e.g. 20 into a 15-point field lands on 15, so a supervisor can
// never end up with (or move on with) an out-of-range criterion score.
function clampScoreInput(raw: string, max: number): string {
  if (raw === '') return raw;
  const n = Number(raw);
  if (!Number.isFinite(n)) return raw;
  return String(Math.min(Math.max(n, 0), max));
}

export function GradeMilestoneModal({ milestone: m, onClose, onGraded }: GradeMilestoneModalProps) {
  const { lang, t } = useLanguage();
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalA11y(dialogRef, true, onClose);

  const activeFields: ActiveGradingField[] = m.gradingComponents?.length
    ? m.gradingComponents.map((c) => ({ key: c.key, max: c.maxScore, weight: c.weight, he: c.labelHe, en: c.labelEn }))
    : GRADING_CRITERIA.map((c) => ({ key: c.key, max: c.max, weight: c.max, he: c.he, en: c.en }));

  const [criteria, setCriteria] = useState<Record<string, string>>(() =>
    Object.fromEntries(activeFields.map((f) => [f.key, '']))
  );
  const [comment, setComment] = useState('');
  // Group projects only (studentIds.length > 1) — optional per-student score
  // layered on top of the shared group score above, keyed by studentId.
  const [individualScores, setIndividualScores] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const totalScore = Math.round(
    activeFields.reduce((sum, f) => sum + ((Number(criteria[f.key]) || 0) / f.max) * f.weight, 0)
  );
  const isGroupProject = m.studentIds.length > 1;

  const handleSubmit = async () => {
    setSubmitting(true);
    setError('');
    try {
      await apiClient.submitMilestoneGrade(m.id, {
        givenScore: totalScore,
        comments: comment,
        projectId: m.projectId,
        criteria: Object.fromEntries(activeFields.map((f) => [f.key, Number(criteria[f.key]) || 0])),
      });

      // Individual components are optional per student and independent of
      // the group score above — submit each filled-in one, but a failure
      // here shouldn't hide that the (already-saved) group grade succeeded.
      if (isGroupProject) {
        const individualFailures: string[] = [];
        for (const studentId of m.studentIds) {
          const raw = individualScores[studentId];
          if (raw === undefined || raw.trim() === '') continue;
          try {
            await apiClient.submitIndividualGrade(m.id, { studentId, score: Number(raw) });
          } catch (err) {
            console.error(`Failed to submit individual grade for ${studentId}:`, err);
            individualFailures.push(m.studentNames[m.studentIds.indexOf(studentId)] ?? studentId);
          }
        }
        if (individualFailures.length > 0) {
          setError(
            lang === 'he'
              ? `הציון הקבוצתי נשמר, אך הציון האישי נכשל עבור: ${individualFailures.join(', ')}`
              : `Group grade saved, but the individual score failed for: ${individualFailures.join(', ')}`,
          );
          // The group grade above did save — refresh the underlying list
          // (this milestone is no longer "pending") without closing the
          // modal, so the error stays visible.
          onGraded();
          setSubmitting(false);
          return;
        }
      }

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
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[var(--radius)] bg-surface p-6 shadow-lg outline-none"
      >
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
          {activeFields.map((field) => (
            <label key={field.key} className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink">
                {lang === 'he' ? field.he : field.en} (0–{field.max})
              </span>
              <input
                type="number"
                min={0}
                max={field.max}
                value={criteria[field.key]}
                onChange={(e) => setCriteria({ ...criteria, [field.key]: clampScoreInput(e.target.value, field.max) })}
                className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink focus:border-primary focus:bg-surface focus:outline-none"
              />
            </label>
          ))}
        </div>

        {/* Group projects only: personal component per student, on top of
            the shared group score above — final grades can differ within
            the group. */}
        {isGroupProject && (
          <div className="mt-4">
            <span className="mb-1.5 block text-sm font-medium text-ink">
              {lang === 'he' ? 'ציון אישי (לצד הציון הקבוצתי)' : 'Individual grade (on top of the group score)'}
            </span>
            <div className="grid gap-2.5">
              {m.studentIds.map((studentId, idx) => (
                <label key={studentId} className="block">
                  <span className="mb-1 block text-xs text-muted">👤 {m.studentNames[idx] ?? studentId}</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    placeholder={lang === 'he' ? 'ציון אישי 0–100 (אופציונלי)' : 'Individual score 0–100 (optional)'}
                    value={individualScores[studentId] ?? ''}
                    onChange={(e) => setIndividualScores({ ...individualScores, [studentId]: clampScoreInput(e.target.value, 100) })}
                    className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink focus:border-primary focus:bg-surface focus:outline-none"
                  />
                </label>
              ))}
            </div>
          </div>
        )}

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

        {error && <p className="mt-3 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">{error}</p>}

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
