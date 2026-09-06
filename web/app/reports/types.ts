// app/reports/types.ts

export type ReportType =
  | 'full-status'
  | 'no-advisor'
  | 'proposal-delay'
  | 'examiner-tracking'
  | 'missing-closure'
  | 'stuck-students'
  | 'statute-exceedance'
  | 'load'
  | 'repository'
  | 'grade-export';

export interface ReportField {
  key: string;
  he: string;
  en: string;
}

export interface ReportDef {
  key: ReportType;
  he: string;
  en: string;
  /** Short one-line explanation shown on the report's selector block. */
  heDesc: string;
  enDesc: string;
  fields: ReportField[];
}

export const REPORTS: ReportDef[] = [
  {
    key: 'full-status',
    he: 'דוח סטטוס מלא',
    en: 'Full Status Report',
    heDesc: 'כל הסטודנטים הפעילים, השלב הנוכחי שלהם וכמה זמן הם נמצאים בו',
    enDesc: 'Every active student, their current stage, and how long they’ve been there',
    fields: [
      { key: 'studentName', he: 'סטודנט', en: 'Student' },
      { key: 'facultyNameHe', he: 'פקולטה', en: 'Faculty' },
      { key: 'advisorName', he: 'מנחה', en: 'Advisor' },
      { key: 'currentMilestoneNameHe', he: 'אבן דרך נוכחית', en: 'Current Milestone' },
      { key: 'daysInStage', he: 'ימים בשלב', en: 'Days in Stage' },
      { key: 'isOverdue', he: 'חריגה', en: 'Overdue' },
    ],
  },
  {
    key: 'no-advisor',
    he: 'ללא מנחה/נושא',
    en: 'No Advisor/Topic',
    heDesc: 'סטודנטים שעדיין לא שובצו למנחה או נושא מעבר לזמן הסביר',
    enDesc: 'Students still without an assigned advisor or topic beyond the normal grace period',
    fields: [
      { key: 'studentName', he: 'סטודנט', en: 'Student' },
      { key: 'facultyNameHe', he: 'פקולטה', en: 'Faculty' },
      { key: 'daysInStage', he: 'ימים בשלב', en: 'Days in Stage' },
    ],
  },
  {
    key: 'proposal-delay',
    he: 'עיכוב בהצעת מחקר',
    en: 'Proposal Delay',
    heDesc: 'סטודנטים שמתעכבים בשלב הצעת המחקר',
    enDesc: 'Students who are delayed at the research-proposal stage',
    fields: [
      { key: 'studentName', he: 'סטודנט', en: 'Student' },
      { key: 'advisorName', he: 'מנחה', en: 'Advisor' },
      { key: 'daysInStage', he: 'ימים בשלב', en: 'Days in Stage' },
      { key: 'isOverdue', he: 'חריגה', en: 'Overdue' },
    ],
  },
  {
    key: 'examiner-tracking',
    he: 'מעקב בוחנים',
    en: 'Examiner Tracking',
    heDesc: 'מעקב אחר בוחנים פנימיים וחיצוניים וסטטוס חוות הדעת שלהם',
    enDesc: 'Tracks internal and external examiners and the status of their opinions',
    fields: [
      { key: 'examinerName', he: 'בוחן', en: 'Examiner' },
      { key: 'examinerType', he: 'סוג', en: 'Type' },
      { key: 'studentName', he: 'סטודנט', en: 'Student' },
      { key: 'daysElapsed', he: 'ימים שחלפו', en: 'Days Elapsed' },
      { key: 'opinionStatus', he: 'סטטוס חוו"ד', en: 'Opinion Status' },
      { key: 'exceptionLevel', he: 'רמת חריגה', en: 'Exception' },
    ],
  },
  {
    key: 'missing-closure',
    he: 'חוסרים לסגירת תואר',
    en: 'Missing for Closure',
    heDesc: 'מה חסר לכל סטודנט כדי לסגור את התואר',
    enDesc: 'What’s still missing for each student to close out their degree',
    fields: [
      { key: 'studentName', he: 'סטודנט', en: 'Student' },
      { key: 'advisorName', he: 'מנחה', en: 'Advisor' },
      { key: 'missing', he: 'חסר', en: 'Missing' },
    ],
  },
  {
    key: 'stuck-students',
    he: 'סטודנטים תקועים',
    en: 'Stuck Students',
    heDesc: 'סטודנטים שחרגו מסף הזמן הסביר בשלב הנוכחי שלהם',
    enDesc: 'Students who’ve exceeded the normal time threshold at their current stage',
    fields: [
      { key: 'studentName', he: 'סטודנט', en: 'Student' },
      { key: 'facultyNameHe', he: 'פקולטה', en: 'Faculty' },
      { key: 'currentMilestoneNameHe', he: 'אבן דרך', en: 'Milestone' },
      { key: 'daysInStage', he: 'ימים בשלב', en: 'Days in Stage' },
    ],
  },
  {
    key: 'statute-exceedance',
    he: 'חריגת שנות תקן',
    en: 'Statute-Year Exceedance',
    heDesc: 'סטודנטים שחרגו ממשך הלימודים התקני לתואר שלהם',
    enDesc: 'Students who’ve exceeded the statutory length of their program',
    fields: [
      { key: 'studentName', he: 'סטודנט', en: 'Student' },
      { key: 'advisorName', he: 'מנחה', en: 'Advisor' },
      { key: 'expectedCompletionDate', he: 'תאריך סיום צפוי', en: 'Expected Completion' },
      { key: 'yearsOverdue', he: 'שנות חריגה', en: 'Years Overdue' },
    ],
  },
  {
    key: 'load',
    he: 'עומס הנחיה ובחינה',
    en: 'Advising/Examining Load',
    heDesc: 'עומס ההנחיה והבחינה הנוכחי של כל מנחה ובוחן',
    enDesc: 'Each advisor’s and examiner’s current advising/examining load',
    fields: [
      { key: 'personName', he: 'שם', en: 'Name' },
      { key: 'role', he: 'תפקיד', en: 'Role' },
      { key: 'activeCount', he: 'פעילים', en: 'Active' },
      { key: 'pendingReviewCount', he: 'ממתינים', en: 'Pending' },
    ],
  },
  {
    key: 'repository',
    he: 'מאגר עבודות',
    en: 'Repository',
    heDesc: 'עבודות שהושלמו והציונים הסופיים שלהן',
    enDesc: 'Completed works and their final grades',
    fields: [
      { key: 'projectTitleHe', he: 'כותרת', en: 'Title' },
      { key: 'studentName', he: 'סטודנט', en: 'Student' },
      { key: 'advisorName', he: 'מנחה', en: 'Advisor' },
      { key: 'finalGrade', he: 'ציון סופי', en: 'Final Grade' },
    ],
  },
  {
    // PLACEHOLDER — name/description not yet supplied by the user (they said
    // they'll provide it separately). Fields are finalized per their spec:
    // Full Name, ID, Project/Thesis name, Supervisor's Name, Year (Hebrew
    // calendar only — see startYearHebrew in services/reports.ts), Status, Grade.
    key: 'grade-export',
    he: 'דוח חדש (שם בהמתנה)',
    en: 'New Report (name pending)',
    heDesc: 'התיאור יתעדכן בהמשך',
    enDesc: 'Description to be added',
    fields: [
      { key: 'studentName', he: 'שם מלא', en: 'Full Name' },
      { key: 'studentIdNumber', he: 'ת.ז.', en: 'ID' },
      { key: 'projectTitleHe', he: 'שם פרויקט/תזה', en: 'Project/Thesis Name' },
      { key: 'advisorName', he: 'שם המנחה', en: 'Supervisor’s Name' },
      { key: 'startYearHebrew', he: 'שנה', en: 'Year' },
      { key: 'projectStatus', he: 'סטטוס', en: 'Status' },
      { key: 'finalGrade', he: 'ציון', en: 'Grade' },
    ],
  },
];

export function displayValue(v: unknown): string {
  if (v == null) return '—';
  if (typeof v === 'boolean') return v ? '✓' : '—';
  if (Array.isArray(v)) return v.join(', ');
  return String(v);
}
