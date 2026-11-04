'use client';

// app/coordinator/home/ReserveDateModal.tsx
// The coordinator fixes the defense date herself instead of waiting for the
// examiners' candidate dates (which still work as before). Leaves the defense
// at 'defense_date_set' — the card then offers the usual time/place step. See
// apiClient.reserveDefenseDate and services/defenseScheduling.ts's
// reserveDefenseDate for which defenses this is allowed on.

import { useRef, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/apiClient';
import { useModalA11y } from '@/hooks/useModalA11y';

interface ReserveDateModalProps {
  milestoneId: string;
  projectTitle: string;
  /** True when examiners were already asked for dates — this replaces that. */
  overridesExaminerDates: boolean;
  onClose: () => void;
  onReserved: () => void;
}

function todayISO(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function ReserveDateModal({ milestoneId, projectTitle, overridesExaminerDates, onClose, onReserved }: ReserveDateModalProps) {
  const { lang } = useLanguage();
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalA11y(dialogRef, true, onClose);

  const [date, setDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState('');

  const submit = async () => {
    setError('');
    if (!date) {
      setError(lang === 'he' ? 'יש לבחור תאריך' : 'Please pick a date');
      return;
    }
    // Same rule the server enforces (Sunday-Thursday) — caught here for a faster message.
    const day = new Date(`${date}T12:00:00`).getDay();
    if (day === 5 || day === 6) {
      setError(lang === 'he' ? 'הגנות מתקיימות בימים א׳–ה׳ בלבד — יש לבחור יום אחר.' : 'Defenses run Sunday to Thursday — please pick another day.');
      return;
    }
    setSaving(true);
    try {
      await apiClient.reserveDefenseDate(milestoneId, date);
      const [y, m, d] = date.split('-');
      setResult(lang === 'he' ? `✅ מועד ההגנה שוריין: ${d}/${m}/${y}` : `✅ Defense date reserved: ${d}/${m}/${y}`);
      setTimeout(onReserved, 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : lang === 'he' ? 'שריון המועד נכשל' : 'Failed to reserve the date');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center-safe justify-center overflow-y-auto bg-black/40 p-4">
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-coordinator-lg bg-coordinator-surface-container-lowest p-6 shadow-lg outline-none"
      >
        <h2 className="text-lg font-semibold text-coordinator-on-surface">📅 {lang === 'he' ? 'שריון מועד הגנה' : 'Reserve defense date'}</h2>
        <p className="mt-1 text-sm text-coordinator-on-surface-variant">{projectTitle}</p>
        <p className="mt-3 text-sm text-coordinator-on-surface-variant">
          {lang === 'he'
            ? 'המועד יישלח לסטודנט, למנחה ולבוחנים. אחרי השריון ניתן לקבוע שעה, מקום ואופן הגנה, ולשבץ בוחנים אם טרם שובצו.'
            : 'The student, supervisor and examiners are notified. Afterwards you can set the time, place and format, and assign examiners if you have not yet.'}
        </p>
        {overridesExaminerDates && (
          <p className="mt-2 rounded-md px-3 py-2 text-xs" style={{ backgroundColor: 'var(--warning-bg, #FEF3C7)', color: 'var(--warning, #92400E)' }}>
            {lang === 'he'
              ? 'הבוחנים כבר התבקשו להגיש תאריכים — השריון מחליף את תהליך התיאום ביניהם.'
              : 'The examiners were already asked for dates — reserving replaces that matching.'}
          </p>
        )}

        <label className="mt-4 block text-sm font-medium text-coordinator-on-surface" htmlFor="reserve-defense-date">
          {lang === 'he' ? 'תאריך ההגנה' : 'Defense date'}
        </label>
        <input
          id="reserve-defense-date"
          type="date"
          min={todayISO()}
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="mt-1 w-full rounded-lg border border-coordinator-outline-variant bg-coordinator-surface-container-low px-3 py-2 text-sm text-coordinator-on-surface focus:border-coordinator-primary focus:bg-coordinator-surface-container-lowest focus:outline-none"
        />

        {result && <p className="mt-4 rounded-md bg-success-bg px-3 py-2 text-sm text-success" role="status">{result}</p>}
        {error && <p className="mt-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">{error}</p>}

        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-coordinator-outline-variant px-3.5 py-2 text-sm font-medium text-coordinator-on-surface hover:bg-coordinator-surface-container-low">
            {lang === 'he' ? 'ביטול' : 'Cancel'}
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving || !!result}
            className="rounded-lg bg-coordinator-primary px-3.5 py-2 text-sm font-semibold text-coordinator-on-primary hover:bg-coordinator-primary-container disabled:opacity-60"
          >
            {saving ? '…' : lang === 'he' ? 'שריין מועד' : 'Reserve date'}
          </button>
        </div>
      </div>
    </div>
  );
}
