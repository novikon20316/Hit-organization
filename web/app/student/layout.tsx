'use client';

// app/student/layout.tsx
// A client component — its NAV_SECTIONS includes plain functions
// (isActive), which can't cross the server/client boundary as props to
// the client SidebarShell (see app/admin/layout.tsx for the full note).
//
// student never had any DashboardShell hamburger-menu actions to migrate —
// this just gives the role the same collapsible sidebar shell every other
// role now has, for consistency, with a single Home link.

import { SidebarShell, type SidebarSection } from '@/components/dashboard/SidebarShell';

const NAV_SECTIONS: SidebarSection[] = [
  {
    title: { he: 'ניווט', en: 'Navigation' },
    items: [
      {
        key: 'home',
        icon: '🏠',
        href: '/student/home',
        label: { he: 'בית', en: 'Home' },
        isActive: (pathname) => pathname === '/student/home',
      },
    ],
  },
];

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarShell
      brand={{ name: 'HIT', subtitle: { he: 'פורטל סטודנט', en: 'Student Portal' } }}
      sections={NAV_SECTIONS}
      theme={{ mode: 'accent' }}
    >
      {children}
    </SidebarShell>
  );
}
