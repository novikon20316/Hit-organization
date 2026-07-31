// app/examiner-access/types.ts
// Shared types for the external-examiner-access route group.

export type ExaminerAccessPhase =
  | 'loading'
  | 'invalid'
  | 'expired'
  | 'pending'
  | 'accepted'
  | 'submitted'
  | 'declined'
  | 'superseded'
  | 'error'
  | 'otp_required';

// ─── Opinion form fields ────────────────────────────────────────────────────
// Adjust these to match your institution's review criteria — deliberately
// hardcoded (not i18n-table-driven), matching mobile's OPINION_CRITERIA.
export const OPINION_CRITERIA = [
  { key: 'originality', he: 'מקוריות ותרומה מדעית', en: 'Originality & Scientific Contribution', max: 30 },
  { key: 'methodology', he: 'מתודולוגיה ושיטות', en: 'Methodology & Methods', max: 25 },
  { key: 'presentation', he: 'כתיבה והצגה', en: 'Writing & Presentation', max: 25 },
  { key: 'knowledge', he: 'שליטה בתחום', en: 'Domain Knowledge', max: 20 },
] as const;

export type CriterionKey = (typeof OPINION_CRITERIA)[number]['key'];

// Mirrors GradingComponentSpec in server/src/services/workflowTemplates.ts —
// denormalized onto the examinerTokens doc at creation time (external
// examiners can't read the milestones collection directly; see
// server/src/services/examinerAccess.ts's createExternalExaminerAccess).
export interface GradingComponentSpec {
  key: string;
  labelHe: string;
  labelEn: string;
  maxScore: number;
  weight: number;
  hasComment: boolean;
  visibleToStudent: boolean;
}

export const RECOMMENDATION_OPTIONS = [
  { value: 'approve', he: 'מאשר ללא תיקונים', en: 'Approve without revisions' },
  { value: 'approve_with_corrections', he: 'מאשר עם תיקונים קלים', en: 'Approve with minor corrections' },
  { value: 'major_revisions', he: 'נדרשים תיקונים מהותיים', en: 'Major revisions required' },
  { value: 'reject', he: 'דחייה', en: 'Reject' },
] as const;

export type Recommendation = (typeof RECOMMENDATION_OPTIONS)[number]['value'];

// ─── Defense date submission — a SEPARATE concern from the review/opinion
// flow (see server/src/services/defenseScheduling.ts). Routed through the
// public examiner-access API (not direct Firestore writes) since it requires
// reconciling both examiners' submissions atomically.
export type DefenseDateStatus = 'not_open' | 'awaiting_your_dates' | 'awaiting_other_examiner' | 'matched' | 'conflict';
