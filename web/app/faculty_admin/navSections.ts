// app/faculty_admin/navSections.ts
// The faculty_admin sidebar's nav content, pulled out of layout.tsx into
// this leaf module so lib/roleChrome.ts can import it too (for any route
// where the signed-in user's activeRole is faculty_admin, not just this
// role's own /faculty_admin/* tree) without a layout-to-layout circular
// import — same split as app/coordinator/navSections.ts.

import type { SidebarSection } from '@/components/dashboard/SidebarShell';

export const FACULTY_ADMIN_NAV_SECTIONS: SidebarSection[] = [
  {
    title: { he: 'ניווט', en: 'Navigation' },
    items: [
      {
        key: 'home',
        icon: '🏠',
        href: '/faculty_admin/dashboard',
        label: { he: 'בית', en: 'Home' },
        description: {
          he: 'לוח הבקרה של הפקולטה שלך — תמונת מצב של כל מה שדורש את תשומת ליבך כרגע.',
          en: "Your faculty's dashboard — a snapshot of everything that needs your attention right now.",
        },
        isActive: (pathname, sp) => pathname === '/faculty_admin/dashboard' && (!sp.get('tab') || sp.get('tab') === 'overview'),
      },
      {
        key: 'users',
        icon: '🧑‍💼',
        href: '/faculty_admin/dashboard?tab=users',
        label: { he: 'משתמשים', en: 'Users' },
        description: {
          he: 'כל חשבונות הסגל בפקולטה שלך — צור, ערוך או השבת מנחים, רכזים ובוחנים.',
          en: 'Every staff account in your faculty — create, edit, or deactivate supervisors, coordinators, and examiners.',
        },
        isActive: (pathname, sp) => pathname === '/faculty_admin/dashboard' && sp.get('tab') === 'users',
      },
      {
        key: 'projects',
        icon: '📁',
        href: '/faculty_admin/dashboard?tab=projects',
        label: { he: 'פרויקטים', en: 'Projects' },
        description: {
          he: 'כל הפרויקטים שפורסמו בפקולטה שלך, בכל הסטטוסים.',
          en: 'Every project posted in your faculty, across every status.',
        },
        isActive: (pathname, sp) => pathname === '/faculty_admin/dashboard' && sp.get('tab') === 'projects',
        badgeTargetScreens: ['faculty_admin_projects'],
      },
      {
        key: 'students',
        icon: '🎓',
        href: '/faculty_admin/dashboard?tab=students',
        label: { he: 'רשימת סטודנטים', en: 'Students List' },
        description: {
          he: 'רשימה מלאה של הסטודנטים הרשומים לתוכניות של הפקולטה שלך.',
          en: "The full list of students enrolled in your faculty's programs.",
        },
        isActive: (pathname, sp) => pathname === '/faculty_admin/dashboard' && sp.get('tab') === 'students',
      },
      {
        key: 'deadlines',
        icon: '⏰',
        href: '/faculty_admin/dashboard?tab=deadlines',
        label: { he: 'מועדי הגשה', en: 'Deadlines' },
        description: {
          he: 'מועדי הגשה קרובים ומועדים שחלפו, בכל הפקולטה.',
          en: 'Upcoming and overdue milestone deadlines across your faculty.',
        },
        isActive: (pathname, sp) => pathname === '/faculty_admin/dashboard' && sp.get('tab') === 'deadlines',
        badgeTargetScreens: ['faculty_admin_deadlines'],
      },
      {
        key: 'signoffs',
        icon: '✅',
        href: '/faculty_admin/dashboard?tab=signoffs',
        label: { he: 'ממתין לאישור ציונים ובוחנים', en: 'Awaiting Grade/Examiner Approval' },
        description: {
          he: 'ציונים ומינויי בוחנים הממתינים לאישור סופי שלך.',
          en: 'Grades and examiner assignments waiting for your final approval.',
        },
        isActive: (pathname, sp) => pathname === '/faculty_admin/dashboard' && sp.get('tab') === 'signoffs',
        badgeTargetScreens: ['faculty_admin_signoffs'],
      },
      {
        key: 'projectTemplates',
        icon: '📋',
        href: '/faculty_admin/templates',
        label: { he: 'תבניות פרויקט', en: 'Project Templates' },
        description: {
          he: 'תבניות פרויקט לשימוש חוזר שמנחים יכולים להתחיל מהן פרויקט חדש.',
          en: 'Reusable project templates supervisors can start new projects from.',
        },
        isActive: (pathname) => pathname === '/faculty_admin/templates',
      },
      {
        key: 'workflowTemplates',
        icon: '🧬',
        href: '/workflow-templates',
        label: { he: 'תבניות תהליך', en: 'Process Templates' },
        description: {
          he: 'שרשראות אבני הדרך והאישורים שבהן פרויקטי הפקולטה מתנהלים — ערוך אותן כאן.',
          en: "The milestone/approval chains your faculty's projects follow — edit them here.",
        },
        isActive: (pathname) => pathname === '/workflow-templates',
      },
      {
        key: 'bulkPermissions',
        icon: '🛡️',
        href: '/bulk-permissions',
        label: { he: 'הרשאות מרוכזות', en: 'Bulk Permissions' },
        description: {
          he: 'הענק או שלול הרשאות ספציפיות להרבה חשבונות סגל בבת אחת.',
          en: 'Grant or revoke specific permissions for many staff accounts at once.',
        },
        isActive: (pathname) => pathname === '/bulk-permissions',
      },
      {
        key: 'reports',
        icon: '📈',
        href: '/reports',
        label: { he: 'דוחות', en: 'Reports' },
        description: {
          he: 'הפק וייצא דוחות מפורטים על פרויקטים, סטודנטים וציונים.',
          en: 'Generate and export detailed reports across projects, students, and grades.',
        },
        isActive: (pathname) => pathname === '/reports',
      },
      {
        key: 'records',
        icon: '📜',
        href: '/faculty_admin/records',
        label: { he: 'רישומי פרויקטים', en: 'Project Records' },
        description: {
          he: 'ארכיון קבוע לחיפוש של כל פרויקט שטופל בפקולטה שלך.',
          en: 'A permanent, searchable archive of every project handled by your faculty.',
        },
        isActive: (pathname) => pathname.startsWith('/faculty_admin/records'),
      },
    ],
  },
];

export const FACULTY_ADMIN_QUICK_ACTIONS: SidebarSection = {
  title: { he: 'פעולות מהירות', en: 'Quick Actions' },
  items: [
    {
      key: 'newProject',
      icon: '📁',
      href: (sp: URLSearchParams) => `/faculty_admin/dashboard?${sp.get('tab') ? `tab=${sp.get('tab')}&` : ''}modal=newProject`,
      label: { he: 'פרסם פרויקט חדש', en: 'Post New Project' },
      description: {
        he: 'פרסם פרויקט חדש בשם מנחה בפקולטה שלך.',
        en: 'Post a new project on behalf of a supervisor in your faculty.',
      },
      isActive: (pathname, sp) => pathname === '/faculty_admin/dashboard' && sp.get('modal') === 'newProject',
    },
  ],
};
