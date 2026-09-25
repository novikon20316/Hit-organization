// app/administrative_coordinator/navSections.ts
// The administrative_secretary sidebar's nav content, pulled out of
// layout.tsx into this leaf module so app/coordinator/layout.tsx can import
// it too (for an administrative_secretary who lands on /coordinator/home,
// a route she shares with coordinator/system_admin — see that file's own
// comment) without a layout-to-layout circular import.

import type { SidebarSection } from '@/components/dashboard/SidebarShell';
import { withinCoordinatorScope, CS_MASTERS_SCOPE } from '@/lib/permissions';

export const ADMINISTRATIVE_COORDINATOR_NAV_SECTIONS: SidebarSection[] = [
  {
    title: { he: 'ניווט', en: 'Navigation' },
    items: [
      {
        key: 'home',
        icon: '🏠',
        href: '/administrative_coordinator/dashboard',
        label: { he: 'בית', en: 'Home' },
        description: {
          he: 'לוח הבקרה שלך — תמונת מצב של כל מה שדורש את תשומת ליבך כרגע.',
          en: "Your dashboard — a snapshot of everything that needs your attention right now.",
        },
        isActive: (pathname, sp) => pathname === '/administrative_coordinator/dashboard' && (!sp.get('tab') || sp.get('tab') === 'groups'),
      },
      {
        key: 'students',
        icon: '🧑‍🎓',
        href: '/administrative_coordinator/dashboard?tab=students',
        label: { he: 'דוח סטודנטים', en: 'Students Report' },
        description: {
          he: 'דוח על כל סטודנט והסטטוס וההתקדמות הנוכחיים שלו.',
          en: 'A report of every student and their current status and progress.',
        },
        isActive: (pathname, sp) => pathname === '/administrative_coordinator/dashboard' && sp.get('tab') === 'students',
      },
      {
        key: 'users',
        icon: '👥',
        href: '/administrative_coordinator/dashboard?tab=users',
        label: { he: 'משתמשים', en: 'Users' },
        description: {
          he: 'רשימת הסטודנטים בתחום האחריות שלך, כולל איפוס סיסמה.',
          en: 'The students in your scope, including password reset.',
        },
        isActive: (pathname, sp) => pathname === '/administrative_coordinator/dashboard' && sp.get('tab') === 'users',
      },
      {
        key: 'overrides',
        icon: '✅',
        href: '/administrative_coordinator/dashboard?tab=overrides',
        label: { he: 'אישור ציונים סופיים', en: 'Final Grade Approvals' },
        description: {
          he: 'ציונים סופיים הממתינים לאישורך לפני העברתם למכלול.',
          en: 'Final grades waiting for your approval before they get transferred to Maklol.',
        },
        isActive: (pathname, sp) => pathname === '/administrative_coordinator/dashboard' && sp.get('tab') === 'overrides',
        badgeTargetScreens: ['admin_coordinator_overrides'],
      },
      {
        key: 'committeeConflicts',
        icon: '🔁',
        href: '/administrative_coordinator/dashboard?tab=committeeConflicts',
        label: { he: 'החלפת חבר ועדה', en: 'Replace Committee Member' },
        description: {
          he: 'פרויקטים בהם המנחה הוא גם חבר בוועדה שתבחן אותו — יש להחליף אותו.',
          en: "Projects where the supervisor is also on the committee reviewing them — replace them.",
        },
        isActive: (pathname, sp) => pathname === '/administrative_coordinator/dashboard' && sp.get('tab') === 'committeeConflicts',
        badgeTargetScreens: ['admin_coordinator_committee_conflicts'],
        // Only makes sense for a coordinator narrowed to a specific major —
        // a whole-faculty coordinator has no single committee this scopes
        // its conflict list to. Mirrors the page's own re-check.
        visible: (userData) => (userData?.coordinatorScopes ?? []).some((s: { major?: string }) => s.major),
      },
      {
        key: 'ungraded',
        icon: '📝',
        href: '/administrative_coordinator/dashboard?tab=ungraded',
        label: { he: 'סטודנטים ללא ציון ממוצע', en: 'Students Without a Grade Average' },
        description: {
          he: 'סטודנטים שעדיין אין להם ציון ממוצע מחושב — סקור או טפל בהם כאן.',
          en: "Students who don't yet have a computed grade average — review or resolve them here.",
        },
        isActive: (pathname, sp) => pathname === '/administrative_coordinator/dashboard' && sp.get('tab') === 'ungraded',
        // This tab only ever shows computer_science master's students (see
        // UngradedCsMastersTab.tsx) — an administrative coordinator scoped to
        // a different faculty/major (e.g. data_science) has no business with
        // that population, so the link itself must not be dangled in front
        // of them. Mirrors the same CS_MASTERS_SCOPE check the page itself
        // re-verifies before rendering the tab.
        visible: (userData) => withinCoordinatorScope(userData, CS_MASTERS_SCOPE),
      },
      {
        key: 'statistics',
        icon: '🧮',
        href: '/administrative_coordinator/dashboard?tab=statistics',
        label: { he: 'סטטיסטיקות', en: 'Statistics' },
        description: {
          he: 'נתונים מצטברים על סטודנטים, מתן ציונים ואישורים.',
          en: 'Aggregate numbers on students, grading, and approvals.',
        },
        isActive: (pathname, sp) => pathname === '/administrative_coordinator/dashboard' && sp.get('tab') === 'statistics',
      },
      {
        key: 'creditPoints',
        icon: '💰',
        href: '/administrative_coordinator/credit-points',
        label: { he: 'נקודות זכות למנחים', en: 'Supervisor Credit Points' },
        description: {
          he: 'מפתח נקודות התשלום למנחים לכל פקולטה וסוג פרויקט, וסך הנקודות שצבר כל מנחה.',
          en: 'The per-faculty/category supervisor payment-point key, and each supervisor’s accrued points.',
        },
        isActive: (pathname) => pathname === '/administrative_coordinator/credit-points',
      },
      {
        key: 'standardSupervisors',
        icon: '🧑‍🏫',
        href: '/administrative_coordinator/standard-supervisors',
        label: { he: 'מנחה סטנדרטי', en: 'Standard Supervisor' },
        description: {
          he: 'סימון אילו מנחים כשירים לפתוח פרויקט גמר/תזה בעצמם, ללא מנחה נוסף.',
          en: 'Mark which supervisors are qualified to open a final project/thesis alone, without a co-supervisor.',
        },
        isActive: (pathname) => pathname === '/administrative_coordinator/standard-supervisors',
      },
      {
        key: 'externalExaminers',
        icon: '🧾',
        href: '/administrative_coordinator/external-examiners',
        label: { he: 'פרטי בוחנים חיצוניים', en: 'External Examiners Info' },
        description: {
          he: 'פרטי הבוחנים החיצוניים, הערכותיהם ומסמכי התשלום שלהם — לרבות פרטי חשבון בנק חסויים.',
          en: 'External examiners’ details, evaluations, and payment documents — including confidential bank details.',
        },
        isActive: (pathname) => pathname === '/administrative_coordinator/external-examiners',
      },
      {
        key: 'workflowTemplates',
        icon: '🧬',
        href: '/workflow-templates',
        label: { he: 'תבניות תהליך', en: 'Process Templates' },
        description: {
          he: 'שרשראות אבני הדרך והאישורים שבהן פרויקטים מתנהלים — ערוך אותן כאן.',
          en: 'The milestone/approval chains projects follow — edit them here.',
        },
        isActive: (pathname) => pathname === '/workflow-templates',
      },
      {
        key: 'academicYear',
        icon: '🎓',
        href: '/academic-year',
        label: { he: 'שנת לימודים', en: 'Academic Year' },
        description: {
          he: 'הגדר את שנת הלימודים הנוכחית ואת התאריכים המרכזיים שלה.',
          en: 'Configure the current academic year and its key dates.',
        },
        isActive: (pathname) => pathname === '/academic-year',
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
        key: 'committees',
        icon: '🧑‍⚖️',
        href: '/committees',
        label: { he: 'ועדות', en: 'Committees' },
        description: {
          he: 'ועדות שאתה חבר/ה בהן, וסקירות הממתינות לך.',
          en: "Committees you're a member of, and any reviews waiting on you.",
        },
        isActive: (pathname) => pathname === '/committees',
      },
      {
        key: 'records',
        icon: '📜',
        href: '/administrative_coordinator/records',
        label: { he: 'רישומי פרויקטים', en: 'Project Records' },
        description: {
          he: 'ארכיון קבוע לחיפוש של כל פרויקט שטופל.',
          en: 'A permanent, searchable archive of every handled project.',
        },
        isActive: (pathname) => pathname.startsWith('/administrative_coordinator/records'),
      },
    ],
  },
];
