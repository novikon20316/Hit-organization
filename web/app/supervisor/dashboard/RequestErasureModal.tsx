'use client';

// app/supervisor/dashboard/RequestErasureModal.tsx
// Replaces the old direct-delete flow — a supervisor can only ask the
// coordinator to erase a project now; see server's services/projectErasure.ts.

import { useRef, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/apiClient';
import { useModalA11y } from '@/hooks/useModalA11y';
import type { MyProject } from './types';

interface RequestErasureModalProps {
  project: MyProject;
  onClose: () => void;
  onSubmitted: () => void;
}

export function RequestErasureModal({ project, onClose, onSubmitted }: RequestErasureModalProps) {
  const { lang, t } = useLanguage();
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalA11y(dialogRef, true, onClose);
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        className="w-full max-w-sm rounded-supervisor bg-supervisor-surface-container-lowest p-5 shadow-lg outline-none"
      >
        <h2 className="text-base font-semibold text-supervisor-on-surface">{t('requestErasureTitle')}</h2>
        <p className="mt-1 text-sm font-medium text-supervisor-on-surface">{lang === 'he' ? project.titleHe : project.titleEn}</p>
        <p className="mt-2 text-sm text-supervisor-on-surface-variant">{t('requestErasureMessage')}</p>

        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={t('requestErasureReason')}
          rows={3}
          className="mt-3 w-full rounded-lg border border-supervisor-outline-variant bg-supervisor-surface-container-low px-3 py-2 text-sm text-supervisor-on-surface focus:border-supervisor-primary focus:outline-none"
        />
        {error && <p className="mt-2 text-sm text-danger">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-lg border border-supervisor-outline-variant px-3.5 py-2 text-sm font-medium text-supervisor-on-surface hover:bg-supervisor-surface-container-low"
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
