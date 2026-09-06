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
        description: {
          he: 'כל הפרויקטים שאתה מנחה — הסטודנטים הרשומים, ההתקדמות באבני הדרך ומתן הציונים.',
          en: 'Every project you supervise — enrolled students, milestone progress, and grading.',
        },
        isActive: (pathname, sp) => pathname === '/supervisor/dashboard' && (!sp.get('tab') || sp.get('tab') === 'projects'),
        badgeTargetScreens: ['supervisor_projects'],
      },
      {
        key: 'applications',
        icon: '📨',
        href: '/supervisor/dashboard?tab=applications',
        label: { he: 'מועמדויות', en: 'Applications' },
        description: {
          he: 'מועמדויות של סטודנטים לפרויקטים הפתוחים שלך — אשר או דחה אותן כאן.',
          en: 'Student applications to your open projects — review, approve, or decline them here.',
        },
        isActive: (pathname, sp) => pathname === '/supervisor/dashboard' && sp.get('tab') === 'applications',
        badgeTargetScreens: ['supervisor_applications'],
      },
      {
        key: 'signoffs',
        icon: '✅',
        href: '/supervisor/dashboard?tab=signoffs',
        label: { he: 'ממתין לאישור ציונים ובוחנים', en: 'Awaiting Grade/Examiner Approval' },
        description: {
          he: 'ציונים ומינויי בוחנים שהגשת, שעדיין ממתינים לאישור הרכז או בית הספר ללימודי מוסמך.',
          en: "Grades and examiner assignments you've submitted that are still waiting on coordinator or grad-school approval.",
        },
        isActive: (pathname, sp) => pathname === '/supervisor/dashboard' && sp.get('tab') === 'signoffs',
        badgeTargetScreens: ['supervisor_signoffs'],
      },
      {
        key: 'records',
        icon: '📜',
        href: '/supervisor/records',
        label: { he: 'רישומי פרויקטים', en: 'Project Records' },
        description: {
          he: 'ארכיון לחיפוש של כל פרויקט שהנחית, כולל פרויקטים שהסתיימו.',
          en: "A searchable archive of every project you've supervised, including completed ones.",
        },
        isActive: (pathname) => pathname.startsWith('/supervisor/records'),
      },
    ],
  },
];
