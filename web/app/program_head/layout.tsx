'use client';

// app/program_head/layout.tsx
// A client component — see app/admin/layout.tsx's note (NAV_SECTIONS'
// isActive functions can't cross the server/client boundary as props).
//
// Migrates program_head's DashboardShell hamburger-menu actions (just one:
// Committees) into the persistent collapsible sidebar, plus the dashboard
// page's own former in-page tab bar (Students/Approvals/Supervisors/Staff/
// My Projects) — same URL-as-source-of-truth pattern as app/admin/layout.tsx
// + app/admin/panel/page.tsx, so these links switch tabs even when the
// dashboard page is already mounted.
//
// The sidebar chrome is resolved centrally by lib/roleChrome.ts's
// getChromeForRole, keyed by the signed-in user's activeRole — always their
// single highest-ranked role — so a system_admin/grad_school_head/
// faculty_admin who also holds 'program_head' (or anyone else who lands
// here) always sees their own real sidebar instead of this route's own
// branding. See that file's header comment for the full rationale.

import { useAuth } from '@/contexts/AuthContext';
import { SidebarShell } from '@/components/dashboard/SidebarShell';
import { getChromeForRole } from '@/lib/roleChrome';

export default function ProgramHeadLayout({ children }: { children: React.ReactNode }) {
  const { activeRole, roles } = useAuth();
  const chrome = getChromeForRole(activeRole, roles);

  if (!chrome) return <>{children}</>;

  return (
    <SidebarShell brand={chrome.brand} sections={chrome.sections} quickActions={chrome.quickActions} theme={chrome.theme}>
      {children}
    </SidebarShell>
  );
}
