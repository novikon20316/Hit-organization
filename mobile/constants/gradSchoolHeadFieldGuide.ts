// constants/gradSchoolHeadFieldGuide.ts
// Mirrors web's app/grad_school_head/dashboard/fieldGuide.ts — same
// guideKeys/copy so seenFieldGuides carries across platforms. Mobile has no
// 'ungraded' tab, so that guide isn't mirrored here.
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
      he: 'פרויקטים שנתקעו ללא התקדמות לאחרונה, בכל הפקולטות.',
      en: 'Projects that have stalled with no recent progress, across every faculty.',
    },
  },
];

export const EXAMINERS_TAB_GUIDE_KEY = 'grad-school-head-examiners-tab';
export const EXAMINERS_TAB_FIELD_GUIDE: FieldGuideStep[] = [
  {
    key: 'examinerList',
    label: { he: 'עומס בוחנים', en: 'Examiners' },
    description: {
      he: 'עומס העבודה הנוכחי של כל בוחן — עוזר לאזן הקצאות חדשות בין הבוחנים.',
      en: "Each examiner's current workload — helps balance new assignments across examiners.",
    },
  },
];

export const GRADES_TAB_GUIDE_KEY = 'grad-school-head-grades-tab';
export const GRADES_TAB_FIELD_GUIDE: FieldGuideStep[] = [
  {
    key: 'gradeList',
    label: { he: 'ציונים מאושרים', en: 'Approved Grades' },
    description: {
      he: 'ציונים סופיים שהשלימו את תהליך האישור. ניתן ״לפתוח לתיקון״ ציון שכבר אושר, בציון סיבה.',
      en: 'Final grades that have completed approval. A grade can be "unlocked for correction" with a reason.',
    },
  },
];

export const STAFF_TAB_GUIDE_KEY = 'grad-school-head-staff-tab';
export const STAFF_TAB_FIELD_GUIDE: FieldGuideStep[] = [
  {
    key: 'staffList',
    label: { he: 'סגל', en: 'Staff' },
    description: {
      he: 'חשבונות סגל בכל הפקולטות.',
      en: 'Staff accounts across every faculty.',
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
