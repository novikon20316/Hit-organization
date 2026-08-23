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
      ],
    },
  ];
}

export default function ProgramHeadLayout({ children }: { children: React.ReactNode }) {
  const { roles } = useAuth();

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
