'use client';

// app/grad_school_head/layout.tsx
// A client component — see app/admin/layout.tsx's note (NAV_SECTIONS'
// isActive functions can't cross the server/client boundary as props).
//
// Migrates grad_school_head's DashboardShell hamburger-menu actions
// (Process Templates, Committees, Bulk Permissions, Reports, Post New
// Project) into the persistent collapsible sidebar.

import { SidebarShell, type SidebarSection } from '@/components/dashboard/SidebarShell';

const NAV_SECTIONS: SidebarSection[] = [
  {
    title: { he: 'ניווט', en: 'Navigation' },
    items: [
      {
        key: 'home',
        icon: '🏠',
        href: '/grad_school_head/dashboard',
        label: { he: 'בית', en: 'Home' },
        isActive: (pathname) => pathname === '/grad_school_head/dashboard',
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

const QUICK_ACTIONS: SidebarSection = {
  title: { he: 'פעולות מהירות', en: 'Quick Actions' },
  items: [
    {
      key: 'newProject',
      icon: '📁',
      href: '/grad_school_head/dashboard?modal=newProject',
      label: { he: 'פרסום פרויקט חדש', en: 'Post New Project' },
      isActive: (pathname, sp) => pathname === '/grad_school_head/dashboard' && sp.get('modal') === 'newProject',
    },
  ],
};

export default function GradSchoolHeadLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarShell
      brand={{ name: 'HIT', subtitle: { he: 'פורטל ראש בית ספר ללימודי מוסמכים', en: 'Grad School Head Portal' } }}
      sections={NAV_SECTIONS}
      quickActions={QUICK_ACTIONS}
      theme={{ mode: 'accent' }}
    >
      {children}
    </SidebarShell>
  );
}
