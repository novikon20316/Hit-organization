'use client';

// app/division_head/layout.tsx
// Mirrors app/program_head/layout.tsx — the sidebar chrome is resolved
// centrally by lib/roleChrome.ts's getChromeForRole, keyed by the signed-in
// user's activeRole, so a multi-role user always sees their own real
// sidebar instead of this route's own branding.

import { useAuth } from '@/contexts/AuthContext';
import { SidebarShell } from '@/components/dashboard/SidebarShell';
import { getChromeForRole } from '@/lib/roleChrome';

export default function DivisionHeadLayout({ children }: { children: React.ReactNode }) {
  const { activeRole, roles, setActiveRole, mainRole } = useAuth();
  const chrome = getChromeForRole(activeRole, roles, setActiveRole, mainRole);

  if (!chrome) return <>{children}</>;

  return (
    <SidebarShell brand={chrome.brand} sections={chrome.sections} quickActions={chrome.quickActions} theme={chrome.theme}>
      {children}
    </SidebarShell>
  );
}
