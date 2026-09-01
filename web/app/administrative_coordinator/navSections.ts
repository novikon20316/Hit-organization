// app/administrative_coordinator/navSections.ts
// The administrative_secretary sidebar's nav content, pulled out of
// layout.tsx into this leaf module so app/coordinator/layout.tsx can import
// it too (for an administrative_secretary who lands on /coordinator/home,
// a route she shares with coordinator/system_admin — see that file's own
// comment) without a layout-to-layout circular import.

import type { SidebarSection } from '@/components/dashboard/SidebarShell';

export const ADMINISTRATIVE_COORDINATOR_NAV_SECTIONS: SidebarSection[] = [
  {
    title: { he: 'ניווט', en: 'Navigation' },
    items: [
      {
        key: 'home',
        icon: '🏠',
        href: '/administrative_coordinator/dashboard',
        label: { he: 'בית', en: 'Home' },
        isActive: (pathname, sp) => pathname === '/administrative_coordinator/dashboard' && (!sp.get('tab') || sp.get('tab') === 'groups'),
      },
      {
        key: 'students',
        icon: '🧑‍🎓',
        href: '/administrative_coordinator/dashboard?tab=students',
        label: { he: 'דוח סטודנטים', en: 'Students Report' },
        isActive: (pathname, sp) => pathname === '/administrative_coordinator/dashboard' && sp.get('tab') === 'students',
      },
      {
        key: 'overrides',
        icon: '✅',
        href: '/administrative_coordinator/dashboard?tab=overrides',
        label: { he: 'אישור ציונים סופיים', en: 'Final Grade Approvals' },
        isActive: (pathname, sp) => pathname === '/administrative_coordinator/dashboard' && sp.get('tab') === 'overrides',
      },
      {
        key: 'ungraded',
        icon: '📝',
        href: '/administrative_coordinator/dashboard?tab=ungraded',
        label: { he: 'סטודנטים ללא ציון ממוצע', en: 'Students Without a Grade Average' },
        isActive: (pathname, sp) => pathname === '/administrative_coordinator/dashboard' && sp.get('tab') === 'ungraded',
      },
      {
        key: 'statistics',
        icon: '🧮',
        href: '/administrative_coordinator/dashboard?tab=statistics',
        label: { he: 'סטטיסטיקות', en: 'Statistics' },
        isActive: (pathname, sp) => pathname === '/administrative_coordinator/dashboard' && sp.get('tab') === 'statistics',
      },
      {
        key: 'workflowTemplates',
        icon: '🧬',
        href: '/workflow-templates',
        label: { he: 'תבניות תהליך', en: 'Process Templates' },
        isActive: (pathname) => pathname === '/workflow-templates',
      },
      {
        key: 'academicYear',
        icon: '🎓',
        href: '/academic-year',
        label: { he: 'שנת לימודים', en: 'Academic Year' },
        isActive: (pathname) => pathname === '/academic-year',
      },
      {
        key: 'records',
        icon: '📜',
        href: '/administrative_coordinator/records',
        label: { he: 'רישומי פרויקטים', en: 'Project Records' },
        isActive: (pathname) => pathname.startsWith('/administrative_coordinator/records'),
      },
    ],
  },
];
