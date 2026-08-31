'use client';

// app/supervisor/layout.tsx
// A client component — see app/admin/layout.tsx's note (NAV_SECTIONS'
// isActive functions can't cross the server/client boundary as props).
//
// The sidebar chrome is resolved centrally by lib/roleChrome.ts's
// getChromeForRole, keyed by the signed-in user's activeRole — always their
// single highest-ranked role, never "whichever role's route they happen to
// be on". Without this, a multi-role user (e.g. a coordinator who also
// supervises) would see their real sidebar on their own dashboard but the
// WHOLE sidebar — brand, color, and menu — would silently swap to
// supervisor's smaller one the moment they followed a link into a project
// they supervise, making it look like their access had changed. Nav
// content itself lives in ./navSections.ts (still supervisor's own list —
// SidebarShell only renders whatever chrome getChromeForRole resolves for
// the SIGNED-IN USER's activeRole, which for a plain supervisor is this
// same list). See roleChrome.ts's header comment for the full rationale —
// including why this doesn't touch authorization at all, only which
// sidebar chrome is displayed.

import { SidebarShell } from '@/components/dashboard/SidebarShell';
import { useAuth } from '@/contexts/AuthContext';
import { getChromeForRole } from '@/lib/roleChrome';

export default function SupervisorLayout({ children }: { children: React.ReactNode }) {
  const { activeRole, roles } = useAuth();
  const chrome = getChromeForRole(activeRole, roles);

  if (!chrome) return <>{children}</>;

  return (
    <SidebarShell brand={chrome.brand} sections={chrome.sections} quickActions={chrome.quickActions} theme={chrome.theme}>
      {children}
    </SidebarShell>
  );
}
