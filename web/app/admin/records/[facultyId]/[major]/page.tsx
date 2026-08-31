'use client';

// app/admin/records/[facultyId]/[major]/page.tsx
// Lists supervisors in this faculty (GET /api/project-records/supervisors
// returns every supervisor, unscoped, for system_admin) — there's no
// major-level filtering on the backend for supervisors, so this filters by
// facultyId client-side only; the major segment exists purely for the
// drill-down URL shape and matches every supervisor in the faculty
// regardless of their assigned majors. Each row drills into
// [supervisorId] for that supervisor's own projects.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { useRequireRole } from '@/hooks/useRequireRole';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/apiClient';
import { facultyLabel, type FacultyId } from '@/lib/i18n';
import { majorsForFaculty } from '@/lib/permissions';
import type { AppRole } from '@/lib/roles';

const ADMIN_ROLES: AppRole[] = ['system_admin'];

interface SupervisorSummary {
  id: string; displayName: string; email: string; facultyId: string;
}

export default function AdminMajorRecordsPage() {
  const { isAllowed } = useRequireRole(ADMIN_ROLES);
  const { lang } = useLanguage();
  const params = useParams<{ facultyId: string; major: string }>();
  const { facultyId, major } = params;
  const [supervisors, setSupervisors] = useState<SupervisorSummary[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isAllowed) return;
    apiClient.getScopedSupervisorsForRecords()
      .then((res) => setSupervisors(res.supervisors.filter((s) => s.facultyId === facultyId)))
      .catch((err) => {
        console.error('Failed to load supervisors for records:', err);
        setError(lang === 'he' ? 'טעינת המנחים נכשלה' : 'Failed to load supervisors');
      });
  }, [isAllowed, lang, facultyId]);

  const majorLabel = majorsForFaculty(facultyId).find((m) => m.slug === major)?.label[lang] ?? major;

  if (!isAllowed) return null;

  return (
    <DashboardShell title={`${facultyLabel(facultyId as FacultyId, lang)} · ${majorLabel}`}>
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <p className="mb-4 text-sm text-muted">
          {lang === 'he'
            ? 'בחר/י מנחה כדי לראות את הפרויקטים שלו/שלה עם רישום קבוע וקריאה בלבד.'
            : 'Choose a supervisor to see their projects with a permanent, read-only record.'}
        </p>

        {error && <p className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">{error}</p>}
        {!error && supervisors === null && <p className="text-sm text-muted">{lang === 'he' ? 'טוען…' : 'Loading…'}</p>}
        {!error && supervisors !== null && supervisors.length === 0 && (
          <p className="text-sm text-muted">{lang === 'he' ? 'אין מנחים להצגה.' : 'No supervisors to show.'}</p>
        )}

        <div className="grid gap-2">
          {supervisors?.map((s) => (
            <Link
              key={s.id}
              href={`/admin/records/${facultyId}/${major}/${s.id}`}
              className="rounded-[var(--radius)] border border-line bg-surface px-4 py-3 transition-colors hover:border-primary"
            >
              <p className="text-sm font-semibold text-ink">{s.displayName}</p>
              <p className="mt-0.5 text-xs text-muted">{s.email}</p>
            </Link>
          ))}
        </div>
      </div>
    </DashboardShell>
  );
}
