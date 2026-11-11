// Grades-tab state for one milestone — shared by the student Grades tab.
//
// A milestone graded with a number shows the number. One decided by
// approve/reject only (no number) shows green "Approved" or red "Rejected"
// instead of falling through to "Not submitted yet" — the bug a CS thesis
// student hit on 2026-11-11 where every approved milestone read as
// unsubmitted. A rejected milestone flips to approved once the corrected
// version is approved. How many tries it took (rejectionCount) is staff-only
// — see server/src/services/milestoneRevisions.ts.

export type GradeTabState = 'graded' | 'approved' | 'rejected' | 'submitted' | 'not_submitted';

interface DecisionFields {
  status?: string | null;
}

const APPROVED = new Set(['coordinator_approved', 'completed', 'approved']);

export function gradeTabState(m: DecisionFields, hasGrade: boolean): GradeTabState {
  const status = (m.status ?? '').trim().toLowerCase();
  if (status === 'rejected') return 'rejected';
  if (APPROVED.has(status)) return hasGrade ? 'graded' : 'approved';
  if (!status || status === 'pending') return 'not_submitted';
  return 'submitted';
}
