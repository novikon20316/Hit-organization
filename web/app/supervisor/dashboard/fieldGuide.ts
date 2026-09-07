// app/supervisor/dashboard/fieldGuide.ts
// Single source of truth for FieldGuideOverlay walkthroughs and InfoTooltips
// across the supervisor dashboard's grading/examiner-recommendation forms.
//
// GradeMilestoneModal's per-criterion score fields are NOT covered
// individually — like MilestoneRowModal's gradingComponents, they're
// configured per-workflow-template by staff (or fall back to a legacy fixed
// rubric), so there's no fixed field-key set to hang static copy off. The
// "criteria" guide step below explains the section as a whole instead.
import type { FieldGuideStep } from '@/components/guidance/types';

// Lightweight, section-level guides for the dashboard's list tabs (page.tsx)
// — these are lists/filters, not forms, so each gets a single step rather
// than an exhaustive per-element walkthrough.
export const PROJECTS_TAB_GUIDE_KEY = 'supervisor-projects-tab';
export const PROJECTS_TAB_FIELD_GUIDE: FieldGuideStep[] = [
  {
    key: 'projectList',
    label: { he: 'הפרויקטים שלי', en: 'My Projects' },
    description: {
      he: 'כל הפרויקטים שאתם מנחים. סננו לפי סטטוס למעלה. לחצו על כרטיס פרויקט כדי להרחיב אותו — משם ניתן לערוך, לדרג אבני דרך שממתינות, ולהמליץ על בוחנים.',
      en: 'Every project you supervise. Filter by status above. Click a project card to expand it — from there you can edit, grade pending milestones, and recommend examiners.',
    },
  },
];

export const APPLICATIONS_TAB_GUIDE_KEY = 'supervisor-applications-tab';
export const APPLICATIONS_TAB_FIELD_GUIDE: FieldGuideStep[] = [
  {
    key: 'applicationList',
    label: { he: 'מועמדויות', en: 'Applications' },
    description: {
      he: 'סטודנטים שהגישו מועמדות לפרויקטים הפתוחים שלכם. סננו לפי סטטוס למעלה. כל כרטיס מציג את פרטי הסטודנט/ית וקבצים מצורפים, ומאפשר לאשר או לדחות.',
      en: "Students who applied to your open projects. Filter by status above. Each card shows the student's details and attached files, and lets you approve or decline.",
    },
  },
];

export const SIGNOFFS_TAB_GUIDE_KEY = 'supervisor-signoffs-tab';
export const SIGNOFFS_TAB_FIELD_GUIDE: FieldGuideStep[] = [
  {
    key: 'signoffList',
    label: { he: 'ממתין לאישור ציונים ובוחנים', en: 'Awaiting Grade/Examiner Approval' },
    description: {
      he: 'ציונים ומינויי בוחנים שהגשתם, שעדיין ממתינים לאישור הרכז או בית הספר ללימודי מוסמך. מוצג כאן עד שהאישור מגיע — אין צורך בפעולה נוספת מצדכם.',
      en: "Grades and examiner assignments you've submitted that are still waiting on coordinator or grad-school approval. Shown here until it comes through — no further action needed from you.",
    },
  },
];

export const GRADE_MILESTONE_GUIDE_KEY = 'supervisor-grade-milestone';
export const GRADE_MILESTONE_FIELD_GUIDE: FieldGuideStep[] = [
  {
    key: 'submittedDocument',
    label: { he: 'המסמך שהוגש', en: 'Submitted document' },
    description: {
      he: 'הקובץ/ים שהסטודנט/ית הגיש/ה עבור אבן הדרך הזו, מוצג כאן ישירות כדי שתוכלו לבדוק לפני מתן הציון — ניתן גם להוריד.',
      en: "The file(s) the student submitted for this milestone, shown here directly so you can review before grading — also downloadable.",
    },
  },
  {
    key: 'criteria',
    label: { he: 'מדדי ציון', en: 'Grading criteria' },
    description: {
      he: 'הרכיבים שמרכיבים את הציון של אבן הדרך הזו, כפי שהוגדרו בתבנית התהליך. הציון הכולל (למטה) מחושב אוטומטית מהם.',
      en: "The components that make up this milestone's grade, as configured in the workflow template. The total (below) is calculated from them automatically.",
    },
  },
  {
    key: 'individualGrade',
    label: { he: 'ציון אישי', en: 'Individual grade' },
    description: {
      he: 'לפרויקט קבוצתי בלבד — ציון אישי אופציונלי לכל סטודנט/ית בנוסף לציון הקבוצתי המשותף, למקרה שהתרומה לא הייתה שווה.',
      en: 'Group projects only — an optional per-student score on top of the shared group grade, for when contribution wasn\'t equal.',
    },
  },
  {
    key: 'comment',
    label: { he: 'הערות לסטודנט', en: 'Comments to Student' },
    description: {
      he: 'משוב חופשי שיוצג לסטודנט/ית יחד עם הציון.',
      en: 'Free-text feedback shown to the student alongside the grade.',
    },
  },
];

export const UPDATE_GRADE_GUIDE_KEY = 'supervisor-update-grade';
export const UPDATE_GRADE_FIELD_GUIDE: FieldGuideStep[] = [
  {
    key: 'score',
    label: { he: 'ציון חדש', en: 'New grade' },
    description: {
      he: 'הציון המעודכן (0–100), שיחליף את הציון שכבר הוגש לאבן הדרך הזו.',
      en: 'The updated score (0–100), replacing the grade already submitted for this milestone.',
    },
  },
  {
    key: 'reason',
    label: { he: 'סיבת השינוי', en: 'Reason for the change' },
    description: {
      he: 'שדה חובה — הסטודנט/ית יראה את הסיבה הזו יחד עם ההודעה שהציון עודכן, ונשמרת ביומן הפעילות של הפרויקט.',
      en: 'Required — the student sees this alongside the grade-change notification, and it\'s recorded in the project\'s activity log.',
    },
  },
];

export const RECOMMEND_EXAMINERS_GUIDE_KEY = 'supervisor-recommend-examiners';
export const RECOMMEND_EXAMINERS_FIELD_GUIDE: FieldGuideStep[] = [
  {
    key: 'internalSearch',
    label: { he: 'חפש בוחן פנימי', en: 'Search Internal Examiner' },
    description: {
      he: 'בוחנים מסגל המוסד — לחצו על שם כדי להוסיף אותו לרשימת ההמלצה. ניתן להוסיף כמה שצריך, בסדר שבו אתם מוסיפים (העדיפות נקבעת אוטומטית).',
      en: "Examiners from the institution's own staff — click a name to add them to the recommendation list. Add as many as needed, in the order you add them (priority is set automatically).",
    },
  },
  {
    key: 'externalForm',
    label: { he: 'הוסף בוחן חיצוני', en: 'Add External Examiner' },
    description: {
      he: 'עבור בוחן שאינו חבר סגל: שם מלא ודוא"ל הם חובה, מוסד ותחום מומחיות הם אופציונליים אך מומלצים. לחצו ״הוסף בוחן חיצוני״ כדי להוסיף אותו לרשימה למעלה.',
      en: 'For an examiner who isn\'t on staff: full name and email are required, institution and area of expertise are optional but recommended. Click "Add External Examiner" to add them to the list above.',
    },
  },
];
