'use client';

// app/coordinator/home/RejectMilestoneModal.tsx
import { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';

interface RejectMilestoneModalProps {
  open: boolean;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}

export function RejectMilestoneModal({ open, busy, onCancel, onConfirm }: RejectMilestoneModalProps) {
  const { lang } = useLanguage();
  const [reason, setReason] = useState('');

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-[var(--radius)] bg-surface p-5 shadow-lg">
        <h2 className="text-base font-semibold text-ink">{lang === 'he' ? 'דחיית אבן דרך' : 'Reject Milestone'}</h2>
        <p className="mt-1 text-sm text-muted">
          {lang === 'he' ? 'יש לציין סיבה — היא תישלח לסטודנט ולמנחה.' : 'A reason is required — it will be sent to the student and supervisor.'}
        </p>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          className="mt-3 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink focus:border-primary focus:bg-surface focus:outline-none"
          placeholder={lang === 'he' ? 'סיבת הדחייה...' : 'Reason for rejection...'}
        />
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              setReason('');
              onCancel();
            }}
            disabled={busy}
            className="rounded-lg border border-line px-3.5 py-2 text-sm font-medium text-ink hover:bg-paper"
          >
            {lang === 'he' ? 'ביטול' : 'Cancel'}
          </button>
          <button
            type="button"
            disabled={busy || !reason.trim()}
            onClick={() => onConfirm(reason.trim())}
            className="rounded-lg bg-danger px-3.5 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
          >
            {busy ? '…' : lang === 'he' ? 'דחה' : 'Reject'}
          </button>
        </div>
      </div>
    </div>
  );
}
