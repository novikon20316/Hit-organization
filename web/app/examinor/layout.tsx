'use client';

// app/examinor/layout.tsx
// A client component — see app/admin/layout.tsx's note (NAV_SECTIONS'
// isActive functions can't cross the server/client boundary as props).
//
// internal_examiner never had any DashboardShell hamburger-menu actions to
// migrate — this just gives the role the same collapsible sidebar shell
// every other role now has, for consistency, with a single Home link.

import { SidebarShell, type SidebarSection } from '@/components/dashboard/SidebarShell';

const NAV_SECTIONS: SidebarSection[] = [
  {
    title: { he: 'ניווט', en: 'Navigation' },
    items: [
      {
        key: 'home',
        icon: '🏠',
        href: '/examinor/home',
        label: { he: 'בית', en: 'Home' },
        isActive: (pathname) => pathname === '/examinor/home',
      },
    ],
  },
];

export default function ExaminorLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarShell
      brand={{ name: 'HIT', subtitle: { he: 'פורטל בוחן פנימי', en: 'Examiner Portal' } }}
      sections={NAV_SECTIONS}
      theme={{ mode: 'accent' }}
    >
      {children}
    </SidebarShell>
  );
}
