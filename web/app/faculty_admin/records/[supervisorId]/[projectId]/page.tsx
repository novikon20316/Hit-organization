'use client';

// app/faculty_admin/records/[supervisorId]/[projectId]/page.tsx
// Full read-only timeline for one project — see ProjectRecordTimeline for
// the actual rendering; this page is just the role-gated wrapper + header.

import { useParams } from 'next/navigation';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { useRequireRole } from '@/hooks/useRequireRole';
import { useLanguage } from '@/contexts/LanguageContext';
import { ProjectRecordTimeline } from '@/components/ProjectRecordTimeline';
import type { AppRole } from '@/lib/roles';

const FACULTY_ADMIN_ROLES: AppRole[] = ['faculty_admin'];

export default function FacultyAdminProjectRecordPage() {
  const { isAllowed } = useRequireRole(FACULTY_ADMIN_ROLES);
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
