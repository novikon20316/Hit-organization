// src/services/projectCompletion.ts
//
// The moment a student finishes: the final approver signing off a project's
// defense milestone closes the project (status 'completed'), and the date,
// time and approver go on the project and into its record. Every final-grade
// path ends here — decideGradeOverride and approveFinalGrade
// (gradSchoolHeadController.ts) and approveThesisFinalGrade
// (examinerOpinionController.ts) — and unlocking the grade undoes it.
//
// Also computes each student's project grade: the defense milestone's own
// grade is only its share of the project (75% on the Electrical B.Sc. form),
// so this is the number that's reported as "the final grade".

import admin from 'firebase-admin';
import { db } from '../config/firebase.js';
import { computeProjectFinalGrade } from './gradeEngine.js';
import { logProjectRecordEntry } from './projectRecords.js';
import { resolveProjectTemplateMilestones } from './workflowTemplates.js';

/** Closes the project of an approved defense milestone. Best effort — the
 *  approval itself already succeeded, so a failure here is logged, never
 *  thrown. Returns each student's project final grade where it's computable. */
export async function recordProjectCompletion(params: {
  milestoneId: string;
  milestone: FirebaseFirestore.DocumentData;
  actorId: string;
  actorRole: string;
}): Promise<Record<string, number>> {
  const { milestoneId, milestone, actorId, actorRole } = params;
  if (milestone.type !== 'defense' || !milestone.projectId) return {};
  try {
    const projectRef = db.collection('projects').doc(milestone.projectId);
    const [projectSnap, siblingsSnap, actorSnap] = await Promise.all([
      projectRef.get(),
      db.collection('milestones').where('projectId', '==', milestone.projectId).get(),
      db.collection('users').doc(actorId).get(),
    ]);
    const project = projectSnap.data();
    if (!project) return {};

    const templateMilestones = await resolveProjectTemplateMilestones(project);
    const finalGradeByStudent: Record<string, number> = {};
    for (const studentId of (milestone.studentIds ?? []) as string[]) {
      const own = siblingsSnap.docs.map((d) => d.data()).filter((m) => (m.studentIds ?? []).includes(studentId));
      const grade = computeProjectFinalGrade(templateMilestones, own.map((m) => ({
        type: m.type as string,
        finalGrade: m.finalGradeByStudent?.[studentId] ?? m.finalGrade ?? null,
      })));
      if (grade != null) finalGradeByStudent[studentId] = grade;
    }

    const completedByName: string = actorSnap.data()?.displayName ?? actorSnap.data()?.displayNameHe ?? actorId;
    await projectRef.update({
      status: 'completed',
      statusBeforeCompletion: project.status ?? null,
      completedAt: admin.firestore.FieldValue.serverTimestamp(),
      completedBy: actorId,
      completedByName,
      completedMilestoneId: milestoneId,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    // The grades go in the record, not on the project: students can read
    // project docs in their major (see firestore.rules), not record entries.
    await logProjectRecordEntry({
      projectId: milestone.projectId,
      type: 'project_completed',
      actorId,
      actorRole,
      actorDisplayName: completedByName,
      data: { milestoneId, track: project.projectType ?? null, studentIds: milestone.studentIds ?? [], finalGradeByStudent },
    });
    return finalGradeByStudent;
  } catch (err) {
    console.error(`recordProjectCompletion failed (milestone ${milestoneId}):`, err);
    return {};
  }
}

/** Unlocking the final grade reopens the project it closed. */
export async function reopenProjectCompletion(params: {
  milestoneId: string;
  milestone: FirebaseFirestore.DocumentData;
  actorId: string;
  actorRole: string;
  reason: string;
}): Promise<void> {
  const { milestoneId, milestone, actorId, actorRole, reason } = params;
  if (!milestone.projectId) return;
  try {
    const projectRef = db.collection('projects').doc(milestone.projectId);
    const project = (await projectRef.get()).data();
    if (project?.completedMilestoneId !== milestoneId) return;
    const remove = admin.firestore.FieldValue.delete();
    await projectRef.update({
      status: project.statusBeforeCompletion ?? 'in_progress',
      statusBeforeCompletion: remove,
      completedAt: remove,
      completedBy: remove,
      completedByName: remove,
      completedMilestoneId: remove,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    await logProjectRecordEntry({
      projectId: milestone.projectId,
      type: 'project_status_changed',
      actorId,
      actorRole,
      data: { from: 'completed', to: project.statusBeforeCompletion ?? 'in_progress', reason },
    });
  } catch (err) {
    console.error(`reopenProjectCompletion failed (milestone ${milestoneId}):`, err);
  }
}
