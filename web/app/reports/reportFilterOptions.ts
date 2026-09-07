// app/reports/reportFilterOptions.ts
// Shared filter option lists + labels for both the shared /reports page and
// system_admin's project-first SystemAdminReportsFlow — kept in one place so
// the two never drift.

export const DEGREE_TYPES = ['bachelors', 'masters'] as const;
export const PROJECT_TYPES = ['project', 'thesis'] as const;
export const MILESTONE_TYPES = ['research_proposal', 'progress_report', 'final_report', 'defense'] as const;
// Mirrors CLOSED_STATUSES + the two live in-progress values in
// services/reports.ts / projectEnrollment.ts — project.status, not the
// separate student-status taxonomy.
export const PROCESS_STATUSES = ['active', 'in_progress', 'completed', 'withdrawn', 'admin_closed'] as const;

export const DEGREE_TYPE_LABEL: Record<string, { he: string; en: string }> = {
  bachelors: { he: 'תואר ראשון', en: 'Bachelor’s' },
  masters: { he: 'תואר שני', en: 'Master’s' },
};
export const PROJECT_TYPE_LABEL: Record<string, { he: string; en: string }> = {
  project: { he: 'פרויקט', en: 'Project' },
  thesis: { he: 'תזה', en: 'Thesis' },
};
export const MILESTONE_TYPE_LABEL: Record<string, { he: string; en: string }> = {
  research_proposal: { he: 'הצעת מחקר', en: 'Research Proposal' },
  progress_report: { he: 'דו"ח התקדמות', en: 'Progress Report' },
  final_report: { he: 'דו"ח מסכם', en: 'Final Report' },
  defense: { he: 'הגנה', en: 'Defense' },
};
export const PROCESS_STATUS_LABEL: Record<string, { he: string; en: string }> = {
  active: { he: 'פעיל', en: 'Active' },
  in_progress: { he: 'בתהליך', en: 'In Progress' },
  completed: { he: 'הושלם', en: 'Completed' },
  withdrawn: { he: 'פרש/ה', en: 'Withdrawn' },
  admin_closed: { he: 'נסגר מנהלתית', en: 'Admin Closed' },
};
