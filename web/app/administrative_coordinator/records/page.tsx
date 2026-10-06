'use client';

// app/administrative_coordinator/records/page.tsx
// Entry point for the administrative coordinator's project-records
// drill-down — lists every supervisor within her own cross-faculty scope
// (see GET /api/project-records/supervisors). Each row drills into
// records/[supervisorId] for that supervisor's own projects.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { useRequireRole } from '@/hooks/useRequireRole';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/apiClient';
import type { AppRole } from '@/lib/roles';

const ADMINISTRATIVE_COORDINATOR_ROLES: AppRole[] = ['administrative_secretary'];

interface SupervisorSummary {
  id: string; displayName: string; email: string; facultyId: string;
  lastLoginAt: string | null;
  lastLoginPlatform: 'web' | 'mobile' | null;
  lastLogoutAt: string | null;
  lastLogoutPlatform: 'web' | 'mobile' | null;
  pendingReviewCount: number;
  oldestPendingSubmittedAt: string | null;
}

function formatLastAt(iso: string | null, platform: 'web' | 'mobile' | null, lang: 'he' | 'en'): string {
  if (!iso) return lang === 'he' ? 'מעולם לא' : 'never';
  const dateStr = new Date(iso).toLocaleString(lang === 'he' ? 'he-IL' : 'en-US', { dateStyle: 'short', timeStyle: 'short' });
  return platform ? `${dateStr} (${platform})` : dateStr;
}

export default function AdministrativeCoordinatorRecordsPage() {
  const { isAllowed } = useRequireRole(ADMINISTRATIVE_COORDINATOR_ROLES);
  const { lang } = useLanguage();
  const [supervisors, setSupervisors] = useState<SupervisorSummary[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isAllowed) return;
    apiClient.getScopedSupervisorsForRecords()
      .then((res) => setSupervisors(res.supervisors))
      .catch((err) => {
        console.error('Failed to load supervisors for records:', err);
        setError(lang === 'he' ? 'טעינת המנחים נכשלה' : 'Failed to load supervisors');
      });
  }, [isAllowed, lang]);

  if (!isAllowed) return null;

  return (
    <DashboardShell title={lang === 'he' ? 'רישומי פרויקטים' : 'Project Records'} showBackButton={false}>
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <p className="mb-4 text-sm text-administrative-coordinator-on-surface-variant">
          {lang === 'he'
            ? 'בחר/י מנחה כדי לראות את הפרויקטים שלו/שלה עם רישום קבוע וקריאה בלבד.'
            : 'Choose a supervisor to see their projects with a permanent, read-only record.'}
        </p>

        {error && <p className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">{error}</p>}
        {!error && supervisors === null && <p className="text-sm text-administrative-coordinator-on-surface-variant" role="status" aria-live="polite">{lang === 'he' ? 'טוען…' : 'Loading…'}</p>}
        {!error && supervisors !== null && supervisors.length === 0 && (
          <p className="text-sm text-administrative-coordinator-on-surface-variant">
            {lang === 'he' ? 'אין מנחים להצגה.' : 'No supervisors to show.'}
          </p>
        )}

        <div className="grid gap-2">
          {supervisors?.map((s) => (
            <Link
              key={s.id}
              href={`/administrative_coordinator/records/${s.id}`}
              className="rounded-administrative-coordinator border border-administrative-coordinator-outline-variant bg-administrative-coordinator-surface-container-lowest px-4 py-3 transition-colors hover:border-administrative-coordinator-primary"
            >
              <p className="text-sm font-semibold text-administrative-coordinator-on-surface">{s.displayName}</p>
              <p className="mt-0.5 text-xs text-administrative-coordinator-on-surface-variant">{s.email}</p>
              <p className="mt-1 text-[11px] text-administrative-coordinator-on-surface-variant">
                {lang === 'he' ? 'כניסה אחרונה: ' : 'Last login: '}{formatLastAt(s.lastLoginAt, s.lastLoginPlatform, lang)}
                {' · '}
                {lang === 'he' ? 'יציאה אחרונה: ' : 'Last logout: '}{formatLastAt(s.lastLogoutAt, s.lastLogoutPlatform, lang)}
              </p>
              {s.pendingReviewCount > 0 && (
                <p className="mt-1 text-[11px] font-medium text-accent">
                  {lang === 'he'
                    ? `📥 ${s.pendingReviewCount} הגשות ממתינות לבדיקה`
                    : `📥 ${s.pendingReviewCount} submission${s.pendingReviewCount === 1 ? '' : 's'} awaiting review`}
                  {s.oldestPendingSubmittedAt && (lang === 'he'
                    ? ` · הישנה ביותר מאז ${new Date(s.oldestPendingSubmittedAt).toLocaleDateString('he-IL')}`
                    : ` · oldest since ${new Date(s.oldestPendingSubmittedAt).toLocaleDateString('en-US')}`)}
                </p>
              )}
            </Link>
          ))}
        </div>
      </div>
    </DashboardShell>
  );
}
