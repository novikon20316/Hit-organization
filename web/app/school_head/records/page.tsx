'use client';

// app/school_head/records/page.tsx
// Entry point for the school head's project-records drill-down — lists
// supervisors within the school head's own assigned major(s) (see GET
// /api/project-records/supervisors, scoped by callerRecordScope's
// school_head branch via coordinatorScopes — both degree levels, only the
// assigned major(s)). Each row drills into records/[supervisorId]; the
// precise major filter is applied one level down, at the project list,
// since a supervisor can teach more than one major.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { useRequireRole } from '@/hooks/useRequireRole';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/apiClient';
import type { AppRole } from '@/lib/roles';

const SCHOOL_HEAD_ROLES: AppRole[] = ['school_head'];

interface SupervisorSummary {
  id: string; displayName: string; email: string; facultyId: string;
}

export default function SchoolHeadRecordsPage() {
  const { isAllowed } = useRequireRole(SCHOOL_HEAD_ROLES);
  const { lang } = useLanguage();
  const [supervisors, setSupervisors] = useState<SupervisorSummary[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isAllowed) return;
    apiClient.getScopedSupervisorsForRecords()
      .then((res) => setSupervisors(res.supervisors))
      .catch((err) => {
        setError(lang === 'he' ? 'טעינת המנחים נכשלה' : 'Failed to load supervisors');
      });
  }, [isAllowed, lang]);

  if (!isAllowed) return null;

  return (
    <DashboardShell title={lang === 'he' ? 'רישומי פרויקטים' : 'Project Records'} showBackButton={false}>
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <p className="mb-4 text-sm text-grad-school-head-on-surface-variant">
          {lang === 'he'
            ? 'בחר/י מנחה כדי לראות את הפרויקטים שלו/שלה עם רישום קבוע וקריאה בלבד, במגמה/ות שלך.'
            : 'Choose a supervisor to see their projects with a permanent, read-only record, within your assigned major(s).'}
        </p>

        {error && <p className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">{error}</p>}
        {!error && supervisors === null && <p className="text-sm text-grad-school-head-on-surface-variant" role="status" aria-live="polite">{lang === 'he' ? 'טוען…' : 'Loading…'}</p>}
        {!error && supervisors !== null && supervisors.length === 0 && (
          <p className="text-sm text-grad-school-head-on-surface-variant">
            {lang === 'he' ? 'אין מנחים להצגה.' : 'No supervisors to show.'}
          </p>
        )}

        <div className="grid gap-2">
          {supervisors?.map((s) => (
            <Link
              key={s.id}
              href={`/school_head/records/${s.id}`}
              className="rounded-grad-school-head border border-grad-school-head-outline-variant bg-grad-school-head-surface-container-lowest px-4 py-3 transition-colors hover:border-grad-school-head-primary"
            >
              <p className="text-sm font-semibold text-grad-school-head-on-surface">{s.displayName}</p>
              <p className="mt-0.5 text-xs text-grad-school-head-on-surface-variant">{s.email}</p>
            </Link>
          ))}
        </div>
      </div>
    </DashboardShell>
  );
}
