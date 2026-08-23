'use client';

// app/workflow-templates/layout.tsx
// This route is shared across several roles (coordinator, faculty_admin,
// program_head, administrative_secretary, grad_school_head, system_admin —
// see page.tsx's own comment) and isn't nested under any one role's
// /<role>/* folder, so it never picked up a role's persistent sidebar —
// app/admin/layout.tsx etc. only wrap their own /<role>/* subtree. For a
// system_admin, landing here (via their own sidebar's "Process Templates"
// link) meant the sidebar disappeared entirely once they arrived.
//
// Reuses system_admin's own nav content (ADMIN_NAV_SECTIONS/QUICK_ACTIONS,
// factored out of app/admin/layout.tsx into navConfig.ts for this) so the
// page looks and behaves exactly like every other admin screen. The other
// roles that can also reach this page still see no sidebar here, same as
// before this file existed — out of scope for now.

import { useAuth } from '@/contexts/AuthContext';
import { SidebarShell } from '@/components/dashboard/SidebarShell';
import { ADMIN_NAV_SECTIONS, ADMIN_QUICK_ACTIONS } from '@/app/admin/navConfig';

export default function WorkflowTemplatesLayout({ children }: { children: React.ReactNode }) {
  const { activeRole } = useAuth();

  if (activeRole !== 'system_admin') {
    return <>{children}</>;
  }

  return (
    <SidebarShell
      brand={{ name: 'HIT', subtitle: { he: 'פורטל מנהל מערכת', en: 'System Admin Portal' } }}
      sections={ADMIN_NAV_SECTIONS}
      quickActions={ADMIN_QUICK_ACTIONS}
      theme={{ mode: 'tokens', tokenPrefix: 'admin' }}
    >
      {children}
    </SidebarShell>
  );
}
