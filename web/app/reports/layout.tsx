'use client';

// app/reports/layout.tsx
// This route is shared across roles and isn't nested under any role's
// /<role>/* folder, so it never picked up a role's persistent sidebar —
// same gap app/workflow-templates/layout.tsx and app/committees/layout.tsx
// already fixed for themselves. Reuse the identical lib/roleChrome.ts lookup.

import { SidebarShell } from '@/components/dashboard/SidebarShell';
import { useAuth } from '@/contexts/AuthContext';
import { getChromeForRole } from '@/lib/roleChrome';

export default function ReportsLayout({ children }: { children: React.ReactNode }) {
  const { activeRole, roles } = useAuth();
  const chrome = getChromeForRole(activeRole, roles);

  if (!chrome) return <>{children}</>;

  return (
    <SidebarShell brand={chrome.brand} sections={chrome.sections} quickActions={chrome.quickActions} theme={chrome.theme}>
      {children}
    </SidebarShell>
  );
}
