// app/grad_school_head/navSections.ts
// The grad_school_head sidebar's nav content, pulled out of layout.tsx into
// this leaf module so lib/roleChrome.ts can import it too (for any route
// where the signed-in user's activeRole is grad_school_head, not just this
// role's own /grad_school_head/* tree) without a layout-to-layout circular
// import — same split as app/coordinator/navSections.ts.

import type { SidebarSection } from '@/components/dashboard/SidebarShell';
import { withinCoordinatorScope, CS_MASTERS_SCOPE } from '@/lib/permissions';

export const GRAD_SCHOOL_HEAD_NAV_SECTIONS: SidebarSection[] = [
  {
    title: { he: 'ניווט', en: 'Navigation' },
    items: [
      {
        key: 'overview',
        icon: '📊',
        href: '/grad_school_head/dashboard',
        label: { he: 'סקירה כללית', en: 'Overview' },
        description: {
          he: 'תמונת מצב חוצת-פקולטות של כל מה שדורש את תשומת ליבך כרגע.',
          en: 'A cross-faculty snapshot of everything that needs your attention right now.',
        },
        isActive: (pathname, sp) => pathname === '/grad_school_head/dashboard' && (!sp.get('tab') || sp.get('tab') === 'overview'),
      },
      {
        key: 'approvals',
        icon: '✅',
        href: '/grad_school_head/dashboard?tab=approvals',
        label: { he: 'ממתין לאישורי', en: 'Approvals' },
        description: {
          he: 'החלטות הממתינות לך ברמת בית הספר ללימודי מוסמך — מנחים, בוחנים, הצעות וציונים.',
          en: 'Decisions waiting on you at the grad-school level — supervisors, examiners, proposals, and grades.',
        },
        isActive: (pathname, sp) => pathname === '/grad_school_head/dashboard' && sp.get('tab') === 'approvals',
        badgeTargetScreens: ['grad_school_head_approvals'],
      },
      {
        key: 'stuck',
        icon: '🚧',
        href: '/grad_school_head/dashboard?tab=stuck',
        label: { he: 'תקועים', en: 'Stuck' },
        description: {
          he: 'פרויקטים שנתקעו ללא התקדמות לאחרונה, בכל הפקולטות.',
          en: 'Projects that have stalled with no recent progress, across every faculty.',
        },
        isActive: (pathname, sp) => pathname === '/grad_school_head/dashboard' && sp.get('tab') === 'stuck',
      },
      {
        key: 'examiners',
        icon: '🧑‍⚖️',
        href: '/grad_school_head/dashboard?tab=examiners',
        label: { he: 'עומס בוחנים', en: 'Examiners' },
        description: {
          he: 'עומס העבודה הנוכחי של כל בוחן, כדי לעזור לאזן הקצאות חדשות.',
          en: "Each examiner's current workload, to help balance new assignments.",
        },
        isActive: (pathname, sp) => pathname === '/grad_school_head/dashboard' && sp.get('tab') === 'examiners',
        badgeTargetScreens: ['grad_school_head_examiners'],
      },
      {
        key: 'grades',
        icon: '🎓',
        href: '/grad_school_head/dashboard?tab=grades',
        label: { he: 'ציונים מאושרים', en: 'Approved Grades' },
        description: {
          he: 'ציונים סופיים שהשלימו את תהליך האישור ברמת בית הספר ללימודי מוסמך.',
          en: 'Final grades that have completed grad-school approval.',
        },
        isActive: (pathname, sp) => pathname === '/grad_school_head/dashboard' && sp.get('tab') === 'grades',
      },
      {
        key: 'staff',
        icon: '🧑‍💼',
        href: '/grad_school_head/dashboard?tab=staff',
        label: { he: 'סגל', en: 'Staff' },
        description: {
          he: 'חשבונות סגל בכל הפקולטות.',
          en: 'Staff accounts across every faculty.',
        },
        isActive: (pathname, sp) => pathname === '/grad_school_head/dashboard' && sp.get('tab') === 'staff',
      },
      {
        key: 'students',
        icon: '🎓',
        href: '/grad_school_head/dashboard?tab=students',
        label: { he: 'רשימת סטודנטים', en: 'Students List' },
        description: {
          he: 'רשימה מלאה של הסטודנטים בכל הפקולטות.',
          en: 'The full list of students across every faculty.',
        },
        isActive: (pathname, sp) => pathname === '/grad_school_head/dashboard' && sp.get('tab') === 'students',
      },
      {
        key: 'ungraded',
        icon: '📝',
        href: '/grad_school_head/dashboard?tab=ungraded',
        label: { he: 'סטודנטים ללא ציון ממוצע', en: 'Students Without a Grade Average' },
        description: {
          he: 'סטודנטים ללא ציון ממוצע מחושב — סקור או טפל בהם כאן.',
          en: 'Students without a computed grade average — review or resolve them here.',
        },
        isActive: (pathname, sp) => pathname === '/grad_school_head/dashboard' && sp.get('tab') === 'ungraded',
        // Only ever lists computer_science master's students (see
        // UngradedCsMastersTab.tsx) — a grad_school_head not scoped to that
        // population (e.g. a different faculty) shouldn't see the link.
        // Mirrors the CS_MASTERS_SCOPE check the page itself re-verifies.
        visible: (userData) => withinCoordinatorScope(userData, CS_MASTERS_SCOPE),
      },
      {
        key: 'workflowTemplates',
        icon: '🧬',
        href: '/workflow-templates',
        label: { he: 'תבניות תהליך', en: 'Process Templates' },
        description: {
          he: 'שרשראות אבני הדרך והאישורים שבהן פרויקטים מתנהלים בכל הפקולטות — ערוך אותן כאן.',
          en: 'The milestone/approval chains projects follow across every faculty — edit them here.',
        },
        isActive: (pathname) => pathname === '/workflow-templates',
      },
      {
        key: 'bulkPermissions',
        icon: '🛡️',
        href: '/bulk-permissions',
        label: { he: 'הרשאות מרוכזות', en: 'Bulk Permissions' },
        description: {
          he: 'הענק או שלול הרשאות ספציפיות להרבה חשבונות סגל בבת אחת, בכל הפקולטות.',
          en: 'Grant or revoke specific permissions for many staff accounts at once, across faculties.',
        },
        isActive: (pathname) => pathname === '/bulk-permissions',
      },
      {
        key: 'reports',
        icon: '📈',
        href: '/reports',
        label: { he: 'דוחות', en: 'Reports' },
        description: {
          he: 'הפק וייצא דוחות מפורטים על כל הפקולטות.',
          en: 'Generate and export detailed reports across every faculty.',
        },
        isActive: (pathname) => pathname === '/reports',
      },
      {
        key: 'records',
        icon: '📜',
        href: '/grad_school_head/records',
        label: { he: 'רישומי פרויקטים', en: 'Project Records' },
        description: {
          he: 'ארכיון קבוע לחיפוש של כל פרויקט בכל הפקולטות.',
          en: 'A permanent, searchable archive of every project across every faculty.',
        },
        isActive: (pathname) => pathname.startsWith('/grad_school_head/records'),
      },
    ],
  },
];

export const GRAD_SCHOOL_HEAD_QUICK_ACTIONS: SidebarSection = {
  title: { he: 'פעולות מהירות', en: 'Quick Actions' },
  items: [
    {
      key: 'newProject',
      icon: '📁',
      // Preserves whatever ?tab= is already open on the dashboard — opening
      // "Post New Project" from the Stuck tab shouldn't bounce the user
      // back to Approvals once they close it. Same pattern as
      // app/admin/layout.tsx's QUICK_ACTIONS.
      href: (sp: URLSearchParams) => `/grad_school_head/dashboard?${sp.get('tab') ? `tab=${sp.get('tab')}&` : ''}modal=newProject`,
      label: { he: 'פרסום פרויקט חדש', en: 'Post New Project' },
      description: {
        he: 'פרסם פרויקט חדש בשם כל מנחה, בכל פקולטה.',
        en: 'Post a new project on behalf of any supervisor, in any faculty.',
      },
      isActive: (pathname, sp) => pathname === '/grad_school_head/dashboard' && sp.get('modal') === 'newProject',
    },
  ],
};
