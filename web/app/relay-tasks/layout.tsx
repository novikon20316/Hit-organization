'use client';

// app/relay-tasks/layout.tsx
// This route is shared across roles (see page.tsx's own comment on why it
// can't live under one role's dashboard tree) and isn't nested under any
// role's /<role>/* folder, so it never picked up a role's persistent
// sidebar — same gap app/committees/layout.tsx already fixed for itself.
// Reuse the identical lib/roleChrome.ts lookup here.

import { SidebarShell } from '@/components/dashboard/SidebarShell';
import { useAuth } from '@/contexts/AuthContext';
import { getChromeForRole } from '@/lib/roleChrome';

export default function RelayTasksLayout({ children }: { children: React.ReactNode }) {
  const { activeRole, roles, setActiveRole, mainRole } = useAuth();
  const chrome = getChromeForRole(activeRole, roles, setActiveRole, mainRole);

  if (!chrome) return <>{children}</>;

  return (
    <SidebarShell brand={chrome.brand} sections={chrome.sections} quickActions={chrome.quickActions} theme={chrome.theme}>
      {children}
    </SidebarShell>
  );
}
