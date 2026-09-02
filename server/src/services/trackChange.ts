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
import { getMilestonesForTemplateId, resolveMilestoneRouting, resolveWorkflowTemplateRefs, resolveMilestoneDueDate } from './workflowTemplates.js';
import { logAuditEvent } from './auditLog.js';

export type ProjectTrack = 'thesis' | 'project';

export interface TrackChangeResult {
  oldProjectId: string;
  newProjectId: string;
}

// Carries both language variants so the controller can return a localized
// message without the client having to string-match the (English-only)
// Error#message — see trackChangeController.ts's catch and, on the client,
// TrackChangeControl.tsx (mirrors the messageHe/messageEn pattern
// milestoneController.ts's submitMilestone already uses).
export class TrackChangeError extends Error {
  constructor(public messageEn: string, public messageHe: string) {
    super(messageEn);
    this.name = 'TrackChangeError';
  }
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
  if (!oldSnap.exists) throw new TrackChangeError('Project not found.', 'הפרויקט לא נמצא.');
  const oldProject = oldSnap.data()!;

  const currentTrack = trackOf(oldProject.projectType);
  if (currentTrack === newTrack) {
    throw new TrackChangeError(
      `Project is already on the ${newTrack} track.`,
      `הפרויקט כבר נמצא במסלול ${newTrack === 'thesis' ? 'תזה' : 'פרויקט'}.`
    );
  }
  if (oldProject.status === 'track_changed') {
    throw new TrackChangeError('This project has already been migrated to a new track.', 'הפרויקט כבר הועבר למסלול חדש.');
  }

  // Everything below tolerates an empty enrolledStudentIds fine (the
  // milestone/student-update loops are no-ops on an empty array) — a
  // project with no students yet still needs to be able to switch track,
  // so this is never a reason to block the change.
  const enrolledStudentIds: string[] = oldProject.enrolledStudentIds ?? [];

  const newProjectRef = db.collection('projects').doc();
  // Track change (project <-> thesis) is only ever meaningful for masters
  // students (deriveProcessType always collapses bachelors to bsc_project
  // regardless of track) — 'masters' is the same fallback the original code
  // used for a missing degreeType.
  const newDegreeType: 'bachelors' | 'masters' = oldProject.degreeType === 'bachelors' ? 'bachelors' : 'masters';
  // The new track needs its own explicit workflowTemplateRefs entry, same
  // rule as project creation — a track change onto a faculty/degree/track
  // combination with no approved template is blocked rather than silently
  // falling back to defaults.
  const { refs: workflowTemplateRefs, missing } = await resolveWorkflowTemplateRefs(
    oldProject.facultyId, [newDegreeType], [newTrack], oldProject.major ?? null
  );
  if (missing.length > 0) {
    throw new TrackChangeError(
      `No approved workflow template for ${newDegreeType}/${newTrack} in this faculty — approve one in Workflow Templates first.`,
      `אין תבנית תהליך מאושרת עבור ${newDegreeType === 'masters' ? 'תואר שני' : 'תואר ראשון'}/${newTrack === 'thesis' ? 'תזה' : 'פרויקט'} בפקולטה זו — יש לאשר תבנית תחילה במסך תבניות תהליך.`
    );
  }
  const newTemplateRef = workflowTemplateRefs[0]!;
  const resolvedTemplate = await getMilestonesForTemplateId(newTemplateRef.templateId);
  const milestoneTemplates = resolvedTemplate?.milestones ?? [];
  const templateDefaultRouting = resolvedTemplate?.defaultRouting;

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
    degreeType: newDegreeType,
    degreeTypes: [newDegreeType],
    projectType: newTrack,
    projectTypes: [newTrack],
    workflowTemplateRefs,
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
    const dueDate = resolveMilestoneDueDate(t, baseDate, milestoneTemplates);
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
      // Snapshot the template's per-milestone grading rubric (if any) — see
      // projectEnrollment.ts's identical comment.
      ...(t.gradingComponents?.length ? { gradingComponents: t.gradingComponents } : {}),
      ...(t.staffRecordMode === 'upload_or_form' ? { staffRecordMode: t.staffRecordMode, staffFormFields: t.staffFormFields ?? [] } : {}),
      ...(t.studentFormFields?.length ? { studentFormFields: t.studentFormFields } : {}),
      ...(t.finalGradeComponents ? { finalGradeComponents: t.finalGradeComponents } : {}),
      ...(t.requiresExaminers
        ? { examinerIds: [], examinerScores: {}, examinerCount: t.examinerCount ?? 2 }
        : {
            routing: resolveMilestoneRouting(t, templateDefaultRouting),
            currentStageIndex: 0,
            stageScores: {},
            stageEnteredAt: admin.firestore.FieldValue.serverTimestamp(),
          }),
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
