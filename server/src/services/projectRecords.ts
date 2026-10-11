// src/services/projectRecords.ts
//
// Permanent, append-only-by-default per-project timeline: milestone
// submissions, grades, examiner assignments, messages, and lifecycle
// events, from every role up to system_admin. Firestore rules deny every
// CLIENT write unconditionally (see mobile/firestore.rules's
// projectRecordEntries block) — every write, including the corrections
// below, goes through the Admin SDK via an authenticated server endpoint,
// never directly from a browser/app.
//
// Immutable for every role EXCEPT system_admin, who gets a narrow,
// fully-audited break-glass path (editProjectRecordEntry/
// deleteProjectRecordEntry/restoreProjectRecordEntry below) for correcting
// a genuine mistake — see projectRecordsController.ts's
// editProjectRecordEntry/deleteProjectRecordEntry/restoreProjectRecordEntry
// controllers, system_admin-only, each requiring a reason and logged twice:
// once in auditLog (the cross-cutting "who did this sensitive thing" trail)
// and once in the entry's own editHistory/deletedAt/deletedBy fields (so the
// record itself still shows it was altered, by whom, and why, rather than
// silently rewriting history).
//
// Logging must never block or fail the action it's recording — call
// logProjectRecordEntry AFTER the primary write has committed, same rule
// as auditLog.ts's own logAuditEvent, which this deliberately mirrors in
// shape.
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
  | 'project_status_changed'
  | 'supervisor_reassigned';

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

/** One past version of an edited entry's `data` — pushed onto editHistory
 *  BEFORE each overwrite, so every prior version survives, not just the
 *  one right before the most recent edit. */
export interface ProjectRecordEditHistoryItem {
  previousData: Record<string, unknown> | null;
  editedBy: string;
  editedByName: string;
  editedAt: admin.firestore.Timestamp | admin.firestore.FieldValue;
  reason: string;
}

/** system_admin-only correction — overwrites an entry's `data`, preserving
 *  every prior version in `editHistory` rather than just discarding it.
 *  Never throws on failure (mirrors logProjectRecordEntry); the caller
 *  checks Firestore existence itself beforehand, so a thrown error here
 *  would only ever be an unexpected infra failure. */
export async function editProjectRecordEntry(params: {
  entryId: string;
  newData: Record<string, unknown>;
  editedBy: string;
  editedByName: string;
  reason: string;
}): Promise<void> {
  const ref = db.collection('projectRecordEntries').doc(params.entryId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error('Record entry not found.');
    const current = snap.data()!;
    const historyItem: ProjectRecordEditHistoryItem = {
      previousData: current.data ?? null,
      editedBy: params.editedBy,
      editedByName: params.editedByName,
      editedAt: admin.firestore.FieldValue.serverTimestamp(),
      reason: params.reason,
    };
    tx.update(ref, {
      data: params.newData,
      edited: true,
      editHistory: admin.firestore.FieldValue.arrayUnion(historyItem),
    });
  });
}

/** system_admin-only correction — soft-deletes an entry (never a real
 *  Firestore delete): hidden from every normal read (getProjectRecord
 *  filters deleted !== true for everyone but system_admin), restorable via
 *  restoreProjectRecordEntry below. */
export async function deleteProjectRecordEntry(params: {
  entryId: string;
  deletedBy: string;
  deletedByName: string;
  reason: string;
}): Promise<void> {
  const ref = db.collection('projectRecordEntries').doc(params.entryId);
  await ref.update({
    deleted: true,
    deletedBy: params.deletedBy,
    deletedByName: params.deletedByName,
    deletedAt: admin.firestore.FieldValue.serverTimestamp(),
    deleteReason: params.reason,
  });
}

/** Undoes deleteProjectRecordEntry — clears the soft-delete markers, keeps
 *  editHistory untouched (a restore is not itself an edit of `data`). */
export async function restoreProjectRecordEntry(entryId: string): Promise<void> {
  const ref = db.collection('projectRecordEntries').doc(entryId);
  await ref.update({
    deleted: false,
    deletedBy: admin.firestore.FieldValue.delete(),
    deletedByName: admin.firestore.FieldValue.delete(),
    deletedAt: admin.firestore.FieldValue.delete(),
    deleteReason: admin.firestore.FieldValue.delete(),
  });
}
