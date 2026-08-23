// app/admin/navConfig.ts
// system_admin's sidebar nav content, extracted out of layout.tsx so it can
// also be reused by app/workflow-templates/layout.tsx (a route shared across
// several roles, not nested under /admin/ — see that file's own comment) —
// a system_admin visiting it should still see their normal sidebar instead
// of losing it just because the page happens to live outside /admin/*.

import type { SidebarSection } from '@/components/dashboard/SidebarShell';

export const ADMIN_NAV_SECTIONS: SidebarSection[] = [
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
        key: 'projects',
        icon: '📁',
        href: '/admin/panel?tab=projects',
        label: { he: 'פרויקטים', en: 'Projects' },
        isActive: (pathname, sp) => pathname === '/admin/panel' && sp.get('tab') === 'projects',
      },
      {
        key: 'milestones',
        icon: '🏁',
        href: '/admin/panel?tab=milestones',
        label: { he: 'אבני דרך', en: 'Milestones' },
        isActive: (pathname, sp) => pathname === '/admin/panel' && sp.get('tab') === 'milestones',
      },
      {
        key: 'defenseAccess',
        icon: '🔑',
        href: '/admin/panel?tab=defenseAccess',
        label: { he: 'גישת הגנה', en: 'Defense Access' },
        isActive: (pathname, sp) => pathname === '/admin/panel' && sp.get('tab') === 'defenseAccess',
      },
      {
        key: 'studentRoster',
        icon: '📋',
        href: '/admin/panel?tab=studentRoster',
        label: { he: 'רשימת סטודנטים', en: 'Student Roster' },
        isActive: (pathname, sp) => pathname === '/admin/panel' && sp.get('tab') === 'studentRoster',
      },
      {
        key: 'signoffs',
        icon: '✅',
        href: '/admin/panel?tab=signoffs',
        label: { he: 'ממתין לאישורך', en: 'Awaiting Your Sign-off' },
        isActive: (pathname, sp) => pathname === '/admin/panel' && sp.get('tab') === 'signoffs',
      },
      {
        key: 'statistics',
        icon: '🧮',
        href: '/admin/panel?tab=statistics',
        label: { he: 'סטטיסטיקות', en: 'Statistics' },
        isActive: (pathname, sp) => pathname === '/admin/panel' && sp.get('tab') === 'statistics',
      },
      {
        key: 'archived',
        icon: '🗄️',
        href: '/admin/panel?tab=archived',
        label: { he: 'ארכיון', en: 'Archived' },
        isActive: (pathname, sp) => pathname === '/admin/panel' && sp.get('tab') === 'archived',
      },
      {
        key: 'feedback',
        icon: '💬',
        href: '/admin/panel?tab=feedback',
        label: { he: 'משוב', en: 'Feedback' },
        isActive: (pathname, sp) => pathname === '/admin/panel' && sp.get('tab') === 'feedback',
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
        key: 'studentsReport',
        icon: '📊',
        href: '/administrative_coordinator/dashboard?tab=students',
        label: { he: 'דוח סטודנטים', en: 'Students Report' },
        isActive: (pathname, sp) => pathname === '/administrative_coordinator/dashboard' && sp.get('tab') === 'students',
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
        isActive: (pathname) => pathname.startsWith('/workflow-templates'),
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

export const ADMIN_QUICK_ACTIONS: SidebarSection = {
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
    // to Overview once they close it. From a page outside /admin/panel
    // (e.g. /workflow-templates), there's no ?tab= to preserve, so this
    // just opens the modal on the default Overview tab.
    href: (sp: URLSearchParams) => `/admin/panel?${sp.get('tab') ? `tab=${sp.get('tab')}&` : ''}modal=${modal}`,
    isActive: (_pathname: string, sp: URLSearchParams) => sp.get('modal') === modal,
  })),
};
