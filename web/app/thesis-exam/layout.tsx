'use client';

// app/thesis-exam/layout.tsx
// Shared across roles (student, supervisor, committee members, examiners, the
// program head, the grad school head) — same role-chrome lookup as
// app/relay-tasks/layout.tsx.

import { SidebarShell } from '@/components/dashboard/SidebarShell';
import { useAuth } from '@/contexts/AuthContext';
import { getChromeForRole } from '@/lib/roleChrome';

export default function ThesisExamLayout({ children }: { children: React.ReactNode }) {
  const { activeRole, roles, setActiveRole, mainRole } = useAuth();
  const chrome = getChromeForRole(activeRole, roles, setActiveRole, mainRole);

  if (!chrome) return <>{children}</>;

  return (
    <SidebarShell brand={chrome.brand} sections={chrome.sections} quickActions={chrome.quickActions} theme={chrome.theme}>
      {children}
    </SidebarShell>
  );
}
