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
import { usePolledDefenseScheduleRefresh } from '@/hooks/usePolledDefenseScheduleRefresh';
import { apiClient } from '@/lib/apiClient';
import { useLanguage } from '@/contexts/LanguageContext';
import { AvailabilityCalendar } from '@/components/AvailabilityCalendar';
import type { DefenseDateStatus } from './types';

interface DefenseDateSectionProps {
  token: string;
}

export function DefenseDateSection({ token }: DefenseDateSectionProps) {
  const { t, lang } = useLanguage();

  const [status, setStatus] = useState<DefenseDateStatus>('not_open');
  const [loaded, setLoaded] = useState(false);
  const [dateWindow, setDateWindow] = useState<{ start: string; end: string } | null>(null);
  const [matchedDate, setMatchedDate] = useState<string | null>(null);
  // Dates picked so far (chips), plus whatever's currently selected in the
  // native date input but not yet added to the list.
  const [pickedDates, setPickedDates] = useState<string[]>([]);
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

  // `silent` — a background live refresh: a failure keeps what's on screen.
  const load = useCallback(async (silent = false) => {
    if (!silent) setLoadError(false);
    try {
      const res = await apiClient.getExaminerAccessDefenseDateStatus(token);
      setStatus(res.status);
      if (res.windowStart && res.windowEnd) setDateWindow({ start: res.windowStart, end: res.windowEnd });
      if (res.matchedDate) setMatchedDate(res.matchedDate);
      setLoadError(false);
    } catch (e) {
      if (!silent) setLoadError(true);
    } finally {
      setLoaded(true);
    }
  }, [token]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot load on mount; load()'s setState calls happen after its awaited network call resolves, not synchronously in this effect
    load();
  }, [load]);

  // The other examiners submitting their dates / the coordinator resolving a
  // conflict shows up without a reload — see hooks/usePolledDefenseScheduleRefresh.ts.
  usePolledDefenseScheduleRefresh(() => load(true));

  const handleSubmit = async () => {
    // AvailabilityCalendar only offers days the server's
    // validateCandidateDates accepts (Sun–Thu, not past, inside the window);
    // the server still re-validates.
    const datesToSubmit = pickedDates;
    if (datesToSubmit.length === 0) {
      setError(t('examinerDefenseDateEmpty'));
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      const res = await apiClient.submitExaminerAccessDefenseDates(token, datesToSubmit);
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
      // always-English validation text, which would defeat this section
      // respecting the examiner's language. The cases it would normally
      // explain (weekend, past, outside window) can't be picked in the
      // calendar at all, so a rejection here is almost always something
      // generic (network, session expired) that this covers fine.
      setError(t('examinerDefenseDateSubmitError'));
    } finally {
      setSubmitting(false);
    }
  };

  if (!loaded) return null;

  if (loadError) {
    return (
      <div className="mt-5 rounded-examinor-lg border border-examinor-outline-variant bg-examinor-surface-container-lowest p-4 text-start shadow-sm">
        <p className="text-sm text-danger" role="alert">
          {t('examinerDefenseDateLoadError')}
        </p>
        <button
          type="button"
          onClick={() => load()}
          className="mt-2 rounded-lg border border-examinor-outline-variant px-3.5 py-2 text-sm font-medium text-examinor-on-surface hover:bg-examinor-surface-container-low"
        >
          {t('examinerDefenseDateRetry')}
        </button>
      </div>
    );
  }

  if (status === 'not_open') return null;

  return (
    <div className="mt-5 rounded-examinor-lg border border-examinor-outline-variant bg-examinor-surface-container-lowest p-4 text-start shadow-sm">
      <h2 className="text-base font-semibold text-examinor-on-surface">📅 {t('examinerDefenseDateSectionTitle')}</h2>

      {status === 'awaiting_your_dates' && (
        <>
          <p className="mt-2 text-sm text-examinor-on-surface-variant">{t('examinerDefenseDateGuidance')}</p>
          {dateWindow && (
            <p className="mt-2 text-sm text-examinor-on-surface-variant">
              {t('examinerDefenseDateWithin')} {dateWindow.start} – {dateWindow.end} · {t('examinerDefenseDateSunThu')}
            </p>
          )}

          <div className="mt-3">
            <AvailabilityCalendar
              lang={lang}
              windowStart={dateWindow?.start ?? null}
              windowEnd={dateWindow?.end ?? null}
              selected={pickedDates}
              onChange={(dates) => { setPickedDates(dates); setError(''); }}
            />
          </div>

          {!!error && <p className="mt-2 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">{error}</p>}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="mt-3 w-full rounded-lg bg-examinor-primary py-2.5 text-sm font-semibold text-examinor-on-primary hover:bg-examinor-primary-container disabled:opacity-60"
          >
            {submitting ? '…' : t('examinerDefenseDateSubmitBtn')}
          </button>
        </>
      )}

      {status === 'awaiting_other_examiners' && <p className="mt-2 text-sm text-examinor-on-surface-variant">{t('examinerDefenseDateWaiting')}</p>}

      {status === 'matched' && (
        <p className="mt-2 text-sm font-semibold text-success" role="status">
          ✅ {t('examinerDefenseDateMatched')} {matchedDate}
        </p>
      )}

      {status === 'conflict' && <p className="mt-2 text-sm font-semibold text-danger" role="alert">⚠️ {t('examinerDefenseDateConflict')}</p>}
    </div>
  );
}
