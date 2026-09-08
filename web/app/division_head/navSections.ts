// app/division_head/navSections.ts
// division_head's sidebar content — a deliberately minimal single-item menu,
// since this role's only job today is signing off on the "Head of Division"
// stage of the Electrical Engineering research-proposal chain (see
// server/src/scripts for the workflow-template seed script that routes a
// stage to this role). Pulled into its own leaf module so lib/roleChrome.ts
// can import it without a layout-to-layout circular import — same split as
// app/grad_school_head/navSections.ts.

import type { SidebarSection } from '@/components/dashboard/SidebarShell';

export const DIVISION_HEAD_NAV_SECTIONS: SidebarSection[] = [
  {
    title: { he: 'ניווט', en: 'Navigation' },
    items: [
      {
        key: 'dashboard',
        icon: '✅',
        href: '/division_head/dashboard',
        label: { he: 'ממתין לאישורי', en: 'Pending Approvals' },
        description: {
          he: 'הצעות מחקר הממתינות לאישור ראש התחום.',
          en: 'Research proposals awaiting the Head of Division\'s sign-off.',
        },
        isActive: (pathname) => pathname === '/division_head/dashboard',
        badgeTargetScreens: ['division_head_pending'],
      },
    ],
  },
];
