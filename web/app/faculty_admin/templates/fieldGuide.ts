// app/faculty_admin/templates/fieldGuide.ts
// Single source of truth for FieldGuideOverlay walkthroughs and InfoTooltips
// on the faculty project-template editor.
import type { FieldGuideStep } from '@/components/guidance/types';

export const TEMPLATE_EDITOR_GUIDE_KEY = 'faculty-admin-template-editor';
export const TEMPLATE_EDITOR_FIELD_GUIDE: FieldGuideStep[] = [
  {
    key: 'degree',
    label: { he: 'תואר', en: 'Degree' },
    description: {
      he: 'לאיזה תואר התבנית הזו מיועדת — קובע לאילו סטודנטים היא תוצע כשמנחה מתחיל ממנה פרויקט חדש.',
      en: 'Which degree this template is meant for — determines which students it can be offered to when a supervisor starts a new project from it.',
    },
  },
  {
    key: 'type',
    label: { he: 'סוג עבודה', en: 'Work Type' },
    description: {
      he: 'האם התבנית מיועדת לפרויקט גמר רגיל, לתזה, או שניהם.',
      en: 'Whether the template is meant for a regular final project, a thesis, or both.',
    },
  },
  {
    key: 'title',
    label: { he: 'כותרת', en: 'Title' },
    description: {
      he: 'הכותרת שהמנחה יראה בבחירת תבנית — לא מוצגת לסטודנטים ישירות עד שנוצר ממנה פרויקט בפועל.',
      en: 'The title a supervisor sees when picking a template — not shown to students until an actual project is created from it.',
    },
  },
  {
    key: 'description',
    label: { he: 'תיאור', en: 'Description' },
    description: {
      he: 'תיאור ברירת מחדל לפרויקט שייווצר מהתבנית — המנחה יכול לערוך אותו בעת יצירת הפרויקט.',
      en: 'The default description for a project created from this template — the supervisor can edit it when creating the project.',
    },
  },
  {
    key: 'skills',
    label: { he: 'כישורים נדרשים', en: 'Required Skills' },
    description: {
      he: 'הקלידו כישור ולחצו Enter או פסיק כדי להוסיף אותו כתגית. אלה יועתקו כברירת מחדל לכל פרויקט שייווצר מהתבנית.',
      en: 'Type a skill and press Enter or comma to add it as a tag. These are copied as the default for any project created from this template.',
    },
  },
];

export const REJECT_PROPOSAL_GUIDE_KEY = 'faculty-admin-reject-proposal';
export const REJECT_PROPOSAL_FIELD_GUIDE: FieldGuideStep[] = [
  {
    key: 'reason',
    label: { he: 'סיבת הדחייה', en: 'Rejection reason' },
    description: {
      he: 'שדה חובה — יישלח למנחה שהגיש את הצעת התבנית.',
      en: 'Required — sent to the supervisor who submitted the template proposal.',
    },
  },
];
