'use client';

// app/admin/records/page.tsx
// Entry point for system_admin's project-records drill-down — lists every
// faculty (see GET /api/project-records/faculties). Each row drills into
// records/[facultyId] for that faculty's majors.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { useRequireRole } from '@/hooks/useRequireRole';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/apiClient';
import { facultyLabel, type FacultyId } from '@/lib/i18n';
import type { AppRole } from '@/lib/roles';

const ADMIN_ROLES: AppRole[] = ['system_admin'];

interface FacultyTaxonomyEntry { facultyId: string; majors: string[]; }

export default function AdminRecordsPage() {
  const { isAllowed } = useRequireRole(ADMIN_ROLES);
  const { lang } = useLanguage();
  const [faculties, setFaculties] = useState<FacultyTaxonomyEntry[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isAllowed) return;
    apiClient.getFacultyTaxonomyForRecords()
      .then((res) => setFaculties(res.faculties))
      .catch((err) => {
        console.error('Failed to load faculty taxonomy for records:', err);
        setError(lang === 'he' ? 'טעינת הפקולטות נכשלה' : 'Failed to load faculties');
      });
  }, [isAllowed, lang]);

  if (!isAllowed) return null;

  return (
    <DashboardShell title={lang === 'he' ? 'רישומי פרויקטים' : 'Project Records'} showBackButton={false}>
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <p className="mb-4 text-sm text-muted">
          {lang === 'he'
            ? 'בחר/י פקולטה כדי להמשיך אל התוכניות, המנחים והפרויקטים שלהם.'
            : 'Choose a faculty to drill into its majors, supervisors, and projects.'}
        </p>

        {error && <p className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>}
        {!error && faculties === null && <p className="text-sm text-muted">{lang === 'he' ? 'טוען…' : 'Loading…'}</p>}
        {!error && faculties !== null && faculties.length === 0 && (
          <p className="text-sm text-muted">{lang === 'he' ? 'אין פקולטות להצגה.' : 'No faculties to show.'}</p>
        )}

        <div className="grid gap-2">
          {faculties?.map((f) => (
            <Link
              key={f.facultyId}
              href={`/admin/records/${f.facultyId}`}
              className="rounded-[var(--radius)] border border-line bg-surface px-4 py-3 transition-colors hover:border-primary"
            >
              <p className="text-sm font-semibold text-ink">{facultyLabel(f.facultyId as FacultyId, lang)}</p>
              <p className="mt-0.5 text-xs text-muted">
                {f.majors.length} {lang === 'he' ? 'תוכניות' : f.majors.length === 1 ? 'major' : 'majors'}
              </p>
            </Link>
          ))}
        </div>
      </div>
    </DashboardShell>
  );
}
