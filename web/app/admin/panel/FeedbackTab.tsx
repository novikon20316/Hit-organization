'use client';

// app/admin/panel/FeedbackTab.tsx
// Ported from the `activeTab === 'feedback'` section of mobile's panel.tsx —
// real (non-noise) feedback messages, one-way (system_admin reviews/resolves
// here rather than replying in-thread, see server's feedbackController.ts).

import { useCallback, useEffect, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/apiClient';
import type { AdminFeedbackMessage } from './types';

export function FeedbackTab() {
  const { lang } = useLanguage();
  const [statusFilter, setStatusFilter] = useState<'open' | 'resolved'>('open');
  const [messages, setMessages] = useState<AdminFeedbackMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const fetchFeedback = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await apiClient.getAdminFeedback(statusFilter);
      setMessages(res.messages ?? []);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : lang === 'he' ? 'טעינת המשוב נכשלה' : 'Failed to load feedback');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, lang]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount/filter-change; fetchFeedback's setState calls happen after its awaited network call resolves, not synchronously in this effect
    fetchFeedback();
  }, [fetchFeedback]);

  const handleResolve = async (id: string) => {
    setResolvingId(id);
    try {
      await apiClient.resolveFeedback(id);
      setMessages((prev) => prev.filter((m) => m.id !== id));
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to resolve feedback');
    } finally {
      setResolvingId(null);
    }
  };

  return (
    <div>
      <p className="mb-4 text-sm text-muted">
        {lang === 'he'
          ? 'משוב אמיתי שהתקבל מהמשתמשים (חד-כיווני — לא ניתן להשיב בתוך הצ׳אט)'
          : "Real feedback from users (one-way — replies aren't sent back in-thread)"}
      </p>

      <div className="mb-4 flex gap-1 border-b border-line">
        {(['open', 'resolved'] as const).map((st) => (
          <button
            key={st}
            type="button"
            onClick={() => setStatusFilter(st)}
            className={`border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
              statusFilter === st ? 'border-primary text-primary' : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            {st === 'open' ? (lang === 'he' ? 'פתוח' : 'Open') : lang === 'he' ? 'טופל' : 'Resolved'}
          </button>
        ))}
      </div>

      {loadError && <p className="mb-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">{loadError}</p>}

      {loading ? (
        <p className="text-sm text-muted">…</p>
      ) : messages.length === 0 ? (
        <p className="text-sm text-muted">{lang === 'he' ? 'אין משוב להצגה' : 'No feedback to show'}</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {messages.map((f) => (
            <div key={f.id} className="rounded-[var(--radius)] border border-line bg-surface p-4">
              <p className="text-sm font-semibold text-ink">
                {f.userName} · {f.role}
              </p>
              <p className="mt-1.5 text-sm text-ink">{f.text}</p>
              {f.aiReasoning && <p className="mt-1.5 text-xs italic text-muted">🤖 {f.aiReasoning}</p>}
              {f.status !== 'resolved' && (
                <button
                  type="button"
                  onClick={() => handleResolve(f.id)}
                  disabled={resolvingId === f.id}
                  className="mt-3 w-full rounded-lg bg-primary py-1.5 text-xs font-semibold text-primary-ink hover:bg-primary-hover disabled:opacity-60"
                >
                  {resolvingId === f.id ? '…' : `✅ ${lang === 'he' ? 'סמן כטופל' : 'Mark resolved'}`}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
