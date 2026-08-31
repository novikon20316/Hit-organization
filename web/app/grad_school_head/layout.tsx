'use client';

// app/grad_school_head/layout.tsx
// A client component — see app/admin/layout.tsx's note (NAV_SECTIONS'
// isActive functions can't cross the server/client boundary as props).
//
// The sidebar chrome is resolved centrally by lib/roleChrome.ts's
// getChromeForRole, keyed by the signed-in user's activeRole — always their
// single highest-ranked role — so anyone who reaches this route while a
// different role is their real activeRole still sees their own real
// sidebar here rather than this route's own branding. Nav content itself
// lives in ./navSections.ts. See roleChrome.ts's header comment for the
// full rationale.

import { SidebarShell } from '@/components/dashboard/SidebarShell';
import { useAuth } from '@/contexts/AuthContext';
import { getChromeForRole } from '@/lib/roleChrome';

export default function GradSchoolHeadLayout({ children }: { children: React.ReactNode }) {
  const { activeRole, roles } = useAuth();
  const chrome = getChromeForRole(activeRole, roles);

  if (!chrome) return <>{children}</>;

  return (
    <SidebarShell brand={chrome.brand} sections={chrome.sections} quickActions={chrome.quickActions} theme={chrome.theme}>
      {children}
    </SidebarShell>
  );
}
