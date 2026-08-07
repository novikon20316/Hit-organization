'use client';

// app/coordinator/home/ApproveMilestoneModal.tsx
// Optional-comment counterpart to RejectMilestoneModal.tsx — approval never
// requires a reason, but the coordinator can leave one (e.g. "approved
// provided the bibliography section is expanded before the defense") since
// the milestone approval flow itself stays binary. See
// coordinatorController.ts's coordinatorApproveMilestone.

import { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';

interface ApproveMilestoneModalProps {
  open: boolean;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (comment: string) => void;
}

export function ApproveMilestoneModal({ open, busy, onCancel, onConfirm }: ApproveMilestoneModalProps) {
  const { lang } = useLanguage();
  const [comment, setComment] = useState('');

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-[var(--radius)] bg-surface p-5 shadow-lg">
        <h2 className="text-base font-semibold text-ink">{lang === 'he' ? 'אישור אבן דרך' : 'Approve Milestone'}</h2>
        <p className="mt-1 text-sm text-muted">
          {lang === 'he'
            ? 'ניתן להוסיף הערה אופציונלית — למשל אישור בתנאי. היא תישלח לסטודנט ולמנחה.'
            : "Optionally add a comment — e.g. a conditional approval. It'll be sent to the student and supervisor."}
        </p>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={3}
          className="mt-3 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink focus:border-primary focus:bg-surface focus:outline-none"
          placeholder={lang === 'he' ? 'הערה (אופציונלי)...' : 'Comment (optional)...'}
        />
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              setComment('');
              onCancel();
            }}
            disabled={busy}
            className="rounded-lg border border-line px-3.5 py-2 text-sm font-medium text-ink hover:bg-paper"
          >
            {lang === 'he' ? 'ביטול' : 'Cancel'}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onConfirm(comment.trim())}
            className="rounded-lg bg-success px-3.5 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
          >
            {busy ? '…' : lang === 'he' ? 'אשר' : 'Approve'}
          </button>
        </div>
      </div>
    </div>
  );
}
