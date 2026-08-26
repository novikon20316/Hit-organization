// src/services/auditLog.ts
//
// Cross-cutting audit trail for privilege- and process-sensitive actions:
// role changes, grade entry/changes, milestone approve/reject, deadline
// overrides, and template proposal approve/reject. Writes to the `auditLog`
// Firestore collection (rules already restrict reads to coordinator/
// faculty_admin/program_head/grad_school_head/system_admin — see
// mobile/firestore.rules — this is the first real writer of that collection).
//
// Logging must never block or fail the action it's recording — call this
// AFTER the primary write has committed, and never let a logging failure
// propagate to the caller.

import { db } from '../config/firebase.js';
import admin from 'firebase-admin';

export type AuditAction =
  | 'login'
  | 'logout'
  | 'role_changed'
  | 'grade_entered'
  | 'grade_changed'
  | 'milestone_approved'
  | 'milestone_rejected'
  | 'deadline_overridden'
  | 'template_proposal_approved'
  | 'template_proposal_rejected'
  | 'final_grade_approved'
  | 'final_grade_rejected'
  | 'grade_approval_reverted'
  | 'workflow_template_approved'
  | 'workflow_template_rejected'
  | 'workflow_template_deleted'
  | 'workflow_template_proposal_updated'
  | 'workflow_template_retroactively_applied'
  | 'examiner_assigned'
  | 'examiner_removed'
  | 'examiner_access_granted'
  | 'examiner_document_viewed'
  | 'examiner_dates_submitted'
  | 'clock_paused'
  | 'clock_resumed'
  | 'track_changed'
  | 'exceptional_action_requested'
  | 'exceptional_action_approved'
  | 'exceptional_action_rejected'
  | 'examiner_approval_requested'
  | 'examiner_approval_decided'
  | 'revision_decision_recorded'
  | 'next_examiner_promoted'
  | 'examiner_reminder_sent'
  | 'bulk_permissions_granted'
  | 'academic_year_updated'
  | 'completed_courses_updated_by_admin'
  | 'audit_log_entries_deleted'
  | 'audit_log_purged'
  | 'login_failed'
  | 'permission_denied'
  | 'password_reset_by_admin'
  | 'login_lockout_lifted_by_admin'
  | 'project_erasure_requested'
  | 'project_erasure_approved'
  | 'project_erasure_rejected'
  | 'project_erased_directly'
  | 'project_restored'
  // Three-rubric final-grade workflow (data_science, or any faculty whose
  // template configures finalGradeComponents) — see supervisorController.ts's
  // decideFinalGrade, gradSchoolHeadController.ts's decideGradeOverride, and
  // projectController.ts's submitSupervisorEvaluation/submitExaminerEvaluation.
  | 'supervisor_evaluation_submitted'
  | 'examiner_evaluation_submitted'
  | 'final_grade_approved_by_supervisor'
  | 'final_grade_override_proposed'
  | 'grade_override_approved'
  | 'grade_override_rejected'
  // Student thesis/project track assignment (see services/studentTrack.ts) —
  // distinct from 'track_changed' above, which is trackChange.ts's
  // already-enrolled-project switch.
  | 'student_track_chosen'
  | 'student_thesis_eligibility_set'
  | 'student_track_overridden_by_admin';

export interface AuditLogEntry {
  userId: string;
  userRole: string;
  action: AuditAction;
  entityType: string;
  entityId: string;
  oldValue?: unknown | undefined;
  newValue?: unknown | undefined;
  explanation?: string | undefined;
  // Denormalized at write time purely so the "Live Transportation" admin
  // table (server/src/controllers/presenceController.ts's sibling feature)
  // can render a name without an extra per-row user lookup on every poll.
  // Optional — older entries and the ~26 pre-existing call sites that don't
  // pass it just fall back to showing userId in that table.
  userDisplayName?: string | undefined;
}

export async function logAuditEvent(entry: AuditLogEntry): Promise<void> {
  try {
    await db.collection('auditLog').add({
      userId: entry.userId,
      userRole: entry.userRole,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      oldValue: entry.oldValue ?? null,
      newValue: entry.newValue ?? null,
      explanation: entry.explanation ?? null,
      userDisplayName: entry.userDisplayName ?? null,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.error(`logAuditEvent failed (action=${entry.action}, entityId=${entry.entityId}):`, err);
  }
}

// Matches the "Live Transportation" admin table's own limit(100) query
// (web/app/admin/live-transportation/page.tsx) — the collection is capped at
// this size so it behaves like a fixed-size ring buffer: new events always
// write immediately (logAuditEvent above never checks the count, so nothing
// ever blocks), and the oldest entries beyond this cap just get swept out on
// the next prune run instead of the collection growing unbounded forever.
export const AUDIT_LOG_MAX_ENTRIES = 100;

/** Run hourly (see index.ts) — same in-process sweep pattern as
 *  presenceHistory.ts's prunePresenceHistory. Deletes everything past the
 *  most recent AUDIT_LOG_MAX_ENTRIES, oldest first. */
export async function pruneAuditLog(): Promise<void> {
  try {
    const snap = await db.collection('auditLog')
      .orderBy('timestamp', 'desc')
      .offset(AUDIT_LOG_MAX_ENTRIES)
      .limit(500)
      .get();
    if (snap.empty) return;
    const batch = db.batch();
    snap.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  } catch (err) {
    console.error('pruneAuditLog failed:', err);
  }
}
