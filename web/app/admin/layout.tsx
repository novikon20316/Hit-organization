'use client';

// app/admin/layout.tsx
// A client component (not the default server component) specifically so
// NAV_SECTIONS/QUICK_ACTIONS below — which include plain functions
// (isActive, and quick actions' dynamic href) — can be passed as props to
// the client SidebarShell. Functions can't cross the server/client
// boundary via RSC serialization, so this file has to live entirely on
// the client; every other role's layout.tsx follows the same rule.
// system_admin's persistent sidebar — the original Stitch-derived design
// (see the "Admin User Management" / "System Admin Dashboard Overview"
// screens), now rendered through the shared, collapsible SidebarShell
// (components/dashboard/SidebarShell.tsx) instead of a bespoke component,
// but with the exact same nav content, --admin-* token styling, and real
// destinations as before.
//
// Every link/action below is real — no placeholder items for features that
// don't exist. The four quick-action modals are still rendered by
// app/admin/panel/page.tsx (with their real callbacks); these just link to
// them via the ?modal= param it reads.

import { SidebarShell, type SidebarSection } from '@/components/dashboard/SidebarShell';

const NAV_SECTIONS: SidebarSection[] = [
  {
    title: { he: 'ניווט', en: 'Navigation' },
    items: [
      {
        key: 'overview',
        icon: '📊',
        href: '/admin/panel',
        label: { he: 'סקירה', en: 'Dashboard' },
        isActive: (pathname, sp) => pathname === '/admin/panel' && sp.get('tab') !== 'users',
      },
      {
        key: 'users',
        icon: '👥',
        href: '/admin/panel?tab=users',
        label: { he: 'ניהול משתמשים', en: 'User Management' },
        isActive: (pathname, sp) => pathname === '/admin/panel' && sp.get('tab') === 'users',
      },
      {
        key: 'health',
        icon: '💓',
        href: '/admin/live-transportation',
        label: { he: 'בריאות המערכת', en: 'System Health' },
        isActive: (pathname) => pathname === '/admin/live-transportation',
      },
      {
        key: 'reports',
        icon: '📈',
        href: '/reports',
        label: { he: 'דוחות', en: 'Reports' },
        isActive: (pathname) => pathname === '/reports',
      },
    ],
  },
  {
    title: { he: 'תוכן וניהול', en: 'Directories & Config' },
    items: [
      {
        key: 'infoFiles',
        icon: '📄',
        href: '/info-files',
        label: { he: 'מסמכי מידע', en: 'Info Files' },
        isActive: (pathname) => pathname === '/info-files',
      },
      {
        key: 'academicYear',
        icon: '🎓',
        href: '/academic-year',
        label: { he: 'שנת לימודים', en: 'Academic Year' },
        isActive: (pathname) => pathname === '/academic-year',
      },
      {
        key: 'bulkPermissions',
        icon: '🛡️',
        href: '/bulk-permissions',
        label: { he: 'הרשאות מרוכזות', en: 'Bulk Permissions' },
        isActive: (pathname) => pathname === '/bulk-permissions',
      },
      {
        key: 'workflowTemplates',
        icon: '🧬',
        href: '/workflow-templates',
        label: { he: 'תבניות תהליך', en: 'Process Templates' },
        isActive: (pathname) => pathname === '/workflow-templates',
      },
      {
        key: 'committees',
        icon: '🧑‍⚖️',
        href: '/committees',
        label: { he: 'ועדות', en: 'Committees' },
        isActive: (pathname) => pathname === '/committees',
      },
    ],
  },
];

const QUICK_ACTIONS: SidebarSection = {
  title: { he: 'פעולות מהירות', en: 'Quick Actions' },
  items: [
    { key: 'academicCalendar', icon: '📅', modal: 'academicCalendar', label: { he: 'לוח שנה', en: 'Academic Calendar' } },
    { key: 'maintenance', icon: '🛠️', modal: 'maintenance', label: { he: 'תחזוקה', en: 'Maintenance' } },
    { key: 'studentStatuses', icon: '🏷️', modal: 'studentStatuses', label: { he: 'סטטוסי סטודנטים', en: 'Student Statuses' } },
    { key: 'bulkImport', icon: '📥', modal: 'bulkImport', label: { he: 'ייבוא/ייצוא', en: 'Import/Export' } },
  ].map(({ key, icon, modal, label }) => ({
    key,
    icon,
    label,
    // Preserves whatever ?tab= is already open on /admin/panel — opening
    // "Maintenance" from the Projects tab shouldn't bounce the admin back
    // to Overview once they close it.
    href: (sp: URLSearchParams) => `/admin/panel?${sp.get('tab') ? `tab=${sp.get('tab')}&` : ''}modal=${modal}`,
    isActive: (_pathname: string, sp: URLSearchParams) => sp.get('modal') === modal,
  })),
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarShell
      brand={{ name: 'HIT', subtitle: { he: 'פורטל מנהל מערכת', en: 'System Admin Portal' } }}
      sections={NAV_SECTIONS}
      quickActions={QUICK_ACTIONS}
      theme={{ mode: 'tokens', tokenPrefix: 'admin' }}
    >
      {children}
    </SidebarShell>
  );
}
