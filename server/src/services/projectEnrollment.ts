// src/services/projectEnrollment.ts
//
// Canonical "add a student to a project" write. There are three surfaces
// that enroll a student (supervisor approving an application, admin manual
// assignment, faculty-admin manual assignment) — they must all leave the
// project/student/milestone documents in the same shape, or dashboards that
// read enrolledStudentIds/hasActiveProject/milestones drift out of sync
// depending on which flow was used.

import admin from 'firebase-admin';
import { db } from '../config/firebase.js';
import { deriveProcessType, getActiveMilestonesFor, getMilestonesForTemplateId, type WorkflowTemplateRef } from './workflowTemplates.js';

export interface EnrollmentTrack {
  degreeType: 'bachelors' | 'masters';
  projectType: 'project' | 'thesis';
}

export async function enrollStudentInProject(
  projectId: string,
  studentId: string,
  supervisorId: string,
  facultyId: string,
  track?: EnrollmentTrack,
): Promise<void> {
  const studentRef = db.collection('users').doc(studentId);
  const projectRef = db.collection('projects').doc(projectId);

  // Read outside the transaction below: degreeType/projectType/major/
  // workflowTemplateRefs are set once at project creation and never change
  // concurrently with enrollment, and the template itself isn't part of the
  // invariant that transaction protects (hasActiveProject), so it doesn't
  // need transactional consistency.
  const [projectSnapForTemplate, studentSnapForMajor] = await Promise.all([projectRef.get(), studentRef.get()]);
  const projectDataForTemplate = projectSnapForTemplate.data() ?? {};
  // The enrolling student's own track — explicitly chosen at apply time when
  // the project offers more than one — falling back to the project's own
  // primary (scalar) degreeType/projectType for manual-assignment callers
  // that didn't specify one, and for legacy projects with a single track.
  const resolvedDegreeType = track?.degreeType ?? projectDataForTemplate.degreeType;
  const resolvedProjectType = track?.projectType ?? projectDataForTemplate.projectType;

  // Milestones come directly from the project's own explicit
  // workflowTemplateRefs (resolved once, at creation time — see
  // createAdminProject/createSupervisorProject) whenever the matching entry
  // for this student's track exists. Legacy projects created before this
  // field existed have no workflowTemplateRefs at all — for those, fall back
  // to the original implicit facultyId+processType+major lookup exactly as
  // before, so every already-in-flight project keeps working unchanged.
  const workflowTemplateRefs: WorkflowTemplateRef[] = projectDataForTemplate.workflowTemplateRefs ?? [];
  const matchingRef = workflowTemplateRefs.find(
    (r) => r.degreeType === resolvedDegreeType && r.projectType === resolvedProjectType
  );

  let milestoneTemplates;
  if (matchingRef) {
    milestoneTemplates = await getMilestonesForTemplateId(matchingRef.templateId);
  }
  if (!milestoneTemplates) {
    const processType = deriveProcessType(resolvedDegreeType, resolvedProjectType);
    // A project's major is optional (unset means "open to any major") — fall
    // back to the enrolling student's own major, same precedent as
    // reports.ts's gatherEngagements.
    const major = projectDataForTemplate.major ?? studentSnapForMajor.data()?.major ?? null;
    milestoneTemplates = await getActiveMilestonesFor(facultyId, processType, major);
  }

  // Wrapped in a transaction: the three callers (supervisor approving an
  // application, admin manual assignment, faculty-admin manual assignment)
  // each pre-check hasActiveProject with a plain read before calling this —
  // two concurrent approvals for the same student could both pass that
  // stale check and both reach here. The re-check + all writes below happen
  // atomically, so only the first to commit wins; the loser gets a thrown
  // error instead of silently double-enrolling the student.
  await db.runTransaction(async (transaction) => {
    const studentSnap = await transaction.get(studentRef);
    if (studentSnap.data()?.hasActiveProject) {
      throw new Error('Student already has an active project.');
    }

    // 'in_progress', not 'active' — an enrolled project must drop out of the
    // open-for-applications browse query/rule (both key on status=='active').
    transaction.update(projectRef, {
      status:             'in_progress',
      enrolledStudentIds: admin.firestore.FieldValue.arrayUnion(studentId),
      studentId:          admin.firestore.FieldValue.delete(),
      studentIds:         admin.firestore.FieldValue.delete(),
      updatedAt:          admin.firestore.FieldValue.serverTimestamp(),
    });

    transaction.update(studentRef, {
      hasActiveProject: true,
      activeProjectId:  projectId,
      supervisorId,
    });

    const baseDate = new Date();
    for (const t of milestoneTemplates) {
      const dueDate = new Date();
      dueDate.setDate(baseDate.getDate() + t.dueDaysFromStart);
      const milestoneRef = db.collection('milestones').doc();
      transaction.set(milestoneRef, {
        projectId, studentIds: [studentId], supervisorId, facultyId,
        type: t.type, nameHe: t.nameHe, nameEn: t.nameEn,
        status:          'pending',
        dueDate:         admin.firestore.Timestamp.fromDate(dueDate),
        createdAt:       admin.firestore.FieldValue.serverTimestamp(),
        finalGrade:      null, fileUrls: [],
        supervisorScore: null,
        // Examiner/defense-panel fields only make sense on a milestone the
        // template marked as requiring examiners — writing them onto e.g.
        // research_proposal/progress_report otherwise just leaves permanent
        // dead clutter on those docs.
        ...(t.requiresExaminers
          ? { examinerIds: [], examiner1Score: null, examiner2Score: null }
          : {}),
      });
    }
  });
}
