'use client';

// components/dashboard/PendingSignoffsWidget.tsx
// Generic "what's waiting on you to sign off" widget — surfaces whatever
// examiner-invitation / final-grade sign-offs the calling user is currently
// authorized to act on (server/src/services/pendingSignoffs.ts), regardless
// of role. Mirrors the exact approve/reject-with-reason card JSX already
// used for the same two item types on grad_school_head/dashboard/page.tsx —
// that dashboard keeps its own richer, dedicated view; this is the same
// underlying data, scoped to whichever role a faculty configured instead of
// grad_school_head only. Renders nothing at all when there's nothing
// pending, so it never clutters a dashboard for staff who don't hold a
// configured sign-off role.

import { useCallback, useEffect, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/apiClient';

type SignoffType = 'examiners' | 'final_grade';
type Urgency = 'low' | 'medium' | 'high';

interface PendingSignoffItem {
  id: string;
  type: SignoffType;
  studentName: string;
  facultyId: string;
  title: string;
  submittedAt: string;
  urgency: Urgency;
}

const TYPE_LABEL: Record<SignoffType, { he: string; en: string }> = {
  examiners: { he: 'אישור בוחנים', en: 'Examiner Approval' },
  final_grade: { he: 'אישור ציון סופי', en: 'Final Grade' },
};

const URGENCY_COLOR: Record<Urgency, string> = {
  high: 'var(--danger)',
  medium: 'var(--accent)',
  low: 'var(--success)',
};

interface PendingSignoffsWidgetProps {
  /** When true, an empty result renders an explicit "nothing pending"
   *  message instead of nothing at all — for callers that give this widget
   *  its own dedicated tab (a blank tab reads as broken). Inline placements
   *  on an already-busy page should leave this false (the default) so the
   *  widget stays invisible for staff who never have anything pending. */
  showEmptyState?: boolean;
}

export function PendingSignoffsWidget({ showEmptyState = false }: PendingSignoffsWidgetProps = {}) {
  const { lang } = useLanguage();
  const [items, setItems] = useState<PendingSignoffItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectTargetId, setRejectTargetId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const fetchItems = useCallback(async () => {
    try {
      const data = await apiClient.getMyPendingSignoffs();
      setItems((data.items ?? []) as PendingSignoffItem[]);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : lang === 'he' ? 'טעינת האישורים הממתינים נכשלה' : 'Failed to load pending sign-offs');
    } finally {
      setLoading(false);
    }
  }, [lang]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; setState calls happen after the awaited network call resolves, not synchronously in this effect
    fetchItems();
  }, [fetchItems]);

  const handleApprove = async (item: PendingSignoffItem) => {
    setBusyId(item.id);
    try {
      if (item.type === 'examiners') await apiClient.approveExaminerRecommendationFinal(item.id);
      else await apiClient.approveFinalGrade(item.id);
      await fetchItems();
    } catch (err) {
      setError(err instanceof Error ? err.message : lang === 'he' ? 'האישור נכשל' : 'Approval failed');
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async (item: PendingSignoffItem) => {
    if (!rejectReason.trim()) return;
    setBusyId(item.id);
    try {
      if (item.type === 'examiners') await apiClient.rejectExaminerRecommendationFinal(item.id, rejectReason.trim());
      else await apiClient.rejectFinalGrade(item.id, rejectReason.trim());
      setRejectTargetId(null);
      setRejectReason('');
      await fetchItems();
    } catch (err) {
      setError(err instanceof Error ? err.message : lang === 'he' ? 'הדחייה נכשלה' : 'Rejection failed');
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return null;
  if (items.length === 0 && !error) {
    if (!showEmptyState) return null;
    return <p className="text-sm text-muted">✅ {lang === 'he' ? 'אין פריטים הממתינים לאישורך' : 'Nothing awaiting your sign-off'}</p>;
  }

  return (
    <div className="mb-4">
      <h3 className="mb-2 text-sm font-semibold text-ink">
        ✍️ {lang === 'he' ? 'ממתין לאישור ציונים ובוחנים' : 'Awaiting grade/examiner approval'}
      </h3>
      {error && <p className="mb-2 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        {items.map((item) => (
          <div
            key={item.id}
            className="role-rail rounded-[var(--radius)] border border-line bg-surface p-4"
            style={{ '--rail-color': URGENCY_COLOR[item.urgency] } as React.CSSProperties}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="rounded-full px-2 py-0.5 text-xs font-medium" style={{ backgroundColor: `${URGENCY_COLOR[item.urgency] ?? '#8899BB'}22`, color: URGENCY_COLOR[item.urgency] ?? '#8899BB' }}>
                {TYPE_LABEL[item.type]?.[lang] ?? item.type}
              </span>
              {item.submittedAt && <span className="text-xs text-muted">{new Date(item.submittedAt).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-US')}</span>}
            </div>
            <p className="mt-1.5 text-sm font-semibold text-ink">{item.studentName}</p>
            <p className="mt-0.5 text-xs text-muted">{item.title}</p>

            {rejectTargetId === item.id && (
              <input
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder={lang === 'he' ? 'סיבת הדחייה' : 'Rejection reason'}
                className="mt-2 w-full rounded-md border border-line bg-paper px-2.5 py-1.5 text-xs text-ink"
              />
            )}
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => (rejectTargetId === item.id ? handleReject(item) : setRejectTargetId(item.id))}
                disabled={busyId === item.id}
                className="flex-1 rounded-lg border border-danger px-3 py-2 text-xs font-semibold text-danger disabled:opacity-60"
              >
                {rejectTargetId === item.id ? (lang === 'he' ? 'שלח דחייה' : 'Submit rejection') : (lang === 'he' ? 'דחה' : 'Reject')}
              </button>
              <button
                type="button"
                onClick={() => handleApprove(item)}
                disabled={busyId === item.id}
                className="flex-1 rounded-lg bg-success px-3 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60"
              >
                {busyId === item.id ? (lang === 'he' ? 'מאשר...' : 'Approving...') : `✅ ${lang === 'he' ? 'אשר' : 'Approve'}`}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
