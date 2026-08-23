'use client';

// app/notifications/layout.tsx
// Notifications & Messages is a single route shared by every role (linked
// from DashboardShell's bell icon regardless of who's signed in), so — unlike
// every other page — it isn't nested under any one role's own /<role>/
// segment and never picked up that role's SidebarShell. Without this, the
// whole persistent menu was simply absent here: no way to jump anywhere else
// without using the browser back button, which felt like being stuck.
//
// Fix: reuse each role's own layout component directly as a wrapper, keyed
// by the signed-in user's activeRole — not a second, hand-maintained copy of
// every role's sections/brand/theme, so this can never drift from what that
// role's own dashboard already shows.

import type { ReactNode, ComponentType } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import type { AppRole } from '@/lib/roles';
import AdminLayout from '@/app/admin/layout';
import StudentLayout from '@/app/student/layout';
import SupervisorLayout from '@/app/supervisor/layout';
import CoordinatorLayout from '@/app/coordinator/layout';
import FacultyAdminLayout from '@/app/faculty_admin/layout';
import ProgramHeadLayout from '@/app/program_head/layout';
import AdministrativeCoordinatorLayout from '@/app/administrative_coordinator/layout';
import GradSchoolHeadLayout from '@/app/grad_school_head/layout';
import ExaminorLayout from '@/app/examinor/layout';

const LAYOUT_BY_ROLE: Partial<Record<AppRole, ComponentType<{ children: ReactNode }>>> = {
  system_admin: AdminLayout,
  student: StudentLayout,
  supervisor: SupervisorLayout,
  secondary_supervisor: SupervisorLayout,
  coordinator: CoordinatorLayout,
  administrative_secretary: AdministrativeCoordinatorLayout,
  faculty_admin: FacultyAdminLayout,
  program_head: ProgramHeadLayout,
  grad_school_head: GradSchoolHeadLayout,
  internal_examiner: ExaminorLayout,
};

export default function NotificationsLayout({ children }: { children: ReactNode }) {
  const { activeRole } = useAuth();
  const RoleLayout = activeRole ? LAYOUT_BY_ROLE[activeRole] : undefined;

  // Briefly true before AuthContext resolves activeRole on first load —
  // render bare rather than guess a role's sidebar.
  if (!RoleLayout) return <>{children}</>;

  return <RoleLayout>{children}</RoleLayout>;
}
