'use client';

// app/examiner-access/DefenseDateSection.tsx
// Defense date submission — a SEPARATE concern from the thesis review/opinion
// flow (see server/src/services/defenseScheduling.ts). Routed through the
// public examiner-access API (not direct Firestore writes) since it requires
// reconciling both examiners' submissions atomically. Self-contained: loads
// its own status on mount and renders nothing once it learns the window
// isn't open ('not_open'), so the parent page just mounts it unconditionally
// once the token is 'accepted'.

import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '@/lib/apiClient';
import { useLanguage } from '@/contexts/LanguageContext';
import type { DefenseDateStatus } from './types';

interface DefenseDateSectionProps {
  token: string;
}

export function DefenseDateSection({ token }: DefenseDateSectionProps) {
  const { t } = useLanguage();

  const [status, setStatus] = useState<DefenseDateStatus>('not_open');
  const [loaded, setLoaded] = useState(false);
  const [dateWindow, setDateWindow] = useState<{ start: string; end: string } | null>(null);
  const [matchedDate, setMatchedDate] = useState<string | null>(null);
  // Dates picked so far (chips), plus whatever's currently selected in the
  // native date input but not yet added to the list.
  const [pickedDates, setPickedDates] = useState<string[]>([]);
  const [dateInput, setDateInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  // A failed initial load previously left `status` stuck at its 'not_open'
  // default, which this component then correctly (per its own logic)
  // rendered as nothing at all — a network blip, a slow cold-start, or the
  // OTP session having just expired all looked identical to "there's
  // nothing to submit," with no error and no way to retry short of
  // reloading the whole page. Track it separately so a genuine failure is
  // visible and retryable instead of silently indistinguishable from
  // "not open yet."
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const res = await apiClient.getExaminerAccessDefenseDateStatus(token);
      setStatus(res.status);
      if (res.windowStart && res.windowEnd) setDateWindow({ start: res.windowStart, end: res.windowEnd });
      if (res.matchedDate) setMatchedDate(res.matchedDate);
    } catch (e) {
      console.error('examiner-access: defense-date status load error', e);
      setLoadError(true);
    } finally {
      setLoaded(true);
    }
  }, [token]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot load on mount; load()'s setState calls happen after its awaited network call resolves, not synchronously in this effect
    load();
  }, [load]);

  // Mirrors the server's own validateCandidateDates (defenseScheduling.ts) —
  // deliberately duplicated rather than trusted-away, so a rejected date is
  // explained the moment it's picked, in the examiner's own selected
  // language, instead of only surfacing as a raw English string from the
  // server after a round-trip on Submit (e.g. "Date 2026-09-05 falls on a
  // weekend..." shown verbatim regardless of whether the page was in
  // Hebrew). The server re-validates independently regardless — this is
  // purely a client-side UX improvement, not the source of truth.
  const validatePickedDate = (raw: string): string | null => {
    const d = new Date(`${raw}T00:00:00`);
    if (isNaN(d.getTime())) return t('examinerDefenseDateInvalidFormat');
    const day = d.getDay(); // 0=Sun .. 6=Sat
    if (day === 5 || day === 6) return t('examinerDefenseDateWeekendError');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (d < today) return t('examinerDefenseDatePastError');
    if (dateWindow?.start && raw < dateWindow.start) return t('examinerDefenseDateOutsideWindowError');
    if (dateWindow?.end && raw > dateWindow.end) return t('examinerDefenseDateOutsideWindowError');
    return null;
  };

  const addPickedDate = () => {
    if (!dateInput) return;
    const validationError = validatePickedDate(dateInput);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError('');
    setPickedDates((prev) => (prev.includes(dateInput) ? prev : [...prev, dateInput].sort()));
    setDateInput('');
  };
  const removePickedDate = (d: string) => setPickedDates((prev) => prev.filter((x) => x !== d));

  const handleSubmit = async () => {
    if (pickedDates.length === 0) {
      setError(t('examinerDefenseDateEmpty'));
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      const res = await apiClient.submitExaminerAccessDefenseDates(token, pickedDates);
      if (res.matched) {
        setStatus('matched');
        setMatchedDate(res.matchedDate ?? null);
      } else if (res.conflict) {
        setStatus('conflict');
      } else {
        setStatus('awaiting_other_examiners');
      }
    } catch (e) {
      // Deliberately NOT displaying e.message — that's the server's raw,
      // always-English validation text (see validatePickedDate's own
      // comment above for why), which would silently defeat the whole
      // point of this section respecting the examiner's language. The
      // cases that message would normally explain (weekend, past, outside
      // window) are now caught client-side before ever reaching the
      // server, so a rejection here is almost always something generic
      // (network, session expired) that this covers fine.
      console.error('examiner-access: submit defense dates error', e);
      setError(t('examinerDefenseDateSubmitError'));
    } finally {
      setSubmitting(false);
    }
  };

  if (!loaded) return null;

  if (loadError) {
    return (
      <div className="mt-5 rounded-[var(--radius)] border border-line bg-surface p-4 text-start shadow-sm">
        <p className="text-sm text-danger" role="alert">
          {t('examinerDefenseDateLoadError')}
        </p>
        <button
          type="button"
          onClick={load}
          className="mt-2 rounded-lg border border-line px-3.5 py-2 text-sm font-medium text-ink hover:bg-paper"
        >
          {t('examinerDefenseDateRetry')}
        </button>
      </div>
    );
  }

  if (status === 'not_open') return null;

  return (
    <div className="mt-5 rounded-[var(--radius)] border border-line bg-surface p-4 text-start shadow-sm">
      <h2 className="text-base font-semibold text-ink">📅 {t('examinerDefenseDateSectionTitle')}</h2>

      {status === 'awaiting_your_dates' && (
        <>
          <p className="mt-2 text-sm text-muted">{t('examinerDefenseDateGuidance')}</p>
          {dateWindow && (
            <p className="mt-2 text-sm text-muted">
              {t('examinerDefenseDateWithin')} {dateWindow.start} – {dateWindow.end} · {t('examinerDefenseDateSunThu')}
            </p>
          )}

          {pickedDates.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {pickedDates.map((d) => (
                <span key={d} className="flex items-center gap-1 rounded-full bg-paper px-2.5 py-1 text-sm font-medium text-ink">
                  {d}
                  <button type="button" onClick={() => removePickedDate(d)} aria-label={t('examinerDefenseDateRemove')} className="text-muted hover:text-danger">
                    ✕
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="mt-3 flex gap-1.5">
            <input
              type="date"
              dir="ltr"
              value={dateInput}
              onChange={(e) => setDateInput(e.target.value)}
              min={dateWindow?.start}
              max={dateWindow?.end}
              className="flex-1 rounded-lg border border-line bg-paper px-3.5 py-2.5 text-sm text-ink focus:border-primary focus:bg-surface focus:outline-none"
            />
            <button
              type="button"
              onClick={addPickedDate}
              disabled={!dateInput}
              className="rounded-lg border border-primary px-3.5 py-2.5 text-sm font-semibold text-primary hover:bg-paper disabled:opacity-50"
            >
              + {t('examinerDefenseDateAddBtn')}
            </button>
          </div>

          {!!error && <p className="mt-2 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">{error}</p>}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="mt-3 w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-ink hover:bg-primary-hover disabled:opacity-60"
          >
            {submitting ? '…' : t('examinerDefenseDateSubmitBtn')}
          </button>
        </>
      )}

      {status === 'awaiting_other_examiners' && <p className="mt-2 text-sm text-muted">{t('examinerDefenseDateWaiting')}</p>}

      {status === 'matched' && (
        <p className="mt-2 text-sm font-semibold text-success" role="status">
          ✅ {t('examinerDefenseDateMatched')} {matchedDate}
        </p>
      )}

      {status === 'conflict' && <p className="mt-2 text-sm font-semibold text-danger" role="alert">⚠️ {t('examinerDefenseDateConflict')}</p>}
    </div>
  );
}
