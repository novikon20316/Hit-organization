// constants/administrativeCoordinatorFieldGuide.ts
// Mirrors web's app/administrative_coordinator/dashboard/fieldGuide.ts —
// same guideKeys/copy so seenFieldGuides carries across platforms.
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

export const SEND_EXAMINER_GUIDE_KEY = 'administrative-coordinator-send-examiner';
export const SEND_EXAMINER_FIELD_GUIDE: FieldGuideStep[] = [
  {
    key: 'name',
    label: { he: 'שם הבוחן', en: 'Examiner name' },
    description: {
      he: 'שם הבוחן החיצוני שיוזמן להעריך את הפרויקט.',
      en: 'The name of the external examiner to invite for this project.',
    },
  },
  {
    key: 'email',
    label: { he: 'דוא"ל', en: 'Email' },
    description: {
      he: 'קישור הגישה הייחודי לבוחן יישלח לכתובת הזו במייל.',
      en: "The examiner's unique access link is emailed directly to this address.",
    },
  },
  {
    key: 'inst',
    label: { he: 'מוסד', en: 'Institution' },
    description: {
      he: 'אופציונלי — המוסד שהבוחן משויך אליו.',
      en: "Optional — the institution the examiner is affiliated with.",
    },
  },
  {
    key: 'language',
    label: { he: 'שפה מועדפת', en: 'Preferred Language' },
    description: {
      he: 'שפת המייל וממשק הגישה שהבוחן יקבל.',
      en: 'The language of the email and access interface the examiner receives.',
    },
  },
];

export const GROUPS_TAB_GUIDE_KEY = 'administrative-coordinator-groups-tab';
export const GROUPS_TAB_FIELD_GUIDE: FieldGuideStep[] = [
  {
    key: 'groupList',
    label: { he: 'בית', en: 'Home' },
    description: {
      he: 'כל קבוצות הפרויקט בתחום האחריות שלכם — צרו קשר עם סטודנטים, תאמו הגנות, ושלחו הזמנות לבוחנים חיצוניים.',
      en: 'Every project group in your scope — contact students, schedule defenses, and send external examiner invitations.',
    },
  },
];

export const STUDENTS_REPORT_TAB_GUIDE_KEY = 'administrative-coordinator-students-report-tab';
export const STUDENTS_REPORT_TAB_FIELD_GUIDE: FieldGuideStep[] = [
  {
    key: 'reportList',
    label: { he: 'דוח סטודנטים', en: 'Students Report' },
    description: {
      he: 'דוח על כל סטודנט בתחום האחריות שלכם — הסטטוס וההתקדמות הנוכחיים שלו.',
      en: 'A report of every student in your scope and their current status and progress.',
    },
  },
];

export const OVERRIDES_TAB_GUIDE_KEY = 'administrative-coordinator-overrides-tab';
export const OVERRIDES_TAB_FIELD_GUIDE: FieldGuideStep[] = [
  {
    key: 'overrideList',
    label: { he: 'אישור ציונים סופיים', en: 'Final Grade Approvals' },
    description: {
      he: 'ציונים סופיים הממתינים לאישורכם לפני שהם מועברים למכלול.',
      en: 'Final grades waiting for your approval before they get transferred to Maklol.',
    },
  },
];
