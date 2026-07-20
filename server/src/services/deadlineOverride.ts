// src/services/deadlineOverride.ts
//
// The actual due-date-override mutation, extracted out of
// milestoneController.ts so both the direct path (faculty_admin/system_admin
// acting on their own authority) and the exceptional-action-approval path
// (services/exceptionalActions.ts, once a program_head/faculty_admin/
// system_admin approves a coordinator's request) can call the exact same
// code rather than duplicating it.

import admin from 'firebase-admin';
import { db } from '../config/firebase.js';
import { logAuditEvent } from './auditLog.js';

export async function applySingleDueDateOverride(
  milestoneId: string,
  dueDate: Date,
  reason: string | undefined,
  actingUid: string,
  actingRole: string,
): Promise<{ success: true; message: string }> {
  const milestoneRef = db.collection('milestones').doc(milestoneId);
  const milestoneSnap = await milestoneRef.get();
  if (!milestoneSnap.exists) throw new Error('Milestone not found.');
  const milestoneData = milestoneSnap.data()!;
  const previousDueDate = milestoneData.dueDate ?? null;

  await milestoneRef.update({
    dueDate: admin.firestore.Timestamp.fromDate(dueDate),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  await logAuditEvent({
    userId: actingUid,
    userRole: actingRole,
    action: 'deadline_overridden',
    entityType: 'milestone',
    entityId: milestoneId,
    oldValue: { dueDate: previousDueDate?.toDate?.()?.toISOString?.() ?? previousDueDate },
    newValue: { dueDate: dueDate.toISOString() },
    explanation: reason,
  });

  const studentIds: string[] = milestoneData.studentIds ?? [];
  try {
    await Promise.all(studentIds.map((studentId) =>
      db.collection('notifications').add({
        recipientId: studentId,
        type: 'milestone_date_adjusted',
        titleHe: 'תאריך יעד עודכן 📅',
        titleEn: 'Milestone Due Date Updated 📅',
        bodyHe: `תאריך היעד עבור "${milestoneData.nameHe ?? milestoneData.type}" עודכן.`,
        bodyEn: `The due date for "${milestoneData.nameEn ?? milestoneData.type}" was updated.`,
        isRead: false,
        relatedProjectId: milestoneData.projectId ?? null,
        relatedMilestoneId: milestoneId,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      })
    ));
  } catch (notifyError) {
    console.error(`Failed to notify students of due-date change for milestone ${milestoneId}:`, notifyError);
  }

  return { success: true, message: 'Milestone due date updated.' };
}

export async function applyBulkDueDateOverride(
  projectIds: string[],
  milestoneType: string | undefined,
  dueDate: Date,
  reason: string | undefined,
  actingUid: string,
  actingRole: string,
): Promise<{ success: true; message: string; updatedCount: number }> {
  // Firestore 'in' queries cap at 30 values — chunk projectIds accordingly.
  const CHUNK_SIZE = 30;
  const chunks: string[][] = [];
  for (let i = 0; i < projectIds.length; i += CHUNK_SIZE) {
    chunks.push(projectIds.slice(i, i + CHUNK_SIZE));
  }

  const snaps = await Promise.all(chunks.map((chunk) => {
    let q: FirebaseFirestore.Query = db.collection('milestones').where('projectId', 'in', chunk);
    if (typeof milestoneType === 'string' && milestoneType) {
      q = q.where('type', '==', milestoneType);
    }
    return q.get();
  }));
  const docs = snaps.flatMap((s) => s.docs);

  if (docs.length === 0) throw new Error('No matching milestones found.');

  const affected = docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      ref: doc.ref,
      projectId: data.projectId as string | undefined,
      studentIds: (data.studentIds ?? []) as string[],
      nameHe: data.nameHe as string | undefined,
      nameEn: data.nameEn as string | undefined,
      type: data.type as string | undefined,
      previousDueDate: data.dueDate ?? null,
    };
  });

  // Firestore batches cap at 500 writes — chunk into multiple batches.
  const BATCH_LIMIT = 450;
  let batch = db.batch();
  let opsInBatch = 0;
  const commits: Promise<unknown>[] = [];
  for (const m of affected) {
    batch.update(m.ref, {
      dueDate: admin.firestore.Timestamp.fromDate(dueDate),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    opsInBatch++;
    if (opsInBatch >= BATCH_LIMIT) {
      commits.push(batch.commit());
      batch = db.batch();
      opsInBatch = 0;
    }
  }
  if (opsInBatch > 0) commits.push(batch.commit());
  await Promise.all(commits);

  await Promise.all(affected.map((m) =>
    logAuditEvent({
      userId: actingUid,
      userRole: actingRole,
      action: 'deadline_overridden',
      entityType: 'milestone',
      entityId: m.id,
      oldValue: { dueDate: m.previousDueDate?.toDate?.()?.toISOString?.() ?? m.previousDueDate },
      newValue: { dueDate: dueDate.toISOString() },
      explanation: reason,
    })
  ));

  try {
    await Promise.all(affected.flatMap((m) =>
      m.studentIds.map((studentId) =>
        db.collection('notifications').add({
          recipientId: studentId,
          type: 'milestone_date_adjusted',
          titleHe: 'תאריך יעד עודכן 📅',
          titleEn: 'Milestone Due Date Updated 📅',
          bodyHe: `תאריך היעד עבור "${m.nameHe ?? m.type}" עודכן.`,
          bodyEn: `The due date for "${m.nameEn ?? m.type}" was updated.`,
          isRead: false,
          relatedProjectId: m.projectId ?? null,
          relatedMilestoneId: m.id,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        })
      )
    ));
  } catch (notifyError) {
    console.error('Failed to notify students of bulk due-date change:', notifyError);
  }

  return { success: true, message: `Updated ${affected.length} milestone(s).`, updatedCount: affected.length };
}
