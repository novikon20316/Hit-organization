// constants/studentFieldGuide.ts
// Mirrors web's app/student/home/fieldGuide.ts — same guideKeys/copy, so
// seenFieldGuides carries across platforms. See that file's own comment for
// why ResearchProposalFormModal/ProgressReportFormModal (dynamic,
// staff-configured fields) aren't covered here either.
import type { FieldGuideStep } from '@/components/guidance/types';

export const APPLY_PROJECT_GUIDE_KEY = 'student-apply-project';
export const APPLY_PROJECT_FIELD_GUIDE: FieldGuideStep[] = [
  {
    key: 'track',
    label: { he: 'מסלול', en: 'Track' },
    description: {
      he: 'פרויקט זה פתוח ליותר ממסלול אחד (פרויקט/תזה) — יש לבחור לאיזה מהם אתם נרשמים.',
      en: 'This project is open to more than one track (project/thesis) — choose which one you\'re applying to.',
    },
  },
  {
    key: 'coverNote',
    label: { he: 'הודעה למנחה', en: 'Cover note' },
    description: {
      he: 'שדה חופשי ואופציונלי — הזדמנות להציג את עצמכם ולהסביר בקצרה למה אתם מתאימים לפרויקט הזה.',
      en: "A free-text, optional field — a chance to introduce yourself and briefly explain why you're a good fit for this project.",
    },
  },
  {
    key: 'transcript',
    label: { he: 'גיליון ציונים', en: 'Transcript' },
    description: {
      he: 'קובץ PDF של גיליון הציונים העדכני שלכם. אם הגשתם מועמדות בעבר, ניתן להשתמש שוב בקובץ שכבר הועלה.',
      en: 'A PDF of your current transcript. If you applied before, you can reuse the file you already uploaded.',
    },
  },
  {
    key: 'cv',
    label: { he: 'קורות חיים', en: 'CV' },
    description: {
      he: 'קובץ PDF של קורות החיים שלכם. אם הגשתם מועמדות בעבר, ניתן להשתמש שוב בקובץ שכבר הועלה.',
      en: "A PDF of your CV. If you applied before, you can reuse the file you already uploaded.",
    },
  },
];

export const SUBMIT_MILESTONE_GUIDE_KEY = 'student-submit-milestone';
export const SUBMIT_MILESTONE_FIELD_GUIDE: FieldGuideStep[] = [
  {
    key: 'files',
    label: { he: 'קבצים', en: 'Files' },
    description: {
      he: 'הקבצים שמרכיבים את ההגשה שלכם עבור אבן הדרך הזו. אם יש הגבלה על סוגי קובץ מותרים, היא תוצג כאן.',
      en: "The files that make up your submission for this milestone. If specific file types are required, they're listed here.",
    },
  },
  {
    key: 'note',
    label: { he: 'הערה', en: 'Note' },
    description: {
      he: 'הערת טקסט חופשית שמצטרפת להגשה — עשויה להיות חובה או אופציונלית, בהתאם לאבן הדרך.',
      en: "A free-text note that accompanies your submission — may be required or optional, depending on the milestone.",
    },
  },
];

export const OVERVIEW_TAB_GUIDE_KEY = 'student-overview-tab';
export const OVERVIEW_TAB_FIELD_GUIDE: FieldGuideStep[] = [
  {
    key: 'metrics',
    label: { he: 'ציון סופי ואבני דרך', en: 'Final grade & milestones' },
    description: {
      he: 'הציון הסופי (מוצג רק לאחר שהתהליך כולו הושלם ואושר), ומספר אבני הדרך שכבר אושרו מתוך הכל.',
      en: 'Your final grade (shown only once the whole process is complete and approved), and how many milestones are approved out of the total.',
    },
  },
  {
    key: 'nextDeadline',
    label: { he: 'המועד הקרוב', en: 'Next deadline' },
    description: {
      he: 'אבן הדרך הבאה שעליכם לטפל בה ומספר הימים שנותרו (או ימי איחור, אם עבר המועד).',
      en: "The next milestone you need to act on and how many days remain (or are overdue, if the date has passed).",
    },
  },
];

export const MILESTONES_TAB_GUIDE_KEY = 'student-milestones-tab';
export const MILESTONES_TAB_FIELD_GUIDE: FieldGuideStep[] = [
  {
    key: 'timeline',
    label: { he: 'אבני הדרך שלך', en: 'Your milestones' },
    description: {
      he: 'כל שלב בתהליך, בסדר. שלב עמום עדיין נעול עד שהקודם לו יאושר. הצבע והתגית מציינים את הסטטוס: ✅ אושר, 📤 הוגש וממתין, ↩ הוחזר לתיקון, או מועד יעד קרוב.',
      en: 'Every stage in your process, in order. A dimmed stage stays locked until the one before it is approved. The color/badge shows status: ✅ approved, 📤 submitted and waiting, ↩ returned for revision, or an upcoming due date.',
    },
  },
];

export const GRADES_TAB_GUIDE_KEY = 'student-grades-tab';
export const GRADES_TAB_FIELD_GUIDE: FieldGuideStep[] = [
  {
    key: 'gradeCards',
    label: { he: 'ציונים ומשקלים', en: 'Grades & Weights' },
    description: {
      he: 'הציון של כל אבן דרך, ברגע שהוא מאושר ונחשף לכם. אבן דרך שניתנת להרחבה מציגה פירוט נוסף בלחיצה.',
      en: 'Each milestone\'s grade, once approved and revealed to you. An expandable milestone shows more detail on tap.',
    },
  },
];
