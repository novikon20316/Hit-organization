'use client';

// app/admin/panel/FeedbackTab.tsx
// Ported from the `activeTab === 'feedback'` section of mobile's panel.tsx —
// real (non-noise) feedback messages, one-way (system_admin reviews/resolves
// here rather than replying in-thread, see server's feedbackController.ts).

import { useCallback, useEffect, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/apiClient';
import type { AdminFeedbackMessage } from './types';

const URGENCY_ORDER = { high: 0, medium: 1, low: 2 } as const;

const URGENCY_META = {
  high:   { he: 'דחוף',  en: 'High',   cls: 'bg-danger-bg text-danger' },
  medium: { he: 'בינוני', en: 'Medium', cls: 'bg-amber-100 text-amber-900' },
  low:    { he: 'נמוך',  en: 'Low',    cls: 'bg-paper text-muted' },
} as const;

const CATEGORY_LABEL = {
  bug:             { he: 'תקלה',       en: 'Bug' },
  feature_request: { he: 'בקשה לפיצ׳ר', en: 'Feature request' },
  ux:              { he: 'שימושיות',    en: 'Usability' },
  question:        { he: 'שאלה',       en: 'Question' },
  other:           { he: 'אחר',        en: 'Other' },
} as const;

const PLATFORM_LABEL = { web: 'Web', ios: 'iOS', android: 'Android' } as const;

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
      // Most urgent first; untriaged (AI unavailable) after high, then by date.
      const rank = (m: AdminFeedbackMessage) => (m.urgency ? URGENCY_ORDER[m.urgency] : 0.5);
      setMessages([...(res.messages ?? [])].sort((a, b) => rank(a) - rank(b)) as AdminFeedbackMessage[]);
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
              <div className="flex flex-wrap items-center gap-1.5">
                {f.urgency && (
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${URGENCY_META[f.urgency].cls}`}>
                    {URGENCY_META[f.urgency][lang]}
                  </span>
                )}
                {f.category && (
                  <span className="rounded-full border border-line px-2 py-0.5 text-[11px] font-medium text-muted">
                    {CATEGORY_LABEL[f.category][lang]}
                  </span>
                )}
              </div>
              <p className="mt-2 text-sm font-semibold text-ink">
                {f.userName} · {f.role}
              </p>
              {f.summaryEn && <p className="mt-1.5 text-sm font-medium text-ink" dir="ltr">{f.summaryEn}</p>}
              <p className="mt-1.5 text-sm text-ink">{f.text}</p>
              {f.duplicateOfId && (
                <p className="mt-1.5 text-xs text-amber-800">
                  {lang === 'he' ? 'ייתכן שזהה למשוב פתוח: ' : 'Possible duplicate of open feedback: '}
                  {messages.find((m) => m.id === f.duplicateOfId)?.text.slice(0, 60) ?? f.duplicateOfId}
                </p>
              )}
              {f.context && (
                <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-xs text-muted" dir="ltr">
                  {f.context.screen && (<><dt>{lang === 'he' ? 'מסך' : 'Screen'}</dt><dd className="break-all text-ink">{f.context.screen}</dd></>)}
                  {f.context.platform && (
                    <>
                      <dt>{lang === 'he' ? 'פלטפורמה' : 'Platform'}</dt>
                      <dd className="text-ink">{PLATFORM_LABEL[f.context.platform]}{f.context.appVersion ? ` ${f.context.appVersion}` : ''}</dd>
                    </>
                  )}
                  {f.context.device && (<><dt>{lang === 'he' ? 'מכשיר' : 'Device'}</dt><dd className="break-all">{f.context.device}</dd></>)}
                  {f.context.serverRevision && (<><dt>{lang === 'he' ? 'גרסת שרת' : 'API build'}</dt><dd>{f.context.serverRevision}</dd></>)}
                </dl>
              )}
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
