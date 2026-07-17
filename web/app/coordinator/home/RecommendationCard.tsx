'use client';

// app/coordinator/home/RecommendationCard.tsx
import { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/apiClient';
import type { ExaminerRecommendation } from './types';

interface RecommendationCardProps {
  recommendation: ExaminerRecommendation;
  onChanged: () => void;
}

export function RecommendationCard({ recommendation: rec, onChanged }: RecommendationCardProps) {
  const { lang } = useLanguage();
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const handleApprove = async () => {
    setBusy(true);
    setError('');
    try {
      await apiClient.approveExaminerRecommendation(rec.id);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve');
    } finally {
      setBusy(false);
    }
  };

  const handleReject = async () => {
    setBusy(true);
    setError('');
    try {
      await apiClient.rejectExaminerRecommendation(rec.id);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reject');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-[var(--radius)] border border-line bg-surface p-4">
      <button type="button" onClick={() => setExpanded((v) => !v)} className="w-full text-start">
        <p className="text-sm font-semibold text-ink">{lang === 'he' ? rec.projectTitleHe : rec.projectTitleEn}</p>
        <p className="mt-0.5 text-xs text-muted">
          👨‍🏫 {lang === 'he' ? 'מנחה:' : 'Supervisor:'} {rec.supervisorName}
        </p>
        <p className="mt-0.5 text-xs text-muted">
          👥 {rec.recommendedExaminers?.length ?? 0} {lang === 'he' ? 'בוחנים הומלצו' : 'examiners recommended'}
        </p>
      </button>

      {expanded && (
        <div className="mt-3 grid gap-2 border-t border-line pt-3">
          {(rec.recommendedExaminers ?? []).map((ex, i) => (
            <div key={i} className="rounded-lg bg-paper p-2.5">
              <p className="text-xs font-semibold text-ink">
                {lang === 'he' ? `עדיפות ${ex.priority}` : `Priority ${ex.priority}`} ·{' '}
                {ex.type === 'internal' ? (lang === 'he' ? 'בוחן פנימי' : 'Internal Examiner') : lang === 'he' ? 'בוחן חיצוני' : 'External Examiner'}
              </p>
              <p className="text-xs text-muted">👤 {ex.name}</p>
              {ex.email && <p className="text-xs text-muted" dir="ltr">✉️ {ex.email}</p>}
              {ex.institution && <p className="text-xs text-muted">🏛 {ex.institution}</p>}
              {ex.expertise && <p className="text-xs text-muted">🔬 {ex.expertise}</p>}
            </div>
          ))}

          {error && <p className="rounded-md bg-danger-bg px-2.5 py-1.5 text-xs text-danger">{error}</p>}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleApprove}
              disabled={busy}
              className="flex-1 rounded-lg bg-success px-3 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60"
            >
              {busy ? '…' : lang === 'he' ? '✅ אשר המלצה' : '✅ Approve'}
            </button>
            <button
              type="button"
              onClick={handleReject}
              disabled={busy}
              className="flex-1 rounded-lg border border-danger px-3 py-2 text-xs font-semibold text-danger hover:bg-danger-bg disabled:opacity-60"
            >
              {busy ? '…' : lang === 'he' ? '❌ דחה' : '❌ Reject'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
