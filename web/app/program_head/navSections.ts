// app/program_head/navSections.ts
// The program_head sidebar's nav content, pulled out of layout.tsx into
// this leaf module so lib/roleChrome.ts can import it too (for any route
// where the signed-in user's activeRole is program_head, not just this
// role's own /program_head/* tree) without a layout-to-layout circular
// import — same split as app/coordinator/navSections.ts.
//
// "My Projects" is role-gated: it only exists for a program_head who's ALSO
// a supervisor/secondary_supervisor (see dashboard/page.tsx's
// canCreateOwnProject) — so this section is built from the caller's full
// roles list rather than a static top-level const.

import type { SidebarSection } from '@/components/dashboard/SidebarShell';

const DASHBOARD = '/program_head/dashboard';

export function buildProgramHeadNavSections(roles: string[]): SidebarSection[] {
  const canCreateOwnProject = roles.includes('supervisor') || roles.includes('secondary_supervisor');

  return [
    {
      title: { he: 'ניווט', en: 'Navigation' },
      items: [
        {
          key: 'students',
          icon: '🧑‍🎓',
          href: DASHBOARD,
          label: { he: 'סטודנטים', en: 'Students' },
          description: {
            he: 'כל הסטודנטים בתוכנית שלך, כולל המסלול וההתקדמות שלהם.',
            en: 'Every student in your program, with their track and progress.',
          },
          isActive: (pathname, sp) => pathname === DASHBOARD && (!sp.get('tab') || sp.get('tab') === 'students'),
        },
        {
          key: 'approvals',
          icon: '✅',
          href: `${DASHBOARD}?tab=approvals`,
          label: { he: 'ממתין לאישור', en: 'Approvals' },
          description: {
            he: 'החלטות הממתינות לך — אישורי פרויקט, מנחה או ציון.',
            en: "Decisions waiting on you — project, supervisor, or grade approvals.",
          },
          isActive: (pathname, sp) => pathname === DASHBOARD && sp.get('tab') === 'approvals',
        },
        {
          key: 'supervisors',
          icon: '🧑‍🏫',
          href: `${DASHBOARD}?tab=supervisors`,
          label: { he: 'מנחים', en: 'Supervisors' },
          description: {
            he: 'כל מנחה בתוכנית שלך והפרויקטים שהוא מנהל.',
            en: 'Every supervisor in your program and the projects they run.',
          },
          isActive: (pathname, sp) => pathname === DASHBOARD && sp.get('tab') === 'supervisors',
        },
        {
          key: 'staff',
          icon: '🧑‍💼',
          href: `${DASHBOARD}?tab=staff`,
          label: { he: 'סגל', en: 'Staff' },
          description: {
            he: 'חשבונות הסגל בתוכנית שלך.',
            en: 'Staff accounts within your program.',
          },
          isActive: (pathname, sp) => pathname === DASHBOARD && sp.get('tab') === 'staff',
        },
        ...(canCreateOwnProject
          ? [
              {
                key: 'myProjects',
                icon: '📁',
                href: `${DASHBOARD}?tab=myProjects`,
                label: { he: 'הפרויקטים שלי', en: 'My Projects' },
                description: {
                  he: 'פרויקטים שאתה מנחה באופן אישי, מכיוון שיש לך גם תפקיד מנחה.',
                  en: 'Projects you personally supervise, since you also hold a supervisor role.',
                },
                isActive: (pathname: string, sp: URLSearchParams) => pathname === DASHBOARD && sp.get('tab') === 'myProjects',
              },
            ]
          : []),
        {
          key: 'records',
          icon: '📜',
          href: '/program_head/records',
          label: { he: 'רישומי פרויקטים', en: 'Project Records' },
          description: {
            he: 'ארכיון קבוע לחיפוש של כל פרויקט שטופל בתוכנית שלך.',
            en: 'A permanent, searchable archive of every project handled by your program.',
          },
          isActive: (pathname: string) => pathname.startsWith('/program_head/records'),
        },
      ],
    },
  ];
}
