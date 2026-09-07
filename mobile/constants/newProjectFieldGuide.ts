// constants/newProjectFieldGuide.ts
// Mirrors web's components/newProjectFieldGuide.ts — same keys/copy, same
// guideKey ('new-project-form') so seenFieldGuides is shared cross-platform:
// dismissing this walkthrough on one platform hides it on the other too,
// since it's the same conceptual form. Mobile's shared
// components/modals/NewProjectModal.tsx has no 'skills' field (a pre-
// existing web/mobile parity gap, not something this pass adds), so that key
// is simply never used here.
import type { FieldGuideStep } from '@/components/guidance/types';

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
    label: { he: 'מסלול לימודים', en: 'Study Program' },
    description: {
      he: 'מצמצם את הפרויקט למסלול ספציפי בתוך הפקולטה, אם רלוונטי. ניתן להשאיר ללא הגבלה כדי שהפרויקט יוצג לכל המסלולים.',
      en: 'Narrows the project to one specific program within the faculty, if relevant. Leave unrestricted so the project shows to every program.',
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
    label: { he: 'פרויקט קבוצתי', en: 'Team Project' },
    description: {
      he: 'האם יותר מסטודנט/ית אחד/ת יכולים להצטרף לפרויקט הזה יחד כצוות, וכמה.',
      en: 'Whether more than one student can join this project together as a team, and how many.',
    },
  },
  {
    key: 'prerequisites',
    label: { he: 'קורסי דרישת קדם', en: 'Prerequisites' },
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
