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
import { SidebarShell } from '@/components/dashboard/SidebarShell';
import { ADMIN_NAV_SECTIONS, ADMIN_QUICK_ACTIONS } from '@/app/admin/navConfig';
import { buildProgramHeadNavSections } from '@/app/program_head/layout';
import { buildCoordinatorNavSections, COORDINATOR_QUICK_ACTIONS } from '@/app/coordinator/navSections';
import { ADMINISTRATIVE_COORDINATOR_NAV_SECTIONS as NAV_SECTIONS } from './navSections';

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

  // coordinator is a distinct role from administrative_secretary
  // ("administrative coordinator") — she reaches the nested student-detail
  // page too, and must never see the wrong one's branding either.
  if (activeRole === 'coordinator') {
    return (
      <SidebarShell
        brand={{ name: 'HIT', subtitle: { he: 'פורטל רכז', en: 'Coordinator Portal' } }}
        sections={buildCoordinatorNavSections(activeRole)}
        quickActions={COORDINATOR_QUICK_ACTIONS}
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
