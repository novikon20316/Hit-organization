// src/services/projectReassignment.ts
//
// Lets a system_admin hand a project's supervisor (primary or secondary)
// role off to someone else — the missing piece accountDeletion.ts's
// checkDeletionEligibility has been blocking on ("no reassignment mechanism
// exists yet"). Modeled directly on services/projectErasure.ts: same
// system_admin-only direct-action shape, same audit/record-log/notify
// pattern, same in-app-only notify() helper (duplicated here rather than
// imported since projectErasure.ts's is private — see that file's header).
//
// Milestones denormalize their own supervisorId/secondarySupervisorId at
// creation time (services/projectEnrollment.ts) and are keyed off that
// field for edit rights and notification routing (milestoneController.ts).
// Reassigning only the project doc would leave the new supervisor unable to
// act on the student's already-created, still-open milestones — exactly the
// "student gets stuck mid-process" outcome this feature exists to prevent —
// so this cascades the field change onto every non-terminal milestone of
// the project. Already-graded/approved milestones are left untouched,
// keeping the original supervisor as the historical record of who actually
// graded them (mirrors purgeAccount's "completed records stay as-is"
// philosophy in accountDeletion.ts).

import admin from 'firebase-admin';
import { db } from '../config/firebase.js';
import { logAuditEvent } from './auditLog.js';
import { logProjectRecordEntry } from './projectRecords.js';

// Matches milestoneController.ts:216-224's own terminal-status check.
const TERMINAL_MILESTONE_STATUSES = ['coordinator_approved', 'completed'];

async function notify(
  recipientId: string, titleHe: string, titleEn: string, bodyHe: string, bodyEn: string, relatedProjectId: string,
): Promise<void> {
  try {
    await db.collection('notifications').add({
      recipientId,
      type: 'general',
      titleHe, titleEn, bodyHe, bodyEn,
      relatedProjectId,
      isRead: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.error('projectReassignment notify failed:', err);
  }
}

export async function reassignProjectSupervisor(input: {
  projectId: string;
  role: 'primary' | 'secondary';
  /** null only valid for role: 'secondary' — clears the slot instead of
   *  handing it to someone else. */
  newSupervisorId: string | null;
  actingAdminUid: string;
  actingAdminRole: string;
}): Promise<void> {
  const { projectId, role, newSupervisorId, actingAdminUid, actingAdminRole } = input;
  if (role === 'primary' && !newSupervisorId) {
    throw new Error('A project must always have a primary supervisor — pick someone to reassign to.');
  }

  const projectRef = db.collection('projects').doc(projectId);
  const projectSnap = await projectRef.get();
  if (!projectSnap.exists) throw new Error('Project not found.');
  const project = projectSnap.data()!;
  if (project.isArchived) throw new Error('This project is archived.');

  const field = role === 'primary' ? 'supervisorId' : 'secondarySupervisorId';
  const oldSupervisorId: string | undefined = project[field];

  if (newSupervisorId) {
    const newSupSnap = await db.collection('users').doc(newSupervisorId).get();
    if (!newSupSnap.exists) throw new Error('The selected replacement supervisor was not found.');
    const newSupData = newSupSnap.data()!;
    const newSupRoles = new Set<string>([newSupData.role, ...(newSupData.roles ?? [])].filter(Boolean));
    if (!newSupRoles.has('supervisor') && !newSupRoles.has('secondary_supervisor')) {
      throw new Error('The selected replacement must hold a supervisor role.');
    }
  }

  await projectRef.update({
    [field]: newSupervisorId ?? admin.firestore.FieldValue.delete(),
  });

  // Cascade onto this project's still-open milestones so the new supervisor
  // can actually act on the student's current work — see file header.
  if (oldSupervisorId) {
    const milestonesSnap = await db.collection('milestones').where('projectId', '==', projectId).where(field, '==', oldSupervisorId).get();
    const openMilestones = milestonesSnap.docs.filter((d) => !TERMINAL_MILESTONE_STATUSES.includes(d.data().status));
    if (openMilestones.length > 0) {
      const batch = db.batch();
      openMilestones.forEach((d) => {
        batch.update(d.ref, { [field]: newSupervisorId ?? admin.firestore.FieldValue.delete() });
      });
      await batch.commit();
    }
  }

  await logAuditEvent({
    userId: actingAdminUid,
    userRole: actingAdminRole,
    action: 'project_supervisor_reassigned',
    entityType: 'project',
    entityId: projectId,
    oldValue: oldSupervisorId ?? null,
    newValue: newSupervisorId,
    explanation: `${role} supervisor reassigned`,
  });
  await logProjectRecordEntry({
    projectId,
    type: 'supervisor_reassigned',
    actorId: actingAdminUid,
    actorRole: actingAdminRole,
    data: { role, oldSupervisorId: oldSupervisorId ?? null, newSupervisorId },
  });

  const titleHe = project.titleHe ?? '';
  const titleEn = project.titleEn ?? '';

  if (newSupervisorId) {
    await notify(
      newSupervisorId,
      'שויכת כמנחה לפרויקט',
      'Assigned as project supervisor',
      `שויכת כ${role === 'primary' ? 'מנחה ראשי' : 'מנחה משני'} לפרויקט "${titleHe}" על ידי הנהלת המערכת.`,
      `You've been assigned as the ${role === 'primary' ? 'primary' : 'secondary'} supervisor for the project "${titleEn}" by system administration.`,
      projectId,
    );
  }
  if (oldSupervisorId) {
    await notify(
      oldSupervisorId,
      'הוחלפת כמנחה בפרויקט',
      'Replaced as project supervisor',
      `הוחלפת כ${role === 'primary' ? 'מנחה ראשי' : 'מנחה משני'} בפרויקט "${titleHe}" על ידי הנהלת המערכת.`,
      `You've been replaced as the ${role === 'primary' ? 'primary' : 'secondary'} supervisor for the project "${titleEn}" by system administration.`,
      projectId,
    );
  }
  const enrolledStudentIds: string[] = project.enrolledStudentIds ?? [];
  await Promise.all(enrolledStudentIds.map((studentId) => notify(
    studentId,
    'שינוי מנחה בפרויקט שלך',
    'Your project supervisor changed',
    `המנחה (${role === 'primary' ? 'ראשי' : 'משני'}) בפרויקט "${titleHe}" שלך הוחלף.`,
    `Your project "${titleEn}"'s ${role === 'primary' ? 'primary' : 'secondary'} supervisor has changed.`,
    projectId,
  )));
}
