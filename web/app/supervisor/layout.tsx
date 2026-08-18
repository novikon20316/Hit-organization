'use client';

// app/supervisor/layout.tsx
// A client component — see app/admin/layout.tsx's note (NAV_SECTIONS'
// isActive functions can't cross the server/client boundary as props).
//
// Migrates supervisor/secondary_supervisor's one DashboardShell hamburger
// action (New Recommendation) into the persistent collapsible sidebar.
// Both roles share this route — SidebarShell's 'accent' theme reads the
// signed-in user's own activeRole internally, so supervisor and
// secondary_supervisor automatically get their own distinct accent color
// here even though they share this one layout.

import { SidebarShell, type SidebarSection } from '@/components/dashboard/SidebarShell';

const NAV_SECTIONS: SidebarSection[] = [
  {
    title: { he: 'ניווט', en: 'Navigation' },
    items: [
      {
        key: 'home',
        icon: '🏠',
        href: '/supervisor/dashboard',
        label: { he: 'בית', en: 'Home' },
        isActive: (pathname) => pathname === '/supervisor/dashboard',
      },
    ],
  },
];

const QUICK_ACTIONS: SidebarSection = {
  title: { he: 'פעולות מהירות', en: 'Quick Actions' },
  items: [
    {
      key: 'recommend',
      icon: '📝',
      href: '/supervisor/dashboard?modal=recommend',
      label: { he: 'המלצה חדשה', en: 'New Recommendation' },
      isActive: (pathname, sp) => pathname === '/supervisor/dashboard' && sp.get('modal') === 'recommend',
    },
  ],
};

export default function SupervisorLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarShell
      brand={{ name: 'HIT', subtitle: { he: 'פורטל מנחה', en: 'Supervisor Portal' } }}
      sections={NAV_SECTIONS}
      quickActions={QUICK_ACTIONS}
      theme={{ mode: 'accent' }}
    >
      {children}
    </SidebarShell>
  );
}
