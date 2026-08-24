// src/services/projectErasure.ts
//
// Project erasure/archive protocol: a supervisor can no longer delete their
// own project directly — they can only request erasure, which a coordinator
// or system_admin must approve. Approving (or a system_admin erasing
// directly) never hard-deletes anything: it flips `isArchived`/`deletedAt`
// on the project doc, same as the pre-existing (but previously unenforced)
// soft-delete path in supervisorController.ts. Milestones live in their own
// `milestones` collection keyed by projectId and are never touched here, so
// every student's recorded progress survives an erasure untouched — that's
// also what makes `restoreProject` a full, lossless undo.
//
// Modeled directly on services/exceptionalActions.ts's request/decide shape.

import admin from 'firebase-admin';
import { db } from '../config/firebase.js';
import { logAuditEvent } from './auditLog.js';

export interface ProjectErasureRequest {
  id: string;
  projectId: string;
  projectTitleHe: string;
  projectTitleEn: string;
  facultyId: string;
  requestedBy: string;
  requestedByRole: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionReason: string | null;
}

function serialize(id: string, data: FirebaseFirestore.DocumentData): ProjectErasureRequest {
  return {
    id,
    projectId: data.projectId,
    projectTitleHe: data.projectTitleHe ?? '',
    projectTitleEn: data.projectTitleEn ?? '',
    facultyId: data.facultyId ?? '',
    requestedBy: data.requestedBy,
    requestedByRole: data.requestedByRole,
    reason: data.reason ?? '',
    status: data.status,
    createdAt: data.createdAt?.toDate?.().toISOString() ?? null,
    decidedBy: data.decidedBy ?? null,
    decidedAt: data.decidedAt?.toDate?.().toISOString() ?? null,
    decisionReason: data.decisionReason ?? null,
  };
}

async function notify(
  recipientId: string, titleHe: string, titleEn: string, bodyHe: string, bodyEn: string, relatedProjectId: string,
  // Only the erasure-request-to-coordinator call site below sets this —
  // recipientId is always a coordinator there (findCoordinatorIdsForFaculty),
  // so no per-recipient role lookup is needed. Every other call site here
  // notifies a supervisor whose destination is already their dashboard's
  // default tab, so they're left unset.
  targetScreen?: string,
): Promise<void> {
  // In-app only, same convention as exceptionalActions.ts's notifyRequester —
  // no channel/template registration needed for an internal decision notice.
  try {
    await db.collection('notifications').add({
      recipientId,
      type: 'general',
      titleHe, titleEn, bodyHe, bodyEn,
      relatedProjectId,
      isRead: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      ...(targetScreen ? { targetScreen } : {}),
    });
  } catch (err) {
    console.error('projectErasure notify failed:', err);
  }
}

async function findCoordinatorIdsForFaculty(facultyId: string): Promise<string[]> {
  const snap = await db.collection('users').where('role', '==', 'coordinator').where('facultyId', '==', facultyId).get();
  return snap.docs.map((d) => d.id);
}

export async function requestProjectErasure(input: {
  projectId: string;
  reason: string;
  requestedBy: string;
  requestedByRole: string;
}): Promise<ProjectErasureRequest> {
  const projectRef = db.collection('projects').doc(input.projectId);
  const projectSnap = await projectRef.get();
  if (!projectSnap.exists) throw new Error('Project not found.');
  const project = projectSnap.data()!;

  if (project.supervisorId !== input.requestedBy && project.secondarySupervisorId !== input.requestedBy) {
    throw new Error('Only this project\'s supervisor can request its erasure.');
  }
  if (project.isArchived) throw new Error('This project is already archived.');

  const existing = await db.collection('projectErasureRequests')
    .where('projectId', '==', input.projectId)
    .where('status', '==', 'pending')
    .get();
  if (!existing.empty) throw new Error('An erasure request for this project is already pending.');

  const ref = await db.collection('projectErasureRequests').add({
    projectId: input.projectId,
    projectTitleHe: project.titleHe ?? '',
    projectTitleEn: project.titleEn ?? '',
    facultyId: project.facultyId,
    requestedBy: input.requestedBy,
    requestedByRole: input.requestedByRole,
    reason: input.reason,
    status: 'pending',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    decidedBy: null,
    decidedAt: null,
    decisionReason: null,
  });

  await logAuditEvent({
    userId: input.requestedBy,
    userRole: input.requestedByRole,
    action: 'project_erasure_requested',
    entityType: 'projectErasureRequest',
    entityId: ref.id,
    newValue: { projectId: input.projectId },
    explanation: input.reason,
  });

  const coordinatorIds = await findCoordinatorIdsForFaculty(project.facultyId);
  await Promise.all(coordinatorIds.map((uid) => notify(
    uid,
    'בקשה למחיקת פרויקט ⚠️',
    'Project Erasure Request ⚠️',
    `המנחה ביקש למחוק את הפרויקט "${project.titleHe ?? ''}".`,
    `The supervisor requested erasing the project "${project.titleEn ?? ''}".`,
    input.projectId,
    'coordinator_archived',
  )));

  const snap = await ref.get();
  return serialize(ref.id, snap.data()!);
}

export async function listPendingErasureRequests(effectiveFacultyIds: string[] | 'all'): Promise<ProjectErasureRequest[]> {
  let query: FirebaseFirestore.Query = db.collection('projectErasureRequests').where('status', '==', 'pending');
  if (effectiveFacultyIds !== 'all') {
    query = query.where('facultyId', 'in', effectiveFacultyIds);
  }
  const snap = await query.get();
  return snap.docs.map((d) => serialize(d.id, d.data()));
}

export async function decideErasureRequest(
  requestId: string,
  decision: 'approved' | 'rejected',
  decidedBy: string,
  decidedByRole: string,
  decisionReason: string | undefined,
  deciderEffectiveFacultyIds: string[] | 'all',
): Promise<ProjectErasureRequest> {
  const ref = db.collection('projectErasureRequests').doc(requestId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error('Erasure request not found.');
  const data = snap.data()!;
  if (data.status !== 'pending') throw new Error('This request has already been decided.');

  if (deciderEffectiveFacultyIds !== 'all' && !deciderEffectiveFacultyIds.includes(data.facultyId)) {
    throw new Error('This request is outside your faculty.');
  }

  if (decision === 'rejected') {
    if (!decisionReason || !decisionReason.trim()) {
      throw new Error('A reason is required to reject an erasure request.');
    }
    await ref.update({
      status: 'rejected',
      decidedBy,
      decidedAt: admin.firestore.FieldValue.serverTimestamp(),
      decisionReason,
    });
    await logAuditEvent({
      userId: decidedBy,
      userRole: decidedByRole,
      action: 'project_erasure_rejected',
      entityType: 'projectErasureRequest',
      entityId: requestId,
      explanation: decisionReason,
    });
    await notify(
      data.requestedBy,
      '❌ בקשת מחיקת פרויקט נדחתה',
      '❌ Project Erasure Request Rejected',
      `הבקשה למחוק את הפרויקט "${data.projectTitleHe}" נדחתה. סיבה: ${decisionReason}`,
      `Your request to erase "${data.projectTitleEn}" was rejected. Reason: ${decisionReason}`,
      data.projectId,
    );
    const updated = await ref.get();
    return serialize(requestId, updated.data()!);
  }

  // Approved — archive the project now.
  await db.collection('projects').doc(data.projectId).update({
    isArchived: true,
    deletedAt: admin.firestore.FieldValue.serverTimestamp(),
    erasedBy: decidedBy,
  });

  await ref.update({
    status: 'approved',
    decidedBy,
    decidedAt: admin.firestore.FieldValue.serverTimestamp(),
    decisionReason: decisionReason ?? null,
  });
  await logAuditEvent({
    userId: decidedBy,
    userRole: decidedByRole,
    action: 'project_erasure_approved',
    entityType: 'projectErasureRequest',
    entityId: requestId,
    explanation: decisionReason,
  });
  await notify(
    data.requestedBy,
    '✅ בקשת מחיקת פרויקט אושרה',
    '✅ Project Erasure Request Approved',
    `הבקשה למחוק את הפרויקט "${data.projectTitleHe}" אושרה. הפרויקט הועבר לארכיון.`,
    `Your request to erase "${data.projectTitleEn}" was approved. The project has been archived.`,
    data.projectId,
  );

  const updated = await ref.get();
  return serialize(requestId, updated.data()!);
}

/** system_admin's direct path — no request doc, immediate archive. Also
 *  tells enrolled students, mirroring what deleteSupervisorProject used to
 *  do for its own soft-delete branch. */
export async function eraseProjectDirectly(input: {
  projectId: string;
  erasedBy: string;
  erasedByRole: string;
  reason?: string;
}): Promise<void> {
  const projectRef = db.collection('projects').doc(input.projectId);
  const snap = await projectRef.get();
  if (!snap.exists) throw new Error('Project not found.');
  const project = snap.data()!;
  if (project.isArchived) throw new Error('This project is already archived.');

  await projectRef.update({
    isArchived: true,
    deletedAt: admin.firestore.FieldValue.serverTimestamp(),
    erasedBy: input.erasedBy,
  });

  await logAuditEvent({
    userId: input.erasedBy,
    userRole: input.erasedByRole,
    action: 'project_erased_directly',
    entityType: 'project',
    entityId: input.projectId,
    explanation: input.reason,
  });

  const enrolledStudentIds: string[] = project.enrolledStudentIds ?? [];
  await Promise.all(enrolledStudentIds.map((studentId) => notify(
    studentId,
    'פרויקט הוסר ⚠️',
    'Project Removed ⚠️',
    `הפרויקט "${project.titleHe ?? ''}" הוסר על ידי הנהלת המערכת.`,
    `The project "${project.titleEn ?? ''}" has been removed by system administration.`,
    input.projectId,
  )));

  if (project.supervisorId) {
    await notify(
      project.supervisorId,
      'פרויקט הוסר ⚠️',
      'Project Removed ⚠️',
      `הפרויקט "${project.titleHe ?? ''}" הוסר על ידי הנהלת המערכת.`,
      `The project "${project.titleEn ?? ''}" has been removed by system administration.`,
      input.projectId,
    );
  }
}

export async function restoreProject(input: {
  projectId: string;
  restoredBy: string;
  restoredByRole: string;
}): Promise<void> {
  const projectRef = db.collection('projects').doc(input.projectId);
  const snap = await projectRef.get();
  if (!snap.exists) throw new Error('Project not found.');
  const project = snap.data()!;
  if (!project.isArchived) throw new Error('This project is not archived.');

  await projectRef.update({
    isArchived: false,
    deletedAt: null,
    erasedBy: null,
  });

  await logAuditEvent({
    userId: input.restoredBy,
    userRole: input.restoredByRole,
    action: 'project_restored',
    entityType: 'project',
    entityId: input.projectId,
  });

  if (project.supervisorId) {
    await notify(
      project.supervisorId,
      'פרויקט שוחזר ✅',
      'Project Restored ✅',
      `הפרויקט "${project.titleHe ?? ''}" שוחזר מהארכיון והוא פעיל שוב.`,
      `The project "${project.titleEn ?? ''}" has been restored from the archive and is active again.`,
      input.projectId,
    );
  }
}

export interface ArchivedProject {
  id: string;
  titleHe: string;
  titleEn: string;
  facultyId: string;
  supervisorId: string;
  supervisorName: string;
  enrolledStudentIds: string[];
  enrolledStudentNames: string[];
  deletedAt: string | null;
  erasedBy: string | null;
  milestones: any[];
}

/** Faculty-scoped list of every archived project, each with its milestones
 *  joined in (same in-memory join getCoordinatorDashboard already does) so
 *  the Archived tab can show every student's progress in one round trip. */
export async function listArchivedProjects(effectiveFacultyIds: string[] | 'all'): Promise<ArchivedProject[]> {
  let query: FirebaseFirestore.Query = db.collection('projects').where('isArchived', '==', true);
  if (effectiveFacultyIds !== 'all') {
    query = query.where('facultyId', 'in', effectiveFacultyIds);
  }
  const projectsSnap = await query.get();
  if (projectsSnap.empty) return [];

  const projects = projectsSnap.docs.map((d) => ({ id: d.id, ...d.data() } as any));

  const userIds = [...new Set([
    ...projects.map((p) => p.supervisorId).filter(Boolean),
    ...projects.flatMap((p) => p.enrolledStudentIds ?? []),
  ])];
  const [userSnaps, milestonesSnaps] = await Promise.all([
    Promise.all(userIds.map((uid) => db.collection('users').doc(uid).get())),
    Promise.all(projects.map((p) => db.collection('milestones').where('projectId', '==', p.id).get())),
  ]);

  const namesById: Record<string, string> = {};
  userSnaps.forEach((snap) => {
    if (snap.exists) namesById[snap.id] = snap.data()?.displayName ?? 'Unknown';
  });

  return projects.map((p, i) => ({
    id: p.id,
    titleHe: p.titleHe ?? '',
    titleEn: p.titleEn ?? '',
    facultyId: p.facultyId ?? '',
    supervisorId: p.supervisorId ?? '',
    supervisorName: p.supervisorId ? (namesById[p.supervisorId] ?? 'Unknown') : '',
    enrolledStudentIds: p.enrolledStudentIds ?? [],
    enrolledStudentNames: (p.enrolledStudentIds ?? []).map((id: string) => namesById[id] ?? id),
    deletedAt: p.deletedAt?.toDate?.().toISOString() ?? null,
    erasedBy: p.erasedBy ?? null,
    milestones: milestonesSnaps[i]!.docs.map((d) => ({ id: d.id, ...d.data() })),
  }));
}
