// app/program_head/dashboard/fieldGuide.ts
// Lightweight, section-level guides for the program_head dashboard's list
// tabs. EditProjectModal/GradeMilestoneModal on this dashboard are the exact
// same shared components already wired in
// app/supervisor/dashboard/EditProjectModal.tsx / GradeMilestoneModal.tsx —
// no separate content needed here.
import type { FieldGuideStep } from '@/components/guidance/types';

export const STUDENTS_TAB_GUIDE_KEY = 'program-head-students-tab';
export const STUDENTS_TAB_FIELD_GUIDE: FieldGuideStep[] = [
  {
    key: 'eligibilityLookup',
    label: { he: 'בדיקת זכאות לתזה', en: 'Thesis Eligibility Lookup' },
    description: {
      he: 'חפשו סטודנט/ית (גם ללא פרויקט פעיל עדיין) כדי להזין ממוצע ציונים או לעדכן את זכאותם לתזה.',
      en: "Search for a student (even one without an active project yet) to enter a grade average or update their thesis eligibility.",
    },
  },
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
      he: 'רשימות בוחנים והצעות תבנית הממתינות לאישורכם — אשרו, או דחו עם סיבה.',
      en: 'Examiner lists and template proposals waiting for your approval — approve, or reject with a reason.',
    },
  },
];

export const SUPERVISORS_TAB_GUIDE_KEY = 'program-head-supervisors-tab';
export const SUPERVISORS_TAB_FIELD_GUIDE: FieldGuideStep[] = [
  {
    key: 'supervisorList',
    label: { he: 'עומס הנחיה', en: 'Supervision Load' },
    description: {
      he: 'כמה סטודנטים כל מנחה בתוכנית שלכם מלווה כרגע — עוזר לאזן הקצאות חדשות.',
      en: 'How many students each supervisor in your program is currently guiding — helps balance new assignments.',
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
