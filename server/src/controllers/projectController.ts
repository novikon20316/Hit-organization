// src/controllers/projectController.ts
// Removed broken: import { Message } from 'protobufjs'

import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.js';
import admin from 'firebase-admin';
import { logAuditEvent } from '../services/auditLog.js';
import { computeWeightedFinalGrade, computeFinalGradeByStudent, DEFAULT_INDIVIDUAL_WEIGHT } from '../services/gradeEngine.js';
import { buildRevisionArchiveUpdate } from '../services/milestoneRevisions.js';
import { resolveMilestoneScope, withinCoordinatorScope } from '../services/scopeAuthorization.js';
import { authorizeStageActor, computeChainFinalGrade, isChainDriven } from '../services/milestoneRouting.js';
import type { ChainStage } from '../services/workflowTemplates.js';

const db = admin.firestore();

const MILESTONE_PROGRESS: Record<string, number> = {
  research_proposal: 25,
  progress_report:   50,
  final_report:      75,
  defense:           100,
};

// Mirrors web/lib/roles.ts's PERMISSION_MAP: view_all_projects (cross-faculty,
// no ownership needed) vs. view_faculty_projects (same-faculty only) vs.
// view_own_project (supervisor/secondary_supervisor — ownership only, no
// blanket bypass). Keep in sync with studentController.ts's copy.
//
// administrative_secretary is deliberately NOT in FULL_ACCESS_ROLES — see
// studentController.ts's copy of this comment. She's scoped below via
// withinCoordinatorScope to her actually-assigned facultyId/major(s).
const FULL_ACCESS_ROLES = [
  'coordinator', 'program_head', 'faculty_admin', 'grad_school_head', 'system_admin',
];
const FACULTY_SCOPED_ROLES = ['internal_examiner'];

// Used only by getProjects below to decide who may opt out of the default
// status='active' filter — unrelated to the per-project access checks above.
const STAFF_ROLES = [
  'supervisor', 'secondary_supervisor', 'coordinator', 'administrative_secretary',
  'program_head', 'internal_examiner', 'faculty_admin', 'grad_school_head', 'system_admin',
];

// ─── Get student project ──────────────────────────────────────────────────────
export const getStudentProject = async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const requester = req.user;
  if (!requester) return res.status(401).json({ message: 'Unauthorized.' });
  if (!id || typeof id !== 'string') return res.status(400).json({ message: 'Invalid projectId' });

  try {
    const snap = await db.collection('projects').doc(id).get();
    if (!snap.exists) return res.status(404).json({ message: 'Project not found' });

    const project = snap.data()!;
    const isOwnProject =
      project.supervisorId === requester.uid ||
      project.secondarySupervisorId === requester.uid ||
      (project.enrolledStudentIds ?? []).includes(requester.uid);
    const hasFullAccess = FULL_ACCESS_ROLES.includes(requester.role);
    const hasFacultyAccess =
      FACULTY_SCOPED_ROLES.includes(requester.role) &&
      (requester.facultyId === 'all' || requester.facultyId === project.facultyId);
    const hasSecretaryScopeAccess =
      requester.role === 'administrative_secretary' &&
      withinCoordinatorScope(requester, { facultyId: project.facultyId ?? '', major: project.major || undefined });
    if (!isOwnProject && !hasFullAccess && !hasFacultyAccess && !hasSecretaryScopeAccess) {
      return res.status(403).json({ message: 'Forbidden.' });
    }

    return res.status(200).json({ id: snap.id, ...project });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to load project' });
  }
};

// ─── Submit milestone grade ───────────────────────────────────────────────────
// Deliberately NOT wired to the granular edit_grades grant (see
// services/scopeAuthorization.ts): the score field written (supervisorScore
// vs examiner1Score vs examiner2Score) is derived from WHICH assigned grader
// uid matches, not a role/grant — a delegate submitting under someone else's
// slot would mislabel the grades collection's audit trail (graderId would be
// the delegate, but the field/graderRole would claim to be the actual
// supervisor/examiner). Correcting a grade on someone's behalf needs its own
// designed "override" path, not a silent reuse of this identity-dispatch one.
export const submitMilestoneGrade = async (req: AuthenticatedRequest, res: Response) => {
  const uid         = (req as any).user?.uid;
  const { milestoneId } = req.params;
  // Destructure the detailed grading criteria and grade from your mobile client payload
  const { givenScore, comments, projectId, criteria } = req.body;

  // criteria is optional — an examiner grading via their own rubric sends
  // only givenScore, with no criteria breakdown at all.
  const grade = criteria
    ? (Number(criteria.clarity) || 0) + (Number(criteria.methodology) || 0) +
      (Number(criteria.feasibility) || 0) + (Number(criteria.innovation) || 0) +
      (Number(criteria.writing) || 0)
    : undefined;
  // Fallback to extract the final score from either property name safely
  const finalScore = givenScore !== undefined && givenScore !== null ? givenScore : grade;

  if (finalScore === undefined || finalScore === null) {
    return res.status(400).json({ message: 'Missing givenScore' });
  }
  if (!milestoneId || typeof milestoneId !== 'string') {
    return res.status(400).json({ message: 'Invalid milestoneId' });
  }

  try {
    const milestoneRef  = db.collection('milestones').doc(milestoneId);
    const milestoneSnap = await milestoneRef.get();
    if (!milestoneSnap.exists) return res.status(404).json({ message: 'Milestone not found' });

    const data        = milestoneSnap.data() || {};
    const supervisorId= data.supervisorId;
    const examinerIds: string[] = data.examinerIds ?? [];

    // Once a grad-school-head has signed off on the computed final grade
    // (gradSchoolHeadController.ts's approveFinalGrade), it must not be
    // silently overwritten — a real edit needs an authorized, reasoned
    // unlock first (see revertFinalGradeApproval), which resets this flag.
    if (data.gradeApproved) {
      return res.status(409).json({
        message: 'This grade has already been approved by the grad school head and cannot be edited directly. Ask the grad school head to unlock it for correction first.',
      });
    }

    // Chain-driven (non-defense) milestone — read who's allowed to grade at
    // its current stage from the configured chain instead of the hardcoded
    // supervisor/examiner1/examiner2 dispatch below. Defense milestones and
    // any milestone created before this feature shipped (no `routing`
    // snapshot) fall straight through to the original logic, unchanged.
    if (isChainDriven(data)) {
      const routing: ChainStage[] = data.routing;
      const currentStageIndex: number = data.currentStageIndex ?? 0;
      const stage = routing[currentStageIndex];
      if (!stage || stage.action !== 'grade') {
        return res.status(400).json({ message: 'This milestone is not currently awaiting a grade submission.' });
      }

      const resource = (await resolveMilestoneScope(milestoneId)) ?? { facultyId: data.facultyId ?? '' };
      // Matches today's own supervisor-only eligibility exactly (the legacy
      // dispatch below never considered a secondary supervisor either) —
      // widening to include one is a separate, later enhancement.
      const projectSupervisorIds = [data.supervisorId].filter(Boolean);
      const authorized = await authorizeStageActor(req.user, stage, resource, projectSupervisorIds);
      if (!authorized) return res.status(403).json({ message: 'Not authorized to grade this milestone at its current stage.' });

      const scoreValue = Number(givenScore);
      const gradesRef = db.collection('grades').doc();
      let responseStatus = '';

      await db.runTransaction(async (transaction) => {
        const freshSnap = await transaction.get(milestoneRef);
        if (!freshSnap.exists) throw new Error('Milestone not found.');
        const fresh = freshSnap.data()!;
        const freshRouting: ChainStage[] = fresh.routing ?? [];
        const freshIndex: number = fresh.currentStageIndex ?? 0;
        const currentStage = freshRouting[freshIndex];
        if (!currentStage || currentStage.id !== stage.id) {
          throw new Error('This milestone has moved on from this grading stage — refresh and try again.');
        }

        const stageScores = {
          ...(fresh.stageScores ?? {}),
          [currentStage.id]: {
            score: scoreValue,
            comments: comments?.trim() ?? '',
            gradedBy: uid,
            gradedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
        };
        const nextStage = freshRouting[freshIndex + 1];
        const update: Record<string, any> = {
          stageScores,
          stageEnteredAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };

        if (nextStage && nextStage.action === 'grade') {
          // Another grade stage follows immediately (e.g. two co-graders in
          // sequence) — advance and keep waiting, this grading round isn't
          // finalized yet.
          update.currentStageIndex = freshIndex + 1;
          update.status = 'submitted';
          responseStatus = 'submitted';
        } else {
          update.finalGrade = computeChainFinalGrade(stageScores);
          update.gradedAt   = admin.firestore.FieldValue.serverTimestamp();
          update.status     = 'graded';
          responseStatus     = 'graded';
          if (nextStage) update.currentStageIndex = freshIndex + 1;
        }

        transaction.update(milestoneRef, update);
        transaction.set(gradesRef, {
          milestoneId, projectId, graderId: uid, graderRole: stage.role,
          comments: comments?.trim() ?? '',
          isFinalized: responseStatus === 'graded',
          submittedAt: admin.firestore.FieldValue.serverTimestamp(),
          grading: { total: Math.round(scoreValue) },
        });
      });

      await logAuditEvent({
        userId: uid,
        userRole: req.user?.role ?? stage.role,
        action: 'grade_entered',
        entityType: 'milestone',
        entityId: milestoneId,
        newValue: { stageId: stage.id, score: scoreValue },
      });

      return res.status(200).json({ success: true, status: responseStatus });
    }

    const updatePayload: Record<string, any> = {
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    let graderRole = '';
    let scoreField = '';

    if (uid === supervisorId) {
      graderRole = 'supervisor';
      scoreField = 'supervisorScore';
      updatePayload.supervisorScore   = Number(givenScore);
      updatePayload.supervisorComment = comments?.trim() ?? '';
      updatePayload.status            = 'supervisor_graded';
    } else if (examinerIds[0] === uid) {
      graderRole = 'examiner1';
      scoreField = 'examiner1Score';
      updatePayload.examiner1Score    = Number(givenScore);
      updatePayload.examiner1Comments = comments?.trim() ?? '';
    } else if (examinerIds[1] === uid) {
      graderRole = 'examiner2';
      scoreField = 'examiner2Score';
      updatePayload.examiner2Score    = Number(givenScore);
      updatePayload.examiner2Comments = comments?.trim() ?? '';
    } else {
      return res.status(403).json({ message: 'Not authorized to grade this milestone' });
    }
    const previousScore = data[scoreField] ?? null;

    // Check if all graders are done
    const next = { ...data, ...updatePayload };
    const allDone =
      next.supervisorScore  !== null &&
      (examinerIds.length < 1 || next.examiner1Score !== null) &&
      (examinerIds.length < 2 || next.examiner2Score !== null);

    if (allDone) {
      updatePayload.status   = 'graded';
      updatePayload.gradedAt = admin.firestore.FieldValue.serverTimestamp();
      // Real weighted final grade — previously nothing ever computed or wrote
      // this field. Uses the milestone's own gradeWeights if configured,
      // otherwise a sensible default split by examiner count.
      updatePayload.finalGrade = computeWeightedFinalGrade(
        {
          supervisorScore: next.supervisorScore,
          examiner1Score: next.examiner1Score,
          examiner2Score: next.examiner2Score,
        },
        examinerIds.length,
        data.gradeWeights ?? null,
      );

      // Group projects: layer each student's individual component (if a
      // supervisor/examiner already recorded one via submitIndividualGrade)
      // on top of the shared group grade — see computeFinalGradeByStudent.
      const studentIds: string[] = data.studentIds ?? [];
      updatePayload.finalGradeByStudent = computeFinalGradeByStudent(
        studentIds,
        updatePayload.finalGrade,
        data.individualScores ?? null,
        data.individualWeight ?? DEFAULT_INDIVIDUAL_WEIGHT,
      );
    }
    const gradeDocumentPayload = {
      milestoneId,
      projectId,
      graderId: uid,
      graderRole,
      comments: comments?.trim() ?? '',
      isFinalized: allDone, 
      submittedAt: admin.firestore.FieldValue.serverTimestamp(),
      grading: {
        clarity: Math.round(Number(criteria?.clarity ?? finalScore)),
        feasibility: Math.round(Number(criteria?.feasibility ?? finalScore)),
        innovation: Math.round(Number(criteria?.innovation ?? finalScore)),
        methodology: Math.round(Number(criteria?.methodology ?? finalScore)),
        writing: Math.round(Number(criteria?.writing ?? finalScore)),
        total: Math.round(Number(finalScore))
      }
    };
    // Execute updates using a batch to guarantee consistency across collections
    const batch = db.batch();
    
    // 1. Update the parent milestone record
    batch.update(milestoneRef, updatePayload);
    
    // 2. Generate and write a unique document into the 'grades' collection
    const newGradeRef = db.collection('grades').doc();
    batch.set(newGradeRef, gradeDocumentPayload);

    await batch.commit();

    await logAuditEvent({
      userId: uid,
      userRole: req.user?.role ?? graderRole,
      action: previousScore !== null ? 'grade_changed' : 'grade_entered',
      entityType: 'milestone',
      entityId: milestoneId,
      oldValue: { [scoreField]: previousScore },
      newValue: { [scoreField]: Number(givenScore) },
    });

    return res.status(200).json({
      success: true,
      status: updatePayload.status ?? data.status
    });
  } catch (error) {
    console.error('submitMilestoneGrade error:', error);
    return res.status(500).json({ message: 'Failed to submit grade' });
  }
};

// ─── Submit individual (per-student) grade component — group projects ────────
// Spec: alongside the shared group components, a group project allows personal
// components (e.g. the oral defense's individual impression) so members of the
// same group can end up with different final grades. This layers a per-student
// score on top of whatever group score submitMilestoneGrade already computed,
// without touching the single-student ("individual project") grading path.
export const submitIndividualGrade = async (req: AuthenticatedRequest, res: Response) => {
  const uid = req.user?.uid;
  const { milestoneId } = req.params;
  const { studentId, score, comments } = req.body;

  if (!uid) return res.status(401).json({ message: 'Unauthorized.' });
  if (!milestoneId || typeof milestoneId !== 'string') {
    return res.status(400).json({ message: 'Invalid milestoneId' });
  }
  if (!studentId || typeof studentId !== 'string') {
    return res.status(400).json({ message: 'Invalid studentId' });
  }
  const numericScore = Number(score);
  if (!Number.isFinite(numericScore) || numericScore < 0 || numericScore > 100) {
    return res.status(400).json({ message: 'score must be a number between 0 and 100' });
  }

  try {
    const milestoneRef  = db.collection('milestones').doc(milestoneId);
    const milestoneSnap = await milestoneRef.get();
    if (!milestoneSnap.exists) return res.status(404).json({ message: 'Milestone not found' });

    const data: any = milestoneSnap.data() ?? {};
    const examinerIds: string[] = data.examinerIds ?? [];
    const studentIds: string[]  = data.studentIds ?? [];

    const isGrader = uid === data.supervisorId || examinerIds.includes(uid);
    if (!isGrader) {
      return res.status(403).json({ message: 'Not authorized to grade this milestone' });
    }
    // Same lock as submitMilestoneGrade — an individual component can't be
    // adjusted post-approval without an authorized unlock either, since it
    // feeds directly into finalGradeByStudent.
    if (data.gradeApproved) {
      return res.status(409).json({
        message: 'This grade has already been approved by the grad school head and cannot be edited directly. Ask the grad school head to unlock it for correction first.',
      });
    }
    if (!studentIds.includes(studentId)) {
      return res.status(400).json({ message: 'studentId is not part of this milestone' });
    }

    const updatePayload: Record<string, any> = {
      [`individualScores.${studentId}`]: numericScore,
      [`individualComments.${studentId}`]: (comments ?? '').toString().trim(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    // If the shared group grade is already finalized, recompute every
    // student's blended grade immediately — otherwise it's picked up the
    // next time submitMilestoneGrade finishes the group scoring.
    if (data.finalGrade != null) {
      const nextIndividualScores = { ...(data.individualScores ?? {}), [studentId]: numericScore };
      updatePayload.finalGradeByStudent = computeFinalGradeByStudent(
        studentIds,
        data.finalGrade,
        nextIndividualScores,
        data.individualWeight ?? DEFAULT_INDIVIDUAL_WEIGHT,
      );
    }

    await milestoneRef.update(updatePayload);

    await logAuditEvent({
      userId: uid,
      userRole: req.user?.role ?? '',
      action: 'grade_entered',
      entityType: 'milestone',
      entityId: milestoneId,
      oldValue: { [`individualScores.${studentId}`]: data.individualScores?.[studentId] ?? null },
      newValue: { [`individualScores.${studentId}`]: numericScore },
    });

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('submitIndividualGrade error:', error);
    return res.status(500).json({ message: 'Failed to submit individual grade' });
  }
};

// ─── Submit milestone (student) ───────────────────────────────────────────────
export const submitStudentMilestone = async (req: AuthenticatedRequest, res: Response) => {
  const { milestoneId } = req.params;
  const { fileUrls, submissionNote } = req.body;
  const studentId = req.user?.uid;

  if (!studentId) return res.status(401).json({ message: 'Unauthorized.' });
  if (!milestoneId || typeof milestoneId !== 'string') {
    return res.status(400).json({ message: 'Invalid milestoneId' });
  }

  try {
    const milestoneRef  = db.collection('milestones').doc(milestoneId);
    const milestoneSnap = await milestoneRef.get();
    if (!milestoneSnap.exists) return res.status(404).json({ message: 'Milestone not found' });

    const milestoneData = milestoneSnap.data() ?? {};
    const studentIds: string[] = milestoneData.studentIds ?? [];
    if (!studentIds.includes(studentId)) {
      return res.status(403).json({ message: 'Forbidden.' });
    }

    // Preserve the outgoing round before it's overwritten — see
    // services/milestoneRevisions.ts.
    const archiveUpdate = buildRevisionArchiveUpdate(milestoneData);

    await milestoneRef.update({
      status:         'submitted',
      submittedAt:    admin.firestore.FieldValue.serverTimestamp(),
      fileUrls:       fileUrls       ?? [],
      submissionNote: submissionNote ?? '',
      ...(archiveUpdate ?? {}),
      // Chain-driven milestones restart the chain on every fresh submission
      // (first-time or resubmission after a student-facing rejection) — the
      // grader(s) evaluate the new content from stage 0, not wherever a
      // previous round left off.
      ...(isChainDriven(milestoneData)
        ? { currentStageIndex: 0, stageScores: {}, stageEnteredAt: admin.firestore.FieldValue.serverTimestamp() }
        : {}),
    });
    return res.status(200).json({ success: true });
  } catch (error) {
    return res.status(500).json({ message: 'Milestone submission failed' });
  }
};

export const getProjects = async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Extract the query parameters sent by the frontend
    const { facultyId, degreeType } = req.query;
    // Default to 'active' so an omitted filter doesn't dump draft/archived
    // projects to whoever calls this. Only staff roles may opt out with
    // status=all — a student passing that should still only see active ones.
    const canSeeAllStatuses = STAFF_ROLES.includes(req.user?.role ?? '');
    const status = (canSeeAllStatuses && req.query.status === 'all')
      ? undefined
      : (req.query.status ?? 'active');

    // Start with a reference to the projects collection
    let projectsQuery: FirebaseFirestore.Query = db.collection('projects');

    // Dynamically apply filters based on what the frontend requested
    if (status) {
      projectsQuery = projectsQuery.where('status', '==', status);
    }
    if (facultyId) {
      projectsQuery = projectsQuery.where('facultyId', '==', facultyId);
    }
    if (degreeType) {
      // Note: Make sure 'degreeType' matches the exact field name in your Firestore project documents!
      // (Sometimes people name it 'targetDegree' or 'allowedDegrees')
      projectsQuery = projectsQuery.where('degreeType', '==', degreeType);
    }

    // Execute the query
    const snapshot = await projectsQuery.get();

    // Map the documents into a clean array
    const projects = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    // Return the data exactly how the frontend expects it: { projects: [...] }
    return res.status(200).json({ projects });

  } catch (error: any) {
    console.error('Error fetching projects list:', error);
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  }
};

export const getActiveProjects = async(req: AuthenticatedRequest, res: Response) => {
  const uid = req.user?.uid;
  const role = req.user?.role;

  // Verify coordinator/admin roles
  if (role !== 'coordinator' && role !== 'faculty_admin' && role !== 'admin') {
    return res.status(403).json({ message: 'Unauthorized access' });
  }

  try {
    // 1. Fetch all active projects
    const projectsSnap = await db.collection('projects')
      .where('status', '==', 'active')
      .get();

    if (projectsSnap.empty) {
      return res.status(200).json({ InProgress: [] });
    }

    const rawProjects = projectsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // 2. Map through projects and construct per-student relational data structures
    const inProgressPromises = rawProjects.map(async (project: any) => {
      
      // A. Fetch all milestones linked to this specific project
      const milestonesSnap = await db.collection('milestones')
        .where('projectId', '==', project.id)
        .get();
      
      const allProjectMilestones = milestonesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      // B. Fetch all students assigned to this active project
      const studentsSnap = await db.collection('users')
        .where('activeProjectId', '==', project.id)
        .get();

      // Define standard chronological milestone ordering
      const MILESTONE_ORDER = ['research_proposal', 'progress_report', 'final_report', 'defense'];

      // C. Process milestones and progress per individual student
      const studentsArray = studentsSnap.docs.map(studentDoc => {
        const studentId = studentDoc.id;
        const studentData = studentDoc.data();

        // Filter out milestones belonging explicitly to this student document ID
        const studentMilestones = allProjectMilestones.filter((m: any) => {
          return Array.isArray(m.studentIds) && m.studentIds.includes(studentId);
        });

        // Sort this specific student's milestones chronologically
        studentMilestones.sort(
          (a: any, b: any) => MILESTONE_ORDER.indexOf(a.type) - MILESTONE_ORDER.indexOf(b.type)
        );

        // Calculate individual progress percentage
        const completedCount = studentMilestones.filter((m: any) => 
          m.status === 'completed' || m.status === 'coordinator_approved'
        ).length;
        
        const studentProgress = studentMilestones.length > 0 
          ? Math.round((completedCount / studentMilestones.length) * 100) 
          : 0;

        // Map milestones to match the exact keys expected by the expanded frontend rows.
        // Group projects: a student's own finalGradeByStudent entry (set once their
        // individual component is recorded — see computeFinalGradeByStudent) takes
        // priority over the shared group finalGrade, so members of the same group
        // can show different grades even though the milestone itself is one document.
        const formattedMilestones = studentMilestones.map((m: any) => ({
          type: m.type,
          status: m.status,
          supervisorScore: m.finalGradeByStudent?.[studentId] ?? m.finalGrade ?? m.supervisorScore ?? null
        }));

        return {
          id: studentId,
          name: studentData?.displayName || 'Unknown Student',
          progress: studentProgress,
          milestones: formattedMilestones
        };
      });

      // D. Fetch Supervisor Name Fallback if needed
      let supervisorName = project.supervisorName || '';
      if (!supervisorName && project.supervisorId) {
        const supDoc = await db.collection('users').doc(project.supervisorId).get();
        supervisorName = supDoc.data()?.displayName || 'Unknown Supervisor';
      }

      // E. Assemble the complete project object matching the target frontend parameters
      return {
        id: project.id,
        projectTitleHe: project.titleHe || '',
        projectTitleEn: project.titleEn || '',
        facultyId: project.facultyId || '',
        supervisorName,
        status: project.status,
        students: studentsArray // Custom nested block containing targeted progress loops
      };
    });

    // Resolve asynchronous batch lookups
    const inProgressArray = await Promise.all(inProgressPromises);
    // Return the final data payload matching the client wrapper requirement
    return res.status(200).json({ InProgress: inProgressArray });

  } catch (error: any) {
    console.error('Error fetching projects list:', error);
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  }
};