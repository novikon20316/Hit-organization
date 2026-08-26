'use client';

// app/supervisor/layout.tsx
// A client component — see app/admin/layout.tsx's note (NAV_SECTIONS'
// isActive functions can't cross the server/client boundary as props).
//
// Both supervisor/secondary_supervisor share this route — SidebarShell's
// 'accent' theme reads the signed-in user's own activeRole internally, so
// each automatically gets their own distinct accent color here even though
// they share this one layout.
//
// No "Recommend Examiners" nav item / quick action anymore — that flow now
// happens right after project creation (or via a project card's own
// button), never a standalone tab or sidebar entry. See
// supervisor/dashboard/RecommendExaminersModal.tsx.

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
        key: 'signoffs',
        icon: '✅',
        href: '/supervisor/dashboard?tab=signoffs',
        label: { he: 'ממתין לאישור ציונים ובוחנים', en: 'Awaiting Grade/Examiner Approval' },
        isActive: (pathname, sp) => pathname === '/supervisor/dashboard' && sp.get('tab') === 'signoffs',
      },
      {
        key: 'records',
        icon: '📜',
        href: '/supervisor/records',
        label: { he: 'רישומי פרויקטים', en: 'Project Records' },
        isActive: (pathname) => pathname.startsWith('/supervisor/records'),
      },
    ],
  },
];

export default function SupervisorLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarShell
      brand={{ name: 'HIT', subtitle: { he: 'פורטל מנחה', en: 'Supervisor Portal' } }}
      sections={NAV_SECTIONS}
      theme={{ mode: 'accent' }}
    >
      {children}
    </SidebarShell>
  );
}
