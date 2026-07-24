// src/services/trackChange.ts
//
// Switch a student's (or group's) track between thesis and non-thesis
// project (P1 backlog item #10). Previously unimplemented — no way to
// switch a track without manual data surgery.
//
// The old project is closed with a terminal status (its milestones/grades/
// audit history stay exactly where they are — nothing is moved or deleted),
// and a fresh project + milestone set is created on the new track, following
// the same milestone-template lookup as projectEnrollment.ts/
// milestoneController.ts's initializeRoadMap.

import admin from 'firebase-admin';
import { db } from '../config/firebase.js';
import { deriveProcessType, getActiveMilestonesFor } from './workflowTemplates.js';
import { logAuditEvent } from './auditLog.js';

export type ProjectTrack = 'thesis' | 'project';

export interface TrackChangeResult {
  oldProjectId: string;
  newProjectId: string;
}

function trackOf(projectType: unknown): ProjectTrack {
  return projectType === 'thesis' ? 'thesis' : 'project';
}

export async function changeProjectTrack(
  oldProjectId: string,
  newTrack: ProjectTrack,
  initiatedBy: string,
  initiatedByRole: string,
  reason: string | undefined,
): Promise<TrackChangeResult> {
  const oldProjectRef = db.collection('projects').doc(oldProjectId);
  const oldSnap = await oldProjectRef.get();
  if (!oldSnap.exists) throw new Error('Project not found.');
  const oldProject = oldSnap.data()!;

  const currentTrack = trackOf(oldProject.projectType);
  if (currentTrack === newTrack) {
    throw new Error(`Project is already on the ${newTrack} track.`);
  }
  if (oldProject.status === 'track_changed') {
    throw new Error('This project has already been migrated to a new track.');
  }

  const enrolledStudentIds: string[] = oldProject.enrolledStudentIds ?? [];
  if (enrolledStudentIds.length === 0) {
    throw new Error('Project has no enrolled students to migrate.');
  }

  const newProjectRef = db.collection('projects').doc();
  const processType = deriveProcessType(oldProject.degreeType, newTrack);
  const milestoneTemplates = await getActiveMilestonesFor(oldProject.facultyId, processType, oldProject.major ?? null);

  const batch = db.batch();

  // Close the old project — a terminal status distinct from any milestone
  // status, so dashboards filtering on 'in_progress'/'active' drop it, while
  // its full milestone/grade/audit history stays queryable by projectId.
  batch.update(oldProjectRef, {
    status: 'track_changed',
    trackChangedAt: admin.firestore.FieldValue.serverTimestamp(),
    trackChangedTo: newProjectRef.id,
    trackChangeReason: reason?.trim() || null,
  });

  batch.set(newProjectRef, {
    titleHe: oldProject.titleHe ?? '',
    titleEn: oldProject.titleEn ?? '',
    descriptionHe: oldProject.descriptionHe ?? '',
    descriptionEn: oldProject.descriptionEn ?? '',
    degreeType: oldProject.degreeType ?? 'masters',
    projectType: newTrack,
    facultyId: oldProject.facultyId,
    ...(oldProject.major ? { major: oldProject.major } : {}),
    supervisorId: oldProject.supervisorId ?? null,
    NumberOfStudents: oldProject.NumberOfStudents ?? enrolledStudentIds.length,
    enrolledStudentIds,
    status: 'in_progress',
    projectId: newProjectRef.id,
    trackChangedFrom: oldProjectId,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  const baseDate = new Date();
  for (const t of milestoneTemplates) {
    const dueDate = new Date();
    dueDate.setDate(baseDate.getDate() + t.dueDaysFromStart);
    const milestoneRef = db.collection('milestones').doc();
    batch.set(milestoneRef, {
      projectId: newProjectRef.id,
      studentIds: enrolledStudentIds,
      facultyId: oldProject.facultyId,
      supervisorId: oldProject.supervisorId ?? null,
      type: t.type,
      nameHe: t.nameHe,
      nameEn: t.nameEn,
      status: 'pending',
      dueDate: admin.firestore.Timestamp.fromDate(dueDate),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      supervisorScore: null,
      finalGrade: null,
      fileUrls: [],
      ...(t.requiresExaminers ? { examinerIds: [], examiner1Score: null, examiner2Score: null } : {}),
    });
  }

  // Same fields projectEnrollment.ts sets on enrollment — dashboards keyed
  // off the student doc's activeProjectId pick up the new track immediately.
  enrolledStudentIds.forEach((sid) => {
    batch.update(db.collection('users').doc(sid), { activeProjectId: newProjectRef.id });
  });

  await batch.commit();

  await logAuditEvent({
    userId: initiatedBy,
    userRole: initiatedByRole,
    action: 'track_changed',
    entityType: 'project',
    entityId: oldProjectId,
    oldValue: { projectType: currentTrack },
    newValue: { projectType: newTrack, newProjectId: newProjectRef.id },
    explanation: reason,
  });

  return { oldProjectId, newProjectId: newProjectRef.id };
}
