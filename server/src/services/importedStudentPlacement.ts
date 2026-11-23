// src/services/importedStudentPlacement.ts
//
// A student uploaded on the approved-students roster as already part-way
// through their project/thesis (the roster's InProgress columns — see
// studentRoster.ts's RosterInProgress) must not start from scratch. Right
// after their first signup claims that roster row, this:
//   1. creates their project, already bound to the named supervisor(s) and
//      to the faculty's workflow template for their track;
//   2. enrolls them with the real start date (projectStartDate + every
//      milestone's due date are computed from it);
//   3. closes the milestones the roster marked done (importedAsDone, no grade
//      yet), so they land on the first one not done;
//   4. tells the supervisor(s) which grades are still to be entered.
// Best-effort from the caller's side: a failure here never undoes the signup
// itself; it is audit-logged so staff can place the student by hand.

import admin from 'firebase-admin';
import { db } from '../config/firebase.js';
import type { RosterEntry } from './studentRoster.js';
import { resolveWorkflowTemplateRefs } from './workflowTemplates.js';
import { assignProjectRecordNumber } from './projectRecordNumber.js';
import { enrollStudentInProject } from './projectEnrollment.js';
import { maybeOpenThesisExamForProject } from './thesisExam.js';
import { notifyUser } from './notify.js';
import { logAuditEvent } from './auditLog.js';

export async function placeImportedStudent(uid: string, entry: RosterEntry): Promise<string | null> {
  const ip = entry.inProgress;
  if (!ip) return null;

  try {
    const degreeType = entry.degreeType;
    const projectType = degreeType === 'bachelors' ? 'project' : ip.projectType;
    const facultyId = entry.facultyId;
    const major = entry.major ?? null;

    // No approved template for this track → refs stay empty and enrollment
    // falls back to the same faculty/default template the import counted
    // milestones against (getActiveMilestonesFor).
    const { refs: workflowTemplateRefs } = await resolveWorkflowTemplateRefs(facultyId, [degreeType], [projectType], major);

    const projectRef = db.collection('projects').doc();
    const recordNumber = await assignProjectRecordNumber(facultyId);
    await projectRef.set({
      titleHe: ip.titleHe,
      titleEn: ip.titleEn,
      descriptionHe: '',
      descriptionEn: '',
      degreeType,
      degreeTypes: [degreeType],
      projectType,
      projectTypes: [projectType],
      workflowTemplateRefs,
      projectFileUrl: null,
      NumberOfStudents: 1,
      requiredSkills: [],
      prerequisites: [],
      recordNumber,
      minAverageGrade: null,
      minCreditPoints: null,
      facultyId,
      ...(major ? { major } : {}),
      supervisorId: ip.supervisorId,
      ...(ip.secondarySupervisorId ? { secondarySupervisorId: ip.secondarySupervisorId } : {}),
      projectId: projectRef.id,
      enrolledStudentIds: [],
      // Never 'active': this project is the student's own, not one offered
      // to others — it must not appear in anyone's browse list, even for the
      // moment before enrollment below runs (or if it fails).
      status: 'in_progress',
      importedFromRoster: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await enrollStudentInProject(
      projectRef.id, uid, ip.supervisorId, facultyId,
      { degreeType, projectType },
      { startDate: new Date(ip.startDate), completedMilestones: ip.completedMilestones },
    );

    // Their track is a fact, not a choice still to be made — lock it so a
    // masters student isn't sent to the choose-track screen.
    if (degreeType === 'masters') {
      await db.collection('users').doc(uid).update({
        track: projectType,
        trackLocked: true,
        trackLockedReason: 'imported_in_progress',
        trackLockedAt: admin.firestore.Timestamp.now(),
      });
    }

    await db.collection('approvedStudents').doc(entry.id).update({
      placedProjectId: projectRef.id,
      placedAt: new Date().toISOString(),
    });

    // A thesis exam milestone that is now the current one opens as if its
    // predecessor had just been approved.
    await maybeOpenThesisExamForProject(projectRef.id).catch((err) =>
      console.error(`placeImportedStudent: thesis exam open check failed for ${projectRef.id}:`, err));

    // Only finished milestones that take a grade need anything from staff —
    // approve-only ones (importedApprovalOnly) are simply done.
    const gradesToEnter = ip.completedMilestones > 0
      ? (await db.collection('milestones').where('projectId', '==', projectRef.id).where('importedAsDone', '==', true).get())
          .docs.filter((d) => !d.data().importedApprovalOnly).length
      : 0;
    if (gradesToEnter > 0) {
      const studentName = entry.fullName;
      for (const recipientId of [ip.supervisorId, ip.secondarySupervisorId].filter((x): x is string => !!x)) {
        await notifyUser({
          recipientId,
          type: 'general',
          titleHe: 'סטודנט/ית הצטרף/ה באמצע הפרויקט — יש להזין ציונים',
          titleEn: 'Student joined mid-project — grades to enter',
          bodyHe: `${studentName} נרשם/ה למערכת והוצב/ה בפרויקט "${ip.titleHe}" בנקודה שבה הוא/היא נמצא/ת. ${gradesToEnter} אבני דרך שכבר הושלמו ממתינות לציון — יש להזין אותו בכרטיס הפרויקט.`,
          bodyEn: `${studentName} signed up and was placed in "${ip.titleEn}" where they actually are. ${gradesToEnter} milestone(s) already finished still need a grade — please enter it on the project card.`,
          relatedProjectId: projectRef.id,
          targetScreen: 'supervisor_projects',
        }).catch((err) => console.error(`placeImportedStudent: notify ${recipientId} failed:`, err));
      }
    }

    await logAuditEvent({
      userId: uid,
      userRole: 'student',
      action: 'imported_student_placed',
      entityType: 'project',
      entityId: projectRef.id,
      newValue: {
        rosterEntryId: entry.id, supervisorId: ip.supervisorId, secondarySupervisorId: ip.secondarySupervisorId,
        startDate: ip.startDate, completedMilestones: ip.completedMilestones, degreeType, projectType,
      },
      explanation: 'Student imported part-way through their project: project created and milestones fast-forwarded at first signup.',
    });
    return projectRef.id;
  } catch (error: any) {
    console.error(`placeImportedStudent failed for ${uid}:`, error);
    await logAuditEvent({
      userId: uid,
      userRole: 'student',
      action: 'imported_student_placement_failed',
      entityType: 'user',
      entityId: uid,
      newValue: { rosterEntryId: entry.id, error: error?.message ?? String(error) },
      explanation: 'Could not place an imported in-progress student into their project at signup — place them manually.',
    });
    return null;
  }
}
