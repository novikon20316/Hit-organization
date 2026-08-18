'use client';

// app/student/layout.tsx
// A client component — its NAV_SECTIONS includes plain functions
// (isActive), which can't cross the server/client boundary as props to
// the client SidebarShell (see app/admin/layout.tsx for the full note).
//
// student never had any DashboardShell hamburger-menu actions to migrate.
// This also migrates ActiveDashboard's former in-page tab bar (Overview /
// Milestones / Grades) into permanent nav entries pointing at the same
// /student/home route via ?tab= — same URL-as-source-of-truth pattern as
// app/admin/layout.tsx + app/admin/panel/page.tsx. These three links are
// only meaningful once the student has an active project (studentState ===
// 'active' in home/page.tsx) — for a student not yet at that stage, they're
// harmless no-ops that just show the same no-project/pending screen.

import { SidebarShell, type SidebarSection } from '@/components/dashboard/SidebarShell';

const NAV_SECTIONS: SidebarSection[] = [
  {
    title: { he: 'ניווט', en: 'Navigation' },
    items: [
      {
        key: 'home',
        icon: '🏠',
        href: '/student/home',
        label: { he: 'סקירה', en: 'Overview' },
        isActive: (pathname, sp) => pathname === '/student/home' && (!sp.get('tab') || sp.get('tab') === 'overview'),
      },
      {
        key: 'milestones',
        icon: '🏁',
        href: '/student/home?tab=milestones',
        label: { he: 'אבני דרך', en: 'Milestones' },
        isActive: (pathname, sp) => pathname === '/student/home' && sp.get('tab') === 'milestones',
      },
      {
        key: 'grades',
        icon: '🎓',
        href: '/student/home?tab=grades',
        label: { he: 'ציונים', en: 'Grades' },
        isActive: (pathname, sp) => pathname === '/student/home' && sp.get('tab') === 'grades',
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
