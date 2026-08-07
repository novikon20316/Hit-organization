
// Canonical, complete role label map — re-exported so every existing importer
// of ROLE_LABELS picks up all 10 real roles instead of a stale 6-entry subset.
export { ROLE_LABELS } from '../components/i18n';

export const MILESTONE_LABEL: Record<string, { he: string; en: string }> = {
  research_proposal: { he: 'הצעת מחקר', en: 'Research Proposal' },
  progress_report: { he: 'דו״ח התקדמות', en: 'Progress Report' },
  final_report: { he: 'דו״ח סופי', en: 'Final Report' },
  defense: { he: 'הגנה', en: 'Defense' },
  poster: { he: 'פוסטר', en: 'Poster Session' },
};

export const STATUS_LABEL: Record<string, { he: string; en: string }> = {
  pending:              { he: 'ממתין להגשה',       en: 'Awaiting Submission' },
  submitted:            { he: 'הוגש',               en: 'Submitted' },
  supervisor_graded:    { he: 'נוקד ע"י מנחה',     en: 'Supervisor Graded' },
  coordinator_approved: { he: 'אושר ע"י רכז',       en: 'Coordinator Approved' },
  examiners_assigned:   { he: 'בוחנים הוקצו',       en: 'Examiners Assigned' },
  examiner_graded:      { he: 'נוקד ע"י בוחן',      en: 'Examiner Graded' },
  completed:            { he: 'הושלם',               en: 'Completed' },
};

export const STATUS_COLORS: Record<string, string> = {
  pending:              '#8899BB',
  submitted:            '#F59E0B',
  supervisor_graded:    '#2E86FF',
  coordinator_approved: '#8B5CF6',
  examiners_assigned:   '#6366F1',
  examiner_graded:      '#10B981',
  completed:            '#10B981',
};