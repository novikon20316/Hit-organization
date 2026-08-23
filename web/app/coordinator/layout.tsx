'use client';

// app/coordinator/layout.tsx
// A client component — see app/admin/layout.tsx's note (NAV_SECTIONS'
// isActive functions can't cross the server/client boundary as props).
//
// Migrates coordinator's DashboardShell hamburger-menu actions (Info
// Files, Process Templates, Committees, Reports, Import/Export) into the
// persistent collapsible sidebar, and — as of this pass — also migrates
// app/coordinator/home/page.tsx's former in-page tab bar (Overview, In
// Progress, Pending Approval, Defenses, Deadlines, Examiner
// Recommendations, Awaiting Your Sign-off, Statistics, Archived) into
// permanent nav entries, all still pointing at that same route via
// ?tab=. The page itself now derives its tab purely from the URL — see
// its comment for the "URL is the source of truth" pattern this mirrors
// from app/admin/panel/page.tsx.
//
// This route is shared by coordinator, system_admin, and
// administrative_secretary (see the 'archived' item's activeRole check
// below, which excludes her from that one tab but not the route itself).
// Nav content itself now lives in ./navSections.ts (a leaf module, so
// app/administrative_coordinator/layout.tsx can reuse it for a coordinator
// who lands on ITS nested student-detail page, without a layout-to-layout
// circular import) — before that split, every one of these three roles saw
// this file's hardcoded "Coordinator Portal" branding regardless of who
// they actually were, the same bug fixed in administrative_coordinator/
// layout.tsx and worth fixing symmetrically here.

import { SidebarShell } from '@/components/dashboard/SidebarShell';
import { useAuth } from '@/contexts/AuthContext';
import { ADMIN_NAV_SECTIONS, ADMIN_QUICK_ACTIONS } from '@/app/admin/navConfig';
import { ADMINISTRATIVE_COORDINATOR_NAV_SECTIONS } from '@/app/administrative_coordinator/navSections';
import { buildCoordinatorNavSections, COORDINATOR_QUICK_ACTIONS } from './navSections';

export default function CoordinatorLayout({ children }: { children: React.ReactNode }) {
  const { activeRole } = useAuth();

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

  if (activeRole === 'administrative_secretary') {
    return (
      <SidebarShell
        brand={{ name: 'HIT', subtitle: { he: 'פורטל רכזת אדמיניסטרטיבית', en: 'Administrative Coordinator Portal' } }}
        sections={ADMINISTRATIVE_COORDINATOR_NAV_SECTIONS}
        theme={{ mode: 'accent' }}
      >
        {children}
      </SidebarShell>
    );
  }

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
