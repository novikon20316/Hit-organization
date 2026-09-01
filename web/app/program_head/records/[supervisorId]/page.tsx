'use client';

// app/program_head/records/[supervisorId]/page.tsx
// Lists one supervisor's projects that already have a record (see
// GET /api/project-records/supervisors/:supervisorId/projects). Each row
// drills into [projectId] for the full read-only timeline.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { useRequireRole } from '@/hooks/useRequireRole';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/apiClient';
import type { AppRole } from '@/lib/roles';

const PROGRAM_HEAD_ROLES: AppRole[] = ['program_head'];

interface ProjectSummary {
  id: string; titleHe: string; titleEn: string; status: string | null;
  supervisorId: string | null; enrolledStudentCount: number;
}

export default function ProgramHeadSupervisorRecordsPage() {
  const { isAllowed } = useRequireRole(PROGRAM_HEAD_ROLES);
  const { lang } = useLanguage();
  const params = useParams<{ supervisorId: string }>();
  const supervisorId = params.supervisorId;
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isAllowed) return;
    apiClient.getSupervisorProjectRecords(supervisorId)
      .then((res) => setProjects(res.projects))
      .catch((err) => {
        console.error('Failed to load supervisor project records:', err);
        setError(lang === 'he' ? 'טעינת הרישומים נכשלה' : 'Failed to load records');
      });
  }, [isAllowed, lang, supervisorId]);

  if (!isAllowed) return null;

  return (
    <DashboardShell title={lang === 'he' ? 'רישומי הפרויקטים של המנחה' : 'Supervisor Project Records'}>
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <p className="mb-4 text-sm text-muted">
          {lang === 'he'
            ? 'רישום קבוע וקריאה בלבד לכל פרויקט של המנחה שכבר יש בו סטודנטים.'
            : 'A permanent, read-only record for every project of this supervisor that already has students.'}
        </p>

        {error && <p className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">{error}</p>}
        {!error && projects === null && <p className="text-sm text-muted" role="status" aria-live="polite">{lang === 'he' ? 'טוען…' : 'Loading…'}</p>}
        {!error && projects !== null && projects.length === 0 && (
          <p className="text-sm text-muted">
            {lang === 'he' ? 'אין עדיין פרויקטים עם רישום.' : 'No projects have a record yet.'}
          </p>
        )}

        <div className="grid gap-2">
          {projects?.map((p) => (
            <Link
              key={p.id}
              href={`/program_head/records/${supervisorId}/${p.id}`}
              className="rounded-[var(--radius)] border border-line bg-surface px-4 py-3 transition-colors hover:border-primary"
            >
              <p className="text-sm font-semibold text-ink">{lang === 'he' ? p.titleHe || p.titleEn : p.titleEn || p.titleHe}</p>
              <p className="mt-0.5 text-xs text-muted">
                {p.enrolledStudentCount} {lang === 'he' ? 'סטודנטים' : 'student(s)'} · {p.status ?? '—'}
              </p>
            </Link>
          ))}
        </div>
      </div>
    </DashboardShell>
  );
}
