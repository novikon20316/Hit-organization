'use client';

// app/grad_school_head/layout.tsx
// A client component — see app/admin/layout.tsx's note (NAV_SECTIONS'
// isActive functions can't cross the server/client boundary as props).
//
// Migrates grad_school_head's DashboardShell hamburger-menu actions
// (Process Templates, Committees, Bulk Permissions, Reports, Post New
// Project) into the persistent collapsible sidebar.
//
// NAV_SECTIONS/QUICK_ACTIONS are exported so app/program_head/layout.tsx can
// show a grad_school_head who also holds 'program_head' as an additional
// role THIS sidebar instead of the program_head one — see that file's
// comment.

import { SidebarShell, type SidebarSection } from '@/components/dashboard/SidebarShell';

export const GRAD_SCHOOL_HEAD_NAV_SECTIONS: SidebarSection[] = [
  {
    title: { he: 'ניווט', en: 'Navigation' },
    items: [
      {
        key: 'approvals',
        icon: '✅',
        href: '/grad_school_head/dashboard',
        label: { he: 'ממתין לאישורי', en: 'Approvals' },
        isActive: (pathname, sp) => pathname === '/grad_school_head/dashboard' && (!sp.get('tab') || sp.get('tab') === 'approvals'),
      },
      {
        key: 'overview',
        icon: '📊',
        href: '/grad_school_head/dashboard?tab=overview',
        label: { he: 'סקירה כללית', en: 'Overview' },
        isActive: (pathname, sp) => pathname === '/grad_school_head/dashboard' && sp.get('tab') === 'overview',
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

export default function GradSchoolHeadLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarShell
      brand={{ name: 'HIT', subtitle: { he: 'פורטל ראש בית ספר ללימודי מוסמכים', en: 'Grad School Head Portal' } }}
      sections={GRAD_SCHOOL_HEAD_NAV_SECTIONS}
      quickActions={GRAD_SCHOOL_HEAD_QUICK_ACTIONS}
      theme={{ mode: 'accent' }}
    >
      {children}
    </SidebarShell>
  );
}
