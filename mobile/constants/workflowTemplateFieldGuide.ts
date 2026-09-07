// constants/workflowTemplateFieldGuide.ts
// Mirrors web's app/workflow-templates/fieldGuide.ts — same keys/copy, kept
// in sync deliberately so a staff member sees the same explanations on
// mobile and web. Single source of truth for both the first-visit
// FieldGuideOverlay walkthrough and every field's inline InfoTooltip on
// app/(tabs)/WorkflowTemplateEditor.tsx (template-level form + milestone
// editor modal, both in that one screen).
import type { FieldGuideStep } from '@/components/guidance/types';

export const WORKFLOW_TEMPLATE_FORM_GUIDE_KEY = 'workflow-template-form';

export const WORKFLOW_TEMPLATE_FIELD_GUIDE: FieldGuideStep[] = [
  {
    key: 'milestones',
    label: { he: 'אבני דרך', en: 'Milestones' },
    description: {
      he: 'הרשימה של השלבים שכל תהליך (פרויקט/תזה) יעבור, בסדר הזה. כל אבן דרך מגדירה תאריך יעד, אחוז מהציון הסופי, והאם נדרשים בוחנים — הקישו על ✏️ כדי לערוך אבן דרך קיימת או על ״הוסף״ כדי להוסיף חדשה.',
      en: 'The ordered list of stages every process (project/thesis) goes through. Each milestone sets a due date, its share of the final grade, and whether examiners are required — tap ✏️ to edit an existing one or "Add" for a new one.',
    },
  },
  {
    key: 'defaultRouting',
    label: { he: 'שרשרת אישור/דחייה ברירת מחדל', en: 'Default approval/rejection chain' },
    description: {
      he: 'מי צריך לאשר (או לדחות בחזרה) כל אבן דרך, בסדר הזה — לדוגמה: מנחה, ואז רכז. חלה על כל אבן דרך שאין לה שרשרת מותאמת משלה; ניתן לשנות לפי אבן דרך בעריכה שלה.',
      en: 'Who needs to approve (or reject back) each milestone, in this order — e.g. supervisor, then coordinator. Applies to every milestone without its own override, settable per-milestone in its own editor.',
    },
  },
  {
    key: 'examinerSignoffRole',
    label: { he: 'אישור נוסף להזמנת בוחנים', en: 'Second sign-off before examiner invitations go out' },
    description: {
      he: 'לאחר שהרכז מאשר את רשימת הבוחנים המומלצת, ניתן לדרוש אישור נוסף מתפקיד ספציפי (למשל ראש בית ספר לתארים מתקדמים) לפני שההזמנות נשלחות בפועל לבוחנים. בחרו ״ללא אישור נוסף״ כדי לדלג על השלב הזה.',
      en: "After a coordinator approves the recommended examiner list, you can require sign-off from a specific role (e.g. the grad school head) before invitations actually go out to examiners. Choose \"No second sign-off\" to skip this stage.",
    },
  },
  {
    key: 'finalGradeSignoffRole',
    label: { he: 'אישור הציון הסופי (הגנה)', en: 'Final grade sign-off (defense)' },
    description: {
      he: 'לאחר שהציון הסופי של ההגנה מחושב מציוני המנחה והבוחנים, התפקיד הזה מאשר או דוחה אותו לפני שהוא מועבר למכלול.',
      en: "Once a defense milestone's final grade is computed from the supervisor's and examiners' scores, this role approves or rejects it before it's sent to Michlol.",
    },
  },
  {
    key: 'firstStepMode',
    label: { he: 'מה הסטודנט/ית רואה קודם?', en: 'What does the student see first?' },
    description: {
      he: 'קובע מה סטודנט/ית ללא פרויקט פעיל בפקולטה/תואר הזה רואה תחילה: עיון ברשימת פרויקטים בודדים שפורסמו (ברירת המחדל), או בחירת מנחה מתוך רשימה ופנייה ישירה אליו/ה.',
      en: 'Controls what a student with no active project in this faculty/degree sees first: browsing individually-posted projects (the default), or choosing a supervisor from a list and reaching out directly.',
    },
  },
  {
    key: 'supervisorSelectionRequiresApproval',
    label: { he: 'בחירת מנחה מצריכה אישור', en: 'Choosing a supervisor requires approval' },
    description: {
      he: 'מסומן: הסטודנט/ית מגיש/ה גיליון ציונים וקורות חיים והמנחה צריך/ה לאשר, בדיוק כמו הגשת מועמדות לפרויקט היום. לא מסומן: הצטרפות מיידית למנחה שנבחר/ה, ללא שלב אישור.',
      en: "Checked: the student submits a transcript/CV and the supervisor must approve — the same flow as applying to a project today. Unchecked: the student joins the chosen supervisor immediately, no approval step.",
    },
  },
  {
    key: 'applyMode',
    label: { he: 'מתי התבנית תיכנס לתוקף?', en: 'When should this take effect?' },
    description: {
      he: '״מכאן ואילך״: התבנית החדשה חלה רק על תהליכים שיתחילו אחרי האישור. ״עכשיו״: חלה גם על תהליכים שכבר בעיצומם — שימו לב שזה יכול לשנות אבני דרך שכבר החלו.',
      en: '"From now on": the new template applies only to processes that start after approval. "Now": it also applies to processes already in progress — note this can change milestones already underway.',
    },
  },
  {
    key: 'note',
    label: { he: 'הערה להצעה', en: 'Note for this proposal' },
    description: {
      he: 'שדה חופשי ואופציונלי שמוצג למאשר/ת ההצעה — מומלץ להסביר בקצרה למה מוצע השינוי, כדי להקל על תהליך האישור.',
      en: 'A free-text, optional field shown to whoever approves this proposal — briefly explaining why the change is proposed helps speed up approval.',
    },
  },
];

export const MILESTONE_MODAL_GUIDE_KEY = 'workflow-template-milestone';

export const MILESTONE_FIELD_GUIDE: FieldGuideStep[] = [
  {
    key: 'name',
    label: { he: 'שם אבן הדרך', en: 'Milestone name' },
    description: {
      he: 'השם שיוצג לסטודנטים ולצוות בעברית ובאנגלית לאורך כל התהליך — לדוגמה ״הגשת הצעת מחקר״.',
      en: 'The name shown to students and staff throughout the process, in Hebrew and English — e.g. "Research Proposal Submission".',
    },
  },
  {
    key: 'dateMode',
    label: { he: 'מועד היעד', en: 'Due date' },
    description: {
      he: 'תאריך יעד יכול להיות מספר ימים קבוע מתחילת התהליך (״יום 90״), תאריך קבוע בלוח השנה, או מסונכרן אוטומטית עם מועד היעד של אבן דרך אחרת.',
      en: 'A due date can be a fixed number of days from the start of the process ("Day 90"), a fixed calendar date, or automatically synced to another milestone\'s due date.',
    },
  },
  {
    key: 'percentOfFinalGrade',
    label: { he: 'אחוז מהציון הסופי', en: '% of final grade' },
    description: {
      he: 'המשקל של אבן הדרך הזו בציון הסופי של כל התהליך. סכום האחוזים של כל אבני הדרך יחד חייב להיות 100.',
      en: "This milestone's weight in the overall process's final grade. The percentages across all milestones must add up to 100.",
    },
  },
  {
    key: 'requiresExaminers',
    label: { he: 'נדרשים בוחנים', en: 'Requires examiners' },
    description: {
      he: 'כאשר מסומן, אבן הדרך הזו (בדרך כלל הגנה) מצריכה שיבוץ בוחנים חיצוניים/פנימיים, ותוכלו להגדיר כמה בוחנים נדרשים.',
      en: 'When checked, this milestone (typically a defense) requires assigning internal/external examiners, and you can set how many are required.',
    },
  },
  {
    key: 'examinerOnlyGrading',
    label: { he: 'ציון בוחנים בלבד', en: 'Examiner-only grading (no supervisor stage)' },
    description: {
      he: 'כאשר מסומן, רק הבוחנים מדרגים את אבן הדרך הזו — שלב הציון של המנחה מדולג עבורה.',
      en: 'When checked, only examiners grade this milestone — the supervisor grading stage is skipped for it.',
    },
  },
  {
    key: 'gradingComponents',
    label: { he: 'מרכיבי ציון', en: 'Grading components' },
    description: {
      he: 'פירוט הרכיבים שמרכיבים את הציון של אבן הדרך הזו (למשל: תוכן, מצגת, כתיבה), כל אחד עם משקל ותווית בעברית ובאנגלית — בנפרד עבור ציון מנחה, ציון בוחן על הפרויקט, וציון בוחן על ההגנה.',
      en: 'The weighted components that make up this milestone\'s grade (e.g. content, presentation, writing), each with a HE/EN label — configured separately for the supervisor score, examiner project score, and examiner defense score.',
    },
  },
  {
    key: 'examinerFormFields',
    label: { he: 'שדות טופס מותאמים לבוחנים/צוות', en: 'Custom staff/examiner form fields' },
    description: {
      he: 'שדות נוספים שתרצו שהבוחנים או הצוות ימלאו עבור אבן הדרך הזו, מעבר לציון עצמו — לדוגמה הערות חופשיות. ניתן לסמן אם השדה חובה ואם הוא גלוי גם לסטודנט/ית.',
      en: 'Extra fields you want examiners or staff to fill in for this milestone, beyond the grade itself — e.g. free-text remarks. You can mark a field required and/or visible to the student.',
    },
  },
  {
    key: 'routing',
    label: { he: 'שרשרת אישור מותאמת לאבן דרך זו', en: 'Per-milestone routing override' },
    description: {
      he: 'שרשרת אישור/דחייה שונה מברירת המחדל של התבנית, החלה רק על אבן דרך זו. השאירו ריק כדי להמשיך להשתמש בשרשרת ברירת המחדל.',
      en: "An approval/rejection chain that differs from the template's default, applying only to this milestone. Leave empty to keep using the default chain.",
    },
  },
];
