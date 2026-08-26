'use client';

// app/supervisor/dashboard/UpdateGradeModal.tsx
// Lets a supervisor overwrite a grade they already submitted for a
// milestone — a single overall score (0-100) plus a mandatory reason,
// distinct from GradeMilestoneModal's first-time per-criterion grading form.
// Reuses the same submit endpoint (server/src/controllers/projectController
// .ts's submitMilestoneGrade already supports overwriting a score), just
// with `reason` set, which the server requires whenever a supervisor score
// already exists and logs alongside the change (grades doc + auditLog) for
// the project's activity record.
import { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/apiClient';
import { MILESTONE_LABEL } from './types';

interface UpdateGradeModalProps {
  milestoneId: string;
  projectId: string;
  milestoneType: string;
  currentScore: number | null;
  onClose: () => void;
  onUpdated: () => void;
}

function clampScore(raw: string): string {
  if (raw === '') return raw;
  const n = Number(raw);
  if (!Number.isFinite(n)) return raw;
  return String(Math.min(Math.max(n, 0), 100));
}

export function UpdateGradeModal({ milestoneId, projectId, milestoneType, currentScore, onClose, onUpdated }: UpdateGradeModalProps) {
  const { lang } = useLanguage();
  const [score, setScore] = useState(currentScore != null ? String(currentScore) : '');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const scoreValid = score.trim() !== '' && Number.isFinite(Number(score)) && Number(score) >= 0 && Number(score) <= 100;
  const reasonValid = reason.trim().length > 0;

  const handleSubmit = async () => {
    if (!scoreValid) {
      setError(lang === 'he' ? 'יש להזין ציון בין 0 ל-100' : 'Enter a grade between 0 and 100');
      return;
    }
    if (!reasonValid) {
      setError(lang === 'he' ? 'יש לפרט את הסיבה לשינוי' : 'A reason for the change is required');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await apiClient.submitMilestoneGrade(milestoneId, {
        givenScore: Number(score),
        projectId,
        reason: reason.trim(),
      });
      onUpdated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : lang === 'he' ? 'שגיאה בעדכון הציון' : 'Failed to update grade');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-sm overflow-y-auto rounded-[var(--radius)] bg-surface p-6 shadow-lg">
        <div className="flex items-start justify-between">
          <h2 className="text-lg font-semibold text-ink">{lang === 'he' ? 'עדכון ציון' : 'Update Grade'}</h2>
          <button type="button" onClick={onClose} className="text-muted hover:text-ink">
            ✕
          </button>
        </div>

        <p className="mt-1 text-xs text-muted">
          {MILESTONE_LABEL[milestoneType]?.[lang] ?? milestoneType}
        </p>

        <label className="mt-4 block">
          <span className="mb-1.5 block text-sm font-medium text-ink">{lang === 'he' ? 'ציון חדש (0–100)' : 'New grade (0–100)'}</span>
          <input
            type="number"
            min={0}
            max={100}
            value={score}
            onChange={(e) => setScore(clampScore(e.target.value))}
            className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink focus:border-primary focus:bg-surface focus:outline-none"
          />
        </label>

        <label className="mt-4 block">
          <span className="mb-1.5 block text-sm font-medium text-ink">{lang === 'he' ? 'סיבת השינוי' : 'Reason for the change'}</span>
          <textarea
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={lang === 'he' ? 'חובה לפרט מדוע הציון מתעדכן' : 'Required — explain why the grade is being updated'}
            className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink focus:border-primary focus:bg-surface focus:outline-none"
          />
        </label>

        <p className="mt-2 text-xs text-muted">
          {lang === 'he'
            ? 'הסטודנט יקבל התראה על עדכון הציון וסיבת השינוי.'
            : 'The student will be notified that their grade changed and why.'}
        </p>

        {error && <p className="mt-3 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className="mt-4 w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-ink hover:bg-primary-hover disabled:opacity-60"
        >
          {submitting ? '…' : lang === 'he' ? 'עדכן ציון' : 'Update Grade'}
        </button>
      </div>
    </div>
  );
}
