'use client';

// app/program_head/layout.tsx
// A client component — see app/admin/layout.tsx's note (NAV_SECTIONS'
// isActive functions can't cross the server/client boundary as props).
//
// Migrates program_head's DashboardShell hamburger-menu actions (just one:
// Committees) into the persistent collapsible sidebar, plus the dashboard
// page's own former in-page tab bar (Students/Approvals/Supervisors/Staff/
// My Projects) — same URL-as-source-of-truth pattern as app/admin/layout.tsx
// + app/admin/panel/page.tsx, so these links switch tabs even when the
// dashboard page is already mounted.
//
// "My Projects" is role-gated: it only exists for a program_head who's ALSO
// a supervisor/secondary_supervisor (see dashboard/page.tsx's
// canCreateOwnProject) — so this section is built inside the component body
// (reading useAuth()) rather than as a static top-level const.

import { useAuth } from '@/contexts/AuthContext';
import { SidebarShell, type SidebarSection } from '@/components/dashboard/SidebarShell';
import { ADMIN_NAV_SECTIONS, ADMIN_QUICK_ACTIONS } from '@/app/admin/navConfig';
import { GRAD_SCHOOL_HEAD_NAV_SECTIONS, GRAD_SCHOOL_HEAD_QUICK_ACTIONS } from '@/app/grad_school_head/layout';
import { FACULTY_ADMIN_NAV_SECTIONS, FACULTY_ADMIN_QUICK_ACTIONS } from '@/app/faculty_admin/layout';

const DASHBOARD = '/program_head/dashboard';

// Exported so app/administrative_coordinator/layout.tsx can show a visiting
// program_head THIS sidebar instead of its own hardcoded "Administrative
// Coordinator" branding — see that file's comment for why that mattered
// (a program_head reaches a student's detail page, which lives under
// /administrative_coordinator/**, from their own dashboard's student
// search).
export function buildProgramHeadNavSections(roles: string[]): SidebarSection[] {
  const canCreateOwnProject = roles.includes('supervisor') || roles.includes('secondary_supervisor');

  return [
    {
      title: { he: 'ניווט', en: 'Navigation' },
      items: [
        {
          key: 'students',
          icon: '🧑‍🎓',
          href: DASHBOARD,
          label: { he: 'סטודנטים', en: 'Students' },
          isActive: (pathname, sp) => pathname === DASHBOARD && (!sp.get('tab') || sp.get('tab') === 'students'),
        },
        {
          key: 'approvals',
          icon: '✅',
          href: `${DASHBOARD}?tab=approvals`,
          label: { he: 'ממתין לאישור', en: 'Approvals' },
          isActive: (pathname, sp) => pathname === DASHBOARD && sp.get('tab') === 'approvals',
        },
        {
          key: 'supervisors',
          icon: '🧑‍🏫',
          href: `${DASHBOARD}?tab=supervisors`,
          label: { he: 'מנחים', en: 'Supervisors' },
          isActive: (pathname, sp) => pathname === DASHBOARD && sp.get('tab') === 'supervisors',
        },
        {
          key: 'staff',
          icon: '🧑‍💼',
          href: `${DASHBOARD}?tab=staff`,
          label: { he: 'סגל', en: 'Staff' },
          isActive: (pathname, sp) => pathname === DASHBOARD && sp.get('tab') === 'staff',
        },
        ...(canCreateOwnProject
          ? [
              {
                key: 'myProjects',
                icon: '📁',
                href: `${DASHBOARD}?tab=myProjects`,
                label: { he: 'הפרויקטים שלי', en: 'My Projects' },
                isActive: (pathname: string, sp: URLSearchParams) => pathname === DASHBOARD && sp.get('tab') === 'myProjects',
              },
            ]
          : []),
        {
          key: 'committees',
          icon: '🧑‍⚖️',
          href: '/committees',
          label: { he: 'ועדות', en: 'Committees' },
          isActive: (pathname) => pathname === '/committees',
        },
        {
          key: 'records',
          icon: '📜',
          href: '/program_head/records',
          label: { he: 'רישומי פרויקטים', en: 'Project Records' },
          isActive: (pathname: string) => pathname.startsWith('/program_head/records'),
        },
      ],
    },
  ];
}

export default function ProgramHeadLayout({ children }: { children: React.ReactNode }) {
  const { activeRole, roles } = useAuth();

  // A system_admin has standing oversight access to this dashboard (see
  // navConfig.ts's "programHead" link) — before this fix they'd see the
  // program_head's own sidebar here, making it look like their role had
  // changed. Same fix/pattern as app/workflow-templates/layout.tsx and
  // app/administrative_coordinator/layout.tsx's system_admin branches.
  if (activeRole === 'system_admin') {
    return (
      <SidebarShell
        brand={{ name: 'HIT', subtitle: { he: 'פורטל מנהל מערכת', en: 'System Admin Portal' } }}
        sections={ADMIN_NAV_SECTIONS}
        quickActions={ADMIN_QUICK_ACTIONS}
        theme={{ mode: 'tokens', tokenPrefix: 'admin' }}
      >
        {children}
      </SidebarShell>
    );
  }

  // Same issue, same fix, for a grad_school_head/faculty_admin who ALSO
  // holds 'program_head' as an additional role (assignable via
  // EditUserModal's "Additional Roles" picker) — resolveActiveRole ranks
  // both above program_head, so this is who they really are even while
  // they're on this page (e.g. via a hand-typed URL or a shared link).
  if (activeRole === 'grad_school_head') {
    return (
      <SidebarShell
        brand={{ name: 'HIT', subtitle: { he: 'פורטל ראש בית ספר ללימודי מוסמכים', en: 'Grad School Head Portal' } }}
        sections={GRAD_SCHOOL_HEAD_NAV_SECTIONS}
        quickActions={GRAD_SCHOOL_HEAD_QUICK_ACTIONS}
        theme={{ mode: 'accent' }}
      >
        {children}
      </SidebarShell>
    );
  }

  if (activeRole === 'faculty_admin') {
    return (
      <SidebarShell
        brand={{ name: 'HIT', subtitle: { he: 'פורטל ראש מנהל פקולטה', en: 'Faculty Admin Portal' } }}
        sections={FACULTY_ADMIN_NAV_SECTIONS}
        quickActions={FACULTY_ADMIN_QUICK_ACTIONS}
        theme={{ mode: 'accent' }}
      >
        {children}
      </SidebarShell>
    );
  }

  return (
    <SidebarShell
      brand={{ name: 'HIT', subtitle: { he: 'פורטל ראש תוכנית', en: 'Program Head Portal' } }}
      sections={buildProgramHeadNavSections(roles)}
      theme={{ mode: 'accent' }}
    >
      {children}
    </SidebarShell>
  );
}
