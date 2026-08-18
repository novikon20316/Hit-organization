'use client';

// app/coordinator/layout.tsx
// A client component — see app/admin/layout.tsx's note (NAV_SECTIONS'
// isActive functions can't cross the server/client boundary as props).
//
// Migrates coordinator's DashboardShell hamburger-menu actions (Info
// Files, Process Templates, Committees, Reports, Import/Export) into the
// persistent collapsible sidebar, and — as of this pass — also migrates
// app/coordinator/home/page.tsx's former in-page tab bar (Overview, In
// Progress, Pending Approval, Defenses, Deadlines, Examiner
// Recommendations, Awaiting Your Sign-off, Statistics, Archived) into
// permanent nav entries, all still pointing at that same route via
// ?tab=. The page itself now derives its tab purely from the URL — see
// its comment for the "URL is the source of truth" pattern this mirrors
// from app/admin/panel/page.tsx.
//
// Sections are built inside the component body (not a static top-level
// const like every other role's layout.tsx) because the 'archived' item
// is role-gated: this route is shared by coordinator, system_admin, and
// administrative_secretary, but the erase/archive protocol excludes
// administrative_secretary — same activeRole check (not the raw `role`
// field) as app/coordinator/home/page.tsx used to make locally when
// building its now-removed tab array.

import { SidebarShell, type SidebarNavItem, type SidebarSection } from '@/components/dashboard/SidebarShell';
import { useAuth } from '@/contexts/AuthContext';

const QUICK_ACTIONS: SidebarSection = {
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

export default function CoordinatorLayout({ children }: { children: React.ReactNode }) {
  const { activeRole } = useAuth();

  const sections: SidebarSection[] = [
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
          label: { he: 'ממתינים לאישור', en: 'Pending Approval' },
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
          label: { he: 'ממתין לאישורך', en: 'Awaiting Your Sign-off' },
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

  return (
    <SidebarShell
      brand={{ name: 'HIT', subtitle: { he: 'פורטל רכז', en: 'Coordinator Portal' } }}
      sections={sections}
      quickActions={QUICK_ACTIONS}
      theme={{ mode: 'accent' }}
    >
      {children}
    </SidebarShell>
  );
}
