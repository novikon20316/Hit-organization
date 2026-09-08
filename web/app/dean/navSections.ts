// app/dean/navSections.ts
// dean's sidebar content — a deliberately minimal single-item menu, mirrors
// app/division_head/navSections.ts. This role's only job today is the
// terminal sign-off on the Electrical Engineering research-proposal chain.

import type { SidebarSection } from '@/components/dashboard/SidebarShell';

export const DEAN_NAV_SECTIONS: SidebarSection[] = [
  {
    title: { he: 'ניווט', en: 'Navigation' },
    items: [
      {
        key: 'dashboard',
        icon: '✅',
        href: '/dean/dashboard',
        label: { he: 'ממתין לאישורי', en: 'Pending Approvals' },
        description: {
          he: 'הצעות מחקר הממתינות לאישור דיקן הפקולטה.',
          en: "Research proposals awaiting the Dean's sign-off.",
        },
        isActive: (pathname) => pathname === '/dean/dashboard',
        badgeTargetScreens: ['dean_pending'],
      },
    ],
  },
];
