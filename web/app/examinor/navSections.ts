// app/examinor/navSections.ts
// The internal_examiner sidebar's nav content, pulled out of layout.tsx
// into this leaf module so lib/roleChrome.ts can import it too (for any
// route where the signed-in user's activeRole is internal_examiner, not
// just this role's own /examinor/* tree) without a layout-to-layout
// circular import — same split as app/coordinator/navSections.ts.

import type { SidebarSection } from '@/components/dashboard/SidebarShell';

export const EXAMINOR_NAV_SECTIONS: SidebarSection[] = [
  {
    title: { he: 'ניווט', en: 'Navigation' },
    items: [
      {
        key: 'home',
        icon: '🎓',
        href: '/examinor/home',
        label: { he: 'הגנות לבחינה', en: 'Defenses' },
        description: {
          he: 'הגנות שהוקצו לך לבחינה — כאן תדרג/י את העבודה הכתובה ואת ההגנה עצמה.',
          en: "Defenses you've been assigned to examine — grade the written work and the defense itself here.",
        },
        isActive: (pathname, sp) => pathname === '/examinor/home' && (!sp.get('tab') || sp.get('tab') === 'defenses'),
      },
      {
        key: 'schedule',
        icon: '📅',
        href: '/examinor/home?tab=schedule',
        label: { he: 'לוח זמנים', en: 'Schedule' },
        description: {
          he: 'מועדי ההגנות הקרובים שלך, והמקום להגיש בו את התאריכים שבהם את/ה פנוי/ה.',
          en: "Your upcoming defense dates, and where to submit the dates you're available for.",
        },
        isActive: (pathname, sp) => pathname === '/examinor/home' && sp.get('tab') === 'schedule',
      },
    ],
  },
];
