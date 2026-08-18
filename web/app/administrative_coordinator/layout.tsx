'use client';

// app/administrative_coordinator/layout.tsx
// A client component — see app/admin/layout.tsx's note (NAV_SECTIONS'
// isActive functions can't cross the server/client boundary as props).
//
// Migrates administrative_secretary's DashboardShell hamburger-menu actions
// (Process Templates, Committees, Academic Year) into the persistent
// collapsible sidebar.

import { SidebarShell, type SidebarSection } from '@/components/dashboard/SidebarShell';

const NAV_SECTIONS: SidebarSection[] = [
  {
    title: { he: 'ניווט', en: 'Navigation' },
    items: [
      {
        key: 'home',
        icon: '🏠',
        href: '/administrative_coordinator/dashboard',
        label: { he: 'בית', en: 'Home' },
        isActive: (pathname, sp) => pathname === '/administrative_coordinator/dashboard' && (!sp.get('tab') || sp.get('tab') === 'groups'),
      },
      {
        key: 'students',
        icon: '🧑‍🎓',
        href: '/administrative_coordinator/dashboard?tab=students',
        label: { he: 'דוח סטודנטים', en: 'Students Report' },
        isActive: (pathname, sp) => pathname === '/administrative_coordinator/dashboard' && sp.get('tab') === 'students',
      },
      {
        key: 'overrides',
        icon: '✅',
        href: '/administrative_coordinator/dashboard?tab=overrides',
        label: { he: 'אישור ציונים סופיים', en: 'Final Grade Approvals' },
        isActive: (pathname, sp) => pathname === '/administrative_coordinator/dashboard' && sp.get('tab') === 'overrides',
      },
      {
        key: 'statistics',
        icon: '🧮',
        href: '/administrative_coordinator/dashboard?tab=statistics',
        label: { he: 'סטטיסטיקות', en: 'Statistics' },
        isActive: (pathname, sp) => pathname === '/administrative_coordinator/dashboard' && sp.get('tab') === 'statistics',
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
        key: 'academicYear',
        icon: '🎓',
        href: '/academic-year',
        label: { he: 'שנת לימודים', en: 'Academic Year' },
        isActive: (pathname) => pathname === '/academic-year',
      },
    ],
  },
];

export default function AdministrativeCoordinatorLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarShell
      brand={{ name: 'HIT', subtitle: { he: 'פורטל רכזת אדמיניסטרטיבית', en: 'Administrative Coordinator Portal' } }}
      sections={NAV_SECTIONS}
      theme={{ mode: 'accent' }}
    >
      {children}
    </SidebarShell>
  );
}
