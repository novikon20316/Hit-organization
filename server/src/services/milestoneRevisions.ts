// src/services/milestoneRevisions.ts
//
// Spec requirement (repeated across proposal revisions, general document
// handling, and milestone corrections): "no overwriting of documents or
// decisions" — when a submission is returned and resubmitted, the system
// must keep the original submission, the comments/decision made on it, the
// new submission, and who approved it. Previously: submitMilestone /
// submitStudentMilestone overwrote `fileUrls`/`submissionNote` in place on
// every resubmission, so a rejected round's file(s) and the coordinator's
// rejection reason were silently lost the moment the student resubmitted —
// `examinerController.ts` even reads a `milestoneHistory` field for exactly
// this purpose that nothing ever wrote.
//
// Call buildRevisionArchiveUpdate() with the milestone doc's CURRENT data
// right before a submit handler overwrites fileUrls/submissionNote — it
// returns extra fields to merge into that same update() call (or null if
// there's nothing yet to archive, i.e. this is the first submission).

import admin from 'firebase-admin';

export interface RevisionHistoryEntry {
  version: number;
  fileUrls: string[];
  submissionNote: string;
  submittedAt: string | null;
  status: string;
  decision: 'approved' | 'rejected' | null;
  decisionReason: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  /** S2 — the supervisor's review of this round, exactly as the student
   *  saw it on the milestone (ActiveDashboard's SupervisorFeedbackBlock):
   *  attachments always, the comment only on an approval — on a return the
   *  comment IS decisionReason. Absent on entries archived before
   *  2026-11-08 or rounds with no supervisor review. */
  supervisorFeedback?: { decision: 'approve' | 'reject'; comment: string; fileUrls: string[] } | null;
}

function toIso(value: unknown): string | null {
  if (!value) return null;
  if (typeof (value as { toDate?: unknown })?.toDate === 'function') {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  if (typeof value === 'string') return value;
  return null;
}

export function buildRevisionArchiveUpdate(
  data: FirebaseFirestore.DocumentData,
): Record<string, unknown> | null {
  const hadPriorSubmission = (data.fileUrls?.length ?? 0) > 0 || !!data.submissionNote;
  if (!hadPriorSubmission) return null;

  const previousHistory: unknown[] = data.revisionHistory ?? [];
  const status: string = data.status ?? '';
  const decision: RevisionHistoryEntry['decision'] =
    status === 'rejected' ? 'rejected'
    : (status === 'coordinator_approved' || status === 'approved') ? 'approved'
    : null;

  // Only feedback given on THIS round — a review from an earlier round
  // stays on the doc until the next one replaces it.
  const fb = data.supervisorReviewFeedback;
  const fbAt = toIso(fb?.decidedAt);
  const roundStart = toIso(data.submittedAt);
  const supervisorFeedback = fb && (fb.decision === 'approve' || fb.decision === 'reject') && fbAt && (!roundStart || fbAt >= roundStart)
    ? { decision: fb.decision, comment: fb.decision === 'approve' ? String(fb.comment ?? '') : '', fileUrls: Array.isArray(fb.fileUrls) ? fb.fileUrls : [] }
    : null;

  const entry: RevisionHistoryEntry = {
    version: previousHistory.length + 1,
    fileUrls: data.fileUrls ?? [],
    submissionNote: data.submissionNote ?? '',
    submittedAt: toIso(data.submittedAt),
    status,
    decision,
    decisionReason: decision === 'rejected' ? (data.rejectionReason ?? null) : null,
    decidedBy: decision === 'rejected' ? (data.coordinatorId ?? null) : null,
    decidedAt:
      decision === 'rejected' ? toIso(data.coordinatorRejectedAt)
      : decision === 'approved' ? toIso(data.coordinatorApprovedAt)
      : null,
    supervisorFeedback,
  };

  return {
    revisionHistory: admin.firestore.FieldValue.arrayUnion(entry),
    // The decision we just archived belongs to the round we're archiving —
    // clearing it here stops a stale rejectionReason from a previous round
    // showing up as if it applied to the fresh, not-yet-decided submission.
    rejectionReason: admin.firestore.FieldValue.delete(),
    coordinatorRejectedAt: admin.firestore.FieldValue.delete(),
  };
}

/** How many times this milestone has been returned to the student
 *  (status → 'rejected'), across every round. Stored as `rejectionCount`
 *  on the milestone doc from 2026-11-11 on; for older milestones that
 *  never had it, derived from the archived rounds in revisionHistory plus
 *  the current round if it's sitting rejected right now. The student's
 *  Grades tab shows a rejected approve/reject milestone red and turns it
 *  green once approved — this count is what keeps the record of how many
 *  tries it took. Keep in sync with web/lib/milestoneDecision.ts and
 *  mobile/utils/milestoneDecision.ts. */
export function countMilestoneRejections(data: FirebaseFirestore.DocumentData): number {
  if (typeof data.rejectionCount === 'number') return data.rejectionCount;
  const archived = Array.isArray(data.revisionHistory)
    ? data.revisionHistory.filter((r: { decision?: unknown }) => r?.decision === 'rejected').length
    : 0;
  return archived + (data.status === 'rejected' ? 1 : 0);
}

/** The value to write as `rejectionCount` in the same update() that sets
 *  status: 'rejected'. Call with the milestone's data as read BEFORE that
 *  update (inside the transaction where there is one). An absolute value,
 *  not FieldValue.increment, so a pre-2026-11-11 milestone picks up the
 *  rejections it already had instead of restarting from 1. */
export function nextRejectionCount(data: FirebaseFirestore.DocumentData): number {
  if (typeof data.rejectionCount === 'number') return data.rejectionCount + 1;
  // Legacy doc: the archived rejected rounds, plus this one. (A doc already
  // sitting 'rejected' here is being re-rejected in the same round — its
  // current round isn't counted twice.)
  return countMilestoneRejections({ ...data, status: null }) + 1;
}

/** Milestone name fields for a project-record entry, so the timeline and the
 *  records export can say WHICH milestone was rejected without a lookup. */
export function milestoneNames(data: FirebaseFirestore.DocumentData | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (typeof data?.nameHe === 'string') out.milestoneNameHe = data.nameHe;
  if (typeof data?.nameEn === 'string') out.milestoneNameEn = data.nameEn;
  if (typeof data?.type === 'string') out.milestoneType = data.type;
  return out;
}
