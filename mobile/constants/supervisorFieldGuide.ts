// constants/supervisorFieldGuide.ts
// Mirrors web's app/supervisor/dashboard/fieldGuide.ts — same guideKeys/copy
// so seenFieldGuides carries across platforms. See that file's own comment
// for why GradeMilestoneModal's per-criterion fields aren't covered
// individually (staff-configured per workflow template).
import type { FieldGuideStep } from '@/components/guidance/types';

export const GRADE_MILESTONE_GUIDE_KEY = 'supervisor-grade-milestone';
export const GRADE_MILESTONE_FIELD_GUIDE: FieldGuideStep[] = [
  {
    key: 'submittedDocument',
    label: { he: 'קבצים שהוגשו', en: 'Submitted Files' },
    description: {
      he: 'הקובץ/ים שהסטודנט/ית הגיש/ה עבור אבן הדרך הזו — הקישו כדי לפתוח ולבדוק לפני מתן הציון.',
      en: "The file(s) the student submitted for this milestone — tap to open and review before grading.",
    },
  },
  {
    key: 'criteria',
    label: { he: 'מחוון ציונים', en: 'Grading Rubric' },
    description: {
      he: 'הרכיבים שמרכיבים את הציון של אבן הדרך הזו, כפי שהוגדרו בתבנית התהליך. הציון הכולל מחושב אוטומטית מהם.',
      en: "The components that make up this milestone's grade, as configured in the workflow template. The total is calculated from them automatically.",
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

export const RECOMMEND_EXAMINERS_GUIDE_KEY = 'supervisor-recommend-examiners';
export const RECOMMEND_EXAMINERS_FIELD_GUIDE: FieldGuideStep[] = [
  {
    key: 'internalSearch',
    label: { he: 'חפש בוחן פנימי', en: 'Search Internal Examiner' },
    description: {
      he: 'בוחנים מסגל המוסד — הקישו על שם כדי להוסיף אותו לרשימת ההמלצה.',
      en: "Examiners from the institution's own staff — tap a name to add them to the recommendation list.",
    },
  },
  {
    key: 'externalForm',
    label: { he: 'הוסף בוחן חיצוני', en: 'Add External Examiner' },
    description: {
      he: 'עבור בוחן שאינו חבר סגל: שם מלא ודוא"ל הם חובה, מוסד ותחום מומחיות הם אופציונליים אך מומלצים.',
      en: "For an examiner who isn't on staff: full name and email are required, institution and area of expertise are optional but recommended.",
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
      he: 'שדה חובה — הסטודנט/ית יראה את הסיבה הזו יחד עם ההודעה שהציון עודכן.',
      en: 'Required — the student sees this alongside the grade-change notification.',
    },
  },
];
