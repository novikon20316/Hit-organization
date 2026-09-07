// constants/examinerFieldGuide.ts
// Mirrors web's app/examinor/home/fieldGuide.ts — same guideKeys/copy so
// seenFieldGuides carries across platforms.
import type { FieldGuideStep } from '@/components/guidance/types';

export const GRADE_EXAMINER_GUIDE_KEY = 'examiner-grade-milestone';
export const GRADE_EXAMINER_FIELD_GUIDE: FieldGuideStep[] = [
  {
    key: 'criteria',
    label: { he: 'מדדי ציון', en: 'Grading criteria' },
    description: {
      he: 'הרכיבים שמרכיבים את הציון שלכם עבור אבן הדרך הזו, כפי שהוגדרו בתבנית התהליך.',
      en: "The components that make up your score for this milestone, as configured in the workflow template.",
    },
  },
  {
    key: 'excludedScores',
    label: { he: 'ציונים נפרדים', en: 'Separate scores' },
    description: {
      he: 'רכיבים שנרשמים בנפרד ואינם נכללים בסיכום הציון הכולל.',
      en: 'Components recorded separately but not folded into the overall total.',
    },
  },
  {
    key: 'comments',
    label: { he: 'הערות', en: 'Comments' },
    description: {
      he: 'משוב חופשי שיוצג לסטודנט/ית יחד עם הציון.',
      en: 'Free-text feedback shown to the student alongside the grade.',
    },
  },
];

export const EXAMINER_EVALUATION_GUIDE_KEY = 'examiner-evaluation';
export const EXAMINER_EVALUATION_FIELD_GUIDE: FieldGuideStep[] = [
  {
    key: 'rubric',
    label: { he: 'מדדי ציון', en: 'Grading criteria' },
    description: {
      he: 'הרכיבים של ההערכה שלכם. זהו רק אחד משלושה חלקי הציון הסופי.',
      en: "The components of your evaluation. This is only one of three parts of the final grade.",
    },
  },
  {
    key: 'comment',
    label: { he: 'הערכה מילולית והערות', en: 'Written evaluation and comments' },
    description: {
      he: 'הסבר מילולי לציונים שלמעלה.',
      en: 'A written explanation for the scores above.',
    },
  },
  {
    key: 'file',
    label: { he: 'קובץ מצורף', en: 'Attached file' },
    description: {
      he: 'אופציונלי — ניתן לצרף מסמך תומך להערכה שלכם.',
      en: 'Optional — attach a supporting document to your evaluation.',
    },
  },
];

export const EXAMINER_FORM_FIELDS_GUIDE_KEY = 'examiner-form-fields';
export const EXAMINER_FORM_FIELDS_FIELD_GUIDE: FieldGuideStep[] = [
  {
    key: 'formFields',
    label: { he: 'טופס הערכה', en: 'Evaluation Form' },
    description: {
      he: 'שאלות שהוגדרו על ידי הפקולטה לאבן דרך זו — שאלות כן/לא עשויות לדרוש הסבר בהערה.',
      en: 'Questions configured by the faculty for this milestone — a yes/no question may require an explanatory comment.',
    },
  },
];

export const ASSIGNMENTS_GUIDE_KEY = 'examiner-assignments';
export const ASSIGNMENTS_FIELD_GUIDE: FieldGuideStep[] = [
  {
    key: 'assignmentList',
    label: { he: 'הפרויקטים שלי', en: 'My Projects' },
    description: {
      he: 'כל הפרויקטים שהוקצתם להם כבוחנים. פתחו כרטיס כדי לצפות בקבצים ולמלא את הטופס המתאים.',
      en: "Every project you've been assigned as an examiner for. Open a card to view files and fill in the matching form.",
    },
  },
];
