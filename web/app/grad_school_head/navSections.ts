// app/grad_school_head/navSections.ts
// The grad_school_head sidebar's nav content, pulled out of layout.tsx into
// this leaf module so lib/roleChrome.ts can import it too (for any route
// where the signed-in user's activeRole is grad_school_head, not just this
// role's own /grad_school_head/* tree) without a layout-to-layout circular
// import — same split as app/coordinator/navSections.ts.

import type { SidebarSection } from '@/components/dashboard/SidebarShell';

export const GRAD_SCHOOL_HEAD_NAV_SECTIONS: SidebarSection[] = [
  {
    title: { he: 'ניווט', en: 'Navigation' },
    items: [
      {
        key: 'overview',
        icon: '📊',
        href: '/grad_school_head/dashboard',
        label: { he: 'סקירה כללית', en: 'Overview' },
        isActive: (pathname, sp) => pathname === '/grad_school_head/dashboard' && (!sp.get('tab') || sp.get('tab') === 'overview'),
      },
      {
        key: 'approvals',
        icon: '✅',
        href: '/grad_school_head/dashboard?tab=approvals',
        label: { he: 'ממתין לאישורי', en: 'Approvals' },
        isActive: (pathname, sp) => pathname === '/grad_school_head/dashboard' && sp.get('tab') === 'approvals',
      },
      {
        key: 'stuck',
        icon: '🚧',
        href: '/grad_school_head/dashboard?tab=stuck',
        label: { he: 'תקועים', en: 'Stuck' },
        isActive: (pathname, sp) => pathname === '/grad_school_head/dashboard' && sp.get('tab') === 'stuck',
      },
      {
        key: 'examiners',
        icon: '🧑‍⚖️',
        href: '/grad_school_head/dashboard?tab=examiners',
        label: { he: 'עומס בוחנים', en: 'Examiners' },
        isActive: (pathname, sp) => pathname === '/grad_school_head/dashboard' && sp.get('tab') === 'examiners',
      },
      {
        key: 'grades',
        icon: '🎓',
        href: '/grad_school_head/dashboard?tab=grades',
        label: { he: 'ציונים מאושרים', en: 'Approved Grades' },
        isActive: (pathname, sp) => pathname === '/grad_school_head/dashboard' && sp.get('tab') === 'grades',
      },
      {
        key: 'staff',
        icon: '🧑‍💼',
        href: '/grad_school_head/dashboard?tab=staff',
        label: { he: 'סגל', en: 'Staff' },
        isActive: (pathname, sp) => pathname === '/grad_school_head/dashboard' && sp.get('tab') === 'staff',
      },
      {
        key: 'students',
        icon: '🎓',
        href: '/grad_school_head/dashboard?tab=students',
        label: { he: 'רשימת סטודנטים', en: 'Students List' },
        isActive: (pathname, sp) => pathname === '/grad_school_head/dashboard' && sp.get('tab') === 'students',
      },
      {
        key: 'ungraded',
        icon: '📝',
        href: '/grad_school_head/dashboard?tab=ungraded',
        label: { he: 'סטודנטים ללא ציון ממוצע', en: 'Students Without a Grade Average' },
        isActive: (pathname, sp) => pathname === '/grad_school_head/dashboard' && sp.get('tab') === 'ungraded',
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
        href: '/grad_school_head/records',
        label: { he: 'רישומי פרויקטים', en: 'Project Records' },
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
      isActive: (pathname, sp) => pathname === '/grad_school_head/dashboard' && sp.get('modal') === 'newProject',
    },
  ],
};
