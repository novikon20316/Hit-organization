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
        isActive: (pathname, sp) => pathname === '/faculty_admin/dashboard' && (!sp.get('tab') || sp.get('tab') === 'overview'),
      },
      {
        key: 'users',
        icon: '🧑‍💼',
        href: '/faculty_admin/dashboard?tab=users',
        label: { he: 'משתמשים', en: 'Users' },
        isActive: (pathname, sp) => pathname === '/faculty_admin/dashboard' && sp.get('tab') === 'users',
      },
      {
        key: 'projects',
        icon: '📁',
        href: '/faculty_admin/dashboard?tab=projects',
        label: { he: 'פרויקטים', en: 'Projects' },
        isActive: (pathname, sp) => pathname === '/faculty_admin/dashboard' && sp.get('tab') === 'projects',
      },
      {
        key: 'students',
        icon: '🎓',
        href: '/faculty_admin/dashboard?tab=students',
        label: { he: 'רשימת סטודנטים', en: 'Students List' },
        isActive: (pathname, sp) => pathname === '/faculty_admin/dashboard' && sp.get('tab') === 'students',
      },
      {
        key: 'deadlines',
        icon: '⏰',
        href: '/faculty_admin/dashboard?tab=deadlines',
        label: { he: 'מועדי הגשה', en: 'Deadlines' },
        isActive: (pathname, sp) => pathname === '/faculty_admin/dashboard' && sp.get('tab') === 'deadlines',
      },
      {
        key: 'signoffs',
        icon: '✅',
        href: '/faculty_admin/dashboard?tab=signoffs',
        label: { he: 'ממתין לאישור ציונים ובוחנים', en: 'Awaiting Grade/Examiner Approval' },
        isActive: (pathname, sp) => pathname === '/faculty_admin/dashboard' && sp.get('tab') === 'signoffs',
      },
      {
        key: 'projectTemplates',
        icon: '📋',
        href: '/faculty_admin/templates',
        label: { he: 'תבניות פרויקט', en: 'Project Templates' },
        isActive: (pathname) => pathname === '/faculty_admin/templates',
      },
      {
        key: 'workflowTemplates',
        icon: '🧬',
        href: '/workflow-templates',
        label: { he: 'תבניות תהליך', en: 'Process Templates' },
        isActive: (pathname) => pathname === '/workflow-templates',
      },
      {
        key: 'bulkPermissions',
        icon: '🛡️',
        href: '/bulk-permissions',
        label: { he: 'הרשאות מרוכזות', en: 'Bulk Permissions' },
        isActive: (pathname) => pathname === '/bulk-permissions',
      },
      {
        key: 'reports',
        icon: '📈',
        href: '/reports',
        label: { he: 'דוחות', en: 'Reports' },
        isActive: (pathname) => pathname === '/reports',
      },
      {
        key: 'records',
        icon: '📜',
        href: '/faculty_admin/records',
        label: { he: 'רישומי פרויקטים', en: 'Project Records' },
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
      isActive: (pathname, sp) => pathname === '/faculty_admin/dashboard' && sp.get('modal') === 'newProject',
    },
  ],
};
