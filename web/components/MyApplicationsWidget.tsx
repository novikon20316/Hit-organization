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

export function MyApplicationsWidget() {
  const { lang } = useLanguage();
  const { roles } = useAuth();
  const isSupervisor = roles.includes('supervisor') || roles.includes('secondary_supervisor');

  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
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

  const pending = applications.filter((a) => a.status === 'applied' || a.status === 'meeting_requested');

  return (
    <div className="rounded-[var(--radius)] border border-line bg-surface p-4">
      <button type="button" onClick={() => setExpanded((v) => !v)} className="flex w-full items-center justify-between gap-2 text-start">
        <span className="text-sm font-semibold text-ink">
          📥 {lang === 'he' ? 'בקשות לפרויקטים שלי (כמנחה)' : 'Applications to My Projects (as Supervisor)'}
          {pending.length > 0 && (
            <span className="ms-2 rounded-full bg-accent/20 px-2 py-0.5 text-xs font-bold text-accent">{pending.length}</span>
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
        <div className="mt-3 grid gap-2 border-t border-line pt-3 sm:grid-cols-2">
          {loading ? (
            <p className="text-sm text-muted">…</p>
          ) : error ? (
            <p className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger sm:col-span-2">{error}</p>
          ) : pending.length === 0 ? (
            <p className="text-sm text-muted">{lang === 'he' ? '✅ אין בקשות הממתינות לטיפולך' : '✅ No applications awaiting your response'}</p>
          ) : (
            pending.map((app) => <ApplicationCard key={app.id} application={app} onDecided={fetchApplications} />)
          )}
        </div>
      )}
    </div>
  );
}
