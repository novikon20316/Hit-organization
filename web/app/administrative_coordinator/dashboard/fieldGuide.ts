// app/administrative_coordinator/dashboard/fieldGuide.ts
// Single source of truth for FieldGuideOverlay walkthroughs and InfoTooltips
// on the administrative coordinator's defense/examiner forms and list tabs.
import type { FieldGuideStep } from '@/components/guidance/types';

export const DEFENSE_LOGISTICS_GUIDE_KEY = 'coordinator-defense-logistics-v2';
export const DEFENSE_LOGISTICS_FIELD_GUIDE: FieldGuideStep[] = [
  {
    key: 'mode',
    label: { he: 'אופן ההגנה', en: 'Defense format' },
    description: {
      he: 'פרונטלי (בניין וחדר), Zoom (פגישה מקוונת בלבד) או היברידי (חדר + Zoom למשתתפים מרחוק).',
      en: 'In person (building and room), Zoom (online only) or hybrid (a room plus Zoom for remote participants).',
    },
  },
  {
    key: 'date',
    label: { he: 'תאריך', en: 'Date' },
    description: {
      he: 'התאריך שנקבע מול הבוחנים. ניתן לשנותו — כל המשתתפים יקבלו עדכון, ובוחנים חיצוניים יקבלו קוד גישה חדש.',
      en: 'The date agreed with the examiners. You can change it — everyone is notified and external examiners get a new access code.',
    },
  },
  {
    key: 'time',
    label: { he: 'שעה', en: 'Time' },
    description: {
      he: 'שעת תחילת ההגנה.',
      en: 'The defense start time.',
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
    label: { he: 'פגישת Zoom', en: 'Zoom meeting' },
    description: {
      he: 'להגנה בזום או היברידית — הפגישה נוצרת אוטומטית ומתעדכנת כשמשנים תאריך/שעה. ניתן גם להדביק קישור קיים.',
      en: 'For a Zoom or hybrid defense — the meeting is created automatically and follows date/time changes. You can also paste an existing link.',
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
    key: 'institution',
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

// Lightweight, section-level guides for the dashboard's list tabs.
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

export const USERS_TAB_GUIDE_KEY = 'administrative-coordinator-users-tab';
export const USERS_TAB_FIELD_GUIDE: FieldGuideStep[] = [
  {
    key: 'userList',
    label: { he: 'משתמשים', en: 'Users' },
    description: {
      he: 'רשימת הסטודנטים בתחום האחריות שלכם — כולל אפשרות לאפס סיסמה עבורם.',
      en: 'The students in your scope, including the ability to reset their password.',
    },
  },
];

export const OVERRIDES_TAB_GUIDE_KEY = 'administrative-coordinator-overrides-tab';
export const OVERRIDES_TAB_FIELD_GUIDE: FieldGuideStep[] = [
  {
    key: 'overrideList',
    label: { he: 'אישור ציונים סופיים', en: 'Final Grade Approvals' },
    description: {
      he: 'ציונים סופיים הממתינים לאישורכם לפני שהם מועברים למכלול — האישור האחרון בשרשרת.',
      en: 'Final grades waiting for your approval before they get transferred to Maklol — the last step in the chain.',
    },
  },
];

export const UNGRADED_TAB_GUIDE_KEY = 'administrative-coordinator-ungraded-tab';
export const UNGRADED_TAB_FIELD_GUIDE: FieldGuideStep[] = [
  {
    key: 'ungradedList',
    label: { he: 'סטודנטים ללא ציון ממוצע', en: 'Students Without a Grade Average' },
    description: {
      he: 'סטודנטים שעדיין אין להם ציון ממוצע מחושב — סקרו או טפלו בהם כאן.',
      en: "Students who don't yet have a computed grade average — review or resolve them here.",
    },
  },
];
