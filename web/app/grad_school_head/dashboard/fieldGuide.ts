// app/grad_school_head/dashboard/fieldGuide.ts
// Lightweight, section-level guides for the grad_school_head dashboard's
// list tabs — these are cross-faculty lists, not forms, so each gets a
// single step. Inline reject-reason/unlock-reason inputs inside each
// approval card are compact list-item actions, not a dedicated form, so
// they're covered by these tab-level steps rather than individual tooltips.
import type { FieldGuideStep } from '@/components/guidance/types';

export const APPROVALS_TAB_GUIDE_KEY = 'grad-school-head-approvals-tab';
export const APPROVALS_TAB_FIELD_GUIDE: FieldGuideStep[] = [
  {
    key: 'approvalList',
    label: { he: 'ממתין לאישורי', en: 'Approvals' },
    description: {
      he: 'החלטות הממתינות לכם ברמת בית הספר ללימודי מוסמך — מנחים, בוחנים, הצעות תבנית וציונים סופיים. כל כרטיס ניתן לאישור, או לדחייה עם סיבה.',
      en: "Decisions waiting on you at the grad-school level — supervisors, examiners, template proposals, and final grades. Each card can be approved, or rejected with a reason.",
    },
  },
];

export const STUCK_TAB_GUIDE_KEY = 'grad-school-head-stuck-tab';
export const STUCK_TAB_FIELD_GUIDE: FieldGuideStep[] = [
  {
    key: 'stuckList',
    label: { he: 'תקועים', en: 'Stuck' },
    description: {
      he: 'פרויקטים שנתקעו ללא התקדמות לאחרונה, בכל הפקולטות — כלי מעקב, ללא פעולות ישירות מכאן.',
      en: 'Projects that have stalled with no recent progress, across every faculty — a tracking view, no direct actions here.',
    },
  },
];

export const EXAMINERS_TAB_GUIDE_KEY = 'grad-school-head-examiners-tab';
export const EXAMINERS_TAB_FIELD_GUIDE: FieldGuideStep[] = [
  {
    key: 'examinerList',
    label: { he: 'עומס בוחנים', en: 'Examiners' },
    description: {
      he: 'עומס העבודה הנוכחי של כל בוחן (פעילים/ממתינים/באיחור) — עוזר לאזן הקצאות חדשות בין הבוחנים.',
      en: "Each examiner's current workload (active/pending/overdue) — helps balance new assignments across examiners.",
    },
  },
];

export const GRADES_TAB_GUIDE_KEY = 'grad-school-head-grades-tab';
export const GRADES_TAB_FIELD_GUIDE: FieldGuideStep[] = [
  {
    key: 'gradeList',
    label: { he: 'ציונים מאושרים', en: 'Approved Grades' },
    description: {
      he: 'ציונים סופיים שהשלימו את תהליך האישור. ניתן ״לפתוח לתיקון״ ציון שכבר אושר, בציון סיבה — פעולה חריגה שיש להשתמש בה בזהירות.',
      en: 'Final grades that have completed approval. A grade can be "unlocked for correction" with a reason — an exceptional action, use carefully.',
    },
  },
];

export const STAFF_TAB_GUIDE_KEY = 'grad-school-head-staff-tab';
export const STAFF_TAB_FIELD_GUIDE: FieldGuideStep[] = [
  {
    key: 'staffList',
    label: { he: 'סגל', en: 'Staff' },
    description: {
      he: 'חשבונות סגל בכל הפקולטות — ערכו תפקיד/פקולטה, או השביתו חשבון מכאן.',
      en: 'Staff accounts across every faculty — edit role/faculty, or deactivate an account from here.',
    },
  },
];

export const STUDENTS_TAB_GUIDE_KEY = 'grad-school-head-students-tab';
export const STUDENTS_TAB_FIELD_GUIDE: FieldGuideStep[] = [
  {
    key: 'studentList',
    label: { he: 'רשימת סטודנטים', en: 'Students List' },
    description: {
      he: 'רשימה מלאה של הסטודנטים בכל הפקולטות.',
      en: 'The full list of students across every faculty.',
    },
  },
];

export const UNGRADED_TAB_GUIDE_KEY = 'grad-school-head-ungraded-tab';
export const UNGRADED_TAB_FIELD_GUIDE: FieldGuideStep[] = [
  {
    key: 'ungradedList',
    label: { he: 'סטודנטים ללא ציון ממוצע', en: 'Students Without a Grade Average' },
    description: {
      he: 'סטודנטים ללא ציון ממוצע מחושב — סקרו או טפלו בהם כאן.',
      en: 'Students without a computed grade average — review or resolve them here.',
    },
  },
];
