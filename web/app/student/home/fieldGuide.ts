// app/student/home/fieldGuide.ts
// Single source of truth for both first-visit FieldGuideOverlay walkthroughs
// and inline InfoTooltips across the student "apply to a project" flow
// (BrowseProjects.tsx and BrowseSupervisors.tsx — same form shape, shared
// guideKey) and the milestone-submission flow (SubmitMilestoneModal.tsx).
//
// NOT covered here: ResearchProposalFormModal.tsx / ProgressReportFormModal.tsx.
// Their fields (milestone.studentFormFields) are configured per-workflow-
// template by staff at runtime — there's no fixed set of field keys to hang
// static HE/EN copy off, unlike every other form in this codebase. Adding
// real per-field help there would mean giving FormFieldSpec its own
// staff-authored help-text property, which is a bigger change than this
// pass's "wire up the fields that already exist" scope.
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

// Lightweight, section-level guides for the three read-only dashboard tabs
// (ActiveDashboard.tsx) — these aren't forms with discrete fields, so each
// gets 1-2 steps explaining its key sections rather than an exhaustive
// per-element walkthrough.
export const OVERVIEW_TAB_GUIDE_KEY = 'student-overview-tab';
export const OVERVIEW_TAB_FIELD_GUIDE: FieldGuideStep[] = [
  {
    key: 'progress',
    label: { he: 'התקדמות הפרויקט', en: 'Project progress' },
    description: {
      he: 'אחוז אבני הדרך שכבר אושרו על ידי הרכז, מתוך כלל אבני הדרך בתהליך שלכם.',
      en: 'The share of your milestones already approved by the coordinator, out of the full process.',
    },
  },
  {
    key: 'nextMilestone',
    label: { he: 'אבן הדרך הבאה', en: 'Next milestone' },
    description: {
      he: 'מה עליכם לעשות עכשיו — כולל מועד היעד וכפתור ההגשה, אם זה תורכם לפעול. אם אבן הדרך כבר הוגשה, כאן תוכלו לראות שהיא ממתינה לאישור צוות.',
      en: "What you need to do right now — including the due date and a submit button, if it's your turn to act. If already submitted, this shows it's awaiting staff approval.",
    },
  },
];

export const MILESTONES_TAB_GUIDE_KEY = 'student-milestones-tab';
export const MILESTONES_TAB_FIELD_GUIDE: FieldGuideStep[] = [
  {
    key: 'timeline',
    label: { he: 'אבני הדרך שלך', en: 'Your milestones' },
    description: {
      he: 'כל שלב בתהליך, בסדר. שלב מקווקו/כהה עדיין נעול עד שהקודם לו יאושר. הצבע והתגית מציינים את הסטטוס: ✅ אושר, 📤 הוגש וממתין, ↩ הוחזר לתיקון, או מועד יעד קרוב.',
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
      he: 'הציון של כל אבן דרך, ברגע שהוא מאושר ונחשף לכם. אבן דרך שיש לה חץ ▸ ניתנת להרחבה — לחיצה עליה מציגה פירוט נוסף (למשל ציון מנחה מול בוחנים, או הערת צוות).',
      en: 'Each milestone\'s grade, once approved and revealed to you. A milestone with a ▸ arrow can be expanded — click it for more detail (e.g. supervisor vs. examiner scores, or a staff note).',
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
