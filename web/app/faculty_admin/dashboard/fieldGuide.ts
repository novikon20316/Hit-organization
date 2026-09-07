// app/faculty_admin/dashboard/fieldGuide.ts
// Single source of truth for FieldGuideOverlay walkthroughs and InfoTooltips
// across the faculty_admin dashboard's user/enrollment forms and list tabs.
import type { FieldGuideStep } from '@/components/guidance/types';

export const EDIT_USER_GUIDE_KEY = 'faculty-admin-edit-user';
export const EDIT_USER_FIELD_GUIDE: FieldGuideStep[] = [
  {
    key: 'role',
    label: { he: 'תפקיד', en: 'Role' },
    description: {
      he: 'התפקיד שהחשבון הזה מחזיק במערכת — קובע אילו מסכים ופעולות זמינים לו.',
      en: "The role this account holds in the system — determines which screens and actions are available to it.",
    },
  },
  {
    key: 'faculty',
    label: { he: 'פקולטה', en: 'Faculty' },
    description: {
      he: 'הפקולטה שהחשבון משויך אליה.',
      en: 'The faculty this account belongs to.',
    },
  },
  {
    key: 'primaryStatus',
    label: { he: 'סטטוס ראשי', en: 'Primary Status' },
    description: {
      he: 'סטטוס לימודים ראשי של הסטודנט/ית (למשל פעיל/ה, בהשעיה) — הרשימה מנוהלת על ידי מנהל/ת המערכת.',
      en: "The student's primary academic status (e.g. active, suspended) — the list is managed by system_admin.",
    },
  },
  {
    key: 'secondaryStatus',
    label: { he: 'סטטוס משני', en: 'Secondary Status' },
    description: {
      he: 'סטטוס נוסף, משלים לסטטוס הראשי, אם רלוונטי.',
      en: "An additional status alongside the primary one, if relevant.",
    },
  },
];

export const ENROLL_STUDENT_GUIDE_KEY = 'faculty-admin-enroll-student';
export const ENROLL_STUDENT_FIELD_GUIDE: FieldGuideStep[] = [
  {
    key: 'student',
    label: { he: 'סטודנט', en: 'Student' },
    description: {
      he: 'רשימת הסטודנטים בפקולטה שאין להם פרויקט פעיל כרגע — בחירה כאן משייכת אותם ישירות לפרויקט הזה, ללא תהליך הגשת מועמדות.',
      en: 'Students in your faculty with no active project right now — selecting one enrolls them directly into this project, skipping the application process.',
    },
  },
];

// Lightweight, section-level guides for the dashboard's list tabs.
export const USERS_TAB_GUIDE_KEY = 'faculty-admin-users-tab';
export const USERS_TAB_FIELD_GUIDE: FieldGuideStep[] = [
  {
    key: 'userList',
    label: { he: 'משתמשים', en: 'Users' },
    description: {
      he: 'כל חשבונות הסגל (ולעיתים סטודנטים) בפקולטה שלכם. ערכו תפקיד/פקולטה/סטטוס, או השביתו חשבון מכאן.',
      en: 'Every staff (and sometimes student) account in your faculty. Edit role/faculty/status, or deactivate an account from here.',
    },
  },
];

export const PROJECTS_TAB_GUIDE_KEY = 'faculty-admin-projects-tab';
export const PROJECTS_TAB_FIELD_GUIDE: FieldGuideStep[] = [
  {
    key: 'projectList',
    label: { he: 'פרויקטים', en: 'Projects' },
    description: {
      he: 'כל הפרויקטים שפורסמו בפקולטה שלכם, בכל הסטטוסים. שייכו סטודנט/ית ללא פרויקט ישירות מכאן.',
      en: 'Every project posted in your faculty, across every status. Enroll a project-less student directly from here.',
    },
  },
];

export const STUDENTS_TAB_GUIDE_KEY = 'faculty-admin-students-tab';
export const STUDENTS_TAB_FIELD_GUIDE: FieldGuideStep[] = [
  {
    key: 'studentList',
    label: { he: 'רשימת סטודנטים', en: 'Students List' },
    description: {
      he: 'רשימה מלאה של הסטודנטים הרשומים לתוכניות של הפקולטה שלכם — כלי מעקב, ללא פעולות ישירות מכאן.',
      en: "The full list of students enrolled in your faculty's programs — a tracking view, no direct actions here.",
    },
  },
];

export const DEADLINES_TAB_GUIDE_KEY = 'faculty-admin-deadlines-tab';
export const DEADLINES_TAB_FIELD_GUIDE: FieldGuideStep[] = [
  {
    key: 'deadlineList',
    label: { he: 'מועדי הגשה', en: 'Deadlines' },
    description: {
      he: 'מועדי הגשה קרובים ומועדים שחלפו, בכל הפקולטה.',
      en: 'Upcoming and overdue milestone deadlines across your faculty.',
    },
  },
];

export const SIGNOFFS_TAB_GUIDE_KEY = 'faculty-admin-signoffs-tab';
export const SIGNOFFS_TAB_FIELD_GUIDE: FieldGuideStep[] = [
  {
    key: 'signoffList',
    label: { he: 'ממתין לאישור ציונים ובוחנים', en: 'Awaiting Grade/Examiner Approval' },
    description: {
      he: 'ציונים ומינויי בוחנים הממתינים לאישור סופי שלכם.',
      en: 'Grades and examiner assignments waiting for your final approval.',
    },
  },
];
