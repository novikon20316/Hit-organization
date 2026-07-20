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
  | 'role_changed'
  | 'grade_entered'
  | 'grade_changed'
  | 'milestone_approved'
  | 'milestone_rejected'
  | 'deadline_overridden'
  | 'template_proposal_approved'
  | 'template_proposal_rejected'
  | 'final_grade_approved'
  | 'grade_approval_reverted'
  | 'workflow_template_approved'
  | 'workflow_template_rejected'
  | 'examiner_access_granted'
  | 'examiner_document_viewed'
  | 'examiner_dates_submitted'
  | 'clock_paused'
  | 'clock_resumed'
  | 'track_changed';

export interface AuditLogEntry {
  userId: string;
  userRole: string;
  action: AuditAction;
  entityType: string;
  entityId: string;
  oldValue?: unknown | undefined;
  newValue?: unknown | undefined;
  explanation?: string | undefined;
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
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.error(`logAuditEvent failed (action=${entry.action}, entityId=${entry.entityId}):`, err);
  }
}
