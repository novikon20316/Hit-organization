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
// The nav content itself lives in navConfig.ts, not inline here, so
// app/workflow-templates/layout.tsx (a route shared across several roles,
// not nested under /admin/*) can reuse it for a system_admin visiting that
// page — see that file's own comment.
//
// Every link/action in navConfig.ts is real — no placeholder items for
// features that don't exist. The four quick-action modals are still
// rendered by app/admin/panel/page.tsx (with their real callbacks); these
// just link to them via the ?modal= param it reads.

import { SidebarShell } from '@/components/dashboard/SidebarShell';
import { ADMIN_NAV_SECTIONS, ADMIN_QUICK_ACTIONS } from './navConfig';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
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
