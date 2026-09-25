'use client';

// app/school_head/layout.tsx
// Mirrors app/grad_school_head/layout.tsx — see its header comment for the
// full rationale on resolving sidebar chrome from activeRole via
// lib/roleChrome.ts rather than assuming "whoever reaches this route is
// this role".

import { SidebarShell } from '@/components/dashboard/SidebarShell';
import { useAuth } from '@/contexts/AuthContext';
import { getChromeForRole } from '@/lib/roleChrome';

export default function SchoolHeadLayout({ children }: { children: React.ReactNode }) {
  const { activeRole, roles, setActiveRole, mainRole } = useAuth();
  const chrome = getChromeForRole(activeRole, roles, setActiveRole, mainRole);

  if (!chrome) return <>{children}</>;

  return (
    <SidebarShell brand={chrome.brand} sections={chrome.sections} quickActions={chrome.quickActions} theme={chrome.theme}>
      {children}
    </SidebarShell>
  );
}
