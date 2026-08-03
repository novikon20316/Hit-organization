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
  | 'workflow_template_retroactively_applied'
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
  | 'audit_log_entries_deleted'
  | 'audit_log_purged'
  | 'login_failed'
  | 'permission_denied'
  | 'password_reset_by_admin'
  | 'login_lockout_lifted_by_admin';

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
