'use client';

// app/examinor/layout.tsx
// A client component — see app/admin/layout.tsx's note (NAV_SECTIONS'
// isActive functions can't cross the server/client boundary as props).
//
// internal_examiner never had any DashboardShell hamburger-menu actions to
// migrate. This also migrates home/page.tsx's former in-page tab bar
// (Defenses / Schedule) into permanent nav entries pointing at that same
// route via ?tab= — same URL-as-source-of-truth pattern as
// app/admin/layout.tsx + app/admin/panel/page.tsx.

import { SidebarShell, type SidebarSection } from '@/components/dashboard/SidebarShell';

const NAV_SECTIONS: SidebarSection[] = [
  {
    title: { he: 'ניווט', en: 'Navigation' },
    items: [
      {
        key: 'home',
        icon: '🎓',
        href: '/examinor/home',
        label: { he: 'הגנות לבחינה', en: 'Defenses' },
        isActive: (pathname, sp) => pathname === '/examinor/home' && (!sp.get('tab') || sp.get('tab') === 'defenses'),
      },
      {
        key: 'schedule',
        icon: '📅',
        href: '/examinor/home?tab=schedule',
        label: { he: 'לוח זמנים', en: 'Schedule' },
        isActive: (pathname, sp) => pathname === '/examinor/home' && sp.get('tab') === 'schedule',
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
