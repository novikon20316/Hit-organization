'use client';

// components/DraftNotice.tsx
// E3 — the one line under an examiner form that says its unsent draft was
// restored (with a way to start over) and whether autosave is keeping up.
// See hooks/useServerDraft.ts.

import type { DraftStatus } from '@/hooks/useServerDraft';

interface Props {
  he: boolean;
  restoredAt: string | null;
  status: DraftStatus;
  onDiscard: () => void;
}

export function DraftNotice({ he, restoredAt, status, onDiscard }: Props) {
  if (!restoredAt && status === 'idle') return null;
  const when = restoredAt
    ? new Date(restoredAt).toLocaleString(he ? 'he-IL' : 'en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    : '';
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted" role="status" aria-live="polite">
      {restoredAt && (
        <>
          <span>{he ? `שוחזרה טיוטה שלא נשלחה (${when}).` : `Restored your unsent draft (${when}).`}</span>
          <button type="button" onClick={onDiscard} className="font-semibold text-primary underline">
            {he ? 'התחל/י מחדש' : 'Start over'}
          </button>
        </>
      )}
      {status === 'saving' && <span>{he ? 'שומר טיוטה…' : 'Saving draft…'}</span>}
      {status === 'saved' && <span>{he ? 'הטיוטה נשמרה — רק את/ה רואה אותה.' : 'Draft saved — only you can see it.'}</span>}
      {status === 'error' && <span className="text-danger">{he ? 'שמירת הטיוטה נכשלה; התוכן עדיין כאן.' : 'Could not save the draft; your text is still here.'}</span>}
    </div>
  );
}
