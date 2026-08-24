// app/coordinator/navSections.ts
// The coordinator sidebar's nav content, pulled out of layout.tsx into this
// leaf module so app/administrative_coordinator/layout.tsx can import it too
// (for a plain `coordinator` who lands on the nested student-detail page —
// see that file's own comment) without a layout-to-layout circular import.

import type { AppRole } from '@/lib/roles';
import type { SidebarNavItem, SidebarSection } from '@/components/dashboard/SidebarShell';

export const COORDINATOR_QUICK_ACTIONS: SidebarSection = {
  title: { he: 'פעולות מהירות', en: 'Quick Actions' },
  items: [
    {
      key: 'bulkImport',
      icon: '📥',
      // Preserves whatever ?tab= is already open on /coordinator/home —
      // opening "Import/Export" from a non-default tab shouldn't bounce
      // the coordinator back to Overview once they close it. Matches
      // app/admin/layout.tsx's identical quick-action pattern.
      href: (sp: URLSearchParams) => `/coordinator/home?${sp.get('tab') ? `tab=${sp.get('tab')}&` : ''}modal=bulkImport`,
      label: { he: 'ייבוא/ייצוא', en: 'Import/Export' },
      isActive: (pathname, sp) => pathname === '/coordinator/home' && sp.get('modal') === 'bulkImport',
    },
  ],
};

export function buildCoordinatorNavSections(activeRole: AppRole | undefined): SidebarSection[] {
  return [
    {
      title: { he: 'ניווט', en: 'Navigation' },
      items: [
        {
          key: 'home',
          icon: '🏠',
          href: '/coordinator/home',
          label: { he: 'בית', en: 'Home' },
          isActive: (pathname, sp) => pathname === '/coordinator/home' && (!sp.get('tab') || sp.get('tab') === 'overview'),
        },
        {
          key: 'inProgress',
          icon: '🚧',
          href: '/coordinator/home?tab=inProgress',
          label: { he: 'פרויקטים פעילים', en: 'In Progress' },
          isActive: (pathname, sp) => pathname === '/coordinator/home' && sp.get('tab') === 'inProgress',
        },
        {
          key: 'pending',
          icon: '⏳',
          href: '/coordinator/home?tab=pending',
          label: { he: 'הגשות ממתינות לבדיקה', en: 'Submissions Pending Review' },
          isActive: (pathname, sp) => pathname === '/coordinator/home' && sp.get('tab') === 'pending',
        },
        {
          key: 'defense',
          icon: '🎓',
          href: '/coordinator/home?tab=defense',
          label: { he: 'הגנות', en: 'Defenses' },
          isActive: (pathname, sp) => pathname === '/coordinator/home' && sp.get('tab') === 'defense',
        },
        {
          key: 'deadlines',
          icon: '⏰',
          href: '/coordinator/home?tab=deadlines',
          label: { he: 'מועדי הגשה', en: 'Deadlines' },
          isActive: (pathname, sp) => pathname === '/coordinator/home' && sp.get('tab') === 'deadlines',
        },
        {
          key: 'recommendations',
          icon: '🧑‍⚖️',
          href: '/coordinator/home?tab=recommendations',
          label: { he: 'המלצות בוחנים', en: 'Examiner Recommendations' },
          isActive: (pathname, sp) => pathname === '/coordinator/home' && sp.get('tab') === 'recommendations',
        },
        {
          key: 'signoffs',
          icon: '✅',
          href: '/coordinator/home?tab=signoffs',
          label: { he: 'ממתין לאישור ציונים ובוחנים', en: 'Awaiting Grade/Examiner Approval' },
          isActive: (pathname, sp) => pathname === '/coordinator/home' && sp.get('tab') === 'signoffs',
        },
        {
          key: 'statistics',
          icon: '🧮',
          href: '/coordinator/home?tab=statistics',
          label: { he: 'סטטיסטיקות', en: 'Statistics' },
          isActive: (pathname, sp) => pathname === '/coordinator/home' && sp.get('tab') === 'statistics',
        },
        // Erasure/archive protocol is coordinator + system_admin only —
        // administrative_secretary shares this route but not this tab.
        ...(activeRole !== 'administrative_secretary'
          ? [
              {
                key: 'archived',
                icon: '🗄️',
                href: '/coordinator/home?tab=archived',
                label: { he: 'ארכיון', en: 'Archived' },
                isActive: (pathname: string, sp: URLSearchParams) => pathname === '/coordinator/home' && sp.get('tab') === 'archived',
              } satisfies SidebarNavItem,
            ]
          : []),
        {
          key: 'infoFiles',
          icon: '📄',
          href: '/info-files',
          label: { he: 'מסמכי מידע', en: 'Info Files' },
          isActive: (pathname) => pathname === '/info-files',
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
        {
          key: 'reports',
          icon: '📈',
          href: '/reports',
          label: { he: 'דוחות', en: 'Reports' },
          isActive: (pathname) => pathname === '/reports',
        },
      ],
    },
  ];
}
