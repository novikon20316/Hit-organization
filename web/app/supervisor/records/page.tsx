'use client';

// app/supervisor/records/page.tsx
// Entry point for the supervisor's own permanent project records — lists
// only projects that have a record yet (i.e. at least one student has
// joined; see GET /api/project-records/my-projects). Each row drills into
// records/[projectId] for the full read-only timeline
// (components/ProjectRecordTimeline.tsx).

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { useRequireRole } from '@/hooks/useRequireRole';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/apiClient';
import type { AppRole } from '@/lib/roles';

const SUPERVISOR_ROLES: AppRole[] = ['supervisor', 'secondary_supervisor'];

interface ProjectSummary {
  id: string; titleHe: string; titleEn: string; status: string | null;
  supervisorId: string | null; enrolledStudentCount: number;
}

export default function SupervisorRecordsPage() {
  const { isAllowed } = useRequireRole(SUPERVISOR_ROLES);
  const { lang } = useLanguage();
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isAllowed) return;
    apiClient.getMyProjectRecords()
      .then((res) => setProjects(res.projects))
      .catch((err) => {
        console.error('Failed to load project records:', err);
        setError(lang === 'he' ? 'טעינת הרישומים נכשלה' : 'Failed to load records');
      });
  }, [isAllowed, lang]);

  if (!isAllowed) return null;

  return (
    <DashboardShell title={lang === 'he' ? 'רישומי הפרויקטים שלי' : 'My Project Records'} showBackButton={false}>
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <p className="mb-4 text-sm text-supervisor-on-surface-variant">
          {lang === 'he'
            ? 'רישום קבוע וקריאה בלבד לכל פרויקט שכבר יש בו סטודנטים. פרויקטים ריקים אינם מוצגים כאן.'
            : 'A permanent, read-only record for every project that already has students. Empty projects aren’t shown here.'}
        </p>

        {error && <p className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">{error}</p>}
        {!error && projects === null && <p className="text-sm text-supervisor-on-surface-variant" role="status" aria-live="polite">{lang === 'he' ? 'טוען…' : 'Loading…'}</p>}
        {!error && projects !== null && projects.length === 0 && (
          <p className="text-sm text-supervisor-on-surface-variant">
            {lang === 'he' ? 'אין עדיין פרויקטים עם רישום.' : 'No projects have a record yet.'}
          </p>
        )}

        <div className="grid gap-2">
          {projects?.map((p) => (
            <Link
              key={p.id}
              href={`/supervisor/records/${p.id}`}
              className="rounded-supervisor border border-supervisor-outline-variant bg-supervisor-surface-container-lowest px-4 py-3 transition-colors hover:border-supervisor-primary"
            >
              <p className="text-sm font-semibold text-supervisor-on-surface">{lang === 'he' ? p.titleHe || p.titleEn : p.titleEn || p.titleHe}</p>
              <p className="mt-0.5 text-xs text-supervisor-on-surface-variant">
                {p.enrolledStudentCount} {lang === 'he' ? 'סטודנטים' : 'student(s)'} · {p.status ?? '—'}
              </p>
            </Link>
          ))}
        </div>
      </div>
    </DashboardShell>
  );
}
