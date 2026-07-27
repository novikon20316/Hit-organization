'use client';

// components/ExceptionalActionQueue.tsx
// P1 backlog item #12 — program_head/faculty_admin/grad_school_head/
// system_admin review deadline-override requests a coordinator/
// administrative_secretary filed instead of applying directly. Self-contained,
// like ClockPauseControl/TrackChangeControl — fetches its own queue rather
// than depending on whatever the parent dashboard's own payload carries.

import { useEffect, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient, type ExceptionalActionRequest } from '@/lib/apiClient';

function describePayload(request: ExceptionalActionRequest, lang: 'he' | 'en'): string {
  const dueDate = request.payload.dueDate ? new Date(String(request.payload.dueDate)).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-GB') : '';
  if (request.type === 'deadline_override') {
    return lang === 'he' ? `דחיית תאריך יעד ל-${dueDate}` : `Push due date to ${dueDate}`;
  }
  const projectIds = Array.isArray(request.payload.projectIds) ? request.payload.projectIds : [];
  return lang === 'he'
    ? `דחיית תאריך יעד ל-${dueDate} עבור ${projectIds.length} פרויקטים`
    : `Push due date to ${dueDate} across ${projectIds.length} project(s)`;
}

export function ExceptionalActionQueue() {
  const { lang } = useLanguage();
  const [requests, setRequests] = useState<ExceptionalActionRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const [rejectReasonById, setRejectReasonById] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  // Distinct from "genuinely zero pending requests" (which also renders
  // nothing, by design) — a failed fetch used to look identical to that,
  // so an approver could silently never see a real pending queue exists.
  const [loadError, setLoadError] = useState('');

  const load = () => {
    setLoading(true);
    setLoadError('');
    apiClient.getPendingExceptionalActions()
      .then((res) => setRequests(res.requests))
      .catch((err) => {
        console.error('Failed to load exceptional-action queue:', err);
        setLoadError(err instanceof Error ? err.message : lang === 'he' ? 'טעינת הבקשות הממתינות נכשלה' : 'Failed to load pending requests');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const decide = async (id: string, decision: 'approved' | 'rejected') => {
    setError('');
    if (decision === 'rejected' && !rejectReasonById[id]?.trim()) {
      setError(lang === 'he' ? 'יש לציין סיבה לדחייה' : 'A reason is required to reject');
      return;
    }
    setDecidingId(id);
    try {
      await apiClient.decideExceptionalAction(id, decision, rejectReasonById[id]?.trim());
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : lang === 'he' ? 'הפעולה נכשלה' : 'Action failed');
    } finally {
      setDecidingId(null);
    }
  };

  if (loading) return null;
  if (loadError) {
    return (
      <div className="mb-4 flex items-center justify-between rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">
        <span>⚠️ {loadError}</span>
        <button type="button" onClick={load} className="font-medium underline">
          {lang === 'he' ? 'נסה שוב' : 'Retry'}
        </button>
      </div>
    );
  }
  if (requests.length === 0) return null;

  return (
    <div className="mb-4 grid gap-3 sm:grid-cols-2">
      {requests.map((r) => (
        <div key={r.id} className="role-rail rounded-[var(--radius)] border border-line bg-surface p-4" style={{ '--rail-color': 'var(--danger)' } as React.CSSProperties}>
          <p className="text-sm font-semibold text-ink">
            ⚠️ {lang === 'he' ? 'בקשה חריגה ממתינה' : 'Pending exceptional action'}
          </p>
          <p className="mt-0.5 text-xs text-muted">{describePayload(r, lang)}</p>
          <p className="mt-1 text-xs text-ink">{r.reason}</p>
          <p className="mt-1 text-xs text-muted">
            {lang === 'he' ? 'מבקש:' : 'Requested by:'} {r.requestedByRole}
          </p>

          <input
            value={rejectReasonById[r.id] ?? ''}
            onChange={(e) => setRejectReasonById((prev) => ({ ...prev, [r.id]: e.target.value }))}
            placeholder={lang === 'he' ? 'סיבת דחייה (נדרש רק לדחייה)' : 'Rejection reason (required only to reject)'}
            className="mt-2 w-full rounded-md border border-line bg-paper px-2.5 py-1.5 text-xs text-ink"
          />

          {error && <p className="mt-1 text-xs text-danger">{error}</p>}

          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => decide(r.id, 'rejected')}
              disabled={decidingId === r.id}
              className="rounded-md border border-danger px-3 py-1.5 text-xs font-medium text-danger disabled:opacity-50"
            >
              {lang === 'he' ? 'דחה' : 'Reject'}
            </button>
            <button
              type="button"
              onClick={() => decide(r.id, 'approved')}
              disabled={decidingId === r.id}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-ink disabled:opacity-50"
            >
              {lang === 'he' ? 'אשר' : 'Approve'}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
