// app/examinor/home/fieldGuide.ts
// Single source of truth for FieldGuideOverlay walkthroughs and InfoTooltips
// on the internal examiner's grading/evaluation forms.
//
// None of these forms have a fixed field-key set — the rubric/form fields
// are configured per workflow template by staff (same situation as
// supervisor/coordinator's GradeMilestoneModal) — so each guide step covers
// a structural section as a whole rather than individual dynamic fields.
import type { FieldGuideStep } from '@/components/guidance/types';

export const GRADE_EXAMINER_GUIDE_KEY = 'examiner-grade-milestone';
export const GRADE_EXAMINER_FIELD_GUIDE: FieldGuideStep[] = [
  {
    key: 'criteria',
    label: { he: 'מדדי ציון', en: 'Grading criteria' },
    description: {
      he: 'הרכיבים שמרכיבים את הציון שלכם עבור אבן הדרך הזו, כפי שהוגדרו בתבנית התהליך. הציון הכולל (למטה) מחושב אוטומטית מהם.',
      en: "The components that make up your score for this milestone, as configured in the workflow template. The total (below) is calculated from them automatically.",
    },
  },
  {
    key: 'excludedScores',
    label: { he: 'ציונים נפרדים', en: 'Separate scores' },
    description: {
      he: 'רכיבים שנרשמים ומאומתים בנפרד אך אינם נכללים בסיכום הציון הכולל (למשל ציון פוסטר נפרד).',
      en: 'Components recorded and validated separately but not folded into the overall total (e.g. a separate poster score).',
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
      he: 'הרכיבים של ההערכה שלכם (עבודה או הגנה, בהתאם לטופס). זהו רק אחד משלושה חלקי הציון הסופי — מנחה ובוחן/ת נוסף/ת מגישים הערכות עצמאיות משלהם.',
      en: "The components of your evaluation (project or defense, depending on the form). This is only one of three parts of the final grade — the supervisor and another examiner submit their own independent evaluations.",
    },
  },
  {
    key: 'comment',
    label: { he: 'הערכה מילולית והערות', en: 'Written evaluation and comments' },
    description: {
      he: 'הסבר מילולי לציונים שלמעלה — עבור טופס עבודת הגמר של מדעי הנתונים שדה זה חובה.',
      en: 'A written explanation for the scores above — required for the Data Science project evaluation form.',
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
      he: 'שאלות שהוגדרו על ידי הפקולטה לאבן דרך זו — שאלות כן/לא עשויות לדרוש הסבר בהערה, בהתאם לתשובה שנבחרה.',
      en: 'Questions configured by the faculty for this milestone — a yes/no question may require a comment explaining the answer, depending on which one is chosen.',
    },
  },
];

// Lightweight tab-level guide for the examiner home screen (single-tab
// dashboard — a list of assignments, not multiple tabs).
export const ASSIGNMENTS_GUIDE_KEY = 'examiner-assignments';
export const ASSIGNMENTS_FIELD_GUIDE: FieldGuideStep[] = [
  {
    key: 'assignmentList',
    label: { he: 'המשימות שלי', en: 'My Assignments' },
    description: {
      he: 'כל הפרויקטים שהוקצתם להם כבוחנים. פתחו כרטיס כדי לצפות בקבצים שהוגשו ולמלא את טופס ההערכה/הציון המתאים.',
      en: 'Every project you\'ve been assigned as an examiner for. Open a card to view submitted files and fill in the matching evaluation/grading form.',
    },
  },
];
