'use client';

// app/admin/layout.tsx
// A client component (not the default server component) specifically so
// ADMIN_NAV_SECTIONS/ADMIN_QUICK_ACTIONS (navConfig.ts) — which include
// plain functions (isActive, and quick actions' dynamic href) — can be
// passed as props to the client SidebarShell. Functions can't cross the
// server/client boundary via RSC serialization, so this file has to live
// entirely on the client; every other role's layout.tsx follows the same
// rule.
//
// The sidebar chrome is resolved centrally by lib/roleChrome.ts's
// getChromeForRole, keyed by the signed-in user's activeRole — same
// mechanism every other role's layout.tsx uses now. In practice this route
// is only reachable at all by someone who holds system_admin (see
// useRequireRole), and system_admin outranks every other role, so
// activeRole always resolves to it here — this is equivalent to the old
// unconditional rendering, just consistent with the rest of the app instead
// of a one-off. See roleChrome.ts's header comment for the full rationale.
//
// Every link/action in navConfig.ts is real — no placeholder items for
// features that don't exist. The four quick-action modals are still
// rendered by app/admin/panel/page.tsx (with their real callbacks); these
// just link to them via the ?modal= param it reads.

import { SidebarShell } from '@/components/dashboard/SidebarShell';
import { useAuth } from '@/contexts/AuthContext';
import { getChromeForRole } from '@/lib/roleChrome';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { activeRole, roles } = useAuth();
  const chrome = getChromeForRole(activeRole, roles);

  if (!chrome) return <>{children}</>;

  return (
    <SidebarShell brand={chrome.brand} sections={chrome.sections} quickActions={chrome.quickActions} theme={chrome.theme}>
      {children}
    </SidebarShell>
  );
}
