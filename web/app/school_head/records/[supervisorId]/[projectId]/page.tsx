'use client';

// app/school_head/records/[supervisorId]/[projectId]/page.tsx
// Full read-only timeline for one project — see ProjectRecordTimeline for
// the actual rendering; this page is just the role-gated wrapper + header.
// Access itself is re-checked server-side (getProjectRecord's
// projectWithinScope), so a URL guessed outside this school head's own
// major still 403s even though this page's own role check only confirms
// the role, not the major.

import { useParams } from 'next/navigation';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { useRequireRole } from '@/hooks/useRequireRole';
import { useLanguage } from '@/contexts/LanguageContext';
import { ProjectRecordTimeline } from '@/components/ProjectRecordTimeline';
import type { AppRole } from '@/lib/roles';

const SCHOOL_HEAD_ROLES: AppRole[] = ['school_head'];

export default function SchoolHeadProjectRecordPage() {
  const { isAllowed } = useRequireRole(SCHOOL_HEAD_ROLES);
  const { lang } = useLanguage();
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;

  if (!isAllowed) return null;

  return (
    <DashboardShell title={lang === 'he' ? 'רישום הפרויקט' : 'Project Record'}>
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <ProjectRecordTimeline projectId={projectId} />
      </div>
    </DashboardShell>
  );
}
