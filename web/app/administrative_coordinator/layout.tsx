'use client';

// app/administrative_coordinator/layout.tsx
// A client component — see app/admin/layout.tsx's note (NAV_SECTIONS'
// isActive functions can't cross the server/client boundary as props).
//
// Migrates administrative_secretary's DashboardShell hamburger-menu actions
// (Process Templates, Committees, Academic Year) into the persistent
// collapsible sidebar.
//
// This folder isn't exclusively hers, though — system_admin has standing
// oversight access to the dashboard here, and program_head/coordinator can
// land on the nested student-detail page (reached from THEIR OWN dashboards'
// student search/report). Before this fix, any of them saw this sidebar's
// hardcoded "Administrative Coordinator Portal" branding regardless of who
// they actually were — confusing at best, and for a moment genuinely made it
// look like the account's role had changed. Now each of those roles gets
// their own real sidebar here instead, same fix/pattern as
// app/workflow-templates/layout.tsx's system_admin branch.

import { useAuth } from '@/contexts/AuthContext';
import { SidebarShell, type SidebarSection } from '@/components/dashboard/SidebarShell';
import { ADMIN_NAV_SECTIONS, ADMIN_QUICK_ACTIONS } from '@/app/admin/navConfig';
import { buildProgramHeadNavSections } from '@/app/program_head/layout';

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
  const { activeRole, roles } = useAuth();

  if (activeRole === 'system_admin') {
    return (
      <SidebarShell
        brand={{ name: 'HIT', subtitle: { he: 'פורטל מנהל מערכת', en: 'System Admin Portal' } }}
        sections={ADMIN_NAV_SECTIONS}
        quickActions={ADMIN_QUICK_ACTIONS}
        theme={{ mode: 'tokens', tokenPrefix: 'admin' }}
      >
        {children}
      </SidebarShell>
    );
  }

  if (activeRole === 'program_head') {
    return (
      <SidebarShell
        brand={{ name: 'HIT', subtitle: { he: 'פורטל ראש תוכנית', en: 'Program Head Portal' } }}
        sections={buildProgramHeadNavSections(roles)}
        theme={{ mode: 'accent' }}
      >
        {children}
      </SidebarShell>
    );
  }

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
