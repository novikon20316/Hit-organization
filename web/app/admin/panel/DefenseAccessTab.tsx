'use client';

// app/admin/panel/DefenseAccessTab.tsx
// Ported from the `activeTab === 'defenseAccess'` section of mobile's
// panel.tsx — external examiners' defense-day access windows. Mobile only
// ever listed 'expired' grants (the only ones needing a recovery
// extension); this adds an active/expired filter so system_admin can also
// see who currently has a live window, while still only offering the
// extend action on expired grants — the server rejects extending one that
// hasn't expired yet (see extendDefenseAccessGrant in adminController.ts).

import { useCallback, useEffect, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/apiClient';
import type { DefenseAccessGrant } from './types';

export function DefenseAccessTab() {
  const { lang } = useLanguage();
  const [statusFilter, setStatusFilter] = useState<'expired' | 'active'>('expired');
  const [grants, setGrants] = useState<DefenseAccessGrant[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [extendingCode, setExtendingCode] = useState<string | null>(null);
  const [newDate, setNewDate] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const fetchGrants = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await apiClient.listDefenseAccessGrants(statusFilter);
      setGrants(res.grants ?? []);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : lang === 'he' ? 'טעינת הגישות נכשלה' : 'Failed to load access grants');
    } finally {
      setLoading(false);
    }
  }, [lang, statusFilter]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount/filter-change; fetchGrants' setState calls happen after its awaited network call resolves, not synchronously in this effect
    fetchGrants();
  }, [fetchGrants]);

  const handleExtend = async (code: string) => {
    setSubmitError('');
    const parsed = new Date(newDate.trim());
    if (!newDate.trim() || isNaN(parsed.getTime())) {
      setSubmitError(lang === 'he' ? 'תאריך לא תקין' : 'Invalid date');
      return;
    }
    setSubmitting(true);
    try {
      await apiClient.extendDefenseAccessGrant(code, { newExpiresAtISO: parsed.toISOString(), reason: reason.trim() || undefined });
      setExtendingCode(null);
      setNewDate('');
      setReason('');
      setGrants((prev) => prev.filter((g) => g.code !== code));
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : lang === 'he' ? 'הארכת הגישה נכשלה' : 'Failed to extend access');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <p className="mb-4 text-sm text-muted">
        {lang === 'he' ? 'גישת בוחנים חיצוניים ליום ההגנה' : "External examiners' defense-day access"}
      </p>

      <div className="mb-4 flex gap-1 border-b border-line">
        {(['expired', 'active'] as const).map((st) => (
          <button
            key={st}
            type="button"
            onClick={() => setStatusFilter(st)}
            className={`border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
              statusFilter === st ? 'border-primary text-primary' : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            {st === 'expired' ? (lang === 'he' ? 'פג תוקף' : 'Expired') : lang === 'he' ? 'פעיל' : 'Active'}
          </button>
        ))}
      </div>

      {loadError && <p className="mb-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{loadError}</p>}

      {loading ? (
        <p className="text-sm text-muted">…</p>
      ) : grants.length === 0 ? (
        <p className="text-sm text-muted">
          {statusFilter === 'expired'
            ? lang === 'he'
              ? 'אין בקשות הארכה ממתינות'
              : 'No pending extension requests'
            : lang === 'he'
              ? 'אין גישות פעילות כרגע'
              : 'No active access grants right now'}
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {grants.map((g) => (
            <div key={g.code} className="rounded-[var(--radius)] border border-line bg-surface p-4">
              <p className="text-sm font-semibold text-ink">{g.examinerName}</p>
              <p className="mt-1 text-xs text-muted" dir="ltr">
                📧 {g.examinerEmail}
              </p>
              <p className="mt-1 text-xs text-muted">
                📅 {lang === 'he' ? 'תאריך הגנה:' : 'Defense date:'} {g.defenseDateISO}
              </p>

              {statusFilter !== 'expired' ? null : extendingCode === g.code ? (
                <div className="mt-3 grid gap-2">
                  <input
                    type="datetime-local"
                    value={newDate}
                    onChange={(e) => setNewDate(e.target.value)}
                    className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink focus:border-primary focus:bg-surface focus:outline-none"
                  />
                  <input
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder={lang === 'he' ? 'סיבה (אופציונלי)' : 'Reason (optional)'}
                    className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink focus:border-primary focus:bg-surface focus:outline-none"
                  />
                  {submitError && <p className="rounded-md bg-danger-bg px-2.5 py-1.5 text-xs text-danger">{submitError}</p>}
                  <button
                    type="button"
                    onClick={() => handleExtend(g.code)}
                    disabled={submitting}
                    className="rounded-lg bg-primary py-2 text-sm font-semibold text-primary-ink hover:bg-primary-hover disabled:opacity-60"
                  >
                    {submitting ? '…' : lang === 'he' ? 'אשר הארכה' : 'Confirm extension'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setExtendingCode(null);
                      setSubmitError('');
                    }}
                    className="text-xs text-muted hover:underline"
                  >
                    {lang === 'he' ? 'ביטול' : 'Cancel'}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setExtendingCode(g.code);
                    setNewDate('');
                    setReason('');
                    setSubmitError('');
                  }}
                  className="mt-3 w-full rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink hover:border-primary hover:text-primary"
                >
                  🔓 {lang === 'he' ? 'הארך גישה' : 'Extend access'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
