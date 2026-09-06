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
      description: {
        he: 'ייבוא או ייצוא של הרבה משתמשים או סטודנטים בבת אחת מקובץ אקסל.',
        en: 'Import or export many users or students at once from an Excel file.',
      },
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
          description: {
            he: 'לוח הבקרה של הפקולטה שלך — תמונת מצב של כל מה שדורש את תשומת ליבך כרגע.',
            en: "Your faculty's dashboard — a snapshot of everything that needs your attention right now.",
          },
          isActive: (pathname, sp) => pathname === '/coordinator/home' && (!sp.get('tab') || sp.get('tab') === 'overview'),
        },
        {
          key: 'inProgress',
          icon: '🚧',
          href: '/coordinator/home?tab=inProgress',
          label: { he: 'פרויקטים פעילים', en: 'In Progress' },
          description: {
            he: 'כל הפרויקטים הפעילים בפקולטה שלך, עם התקדמות אבני הדרך של כל סטודנט רשום.',
            en: "Every active project in your faculty, with each enrolled student's milestone progress.",
          },
          isActive: (pathname, sp) => pathname === '/coordinator/home' && sp.get('tab') === 'inProgress',
        },
        {
          key: 'pending',
          icon: '⏳',
          href: '/coordinator/home?tab=pending',
          label: { he: 'הגשות ממתינות לבדיקה', en: 'Submissions Pending Review' },
          description: {
            he: 'הגשות (הצעות, דוחות ועוד) הממתינות לבדיקה ואישור שלך.',
            en: 'Submissions (proposals, reports, and more) waiting for your review and approval.',
          },
          isActive: (pathname, sp) => pathname === '/coordinator/home' && sp.get('tab') === 'pending',
          badgeTargetScreens: ['coordinator_pending'],
        },
        {
          key: 'defense',
          icon: '🎓',
          href: '/coordinator/home?tab=defense',
          label: { he: 'הגנות', en: 'Defenses' },
          description: {
            he: 'פרויקטים שהגיעו לשלב ההגנה — הקצה בוחנים ואשר את הרכב הוועדה.',
            en: "Projects that have reached their defense stage — assign examiners and confirm the panel.",
          },
          isActive: (pathname, sp) => pathname === '/coordinator/home' && sp.get('tab') === 'defense',
          badgeTargetScreens: ['coordinator_defense'],
        },
        {
          key: 'deadlines',
          icon: '⏰',
          href: '/coordinator/home?tab=deadlines',
          label: { he: 'מועדי הגשה', en: 'Deadlines' },
          description: {
            he: 'מועדי הגשה קרובים ומועדים שחלפו, בכל הפקולטה.',
            en: 'Upcoming and overdue milestone deadlines across your faculty.',
          },
          isActive: (pathname, sp) => pathname === '/coordinator/home' && sp.get('tab') === 'deadlines',
          badgeTargetScreens: ['coordinator_deadlines'],
        },
        {
          key: 'recommendations',
          icon: '🧑‍⚖️',
          href: '/coordinator/home?tab=recommendations',
          label: { he: 'המלצות בוחנים', en: 'Examiner Recommendations' },
          description: {
            he: 'המלצות בוחנים מהמנחים, הממתינות לאישור או להחלפה שלך.',
            en: "Examiner suggestions from supervisors, waiting for you to confirm or replace.",
          },
          isActive: (pathname, sp) => pathname === '/coordinator/home' && sp.get('tab') === 'recommendations',
        },
        {
          key: 'signoffs',
          icon: '✅',
          href: '/coordinator/home?tab=signoffs',
          label: { he: 'ממתין לאישור ציונים ובוחנים', en: 'Awaiting Grade/Examiner Approval' },
          description: {
            he: 'ציונים ומינויי בוחנים שכבר דורגו וממתינים לאישור סופי שלך.',
            en: 'Grades and examiner assignments already graded that still need your final approval.',
          },
          isActive: (pathname, sp) => pathname === '/coordinator/home' && sp.get('tab') === 'signoffs',
          badgeTargetScreens: ['coordinator_signoffs'],
        },
        {
          key: 'statistics',
          icon: '🧮',
          href: '/coordinator/home?tab=statistics',
          label: { he: 'סטטיסטיקות', en: 'Statistics' },
          description: {
            he: 'נתונים מצטברים על פרויקטים, אבני דרך ומתן ציונים בפקולטה שלך.',
            en: 'Aggregate numbers on projects, milestones, and grading across your faculty.',
          },
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
                description: {
                  he: 'פרויקטים שנמחקו או הועברו לארכיון — שחזר פרויקט אם הוסר בטעות.',
                  en: 'Projects that were erased or archived — restore one if it was removed by mistake.',
                },
                isActive: (pathname: string, sp: URLSearchParams) => pathname === '/coordinator/home' && sp.get('tab') === 'archived',
                badgeTargetScreens: ['coordinator_archived'],
              } satisfies SidebarNavItem,
            ]
          : []),
        {
          key: 'infoFiles',
          icon: '📄',
          href: '/info-files',
          label: { he: 'מסמכי מידע', en: 'Info Files' },
          description: {
            he: 'מסמכי מידע והנחיות משותפים לפקולטה שלך.',
            en: 'Shared reference documents and guidelines for your faculty.',
          },
          isActive: (pathname) => pathname === '/info-files',
        },
        {
          key: 'workflowTemplates',
          icon: '🧬',
          href: '/workflow-templates',
          label: { he: 'תבניות תהליך', en: 'Process Templates' },
          description: {
            he: 'שרשראות אבני הדרך והאישורים שבהן פרויקטי הפקולטה מתנהלים — ערוך אותן כאן.',
            en: "The milestone/approval chains your faculty's projects follow — edit them here.",
          },
          isActive: (pathname) => pathname === '/workflow-templates',
        },
        {
          key: 'reports',
          icon: '📈',
          href: '/reports',
          label: { he: 'דוחות', en: 'Reports' },
          description: {
            he: 'הפק וייצא דוחות מפורטים על פרויקטים, סטודנטים וציונים.',
            en: 'Generate and export detailed reports across projects, students, and grades.',
          },
          isActive: (pathname) => pathname === '/reports',
        },
        {
          key: 'records',
          icon: '📜',
          href: '/coordinator/records',
          label: { he: 'רישומי פרויקטים', en: 'Project Records' },
          description: {
            he: 'ארכיון קבוע לחיפוש של כל פרויקט שטופל בפקולטה שלך.',
            en: 'A permanent, searchable archive of every project handled by your faculty.',
          },
          isActive: (pathname) => pathname.startsWith('/coordinator/records'),
        },
      ],
    },
  ];
}
