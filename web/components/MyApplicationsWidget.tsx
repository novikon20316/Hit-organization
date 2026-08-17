'use client';

// components/MyApplicationsWidget.tsx
// Same gap CreateOwnProjectButton.tsx exists for, one step further: a staff
// member who holds supervisor/secondary_supervisor alongside a higher-
// ranked role (coordinator, faculty_admin, grad_school_head,
// administrative_secretary, program_head, system_admin) lands on that
// higher role's dashboard (see lib/roles.ts's resolveActiveRole) and, since
// manual role switching was removed, has no way to reach
// /supervisor/dashboard's Applications tab at all — not even to discover
// it exists. CreateOwnProjectButton solved this for CREATING their own
// project; this solves it for the applications THAT PROJECT then receives,
// which otherwise sit invisible and un-actionable forever (the account is
// correctly authorized server-side — getSupervisorDashboard's query and
// handleApplicationDecision's ownership check both key off supervisorId
// directly, unaffected by which role is "active" — this is purely a
// navigation dead end, not a permissions bug).
//
// Self-fetches (same data getSupervisorDashboard's own Applications tab
// uses) and self-gates like CreateOwnProjectButton — renders nothing for
// anyone who isn't a supervisor/secondary_supervisor. Drop into any staff
// dashboard alongside CreateOwnProjectButton.

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/apiClient';
import { ApplicationCard } from '@/app/supervisor/dashboard/ApplicationCard';
import type { Application } from '@/app/supervisor/dashboard/types';

// Buckets, not strict status equality — 'awaiting_student_confirmation' (she
// already said yes; the student hasn't confirmed which of possibly several
// approvals to start yet — see applicationController.ts's
// confirmApplicationStart) reads as "approved" from her side, and
// 'declined_by_student' reads as "rejected" outcome-wise, even though
// neither is a status SHE set directly. Same data as the full
// /supervisor/dashboard Applications tab (getSupervisorDashboard returns
// every status, unfiltered) — this is just a compact view of the same history.
type Filter = 'pending' | 'approved' | 'rejected' | 'all';
const FILTERS: { key: Filter; he: string; en: string; match: (status: string) => boolean }[] = [
  { key: 'pending', he: 'ממתין לטיפול', en: 'Awaiting Response', match: (s) => s === 'applied' || s === 'meeting_requested' },
  { key: 'approved', he: 'אושרו', en: 'Approved', match: (s) => s === 'approved' || s === 'awaiting_student_confirmation' },
  { key: 'rejected', he: 'נדחו', en: 'Rejected', match: (s) => s === 'rejected' || s === 'declined_by_student' },
  { key: 'all', he: 'הכל', en: 'All', match: () => true },
];

export function MyApplicationsWidget() {
  const { lang } = useLanguage();
  const { roles } = useAuth();
  const isSupervisor = roles.includes('supervisor') || roles.includes('secondary_supervisor');

  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [filter, setFilter] = useState<Filter>('pending');
  // A silently-swallowed fetch failure (auth token issue, network error, a
  // real server error) used to look IDENTICAL to "genuinely zero
  // applications" — indistinguishable from here, and from the outside,
  // exactly the symptom this widget exists to fix in the first place. Now
  // surfaced instead of hidden behind an empty state.
  const [error, setError] = useState('');

  const fetchApplications = useCallback(() => {
    setLoading(true);
    setError('');
    apiClient
      .getSupervisorDashboard()
      .then((res) => setApplications((res.applications ?? []) as unknown as Application[]))
      .catch((err) => {
        setApplications([]);
        setError(err instanceof Error ? err.message : lang === 'he' ? 'הטעינה נכשלה' : 'Failed to load');
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- lang is read once per call, not a reactive dependency worth re-binding the callback over
  }, []);

  useEffect(() => {
    if (isSupervisor) fetchApplications();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetch-on-mount only
  }, [isSupervisor]);

  if (!isSupervisor) return null;

  // The header badge always counts what needs HER action, regardless of
  // which filter is currently selected below — switching to "Approved" to
  // check on a student shouldn't make the actionable count disappear.
  const pendingCount = applications.filter((a) => a.status === 'applied' || a.status === 'meeting_requested').length;
  const activeFilter = FILTERS.find((f) => f.key === filter)!;
  const filtered = applications.filter((a) => activeFilter.match(a.status));

  return (
    <div className="rounded-[var(--radius)] border border-line bg-surface p-4">
      <button type="button" onClick={() => setExpanded((v) => !v)} className="flex w-full items-center justify-between gap-2 text-start">
        <span className="text-sm font-semibold text-ink">
          📥 {lang === 'he' ? 'בקשות לפרויקטים שלי (כמנחה)' : 'Applications to My Projects (as Supervisor)'}
          {pendingCount > 0 && (
            <span className="ms-2 rounded-full bg-accent/20 px-2 py-0.5 text-xs font-bold text-accent">{pendingCount}</span>
          )}
          {error && !loading && (
            <span className="ms-2 rounded-full bg-danger-bg px-2 py-0.5 text-xs font-bold text-danger">
              ⚠️ {lang === 'he' ? 'שגיאת טעינה' : 'Load error'}
            </span>
          )}
        </span>
        <span className="text-xs text-muted">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div className="mt-3 border-t border-line pt-3">
          <div className="mb-3 flex flex-wrap gap-1.5">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className={`rounded-full border px-3 py-1 text-xs font-medium ${
                  filter === f.key ? 'border-primary bg-primary text-primary-ink' : 'border-line bg-surface text-ink'
                }`}
              >
                {lang === 'he' ? f.he : f.en}
              </button>
            ))}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {loading ? (
              <p className="text-sm text-muted">…</p>
            ) : error ? (
              <p className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger sm:col-span-2">{error}</p>
            ) : filtered.length === 0 ? (
              <p className="text-sm text-muted">
                {filter === 'pending'
                  ? (lang === 'he' ? '✅ אין בקשות הממתינות לטיפולך' : '✅ No applications awaiting your response')
                  : (lang === 'he' ? 'אין בקשות בקטגוריה זו' : 'No applications in this category')}
              </p>
            ) : (
              filtered.map((app) => <ApplicationCard key={app.id} application={app} onDecided={fetchApplications} />)
            )}
          </div>
        </div>
      )}
    </div>
  );
}
