'use client';

// components/ClockPauseControl.tsx
// Pause/resume a project's deadline clock for leave, reserve duty,
// maternity/paternity, or illness (P1 backlog item #7). Self-contained —
// fetches its own state via apiClient.getClockPauseState, independent of
// whatever dashboard payload the parent card came from.

import { useEffect, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient, type ClockPause, type ClockPauseReason } from '@/lib/apiClient';

const REASON_LABEL: Record<ClockPauseReason, { he: string; en: string }> = {
  reserve_duty: { he: 'מילואים', en: 'Reserve duty' },
  illness: { he: 'מחלה', en: 'Illness' },
  maternity_paternity: { he: 'חופשת לידה', en: 'Maternity/paternity leave' },
  other: { he: 'אחר', en: 'Other' },
};

export function ClockPauseControl({ projectId }: { projectId: string }) {
  const { lang } = useLanguage();
  const [activePause, setActivePause] = useState<ClockPause | null>(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [reason, setReason] = useState<ClockPauseReason>('reserve_duty');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    apiClient.getClockPauseState(projectId)
      .then((res) => setActivePause(res.activeClockPause))
      .catch((err) => console.error('Failed to load clock-pause state:', err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (projectId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load is a stable closure over projectId, re-created each render but not a dep issue here
  }, [projectId]);

  const handlePause = async () => {
    setSaving(true);
    setError('');
    try {
      await apiClient.pauseProjectClock(projectId, reason, note.trim() || undefined);
      setShowModal(false);
      setNote('');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : lang === 'he' ? 'השהיית השעון נכשלה' : 'Failed to pause the clock');
    } finally {
      setSaving(false);
    }
  };

  const handleResume = async () => {
    setSaving(true);
    setError('');
    try {
      await apiClient.resumeProjectClock(projectId);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : lang === 'he' ? 'המשך השעון נכשל' : 'Failed to resume the clock');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return null;

  return (
    <div className="mt-2">
      {activePause ? (
        <div className="flex items-center justify-between gap-2 rounded-md bg-danger-bg px-2.5 py-1.5">
          <span className="text-xs font-medium text-danger">
            ⏸ {lang === 'he' ? 'שעון מוקפא:' : 'Clock paused:'} {REASON_LABEL[activePause.reason]?.[lang] ?? activePause.reason}
          </span>
          <button
            type="button"
            onClick={handleResume}
            disabled={saving}
            className="rounded-md border border-danger px-2 py-0.5 text-xs font-medium text-danger disabled:opacity-50"
          >
            {lang === 'he' ? 'המשך' : 'Resume'}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowModal(true)}
          className="text-xs font-medium text-muted underline hover:text-ink"
        >
          ⏸ {lang === 'he' ? 'הקפא שעון (חופשה/מילואים/מחלה)' : 'Pause clock (leave/reserve/illness)'}
        </button>
      )}

      {error && <p className="mt-1 text-xs text-danger">{error}</p>}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowModal(false)}>
          <div
            className="w-full max-w-sm rounded-[var(--radius)] border border-line bg-surface p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm font-semibold text-ink">
              {lang === 'he' ? 'הקפאת שעון היעדים' : 'Pause the deadline clock'}
            </p>
            <label className="mt-3 block text-xs font-medium text-muted">
              {lang === 'he' ? 'סיבה' : 'Reason'}
            </label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value as ClockPauseReason)}
              className="mt-1 w-full rounded-md border border-line bg-paper px-2.5 py-1.5 text-sm text-ink"
            >
              {(Object.keys(REASON_LABEL) as ClockPauseReason[]).map((r) => (
                <option key={r} value={r}>{REASON_LABEL[r][lang]}</option>
              ))}
            </select>
            <label className="mt-3 block text-xs font-medium text-muted">
              {lang === 'he' ? 'הערה (אופציונלי)' : 'Note (optional)'}
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-md border border-line bg-paper px-2.5 py-1.5 text-sm text-ink"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setShowModal(false)} className="rounded-md border border-line px-3 py-1.5 text-sm text-ink">
                {lang === 'he' ? 'ביטול' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={handlePause}
                disabled={saving}
                className="rounded-md bg-danger px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
              >
                {lang === 'he' ? 'הקפא' : 'Pause'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
