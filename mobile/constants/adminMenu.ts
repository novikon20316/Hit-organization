// constants/adminMenu.ts
// system_admin's mobile navigation catalogue — used to build the single
// full-screen menu opened from TopBar's hamburger on every admin screen
// (see app/admin/overview.tsx and app/admin/panel.tsx). Used to live as two
// screen-local arrays on the now-removed app/admin/menu.tsx; hoisted here so
// both screens build the exact same item list instead of drifting (panel.tsx
// used to hand-roll its own, shorter copy of ADMIN_DIRECTORY_ITEMS).
//
// Mirrors web/app/admin/navConfig.ts's grouping (Navigation / Directories &
// Config), limited to destinations that actually exist on mobile — web-only
// items like Statistics, System Health, Reports and Committees have no
// mobile screen yet, so they're left out rather than linking to a 404.

export interface AdminMenuItem {
  key: string;
  icon: string;
  label: { he: string; en: string };
  href: string;
  /** targetScreen key(s) (see server/src/services/notificationTargets.ts)
   *  whose unread notification count feeds this item's badge — mirrors
   *  web's SidebarNavItem.badgeTargetScreens. Omit for destinations with no
   *  notification concept. */
  badgeTargetScreens?: string[];
}

export const ADMIN_NAVIGATION_ITEMS: AdminMenuItem[] = [
  { key: 'overview', icon: '📊', href: '/admin/panel', label: { he: 'סקירה', en: 'Overview' } },
  { key: 'users', icon: '👥', href: '/admin/panel?tab=users', label: { he: 'ניהול משתמשים', en: 'User Management' } },
  { key: 'projects', icon: '📁', href: '/admin/panel?tab=projects', label: { he: 'פרויקטים', en: 'Projects' } },
  { key: 'milestones', icon: '🏁', href: '/admin/panel?tab=milestones', label: { he: 'אבני דרך', en: 'Milestones' }, badgeTargetScreens: ['admin_panel_milestones'] },
  { key: 'defenseAccess', icon: '🔑', href: '/admin/panel?tab=defenseAccess', label: { he: 'גישת הגנה', en: 'Defense Access' } },
  { key: 'studentRoster', icon: '📋', href: '/admin/panel?tab=studentRoster', label: { he: 'רשימת סטודנטים', en: 'Student Roster' } },
  { key: 'signoffs', icon: '✅', href: '/admin/panel?tab=signoffs', label: { he: 'ממתין לאישור ציונים ובוחנים', en: 'Awaiting Grade/Examiner Approval' }, badgeTargetScreens: ['admin_panel_signoffs'] },
  { key: 'archived', icon: '🗄️', href: '/admin/panel?tab=archived', label: { he: 'ארכיון', en: 'Archived' } },
  { key: 'feedback', icon: '💬', href: '/admin/panel?tab=feedback', label: { he: 'משוב', en: 'Feedback' }, badgeTargetScreens: ['admin_panel_feedback'] },
];

export const ADMIN_DIRECTORY_ITEMS: AdminMenuItem[] = [
  { key: 'infoFiles', icon: '📎', href: '/Info-files', label: { he: 'מסמכי מידע לסטודנטים', en: 'Student Info Files' } },
  { key: 'academicYear', icon: '🎓', href: '/AcademicYearManager', label: { he: 'ניהול שנת לימודים', en: 'Academic Year Management' } },
  { key: 'bulkPermissions', icon: '🛡️', href: '/BulkPermissionsManager', label: { he: 'הרשאות מרוכזות לפי תפקיד', en: 'Bulk Permissions by Role' } },
  { key: 'records', icon: '📜', href: '/admin/records', label: { he: 'רישומי פרויקטים', en: 'Project Records' } },
  { key: 'workflowTemplates', icon: '🧬', href: '/WorkflowTemplateManager', label: { he: 'תבניות תהליך', en: 'Process Templates' } },
];
