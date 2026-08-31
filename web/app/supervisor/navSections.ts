// app/supervisor/navSections.ts
// The supervisor sidebar's nav content, pulled out of layout.tsx into this
// leaf module so lib/roleChrome.ts can import it too (for any route where
// the signed-in user's activeRole is supervisor/secondary_supervisor, not
// just this role's own /supervisor/* tree) without a layout-to-layout
// circular import — same split as app/coordinator/navSections.ts.

import type { SidebarSection } from '@/components/dashboard/SidebarShell';

export const SUPERVISOR_NAV_SECTIONS: SidebarSection[] = [
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
