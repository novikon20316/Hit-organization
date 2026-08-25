'use client';

// app/faculty_admin/layout.tsx
// A client component — see app/admin/layout.tsx's note (NAV_SECTIONS'
// isActive functions can't cross the server/client boundary as props).
//
// Migrates faculty_admin's DashboardShell hamburger-menu actions (Project
// Templates, Process Templates, Committees, Bulk Permissions, Reports,
// Post New Project) into the persistent collapsible sidebar. Also covers
// /faculty_admin/templates (no layout of its own needed — it's nested
// under this route).
//
// NAV_SECTIONS/QUICK_ACTIONS are exported so app/program_head/layout.tsx can
// show a faculty_admin who also holds 'program_head' as an additional role
// THIS sidebar instead of the program_head one — see that file's comment.

import { SidebarShell, type SidebarSection } from '@/components/dashboard/SidebarShell';

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
        key: 'committees',
        icon: '🧑‍⚖️',
        href: '/committees',
        label: { he: 'ועדות', en: 'Committees' },
        isActive: (pathname) => pathname === '/committees',
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

export default function FacultyAdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarShell
      brand={{ name: 'HIT', subtitle: { he: 'פורטל ראש מנהל פקולטה', en: 'Faculty Admin Portal' } }}
      sections={FACULTY_ADMIN_NAV_SECTIONS}
      quickActions={FACULTY_ADMIN_QUICK_ACTIONS}
      theme={{ mode: 'accent' }}
    >
      {children}
    </SidebarShell>
  );
}
