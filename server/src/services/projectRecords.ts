// src/services/projectRecords.ts
//
// Permanent, append-only per-project timeline: milestone submissions,
// grades, examiner assignments, messages, and lifecycle events, from every
// role up to system_admin — read-only, and unlike auditLog.ts's capped ring
// buffer, this collection is never pruned and never grows a delete/update
// path. Immutability is enforced two ways: Firestore rules deny every client
// write unconditionally (see mobile/firestore.rules's projectRecordEntries
// block), and no controller/route in this codebase ever updates or deletes
// a projectRecordEntries doc — the only writer is logProjectRecordEntry's
// own .add() below.
//
// Logging must never block or fail the action it's recording — call this
// AFTER the primary write has committed, same rule as auditLog.ts's own
// logAuditEvent, which this deliberately mirrors in shape.
//
// Since this is a brand-new collection, it only captures events from ship
// date forward — there is no way to backfill history for anything that
// happened before this existed.

import { db } from '../config/firebase.js';
import admin from 'firebase-admin';

export type RecordEntryType =
  | 'student_joined_project'
  | 'milestone_submitted'
  | 'milestone_resubmitted'
  | 'milestone_approved'
  | 'milestone_rejected'
  | 'grade_submitted'
  | 'grade_changed'
  | 'final_grade_approved'
  | 'examiner_assigned'
  | 'examiner_removed'
  | 'message_sent'
  | 'defense_date_resolved'
  | 'project_status_changed';

export interface ProjectRecordEntry {
  projectId: string;
  type: RecordEntryType;
  actorId: string;
  actorRole: string;
  actorDisplayName?: string | undefined;
  // Type-specific payload — e.g. { milestoneId, milestoneType } for
  // milestone_submitted, { score, graderRole } for grade_submitted,
  // { examinerName, examinerType } for examiner_assigned, { preview } for
  // message_sent. Deliberately loose (mirrors auditLog's oldValue/newValue)
  // since each entry type shapes it differently.
  data?: Record<string, unknown> | undefined;
}

export async function logProjectRecordEntry(entry: ProjectRecordEntry): Promise<void> {
  try {
    await db.collection('projectRecordEntries').add({
      projectId: entry.projectId,
      type: entry.type,
      actorId: entry.actorId,
      actorRole: entry.actorRole,
      actorDisplayName: entry.actorDisplayName ?? null,
      data: entry.data ?? null,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.error(`logProjectRecordEntry failed (type=${entry.type}, projectId=${entry.projectId}):`, err);
  }
}
