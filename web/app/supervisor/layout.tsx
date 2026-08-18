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
        icon: '📁',
        href: '/supervisor/dashboard',
        label: { he: 'הפרויקטים שלי', en: 'My Projects' },
        isActive: (pathname, sp) => pathname === '/supervisor/dashboard' && (!sp.get('tab') || sp.get('tab') === 'projects'),
      },
      {
        key: 'applications',
        icon: '📨',
        href: '/supervisor/dashboard?tab=applications',
        label: { he: 'מועמדויות', en: 'Applications' },
        isActive: (pathname, sp) => pathname === '/supervisor/dashboard' && sp.get('tab') === 'applications',
      },
      {
        key: 'recommendTab',
        icon: '🧑‍⚖️',
        href: '/supervisor/dashboard?tab=recommend',
        label: { he: 'המלצת בוחנים', en: 'Recommend Examiners' },
        isActive: (pathname, sp) => pathname === '/supervisor/dashboard' && sp.get('tab') === 'recommend',
      },
      {
        key: 'signoffs',
        icon: '✅',
        href: '/supervisor/dashboard?tab=signoffs',
        label: { he: 'ממתין לאישורך', en: 'Awaiting Your Sign-off' },
        isActive: (pathname, sp) => pathname === '/supervisor/dashboard' && sp.get('tab') === 'signoffs',
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
      // Preserves whatever ?tab= is already open on /supervisor/dashboard —
      // opening "New Recommendation" from the Applications tab shouldn't
      // bounce the supervisor back to Projects once they close it. Same
      // pattern as admin/layout.tsx's QUICK_ACTIONS.
      href: (sp: URLSearchParams) => `/supervisor/dashboard?${sp.get('tab') ? `tab=${sp.get('tab')}&` : ''}modal=recommend`,
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
