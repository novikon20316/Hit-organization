'use client';

// components/SessionExpiredModal.tsx
// Shown by AuthContext after a period of inactivity (see hooks/useIdleTimer.ts).
// Always bilingual (Hebrew + English together) regardless of the current
// language toggle — the point is to be understood no matter what, right
// before forcing a re-login. Deliberately has no close/X and no backdrop
// click-to-dismiss: the only way out is the OK button.

import { useRef } from 'react';
import { t } from '@/lib/i18n';
import { useModalA11y } from '@/hooks/useModalA11y';

interface SessionExpiredModalProps {
  open: boolean;
  onConfirm: () => void;
}

export function SessionExpiredModal({ open, onConfirm }: SessionExpiredModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  // No-op onClose: this modal is deliberately un-dismissable except via the
  // OK button (see comment above) — Escape shouldn't bypass that, so we
  // still get the focus trap and focus-restore from the hook without wiring
  // up an actual close behavior.
  useModalA11y(dialogRef, open, () => {});

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <div ref={dialogRef} tabIndex={-1} className="w-full max-w-sm rounded-[var(--radius)] bg-surface p-5 shadow-lg outline-none">
        <h2 className="text-base font-semibold text-ink" dir="rtl">
          {t.sessionExpiredTitle.he}
        </h2>
        <h2 className="mt-1 text-base font-semibold text-ink" dir="ltr">
          {t.sessionExpiredTitle.en}
        </h2>

        <p className="mt-3 text-sm text-muted" dir="rtl">
          {t.sessionExpiredMessage.he}
        </p>
        <p className="mt-2 text-sm text-muted" dir="ltr">
          {t.sessionExpiredMessage.en}
        </p>

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onConfirm}
            autoFocus
            className="rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-ink hover:bg-primary-hover"
          >
            {t.ok.he} / {t.ok.en}
          </button>
        </div>
      </div>
    </div>
  );
}
