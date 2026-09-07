// app/coordinator/home/fieldGuide.ts
// Single source of truth for FieldGuideOverlay walkthroughs and InfoTooltips
// across the coordinator dashboard's defense/examiner/milestone-review forms.
import type { FieldGuideStep } from '@/components/guidance/types';

export const DEFENSE_LOGISTICS_GUIDE_KEY = 'coordinator-defense-logistics';
export const DEFENSE_LOGISTICS_FIELD_GUIDE: FieldGuideStep[] = [
  {
    key: 'time',
    label: { he: 'שעה', en: 'Time' },
    description: {
      he: 'שעת ההגנה, ביום שכבר נקבע בתהליך התאמת התאריכים מול הבוחנים.',
      en: 'The defense time, on the date already locked in by the examiner date-matching flow.',
    },
  },
  {
    key: 'room',
    label: { he: 'חדר', en: 'Room' },
    description: {
      he: 'מספר/שם החדר שבו תתקיים ההגנה.',
      en: 'The room number/name where the defense will take place.',
    },
  },
  {
    key: 'building',
    label: { he: 'בניין', en: 'Building' },
    description: {
      he: 'הבניין בקמפוס שבו נמצא החדר.',
      en: 'The campus building the room is in.',
    },
  },
  {
    key: 'onlineLink',
    label: { he: 'קישור להגנה מקוונת', en: 'Online defense link' },
    description: {
      he: 'אופציונלי — קישור לפגישה מקוונת (Zoom וכו׳), למשתתפים שלא יגיעו פיזית.',
      en: 'Optional — a link to an online meeting (Zoom, etc.) for participants who won\'t attend in person.',
    },
  },
];

export const ASSIGN_EXAMINERS_GUIDE_KEY = 'coordinator-assign-examiners';
export const ASSIGN_EXAMINERS_FIELD_GUIDE: FieldGuideStep[] = [
  {
    key: 'examinerSlots',
    label: { he: 'בוחנים', en: 'Examiners' },
    description: {
      he: 'לכל בוחן: פנימי (מסגל המוסד, נבחר מרשימה) או חיצוני (שם, דוא"ל ומוסד מוזנים ידנית). ניתן להוסיף או להסיר בוחנים בכל מספר.',
      en: 'For each examiner: internal (institution staff, picked from a list) or external (name, email, institution entered manually). Add or remove examiners freely.',
    },
  },
  {
    key: 'weights',
    label: { he: 'משקלות ציון', en: 'Grade Weights' },
    description: {
      he: 'איך הציון הסופי מתחלק בין המנחה לכל בוחן — חייב להסתכם ל-100%. לא רלוונטי לפקולטת מדעי הנתונים, שם ההגנה משתמשת בפיצול ציון קבוע משלה.',
      en: "How the final grade splits between the supervisor and each examiner — must sum to 100%. Not shown for the Data Science faculty, whose defense uses its own fixed grade split.",
    },
  },
];

export const REJECT_MILESTONE_GUIDE_KEY = 'coordinator-reject-milestone';
export const REJECT_MILESTONE_FIELD_GUIDE: FieldGuideStep[] = [
  {
    key: 'reason',
    label: { he: 'סיבת הדחייה', en: 'Rejection reason' },
    description: {
      he: 'שדה חובה — הסטודנט/ית יראה את הסיבה הזו ויוכל/תוכל להגיש גרסה מתוקנת בהתאם.',
      en: 'Required — the student sees this reason and can resubmit a corrected version accordingly.',
    },
  },
];

export const PROPOSAL_RECOMMENDATION_GUIDE_KEY = 'coordinator-proposal-recommendation';
export const PROPOSAL_RECOMMENDATION_FIELD_GUIDE: FieldGuideStep[] = [
  {
    key: 'decision',
    label: { he: 'החלטה על ההמלצה', en: 'Decision on the recommendation' },
    description: {
      he: 'אשרו את רשימת הבוחנים כפי שהמליץ עליה המנחה, או בחרו בוחנים אחרים בעצמכם.',
      en: "Approve the examiner list as recommended by the supervisor, or choose different examiners yourself.",
    },
  },
];

// Lightweight, section-level guides for the dashboard's list tabs — these
// are lists, not forms, so each gets a single step.
export const IN_PROGRESS_TAB_GUIDE_KEY = 'coordinator-in-progress-tab';
export const IN_PROGRESS_TAB_FIELD_GUIDE: FieldGuideStep[] = [
  {
    key: 'projectList',
    label: { he: 'פרויקטים פעילים', en: 'In Progress' },
    description: {
      he: 'כל הפרויקטים הפעילים בפקולטה שלכם, עם התקדמות אבני הדרך של כל סטודנט/ית רשום/ה.',
      en: "Every active project in your faculty, with each enrolled student's milestone progress.",
    },
  },
];

export const PENDING_TAB_GUIDE_KEY = 'coordinator-pending-tab';
export const PENDING_TAB_FIELD_GUIDE: FieldGuideStep[] = [
  {
    key: 'submissionList',
    label: { he: 'הגשות ממתינות לבדיקה', en: 'Submissions Pending Review' },
    description: {
      he: 'הגשות (הצעות, דוחות ועוד) הממתינות לבדיקה ואישור שלכם. אשרו, דחו עם סיבה, או פתחו לצפייה בקבצים שהוגשו.',
      en: "Submissions (proposals, reports, and more) waiting for your review. Approve, reject with a reason, or open to view the submitted files.",
    },
  },
];

export const DEFENSE_TAB_GUIDE_KEY = 'coordinator-defense-tab';
export const DEFENSE_TAB_FIELD_GUIDE: FieldGuideStep[] = [
  {
    key: 'defenseList',
    label: { he: 'הגנות', en: 'Defenses' },
    description: {
      he: 'פרויקטים שהגיעו לשלב ההגנה. שבצו בוחנים ואשרו את פרטי הזמן/מקום ברגע שהתאריך נקבע.',
      en: "Projects that have reached their defense stage. Assign examiners and confirm time/place once the date is set.",
    },
  },
];

export const DEADLINES_TAB_GUIDE_KEY = 'coordinator-deadlines-tab';
export const DEADLINES_TAB_FIELD_GUIDE: FieldGuideStep[] = [
  {
    key: 'deadlineList',
    label: { he: 'מועדי הגשה', en: 'Deadlines' },
    description: {
      he: 'מועדי הגשה קרובים ומועדים שחלפו, בכל הפקולטה — כלי מעקב בלבד, ללא פעולות ישירות מכאן.',
      en: 'Upcoming and overdue milestone deadlines across your faculty — a tracking view only, no direct actions here.',
    },
  },
];

export const RECOMMENDATIONS_TAB_GUIDE_KEY = 'coordinator-recommendations-tab';
export const RECOMMENDATIONS_TAB_FIELD_GUIDE: FieldGuideStep[] = [
  {
    key: 'recommendationList',
    label: { he: 'המלצות בוחנים', en: 'Examiner Recommendations' },
    description: {
      he: 'המלצות בוחנים שהגישו המנחים, ממתינות לאישור או להחלפה שלכם.',
      en: "Examiner suggestions submitted by supervisors, waiting for you to confirm or replace.",
    },
  },
];

export const SIGNOFFS_TAB_GUIDE_KEY = 'coordinator-signoffs-tab';
export const SIGNOFFS_TAB_FIELD_GUIDE: FieldGuideStep[] = [
  {
    key: 'signoffList',
    label: { he: 'ממתין לאישור ציונים ובוחנים', en: 'Awaiting Grade/Examiner Approval' },
    description: {
      he: 'ציונים ומינויי בוחנים שכבר דורגו וממתינים לאישור סופי שלכם — האישור האחרון לפני שהם נכנסים לתוקף.',
      en: 'Grades and examiner assignments already graded that still need your final approval — the last step before they take effect.',
    },
  },
];
