'use client';

// app/supervisor/dashboard/RequestErasureModal.tsx
// Replaces the old direct-delete flow — a supervisor can only ask the
// coordinator to erase a project now; see server's services/projectErasure.ts.

import { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/apiClient';
import type { MyProject } from './types';

interface RequestErasureModalProps {
  project: MyProject;
  onClose: () => void;
  onSubmitted: () => void;
}

export function RequestErasureModal({ project, onClose, onSubmitted }: RequestErasureModalProps) {
  const { lang, t } = useLanguage();
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!reason.trim()) {
      setError(lang === 'he' ? 'יש להזין סיבה' : 'A reason is required');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await apiClient.requestProjectErasure(project.id, reason.trim());
      onSubmitted();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : lang === 'he' ? 'שליחת הבקשה נכשלה' : 'Failed to send request');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-sm rounded-[var(--radius)] bg-surface p-5 shadow-lg">
        <h2 className="text-base font-semibold text-ink">{t('requestErasureTitle')}</h2>
        <p className="mt-1 text-sm font-medium text-ink">{lang === 'he' ? project.titleHe : project.titleEn}</p>
        <p className="mt-2 text-sm text-muted">{t('requestErasureMessage')}</p>

        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={t('requestErasureReason')}
          rows={3}
          className="mt-3 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none"
        />
        {error && <p className="mt-2 text-sm text-danger">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-lg border border-line px-3.5 py-2 text-sm font-medium text-ink hover:bg-paper"
          >
            {t('cancel')}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="rounded-lg bg-danger px-3.5 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
          >
            {submitting ? '…' : t('requestErasure')}
          </button>
        </div>
      </div>
    </div>
  );
}
