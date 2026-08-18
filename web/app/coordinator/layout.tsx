'use client';

// app/coordinator/layout.tsx
// A client component — see app/admin/layout.tsx's note (NAV_SECTIONS'
// isActive functions can't cross the server/client boundary as props).
//
// Migrates coordinator's DashboardShell hamburger-menu actions (Info
// Files, Process Templates, Committees, Reports, Import/Export) into the
// persistent collapsible sidebar.

import { SidebarShell, type SidebarSection } from '@/components/dashboard/SidebarShell';

const NAV_SECTIONS: SidebarSection[] = [
  {
    title: { he: 'ניווט', en: 'Navigation' },
    items: [
      {
        key: 'home',
        icon: '🏠',
        href: '/coordinator/home',
        label: { he: 'בית', en: 'Home' },
        isActive: (pathname) => pathname === '/coordinator/home',
      },
      {
        key: 'infoFiles',
        icon: '📄',
        href: '/info-files',
        label: { he: 'מסמכי מידע', en: 'Info Files' },
        isActive: (pathname) => pathname === '/info-files',
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
      key: 'bulkImport',
      icon: '📥',
      href: '/coordinator/home?modal=bulkImport',
      label: { he: 'ייבוא/ייצוא', en: 'Import/Export' },
      isActive: (pathname, sp) => pathname === '/coordinator/home' && sp.get('modal') === 'bulkImport',
    },
  ],
};

export default function CoordinatorLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarShell
      brand={{ name: 'HIT', subtitle: { he: 'פורטל רכז', en: 'Coordinator Portal' } }}
      sections={NAV_SECTIONS}
      quickActions={QUICK_ACTIONS}
      theme={{ mode: 'accent' }}
    >
      {children}
    </SidebarShell>
  );
}
