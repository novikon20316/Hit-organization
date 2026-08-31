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
// oversight access to the dashboard here, and program_head/coordinator (and
// anyone else) can land on the nested student-detail page (reached from
// THEIR OWN dashboards' student search/report). The sidebar chrome is
// resolved centrally by lib/roleChrome.ts's getChromeForRole, keyed by the
// signed-in user's activeRole — always their single highest-ranked role —
// so whoever lands here always sees their own real sidebar instead of this
// route's own hardcoded "Administrative Coordinator Portal" branding. See
// that file's header comment for the full rationale.

import { SidebarShell } from '@/components/dashboard/SidebarShell';
import { useAuth } from '@/contexts/AuthContext';
import { getChromeForRole } from '@/lib/roleChrome';

export default function AdministrativeCoordinatorLayout({ children }: { children: React.ReactNode }) {
  const { activeRole, roles } = useAuth();
  const chrome = getChromeForRole(activeRole, roles);

  if (!chrome) return <>{children}</>;

  return (
    <SidebarShell brand={chrome.brand} sections={chrome.sections} quickActions={chrome.quickActions} theme={chrome.theme}>
      {children}
    </SidebarShell>
  );
}
