'use client';

// app/admin/records/[facultyId]/page.tsx
// Lists one faculty's majors — re-fetches the same taxonomy call as
// records/page.tsx and finds the matching facultyId (no dedicated
// per-faculty endpoint exists). Each row drills into [major] for that
// major's supervisors.

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

export default function AdminFacultyRecordsPage() {
  const { isAllowed } = useRequireRole(ADMIN_ROLES);
  const { lang } = useLanguage();
  const params = useParams<{ facultyId: string }>();
  const facultyId = params.facultyId;
  const [majors, setMajors] = useState<string[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isAllowed) return;
    apiClient.getFacultyTaxonomyForRecords()
      .then((res) => setMajors(res.faculties.find((f) => f.facultyId === facultyId)?.majors ?? []))
      .catch((err) => {
        console.error('Failed to load faculty taxonomy for records:', err);
        setError(lang === 'he' ? 'טעינת התוכניות נכשלה' : 'Failed to load majors');
      });
  }, [isAllowed, lang, facultyId]);

  if (!isAllowed) return null;

  return (
    <DashboardShell title={facultyLabel(facultyId as FacultyId, lang)}>
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <p className="mb-4 text-sm text-muted">
          {lang === 'he'
            ? 'בחר/י תוכנית כדי להמשיך אל המנחים והפרויקטים שלה.'
            : 'Choose a major to drill into its supervisors and projects.'}
        </p>

        {error && <p className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">{error}</p>}
        {!error && majors === null && <p className="text-sm text-muted" role="status" aria-live="polite">{lang === 'he' ? 'טוען…' : 'Loading…'}</p>}
        {!error && majors !== null && majors.length === 0 && (
          <p className="text-sm text-muted">{lang === 'he' ? 'אין תוכניות להצגה.' : 'No majors to show.'}</p>
        )}

        <div className="grid gap-2">
          {majors?.map((major) => (
            <Link
              key={major}
              href={`/admin/records/${facultyId}/${major}`}
              className="rounded-[var(--radius)] border border-line bg-surface px-4 py-3 transition-colors hover:border-primary"
            >
              <p className="text-sm font-semibold text-ink">
                {majorsForFaculty(facultyId).find((m) => m.slug === major)?.label[lang] ?? major}
              </p>
            </Link>
          ))}
        </div>
      </div>
    </DashboardShell>
  );
}
