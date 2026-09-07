'use client';

// app/reports/page.tsx
// Thin dispatcher — every report-viewing role gets the same project-first
// experience (see ProjectFirstReportsFlow.tsx), scoped to whatever that
// role's own permissions allow (enforced server-side, see
// reportsController.ts's resolveFacultyScope).

import { useRequireRole } from '@/hooks/useRequireRole';
import { useAuth } from '@/contexts/AuthContext';
import type { AppRole } from '@/lib/roles';
import { ProjectFirstReportsFlow } from './ProjectFirstReportsFlow';

const REPORT_ROLES: AppRole[] = ['coordinator', 'faculty_admin', 'program_head', 'administrative_secretary', 'grad_school_head', 'system_admin'];

export default function ReportsPage() {
  const { loading: guardLoading } = useRequireRole(REPORT_ROLES);
  const { activeRole } = useAuth();

  if (guardLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper">
        <p className="text-sm text-muted">…</p>
      </div>
    );
  }

  return <ProjectFirstReportsFlow activeRole={activeRole} />;
}
