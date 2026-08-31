'use client';

// app/notifications/layout.tsx
// Notifications & Messages is a single route shared by every role (linked
// from the sidebar's bell icon regardless of who's signed in), so — unlike
// every other page — it isn't nested under any one role's own /<role>/
// segment and never picked up that role's SidebarShell. Without this, the
// whole persistent menu was simply absent here: no way to jump anywhere else
// without using the browser back button, which felt like being stuck.
//
// Fix: same lib/roleChrome.ts lookup every other role's layout.tsx now
// uses, keyed by the signed-in user's activeRole — so this can never drift
// from what that role's own dashboard already shows.

import { SidebarShell } from '@/components/dashboard/SidebarShell';
import { useAuth } from '@/contexts/AuthContext';
import { getChromeForRole } from '@/lib/roleChrome';

export default function NotificationsLayout({ children }: { children: React.ReactNode }) {
  const { activeRole, roles } = useAuth();
  const chrome = getChromeForRole(activeRole, roles);

  // Briefly true before AuthContext resolves activeRole on first load —
  // render bare rather than guess a role's sidebar.
  if (!chrome) return <>{children}</>;

  return (
    <SidebarShell brand={chrome.brand} sections={chrome.sections} quickActions={chrome.quickActions} theme={chrome.theme}>
      {children}
    </SidebarShell>
  );
}
