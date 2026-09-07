// components/newProjectFieldGuide.ts
// Single source of truth for both the first-visit FieldGuideOverlay
// walkthrough and every field's inline InfoTooltip across all "new project"
// modals (app/admin/panel, app/faculty_admin/dashboard,
// app/administrative_coordinator/dashboard, app/grad_school_head/dashboard,
// app/supervisor/dashboard — plus mobile's shared
// components/modals/NewProjectModal.tsx, mirrored in
// mobile/constants/newProjectFieldGuide.ts with the same keys/copy). Every
// variant renders a different subset/order of these fields (e.g. supervisor
// has no faculty picker — it's locked to their own faculty), so each modal
// calls pickNewProjectSteps() with its own fields in ITS OWN visual order
// rather than relying on a single shared array order.
import type { FieldGuideStep } from './guidance/types';

export const NEW_PROJECT_FORM_GUIDE_KEY = 'new-project-form';

const NEW_PROJECT_FIELD_GUIDE: FieldGuideStep[] = [
  {
    key: 'title',
    label: { he: 'כותרת הפרויקט', en: 'Project title' },
    description: {
      he: 'השם שהפרויקט יוצג בו לסטודנטים, בעברית ובאנגלית — שדה חובה בשתי השפות.',
      en: 'The name shown to students browsing projects, in both Hebrew and English — required in both.',
    },
  },
  {
    key: 'description',
    label: { he: 'תיאור הפרויקט', en: 'Project description' },
    description: {
      he: 'הסבר מפורט על הפרויקט שסטודנט/ית פוטנציאלי/ת יראה — מומלץ למלא בשתי השפות, גם אם לא חובה.',
      en: "A detailed explanation a prospective student sees — worth filling in both languages, even though it's optional.",
    },
  },
  {
    key: 'faculty',
    label: { he: 'פקולטה/ות', en: 'Faculty/Faculties' },
    description: {
      he: 'הפקולטה/ות שהפרויקט משויך אליהן. ניתן לבחור יותר מפקולטה אחת אם יש הרשאה לכך — הפרויקט יוצג לסטודנטים בכל הפקולטות שנבחרו.',
      en: 'The faculty/faculties this project belongs to. More than one can be selected if permitted — the project is shown to students in every faculty chosen.',
    },
  },
  {
    key: 'supervisors',
    label: { he: 'מנחה/ים', en: 'Supervisor(s)' },
    description: {
      he: 'מי מנחה את הפרויקט. ניתן לבחור יותר ממנחה אחד (למשל מנחה ראשי ומנחה משנה) — לפחות מנחה אחד חייב להיות מוסמך להנחיה ראשית בפקולטה/ות שנבחרו.',
      en: "Who supervises this project. More than one can be chosen (e.g. a primary and a secondary supervisor) — at least one must be eligible as a primary supervisor for the selected faculty/ies.",
    },
  },
  {
    key: 'major',
    label: { he: 'מגמה / תוכנית', en: 'Major/Program' },
    description: {
      he: 'מצמצם את הפרויקט למגמה ספציפית בתוך הפקולטה, אם רלוונטי. ניתן להשאיר ללא הגבלה כדי שהפרויקט יוצג לכל המגמות.',
      en: 'Narrows the project to one specific major within the faculty, if relevant. Leave unrestricted so the project shows to every major.',
    },
  },
  {
    key: 'degreeType',
    label: { he: 'סוג תואר', en: 'Degree Type' },
    description: {
      he: 'לאיזה תואר (ראשון/שני) הפרויקט פתוח. ניתן לסמן יותר מאחד אם הפרויקט מתאים לשניהם.',
      en: 'Which degree level(s) (bachelor\'s/master\'s) this project is open to. Check more than one if the project suits both.',
    },
  },
  {
    key: 'projectType',
    label: { he: 'סוג פרויקט', en: 'Project Type' },
    description: {
      he: 'האם זהו פרויקט גמר רגיל, תזה, או שניהם. קובע לפי איזו תבנית תהליך (אבני דרך, שרשראות אישור) הפרויקט ינוהל.',
      en: "Whether this is a regular final project, a thesis, or both. Determines which workflow template (milestones, approval chains) governs it.",
    },
  },
  {
    key: 'teamSize',
    label: { he: 'מספר סטודנטים', en: 'Number of students' },
    description: {
      he: 'כמה סטודנטים יכולים להצטרף לפרויקט הזה יחד כצוות. 1 פירושו פרויקט אישי בלבד.',
      en: 'How many students can join this project together as a team. 1 means an individual project only.',
    },
  },
  {
    key: 'skills',
    label: { he: 'כישורים נדרשים', en: 'Required Skills' },
    description: {
      he: 'רשימת כישורים/טכנולוגיות מופרדת בפסיקים, מוצגת לסטודנטים כדי לעזור להם להעריך התאמה — אינה נבדקת אוטומטית.',
      en: "A comma-separated list of skills/technologies, shown to students to help them judge fit — not automatically enforced.",
    },
  },
  {
    key: 'prerequisites',
    label: { he: 'דרישות קדם', en: 'Prerequisites' },
    description: {
      he: 'קורסים נדרשים (ואופציונלית ציון מינימלי בהם) לפני הצטרפות לפרויקט. המערכת בודקת זאת מול גיליון הציונים של הסטודנט/ית.',
      en: "Courses required (optionally with a minimum grade) before joining this project. The system checks this against the student's transcript.",
    },
  },
];

export function pickNewProjectSteps(orderedKeys: string[]): FieldGuideStep[] {
  const byKey = new Map(NEW_PROJECT_FIELD_GUIDE.map((s) => [s.key, s]));
  return orderedKeys.map((k) => byKey.get(k)!).filter(Boolean);
}

export function newProjectFieldInfo(key: string) {
  return NEW_PROJECT_FIELD_GUIDE.find((s) => s.key === key)!.description;
}
