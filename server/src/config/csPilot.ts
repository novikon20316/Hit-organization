// src/config/csPilot.ts
//
// Majors enrolled in the "CS pilot" — a bundle of workflow changes trialed on
// computer_science first, to be widened to every department once proven:
//
//   1. Supervisor comment files — at the supervisor's own approve/reject
//      station, a Word/PDF comments file may stand in for (or accompany) the
//      typed comment/rejection reason, and the student sees both (see
//      coordinatorController.ts's supervisorReviewFeedback).
//   2. Committee conflict-of-interest hold — a milestone entering a committee
//      stage while the project's own supervisor sits on that committee is
//      held (the committee isn't notified and can't act) until the
//      administrative coordinator substitutes someone in for that milestone
//      (see committeeReviewController.ts's onEnterCommitteeStage).
//
// Expanding to everyone = add the major here (or replace the check with
// `true`). Mirrored client-side only through GET
// /api/milestones/:id/pilot-features, never duplicated as a client constant.

export const CS_PILOT_MAJORS: readonly string[] = ['computer_science'];

export function isCsPilotMajor(major: string | null | undefined): boolean {
  return !!major && CS_PILOT_MAJORS.includes(major);
}
