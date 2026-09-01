// app/student/navSections.ts
// The student sidebar's nav content, pulled out of layout.tsx into this
// leaf module so lib/roleChrome.ts can import it too (for any route where
// the signed-in user's activeRole is student, not just this role's own
// /student/* tree) without a layout-to-layout circular import — same split
// as app/coordinator/navSections.ts.

import type { SidebarSection } from '@/components/dashboard/SidebarShell';

export const STUDENT_NAV_SECTIONS: SidebarSection[] = [
  {
    title: { he: 'ניווט', en: 'Navigation' },
    items: [
      {
        key: 'home',
        icon: '🏠',
        href: '/student/home',
        label: { he: 'סקירה', en: 'Overview' },
        description: {
          he: 'סקירת הפרויקט שלך — הסטטוס הנוכחי, שם המנחה, והמשימה הבאה שממתינה לך.',
          en: "Your project overview — current status, your supervisor, and what's due next.",
        },
        isActive: (pathname, sp) => pathname === '/student/home' && (!sp.get('tab') || sp.get('tab') === 'overview'),
      },
      {
        key: 'milestones',
        icon: '🏁',
        href: '/student/home?tab=milestones',
        label: { he: 'אבני דרך', en: 'Milestones' },
        description: {
          he: 'כל אבני הדרך בתהליך הפרויקט שלך (הצעה, דוחות, הגנה ועוד), מועדי ההגשה וההיסטוריה של ההגשות שלך.',
          en: "Every milestone in your project's workflow (proposal, reports, defense, and more), its due date, and your submission history.",
        },
        isActive: (pathname, sp) => pathname === '/student/home' && sp.get('tab') === 'milestones',
      },
      {
        key: 'grades',
        icon: '🎓',
        href: '/student/home?tab=grades',
        label: { he: 'ציונים', en: 'Grades' },
        description: {
          he: 'הציונים שלך, לפי כל אבן דרך, ככל שהם נכנסים למערכת ומאושרים.',
          en: 'Your grades, milestone by milestone, as they get entered and approved.',
        },
        isActive: (pathname, sp) => pathname === '/student/home' && sp.get('tab') === 'grades',
      },
    ],
  },
];
