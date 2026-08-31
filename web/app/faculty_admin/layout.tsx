'use client';

// app/faculty_admin/layout.tsx
// A client component — see app/admin/layout.tsx's note (NAV_SECTIONS'
// isActive functions can't cross the server/client boundary as props).
//
// Also covers /faculty_admin/templates (no layout of its own needed — it's
// nested under this route).
//
// The sidebar chrome is resolved centrally by lib/roleChrome.ts's
// getChromeForRole, keyed by the signed-in user's activeRole — always their
// single highest-ranked role — so anyone who reaches this route while a
// different role is their real activeRole (e.g. a faculty_admin who also
// supervises, following a link into a project they supervise) still sees
// their own real sidebar here rather than this route's own branding. Nav
// content itself lives in ./navSections.ts. See roleChrome.ts's header
// comment for the full rationale.

import { SidebarShell } from '@/components/dashboard/SidebarShell';
import { useAuth } from '@/contexts/AuthContext';
import { getChromeForRole } from '@/lib/roleChrome';

export default function FacultyAdminLayout({ children }: { children: React.ReactNode }) {
  const { activeRole, roles } = useAuth();
  const chrome = getChromeForRole(activeRole, roles);

  if (!chrome) return <>{children}</>;

  return (
    <SidebarShell brand={chrome.brand} sections={chrome.sections} quickActions={chrome.quickActions} theme={chrome.theme}>
      {children}
    </SidebarShell>
  );
}
