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
  | 'repository';

export interface ReportField {
  key: string;
  he: string;
  en: string;
}

export interface ReportDef {
  key: ReportType;
  he: string;
  en: string;
  fields: ReportField[];
}

export const REPORTS: ReportDef[] = [
  {
    key: 'full-status',
    he: 'דוח סטטוס מלא',
    en: 'Full Status Report',
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
    fields: [
      { key: 'projectTitleHe', he: 'כותרת', en: 'Title' },
      { key: 'studentName', he: 'סטודנט', en: 'Student' },
      { key: 'advisorName', he: 'מנחה', en: 'Advisor' },
      { key: 'finalGrade', he: 'ציון סופי', en: 'Final Grade' },
    ],
  },
];

export function displayValue(v: unknown): string {
  if (v == null) return '—';
  if (typeof v === 'boolean') return v ? '✓' : '—';
  if (Array.isArray(v)) return v.join(', ');
  return String(v);
}
