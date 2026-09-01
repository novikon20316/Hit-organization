// app/administrative_coordinator/navSections.ts
// The administrative_secretary sidebar's nav content, pulled out of
// layout.tsx into this leaf module so app/coordinator/layout.tsx can import
// it too (for an administrative_secretary who lands on /coordinator/home,
// a route she shares with coordinator/system_admin — see that file's own
// comment) without a layout-to-layout circular import.

import type { SidebarSection } from '@/components/dashboard/SidebarShell';

export const ADMINISTRATIVE_COORDINATOR_NAV_SECTIONS: SidebarSection[] = [
  {
    title: { he: 'ניווט', en: 'Navigation' },
    items: [
      {
        key: 'home',
        icon: '🏠',
        href: '/administrative_coordinator/dashboard',
        label: { he: 'בית', en: 'Home' },
        description: {
          he: 'לוח הבקרה שלך — תמונת מצב של כל מה שדורש את תשומת ליבך כרגע.',
          en: "Your dashboard — a snapshot of everything that needs your attention right now.",
        },
        isActive: (pathname, sp) => pathname === '/administrative_coordinator/dashboard' && (!sp.get('tab') || sp.get('tab') === 'groups'),
      },
      {
        key: 'students',
        icon: '🧑‍🎓',
        href: '/administrative_coordinator/dashboard?tab=students',
        label: { he: 'דוח סטודנטים', en: 'Students Report' },
        description: {
          he: 'דוח על כל סטודנט והסטטוס וההתקדמות הנוכחיים שלו.',
          en: 'A report of every student and their current status and progress.',
        },
        isActive: (pathname, sp) => pathname === '/administrative_coordinator/dashboard' && sp.get('tab') === 'students',
      },
      {
        key: 'overrides',
        icon: '✅',
        href: '/administrative_coordinator/dashboard?tab=overrides',
        label: { he: 'אישור ציונים סופיים', en: 'Final Grade Approvals' },
        description: {
          he: 'ציונים סופיים הממתינים לאישורך לפני העברתם למכלול.',
          en: 'Final grades waiting for your approval before they get transferred to Maklol.',
        },
        isActive: (pathname, sp) => pathname === '/administrative_coordinator/dashboard' && sp.get('tab') === 'overrides',
      },
      {
        key: 'ungraded',
        icon: '📝',
        href: '/administrative_coordinator/dashboard?tab=ungraded',
        label: { he: 'סטודנטים ללא ציון ממוצע', en: 'Students Without a Grade Average' },
        description: {
          he: 'סטודנטים שעדיין אין להם ציון ממוצע מחושב — סקור או טפל בהם כאן.',
          en: "Students who don't yet have a computed grade average — review or resolve them here.",
        },
        isActive: (pathname, sp) => pathname === '/administrative_coordinator/dashboard' && sp.get('tab') === 'ungraded',
      },
      {
        key: 'statistics',
        icon: '🧮',
        href: '/administrative_coordinator/dashboard?tab=statistics',
        label: { he: 'סטטיסטיקות', en: 'Statistics' },
        description: {
          he: 'נתונים מצטברים על סטודנטים, מתן ציונים ואישורים.',
          en: 'Aggregate numbers on students, grading, and approvals.',
        },
        isActive: (pathname, sp) => pathname === '/administrative_coordinator/dashboard' && sp.get('tab') === 'statistics',
      },
      {
        key: 'workflowTemplates',
        icon: '🧬',
        href: '/workflow-templates',
        label: { he: 'תבניות תהליך', en: 'Process Templates' },
        description: {
          he: 'שרשראות אבני הדרך והאישורים שבהן פרויקטים מתנהלים — ערוך אותן כאן.',
          en: 'The milestone/approval chains projects follow — edit them here.',
        },
        isActive: (pathname) => pathname === '/workflow-templates',
      },
      {
        key: 'academicYear',
        icon: '🎓',
        href: '/academic-year',
        label: { he: 'שנת לימודים', en: 'Academic Year' },
        description: {
          he: 'הגדר את שנת הלימודים הנוכחית ואת התאריכים המרכזיים שלה.',
          en: 'Configure the current academic year and its key dates.',
        },
        isActive: (pathname) => pathname === '/academic-year',
      },
      {
        key: 'records',
        icon: '📜',
        href: '/administrative_coordinator/records',
        label: { he: 'רישומי פרויקטים', en: 'Project Records' },
        description: {
          he: 'ארכיון קבוע לחיפוש של כל פרויקט שטופל.',
          en: 'A permanent, searchable archive of every handled project.',
        },
        isActive: (pathname) => pathname.startsWith('/administrative_coordinator/records'),
      },
    ],
  },
];
