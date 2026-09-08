'use client';

// app/dean/layout.tsx — mirrors app/division_head/layout.tsx.

import { useAuth } from '@/contexts/AuthContext';
import { SidebarShell } from '@/components/dashboard/SidebarShell';
import { getChromeForRole } from '@/lib/roleChrome';

export default function DeanLayout({ children }: { children: React.ReactNode }) {
  const { activeRole, roles, setActiveRole, mainRole } = useAuth();
  const chrome = getChromeForRole(activeRole, roles, setActiveRole, mainRole);

  if (!chrome) return <>{children}</>;

  return (
    <SidebarShell brand={chrome.brand} sections={chrome.sections} quickActions={chrome.quickActions} theme={chrome.theme}>
      {children}
    </SidebarShell>
  );
}
