'use client';

// components/ExaminerOpinionFormModal.tsx
// ExaminerOpinionForm in a dialog — for internal examiners, the supervisor
// and the administrative coordinator (external examiners get the form
// inline on their access page instead).

import { useMemo, useRef } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useModalA11y } from '@/hooks/useModalA11y';
import { ExaminerOpinionForm, internalOpinionSource } from './ExaminerOpinionForm';

export function ExaminerOpinionFormModal({ milestoneId, onClose, onChanged }: { milestoneId: string; onClose: () => void; onChanged?: () => void }) {
  const { lang } = useLanguage();
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalA11y(dialogRef, true, onClose);
  const source = useMemo(() => internalOpinionSource(milestoneId), [milestoneId]);
  return (
    <div className="fixed inset-0 z-50 flex items-center-safe justify-center overflow-y-auto bg-black/40 p-2 sm:p-4">
      <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={lang === 'he' ? 'טופס בוחן' : 'Examiner form'} className="relative max-h-[95vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-paper p-4 shadow-lg outline-none sm:p-6">
        <button type="button" onClick={onClose} aria-label={lang === 'he' ? 'סגור' : 'Close'} className="absolute end-4 top-4 text-muted hover:text-ink">✕</button>
        <ExaminerOpinionForm source={source} onChanged={onChanged} />
      </div>
    </div>
  );
}
