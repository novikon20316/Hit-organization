'use client';

// app/supervisor/dashboard/ProposeMeetingModal.tsx
// Lets a supervisor offer 1-5 candidate date/time slots for a meeting with
// an applicant — see server/src/controllers/supervisorController.ts's
// proposeMeeting. The student then picks one (ApplicationStatusCard.tsx on
// their side). Scheduling a meeting never decides the application — Approve/
// Reject stay available on ApplicationCard.tsx throughout.

import { useRef, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/apiClient';
import { useModalA11y } from '@/hooks/useModalA11y';
import type { Application } from './types';

const MAX_SLOTS = 5;

interface ProposeMeetingModalProps {
  application: Application;
  onClose: () => void;
  onProposed: () => void;
}

// datetime-local has no timezone — treat the entered value as local wall-clock
// time and let `new Date(...)` interpret it that way (browsers already do,
// since it lacks a 'Z'/offset suffix), same as every other date input in
// this codebase that stores an ISO string derived from local input.
function toIso(local: string): string | null {
  if (!local) return null;
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function ProposeMeetingModal({ application, onClose, onProposed }: ProposeMeetingModalProps) {
  const { lang, t } = useLanguage();
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalA11y(dialogRef, true, onClose);
  const [slots, setSlots] = useState<string[]>(['']);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const updateSlot = (i: number, value: string) => {
    setSlots((prev) => prev.map((s, idx) => (idx === i ? value : s)));
  };
  const addSlot = () => setSlots((prev) => (prev.length < MAX_SLOTS ? [...prev, ''] : prev));
  const removeSlot = (i: number) => setSlots((prev) => prev.filter((_, idx) => idx !== i));

  const handleSubmit = async () => {
    setError('');
    const isoSlots: string[] = [];
    for (const raw of slots) {
      if (!raw) continue;
      const iso = toIso(raw);
      if (!iso) {
        setError(lang === 'he' ? 'תאריך/שעה לא תקינים' : 'Invalid date/time');
        return;
      }
      if (new Date(iso).getTime() <= Date.now()) {
        setError(lang === 'he' ? 'יש לבחור מועד עתידי' : 'Times must be in the future');
        return;
      }
      isoSlots.push(iso);
    }
    if (isoSlots.length === 0) {
      setError(lang === 'he' ? 'יש להזין לפחות מועד אחד' : 'At least one time is required');
      return;
    }

    setSubmitting(true);
    try {
      await apiClient.proposeMeeting(application.id, isoSlots);
      onProposed();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : lang === 'he' ? 'שליחת ההצעה נכשלה' : 'Failed to send proposal');
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
        <h2 className="text-base font-semibold text-supervisor-on-surface">
          {lang === 'he' ? 'הצע מועדים לפגישה' : 'Propose Meeting Times'}
        </h2>
        <p className="mt-1 text-sm font-medium text-supervisor-on-surface">
          {lang === 'he' ? application.projectTitleHe : application.projectTitleEn}
        </p>
        <p className="mt-1 text-xs text-supervisor-on-surface-variant">{application.studentName}</p>
        <p className="mt-2 text-xs text-supervisor-on-surface-variant">
          {lang === 'he'
            ? 'הצע עד 5 מועדים — הסטודנט/ית יבחר/תבחר אחד מהם.'
            : 'Offer up to 5 times — the student will pick one.'}
        </p>

        <div className="mt-3 grid gap-2">
          {slots.map((slot, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="datetime-local"
                value={slot}
                onChange={(e) => updateSlot(i, e.target.value)}
                className="flex-1 rounded-lg border border-supervisor-outline-variant bg-supervisor-surface-container-low px-3 py-2 text-sm text-supervisor-on-surface focus:border-supervisor-primary focus:outline-none"
              />
              {slots.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeSlot(i)}
                  aria-label={lang === 'he' ? 'הסר מועד' : 'Remove time'}
                  className="rounded-lg border border-supervisor-outline-variant px-2 py-2 text-xs text-supervisor-on-surface-variant hover:bg-supervisor-surface-container-low"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>

        {slots.length < MAX_SLOTS && (
          <button
            type="button"
            onClick={addSlot}
            className="mt-2 text-xs font-medium text-supervisor-primary hover:underline"
          >
            + {lang === 'he' ? 'הוסף מועד נוסף' : 'Add another time'}
          </button>
        )}

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
            className="rounded-lg bg-accent px-3.5 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
          >
            {submitting ? '…' : lang === 'he' ? 'שלח הצעה' : 'Send Proposal'}
          </button>
        </div>
      </div>
    </div>
  );
}
