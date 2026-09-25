// app/school_head/navSections.ts
// Pulled out of layout.tsx so lib/roleChrome.ts can import it too — same
// split as app/grad_school_head/navSections.ts, which this deliberately
// mirrors (minus the staff/ungraded/workflow-template/bulk-permissions
// items — school_head isn't a delegate-admin role and has no cross-faculty
// scope, so those don't apply).

import type { SidebarSection } from '@/components/dashboard/SidebarShell';

export const SCHOOL_HEAD_NAV_SECTIONS: SidebarSection[] = [
  {
    title: { he: 'ניווט', en: 'Navigation' },
    items: [
      {
        key: 'overview',
        icon: '📊',
        href: '/school_head/dashboard',
        label: { he: 'סקירה כללית', en: 'Overview' },
        description: {
          he: 'תמונת מצב של המגמה/ות שלך — כל מה שדורש את תשומת ליבך כרגע.',
          en: 'A snapshot of your assigned major(s) — everything that needs your attention right now.',
        },
        isActive: (pathname, sp) => pathname === '/school_head/dashboard' && (!sp.get('tab') || sp.get('tab') === 'overview'),
      },
      {
        key: 'approvals',
        icon: '✅',
        href: '/school_head/dashboard?tab=approvals',
        label: { he: 'ממתין לאישורי', en: 'Approvals' },
        description: {
          he: 'החלטות הממתינות לך — בוחנים, תבניות וציונים, במגמה/ות שלך בלבד.',
          en: 'Decisions waiting on you — examiners, templates, and grades, within your assigned major(s) only.',
        },
        isActive: (pathname, sp) => pathname === '/school_head/dashboard' && sp.get('tab') === 'approvals',
        badgeTargetScreens: ['school_head_approvals'],
      },
      {
        key: 'stuck',
        icon: '🚧',
        href: '/school_head/dashboard?tab=stuck',
        label: { he: 'תקועים', en: 'Stuck' },
        description: {
          he: 'פרויקטים שנתקעו ללא התקדמות לאחרונה, במגמה/ות שלך.',
          en: 'Projects that have stalled with no recent progress, within your assigned major(s).',
        },
        isActive: (pathname, sp) => pathname === '/school_head/dashboard' && sp.get('tab') === 'stuck',
      },
      {
        key: 'examiners',
        icon: '🧑‍⚖️',
        href: '/school_head/dashboard?tab=examiners',
        label: { he: 'עומס בוחנים', en: 'Examiners' },
        description: {
          he: 'עומס העבודה הנוכחי של כל בוחן במגמה/ות שלך.',
          en: "Each examiner's current workload within your assigned major(s).",
        },
        isActive: (pathname, sp) => pathname === '/school_head/dashboard' && sp.get('tab') === 'examiners',
      },
      {
        key: 'grades',
        icon: '🎓',
        href: '/school_head/dashboard?tab=grades',
        label: { he: 'ציונים מאושרים', en: 'Approved Grades' },
        description: {
          he: 'ציונים סופיים שהושלם עבורם תהליך האישור, במגמה/ות שלך.',
          en: 'Final grades that have completed approval, within your assigned major(s).',
        },
        isActive: (pathname, sp) => pathname === '/school_head/dashboard' && sp.get('tab') === 'grades',
      },
      {
        key: 'students',
        icon: '👥',
        href: '/school_head/dashboard?tab=students',
        label: { he: 'רשימת סטודנטים', en: 'Students List' },
        description: {
          he: 'רשימת הסטודנטים במגמה/ות שלך בלבד.',
          en: 'The list of students within your assigned major(s) only.',
        },
        isActive: (pathname, sp) => pathname === '/school_head/dashboard' && sp.get('tab') === 'students',
      },
    ],
  },
];
