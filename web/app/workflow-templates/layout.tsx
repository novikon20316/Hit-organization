'use client';

// app/workflow-templates/layout.tsx
// This route is shared across several roles (coordinator, faculty_admin,
// program_head, administrative_secretary, grad_school_head, system_admin —
// see page.tsx's own comment) and isn't nested under any one role's
// /<role>/* folder, so it never picked up a role's persistent sidebar —
// app/admin/layout.tsx etc. only wrap their own /<role>/* subtree.
//
// Fix: same lib/roleChrome.ts lookup every other role's layout.tsx now
// uses, keyed by the signed-in user's activeRole — so whoever lands here
// (via their own sidebar's "Process Templates" link, or otherwise) gets
// their own real sidebar instead of losing it entirely just because the
// page happens to live outside their own /<role>/* tree.

import { SidebarShell } from '@/components/dashboard/SidebarShell';
import { useAuth } from '@/contexts/AuthContext';
import { getChromeForRole } from '@/lib/roleChrome';

export default function WorkflowTemplatesLayout({ children }: { children: React.ReactNode }) {
  const { activeRole, roles } = useAuth();
  const chrome = getChromeForRole(activeRole, roles);

  if (!chrome) return <>{children}</>;

  return (
    <SidebarShell brand={chrome.brand} sections={chrome.sections} quickActions={chrome.quickActions} theme={chrome.theme}>
      {children}
    </SidebarShell>
  );
}
