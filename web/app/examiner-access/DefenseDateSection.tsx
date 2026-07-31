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
  const [dateDraft, setDateDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await apiClient.getExaminerAccessDefenseDateStatus(token);
      setStatus(res.status);
      if (res.windowStart && res.windowEnd) setDateWindow({ start: res.windowStart, end: res.windowEnd });
      if (res.matchedDate) setMatchedDate(res.matchedDate);
    } catch (e) {
      console.error('examiner-access: defense-date status load error', e);
    } finally {
      setLoaded(true);
    }
  }, [token]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot load on mount; load()'s setState calls happen after its awaited network call resolves, not synchronously in this effect
    load();
  }, [load]);

  const handleSubmit = async () => {
    const raw = dateDraft
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (raw.length === 0 || raw.some((d) => !/^\d{4}-\d{2}-\d{2}$/.test(d))) {
      setError(t('examinerDefenseDateInvalidFormat'));
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      const res = await apiClient.submitExaminerAccessDefenseDates(token, raw);
      if (res.matched) {
        setStatus('matched');
        setMatchedDate(res.matchedDate ?? null);
      } else if (res.conflict) {
        setStatus('conflict');
      } else {
        setStatus('awaiting_other_examiners');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  if (!loaded || status === 'not_open') return null;

  return (
    <div className="mt-5 rounded-[var(--radius)] border border-line bg-surface p-4 text-start shadow-sm">
      <h2 className="text-base font-semibold text-ink">📅 {t('examinerDefenseDateSectionTitle')}</h2>

      {status === 'awaiting_your_dates' && (
        <>
          {dateWindow && (
            <p className="mt-2 text-sm text-muted">
              {t('examinerDefenseDateWithin')} {dateWindow.start} – {dateWindow.end} · {t('examinerDefenseDateSunThu')}
            </p>
          )}
          <input
            type="text"
            dir="ltr"
            value={dateDraft}
            onChange={(e) => setDateDraft(e.target.value)}
            placeholder="YYYY-MM-DD, YYYY-MM-DD"
            className="mt-3 w-full rounded-lg border border-line bg-paper px-3.5 py-2.5 text-sm text-ink focus:border-primary focus:bg-surface focus:outline-none"
          />
          {!!error && <p className="mt-2 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>}
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
        <p className="mt-2 text-sm font-semibold text-success">
          ✅ {t('examinerDefenseDateMatched')} {matchedDate}
        </p>
      )}

      {status === 'conflict' && <p className="mt-2 text-sm font-semibold text-danger">⚠️ {t('examinerDefenseDateConflict')}</p>}
    </div>
  );
}
