// constants/programHeadFieldGuide.ts
// Mirrors web's app/program_head/dashboard/fieldGuide.ts — same
// guideKeys/copy so seenFieldGuides carries across platforms. Mobile has no
// thesis-eligibility-lookup tool (a web-only feature), so that step isn't
// mirrored here — only the plain student list.
import type { FieldGuideStep } from '@/components/guidance/types';

export const STUDENTS_TAB_GUIDE_KEY = 'program-head-students-tab';
export const STUDENTS_TAB_FIELD_GUIDE: FieldGuideStep[] = [
  {
    key: 'studentList',
    label: { he: 'רשימת סטודנטים', en: 'Students' },
    description: {
      he: 'כל הסטודנטים בתוכנית שלכם — סננו לפי איחור או מסלול (תזה/פרויקט מוסמך).',
      en: 'Every student in your program — filter by overdue status or track (thesis/master\'s project).',
    },
  },
];

export const APPROVALS_TAB_GUIDE_KEY = 'program-head-approvals-tab';
export const APPROVALS_TAB_FIELD_GUIDE: FieldGuideStep[] = [
  {
    key: 'approvalList',
    label: { he: 'אישורים', en: 'Approvals' },
    description: {
      he: 'רשימות בוחנים והצעות תבנית הממתינות לאישורכם.',
      en: 'Examiner lists and template proposals waiting for your approval.',
    },
  },
];

export const SUPERVISORS_TAB_GUIDE_KEY = 'program-head-supervisors-tab';
export const SUPERVISORS_TAB_FIELD_GUIDE: FieldGuideStep[] = [
  {
    key: 'supervisorList',
    label: { he: 'עומס הנחיה', en: 'Supervision Load' },
    description: {
      he: 'כמה סטודנטים כל מנחה בתוכנית שלכם מלווה כרגע.',
      en: 'How many students each supervisor in your program is currently guiding.',
    },
  },
];

export const STAFF_TAB_GUIDE_KEY = 'program-head-staff-tab';
export const STAFF_TAB_FIELD_GUIDE: FieldGuideStep[] = [
  {
    key: 'staffList',
    label: { he: 'סגל', en: 'Staff' },
    description: {
      he: 'חשבונות הסגל שאתם מנהלים ישירות.',
      en: 'The staff accounts you manage directly.',
    },
  },
];
