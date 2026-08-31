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
// administrative_secretary — plus anyone else who reaches it while a
// higher- or lower-ranked role is their real activeRole (e.g. a
// grad_school_head who also holds 'coordinator' as an additional role, or a
// coordinator who also supervises and gets linked here from a supervisor
// context). The sidebar chrome is resolved centrally by lib/roleChrome.ts's
// getChromeForRole, keyed by the signed-in user's activeRole — always their
// single highest-ranked role — so it can never drift from what that role's
// own dashboard already shows, no matter which route they're physically on.
// See that file's header comment for the full rationale.

import { SidebarShell } from '@/components/dashboard/SidebarShell';
import { useAuth } from '@/contexts/AuthContext';
import { getChromeForRole } from '@/lib/roleChrome';

export default function CoordinatorLayout({ children }: { children: React.ReactNode }) {
  const { activeRole, roles } = useAuth();
  const chrome = getChromeForRole(activeRole, roles);

  // Briefly true before AuthContext resolves activeRole on first load —
  // render bare rather than guess a role's sidebar.
  if (!chrome) return <>{children}</>;

  return (
    <SidebarShell brand={chrome.brand} sections={chrome.sections} quickActions={chrome.quickActions} theme={chrome.theme}>
      {children}
    </SidebarShell>
  );
}
