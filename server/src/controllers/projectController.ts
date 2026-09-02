// src/controllers/projectController.ts
// Removed broken: import { Message } from 'protobufjs'

import { Response } from 'express';
import { AuthenticatedRequest, hasAnyRole } from '../middleware/auth.js';
import admin from 'firebase-admin';
import { v2 as cloudinary } from 'cloudinary';
import { logAuditEvent } from '../services/auditLog.js';
import { logProjectRecordEntry } from '../services/projectRecords.js';
import { computeWeightedFinalGrade, computeIdentityWeightedFinalGrade, computeFinalGradeByStudent, DEFAULT_INDIVIDUAL_WEIGHT } from '../services/gradeEngine.js';
import { buildRevisionArchiveUpdate } from '../services/milestoneRevisions.js';
import { resolveMilestoneScope, withinCoordinatorScope, facultyIdMatches, resolveProjectScope, resolveStaffForScope } from '../services/scopeAuthorization.js';
import { notifyUser } from '../services/notify.js';
import { authorizeStageActor, computeChainFinalGrade, computeGradingComponentsScore, isChainDriven, isIdentityKeyedDefense } from '../services/milestoneRouting.js';
import type { ChainStage, GradingComponentSpec, FormFieldSpec } from '../services/workflowTemplates.js';
import { submissionRequirementMet, resolveMilestoneOrder, resolveProjectTemplateMilestones } from '../services/workflowTemplates.js';
import { resolveEffectiveTrack } from '../config/studentTrack.js';

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
    const hasFullAccess = hasAnyRole(requester, FULL_ACCESS_ROLES);
    // Own faculty, an explicit 'all', or any extra faculty granted via
    // internalExaminerFacultyIds (see facultyIdMatches).
    const hasFacultyAccess =
      hasAnyRole(requester, FACULTY_SCOPED_ROLES) &&
      facultyIdMatches(requester, project.facultyId ?? '', 'internalExaminerFacultyIds');
    const hasCoordinatorScopeAccess =
      hasAnyRole(requester, ['administrative_secretary']) &&
      withinCoordinatorScope(requester, { facultyId: project.facultyId ?? '', major: project.major || undefined });
    if (!isOwnProject && !hasFullAccess && !hasFacultyAccess && !hasCoordinatorScopeAccess) {
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
  // reason is optional on first submission; required when a supervisor is
  // overwriting a score they already submitted (enforced further down, once
  // we know whether this is an edit) — see the "update grade" flow.
  const { givenScore, comments, projectId, criteria, reason } = req.body;

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
  if (Number.isNaN(Number(finalScore)) || Number(finalScore) < 0 || Number(finalScore) > 100) {
    return res.status(400).json({ message: 'Grade must be a number between 0 and 100.' });
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
      const authorized = await authorizeStageActor(req.user, stage, resource, projectSupervisorIds, examinerIds);
      if (!authorized) return res.status(403).json({ message: 'Not authorized to grade this milestone at its current stage.' });

      // A milestone with its own configured rubric (see workflowTemplates.ts's
      // GradingComponentSpec) computes its score SERVER-SIDE from the
      // submitted per-component criteria — the same integrity bar every other
      // final-grade computation in this file already holds to, rather than
      // trusting whatever givenScore the client computed. An unconfigured
      // milestone keeps today's exact behavior: trust the client's givenScore.
      let scoreValue: number;
      let criteriaBreakdown: Record<string, { score: number; maxScore: number; weight: number }> | undefined;
      const gradingComponents: GradingComponentSpec[] = data.gradingComponents ?? [];
      if (gradingComponents.length > 0) {
        try {
          const computed = computeGradingComponentsScore(gradingComponents, criteria ?? {});
          scoreValue = computed.total;
          criteriaBreakdown = computed.breakdown;
        } catch (err: any) {
          return res.status(400).json({ message: err.message || 'Invalid grading criteria.' });
        }
      } else {
        scoreValue = Number(givenScore);
      }
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
            ...(criteriaBreakdown ? { criteria: criteriaBreakdown } : {}),
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
          grading: { total: Math.round(scoreValue), ...(criteriaBreakdown ? { criteria: criteriaBreakdown } : {}) },
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
      await logProjectRecordEntry({
        projectId,
        type: 'grade_submitted',
        actorId: uid,
        actorRole: req.user?.role ?? stage.role,
        data: { milestoneId, stageId: stage.id, score: scoreValue },
      });

      return res.status(200).json({ success: true, status: responseStatus });
    }

    // Identity-keyed defense milestone (created after the examiner1Score/
    // examiner2Score generalization) — dispatch off uid membership in
    // examinerIds rather than array position. Legacy defense milestones (no
    // examinerScores field) fall straight through to the original positional
    // dispatch below, unchanged.
    if (isIdentityKeyedDefense(data)) {
      const isSupervisor = uid === supervisorId;
      const isExaminer    = examinerIds.includes(uid);
      if (!isSupervisor && !isExaminer) {
        return res.status(403).json({ message: 'Not authorized to grade this milestone' });
      }

      // A supervisor overwriting a grade they already submitted must say why
      // — the reason is what the "update grade" UI surfaces to the student
      // and what the (separately built) project record will show later.
      if (isSupervisor && data.supervisorScore != null && !reason?.trim()) {
        return res.status(400).json({ message: 'A reason is required when updating an existing grade.' });
      }

      // Same server-side rubric computation as the chain-driven branch above
      // — see its comment for why this doesn't just trust the client's
      // givenScore once a rubric is configured.
      let scoreValue: number;
      let criteriaBreakdown: Record<string, { score: number; maxScore: number; weight: number }> | undefined;
      const gradingComponents: GradingComponentSpec[] = data.gradingComponents ?? [];
      if (gradingComponents.length > 0) {
        try {
          const computed = computeGradingComponentsScore(gradingComponents, criteria ?? {});
          scoreValue = computed.total;
          criteriaBreakdown = computed.breakdown;
        } catch (err: any) {
          return res.status(400).json({ message: err.message || 'Invalid grading criteria.' });
        }
      } else {
        scoreValue = Number(givenScore);
      }
      const gradesRef  = db.collection('grades').doc();
      let responseStatus = '';
      let previousScore: number | null = null;
      let isFinalized = false;

      await db.runTransaction(async (transaction) => {
        const freshSnap = await transaction.get(milestoneRef);
        if (!freshSnap.exists) throw new Error('Milestone not found.');
        const fresh = freshSnap.data()!;
        if (fresh.gradeApproved) {
          throw new Error('This grade has already been approved by the grad school head and cannot be edited directly.');
        }

        const freshExaminerIds: string[] = fresh.examinerIds ?? [];
        const freshExaminerScores: Record<string, { score: number; comments: string }> = fresh.examinerScores ?? {};

        const update: Record<string, any> = {
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };

        let nextSupervisorScore: number | null = fresh.supervisorScore ?? null;
        let nextExaminerScores = freshExaminerScores;

        if (isSupervisor) {
          previousScore = fresh.supervisorScore ?? null;
          update.supervisorScore   = scoreValue;
          // Only overwrite the comment shown to the student when the caller
          // actually sent one — the "update grade" flow only sends a score
          // and a change reason, and must not silently blank out the
          // supervisor's original feedback text.
          if (comments !== undefined) update.supervisorComment = comments.trim();
          update.status            = 'supervisor_graded';
          if (criteriaBreakdown) update.supervisorCriteria = criteriaBreakdown;
          nextSupervisorScore = scoreValue;
        } else {
          previousScore = freshExaminerScores[uid]?.score ?? null;
          nextExaminerScores = {
            ...freshExaminerScores,
            [uid]: {
              score: scoreValue,
              comments: comments?.trim() ?? '',
              ...(criteriaBreakdown ? { criteria: criteriaBreakdown } : {}),
            },
          };
          update.examinerScores = nextExaminerScores;
        }

        const allDone =
          nextSupervisorScore !== null &&
          freshExaminerIds.every((id) => nextExaminerScores[id] != null);

        if (allDone) {
          update.status     = 'graded';
          update.gradedAt   = admin.firestore.FieldValue.serverTimestamp();
          update.finalGrade = computeIdentityWeightedFinalGrade(
            nextSupervisorScore!,
            nextExaminerScores,
            fresh.gradeWeights ?? null,
          );

          const studentIds: string[] = fresh.studentIds ?? [];
          update.finalGradeByStudent = computeFinalGradeByStudent(
            studentIds,
            update.finalGrade,
            fresh.individualScores ?? null,
            fresh.individualWeight ?? DEFAULT_INDIVIDUAL_WEIGHT,
          );
        }

        isFinalized     = allDone;
        responseStatus  = update.status ?? fresh.status ?? '';

        transaction.update(milestoneRef, update);
        transaction.set(gradesRef, {
          milestoneId, projectId, graderId: uid,
          graderRole: isSupervisor ? 'supervisor' : 'examiner',
          comments: comments?.trim() ?? '',
          isFinalized: allDone,
          submittedAt: admin.firestore.FieldValue.serverTimestamp(),
          grading: { total: Math.round(scoreValue), ...(criteriaBreakdown ? { criteria: criteriaBreakdown } : {}) },
          ...(reason?.trim() ? { changeReason: reason.trim() } : {}),
        });
      });

      await logAuditEvent({
        userId: uid,
        userRole: req.user?.role ?? (isSupervisor ? 'supervisor' : 'examiner'),
        action: previousScore !== null ? 'grade_changed' : 'grade_entered',
        entityType: 'milestone',
        entityId: milestoneId,
        oldValue: { score: previousScore },
        newValue: { score: scoreValue, ...(reason?.trim() ? { reason: reason.trim() } : {}) },
      });
      await logProjectRecordEntry({
        projectId,
        type: previousScore !== null ? 'grade_changed' : 'grade_submitted',
        actorId: uid,
        actorRole: req.user?.role ?? (isSupervisor ? 'supervisor' : 'examiner'),
        data: { milestoneId, score: scoreValue, ...(reason?.trim() ? { reason: reason.trim() } : {}) },
      });

      // A supervisor editing a grade they'd already submitted — tell the
      // student(s) it changed and why. First-time grading isn't announced
      // here (matches today's behavior); only genuine edits are.
      if (isSupervisor && previousScore !== null) {
        const studentIds: string[] = data.studentIds ?? [];
        const milestoneTitle = { he: data.nameHe ?? data.type ?? '', en: data.nameEn ?? data.type ?? '' };
        await Promise.all(studentIds.map((studentId) =>
          notifyUser({
            recipientId: studentId,
            type: 'milestone_graded',
            titleHe: 'המנחה עדכן את הציון שלך',
            titleEn: 'Your supervisor updated your grade',
            bodyHe: `המנחה עדכן את הציון עבור "${milestoneTitle.he}" ל-${scoreValue}. סיבה: ${reason!.trim()}`,
            bodyEn: `Your supervisor updated the grade for "${milestoneTitle.en}" to ${scoreValue}. Reason: ${reason!.trim()}`,
            relatedProjectId: projectId ?? null,
            relatedMilestoneId: milestoneId,
            emailData: { milestoneTitle, grade: String(scoreValue) },
          }).catch((err) => console.error(`submitMilestoneGrade: student notify failed for ${studentId} on ${milestoneId}:`, err))
        ));
      }

      return res.status(200).json({ success: true, status: responseStatus, isFinalized });
    }

    const updatePayload: Record<string, any> = {
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    let graderRole = '';
    let scoreField = '';

    if (uid === supervisorId) {
      // Same "reason required to overwrite" guard as the identity-keyed
      // defense branch above — see its comment.
      if (data.supervisorScore != null && !reason?.trim()) {
        return res.status(400).json({ message: 'A reason is required when updating an existing grade.' });
      }
      graderRole = 'supervisor';
      scoreField = 'supervisorScore';
      updatePayload.supervisorScore   = Number(givenScore);
      // Only overwrite the comment shown to the student when the caller
      // actually sent one — see the identical guard above.
      if (comments !== undefined) updatePayload.supervisorComment = comments.trim();
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
      },
      ...(reason?.trim() ? { changeReason: reason.trim() } : {}),
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
      newValue: { [scoreField]: Number(givenScore), ...(reason?.trim() ? { reason: reason.trim() } : {}) },
    });
    await logProjectRecordEntry({
      projectId,
      type: previousScore !== null ? 'grade_changed' : 'grade_submitted',
      actorId: uid,
      actorRole: req.user?.role ?? graderRole,
      data: { milestoneId, score: Number(givenScore), ...(reason?.trim() ? { reason: reason.trim() } : {}) },
    });

    // Supervisor editing a grade they'd already submitted — notify the
    // student(s). Same "only announce genuine edits" rule as the
    // identity-keyed branch above.
    if (uid === supervisorId && previousScore !== null) {
      const studentIds: string[] = data.studentIds ?? [];
      const milestoneTitle = { he: data.nameHe ?? data.type ?? '', en: data.nameEn ?? data.type ?? '' };
      await Promise.all(studentIds.map((studentId) =>
        notifyUser({
          recipientId: studentId,
          type: 'milestone_graded',
          titleHe: 'המנחה עדכן את הציון שלך',
          titleEn: 'Your supervisor updated your grade',
          bodyHe: `המנחה עדכן את הציון עבור "${milestoneTitle.he}" ל-${Number(givenScore)}. סיבה: ${reason!.trim()}`,
          bodyEn: `Your supervisor updated the grade for "${milestoneTitle.en}" to ${Number(givenScore)}. Reason: ${reason!.trim()}`,
          relatedProjectId: projectId ?? null,
          relatedMilestoneId: milestoneId,
          emailData: { milestoneTitle, grade: String(Number(givenScore)) },
        }).catch((err) => console.error(`submitMilestoneGrade: student notify failed for ${studentId} on ${milestoneId}:`, err))
      ));
    }

    return res.status(200).json({
      success: true,
      status: updatePayload.status ?? data.status
    });
  } catch (error) {
    console.error('submitMilestoneGrade error:', error);
    return res.status(500).json({ message: 'Failed to submit grade' });
  }
};

// ─── Three-rubric final-grade workflow (defense milestones with a template-
// configured finalGradeComponents — data_science, as of this writing) ────────
// Separate from submitMilestoneGrade's identity-keyed defense branch above,
// which stays exactly as-is for every faculty that hasn't configured this:
// instead of ONE shared rubric every grader scores against, three independent
// rubrics (supervisor / examiner-on-the-written-project / examiner-on-the-
// oral-defense) combine via their own template-configured weights into the
// milestone's autoCalculatedFinalGrade — see workflowTemplates.ts's
// WorkflowMilestoneSpec.finalGradeComponents doc comment for the full model,
// and supervisorController.ts's decideFinalGrade for what happens once it's
// computed (the supervisor approves it or proposes an override).

/** Re-checks completion (supervisor eval + every examiner's both evals) and,
 *  the first time all of them are in, computes and writes
 *  autoCalculatedFinalGrade, notifying the supervisor it's ready for their
 *  decision. Wrapped in a transaction so two near-simultaneous submissions
 *  (e.g. both examiners finishing at once) can't double-notify or race. */
export async function maybeFinalizeAutoCalculatedGrade(milestoneRef: FirebaseFirestore.DocumentReference): Promise<void> {
  let shouldNotify = false;
  let autoGrade = 0;
  let supervisorId = '';

  await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(milestoneRef);
    if (!snap.exists) return;
    const data = snap.data()!;
    if (data.autoCalculatedFinalGrade != null) return; // already computed
    const rubrics = data.finalGradeComponents;
    if (!rubrics) return;

    const supervisorEval = data.supervisorEvaluation;
    if (!supervisorEval) return;

    // The full panel's identities — internal uids from examinerIds, PLUS any
    // external examiner's token (examinerEvaluations is keyed by token for an
    // external submission — see examinerAccessController.ts's
    // submitExternalExaminerEvaluation, which counts toward this same
    // computed grade exactly like an internal examiner's submission).
    // defensePanel's external members carry the token in `ref`; internal
    // members there duplicate what's already in examinerIds, so a Set dedupes.
    const examinerIds: string[] = data.examinerIds ?? [];
    const externalIds: string[] = (data.defensePanel ?? [])
      .filter((p: { type?: string; ref?: string }) => p.type === 'external' && p.ref)
      .map((p: { ref: string }) => p.ref);
    const allIds = Array.from(new Set([...examinerIds, ...externalIds]));

    const examinerEvals: Record<string, { project?: { total: number }; defense?: { total: number } }> = data.examinerEvaluations ?? {};
    const allExaminersDone = allIds.length > 0 && allIds.every((id) => examinerEvals[id]?.project && examinerEvals[id]?.defense);
    if (!allExaminersDone) return;

    const examinerProjectAvg = allIds.reduce((sum, id) => sum + examinerEvals[id]!.project!.total, 0) / allIds.length;
    const examinerDefenseAvg = allIds.reduce((sum, id) => sum + examinerEvals[id]!.defense!.total, 0) / allIds.length;

    autoGrade = Math.round(
      (supervisorEval.total * rubrics.supervisorEvaluation.weight +
        examinerProjectAvg * rubrics.examinerProjectEvaluation.weight +
        examinerDefenseAvg * rubrics.examinerDefenseEvaluation.weight) / 100
    );

    transaction.update(milestoneRef, {
      autoCalculatedFinalGrade: autoGrade,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    shouldNotify = true;
    supervisorId = data.supervisorId ?? '';
  });

  if (shouldNotify && supervisorId) {
    try {
      await db.collection('notifications').add({
        recipientId: supervisorId,
        type: 'final_grade_ready_for_review',
        titleHe: '🎓 הציון הסופי המחושב מוכן לבדיקה',
        titleEn: '🎓 Computed Final Grade Ready for Review',
        bodyHe: `כל ההערכות הוגשו והציון הסופי המחושב (${autoGrade}) מוכן לאישורך או לשינוי.`,
        bodyEn: `All evaluations are in — the computed final grade (${autoGrade}) is ready for your approval or override.`,
        isRead: false,
        relatedMilestoneId: milestoneRef.id,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch (notifyErr) {
      console.error('maybeFinalizeAutoCalculatedGrade: failed to notify supervisor:', notifyErr);
    }
  }
}

// ─── POST /api/projects/milestones/:milestoneId/supervisor-evaluation ────────
export const submitSupervisorEvaluation = async (req: AuthenticatedRequest, res: Response) => {
  const uid = req.user?.uid;
  const { milestoneId } = req.params;
  // Multipart (uploadMiddleware) when an optional file is attached alongside
  // the rubric — FormData fields arrive as strings, so `scores` needs
  // JSON.parse there; a plain JSON body (no file) keeps working as-is.
  const scores = typeof req.body.scores === 'string' ? JSON.parse(req.body.scores) : req.body.scores;
  const comment = req.body.comment;
  if (!uid) return res.status(401).json({ message: 'Unauthorized.' });
  if (!milestoneId || typeof milestoneId !== 'string') return res.status(400).json({ message: 'Invalid milestoneId.' });

  try {
    const milestoneRef = db.collection('milestones').doc(milestoneId);
    const milestoneSnap = await milestoneRef.get();
    if (!milestoneSnap.exists) return res.status(404).json({ message: 'Milestone not found.' });
    const data = milestoneSnap.data()!;

    if (data.type !== 'defense' || !data.finalGradeComponents) {
      return res.status(400).json({ message: 'This milestone does not use the three-rubric final-grade workflow.' });
    }
    if (data.supervisorId !== uid) {
      return res.status(403).json({ message: "Only this project's supervisor may submit this evaluation." });
    }
    if (data.gradeApproved) {
      return res.status(409).json({ message: 'This grade has already been finalized.' });
    }

    const rubric: GradingComponentSpec[] = data.finalGradeComponents.supervisorEvaluation.components;
    let computed;
    try {
      computed = computeGradingComponentsScore(rubric, scores ?? {});
    } catch (err: any) {
      return res.status(400).json({ message: err.message || 'Invalid evaluation scores.' });
    }

    // Optional file attached alongside the online rubric (e.g. the completed
    // paper form, for the record) — never required, the rubric alone drives
    // the computed grade. See uploadMiddleware (shared with submitStaffRecord).
    const files = ((req as any).files as Express.Multer.File[]) ?? [];
    const fileUrls: string[] = [];
    for (const file of files) {
      const base64 = file.buffer.toString('base64');
      const dataUri = `data:${file.mimetype};base64,${base64}`;
      const result = await cloudinary.uploader.upload(dataUri, { resource_type: 'raw', folder: 'evaluationRecords' });
      fileUrls.push(result.secure_url);
    }

    await milestoneRef.update({
      supervisorEvaluation: {
        scores: computed.breakdown,
        total: computed.total,
        comment: comment?.trim() ?? '',
        ...(fileUrls.length > 0 ? { fileUrls } : {}),
        submittedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await maybeFinalizeAutoCalculatedGrade(milestoneRef);

    await logAuditEvent({
      userId: uid,
      userRole: req.user?.role ?? 'supervisor',
      action: 'supervisor_evaluation_submitted',
      entityType: 'milestone',
      entityId: milestoneId,
      newValue: { total: computed.total },
    });

    return res.status(200).json({ success: true, total: computed.total });
  } catch (error: any) {
    console.error('submitSupervisorEvaluation error:', error);
    return res.status(500).json({ message: 'Failed to submit evaluation.' });
  }
};

// ─── POST /api/projects/milestones/:milestoneId/examiner-evaluation ──────────
// Body: { kind: 'project' | 'defense', scores, comment? } plus an optional
// attached file (multipart, field 'files') — 'project' scores the written
// project/thesis (Project_examiner), 'defense' scores the oral defense
// performance (Project_defence_slides); an examiner submits both,
// independently, each averaged across every assigned examiner once all are in.
export const submitExaminerEvaluation = async (req: AuthenticatedRequest, res: Response) => {
  const uid = req.user?.uid;
  const { milestoneId } = req.params;
  const { kind, comment } = req.body;
  // Multipart (uploadMiddleware) when an optional file is attached alongside
  // the rubric — FormData fields arrive as strings, so `scores` needs
  // JSON.parse there; a plain JSON body (no file) keeps working as-is.
  const scores = typeof req.body.scores === 'string' ? JSON.parse(req.body.scores) : req.body.scores;
  if (!uid) return res.status(401).json({ message: 'Unauthorized.' });
  if (!milestoneId || typeof milestoneId !== 'string') return res.status(400).json({ message: 'Invalid milestoneId.' });
  if (kind !== 'project' && kind !== 'defense') return res.status(400).json({ message: 'kind must be "project" or "defense".' });

  try {
    const milestoneRef = db.collection('milestones').doc(milestoneId);
    const milestoneSnap = await milestoneRef.get();
    if (!milestoneSnap.exists) return res.status(404).json({ message: 'Milestone not found.' });
    const data = milestoneSnap.data()!;

    if (data.type !== 'defense' || !data.finalGradeComponents) {
      return res.status(400).json({ message: 'This milestone does not use the three-rubric final-grade workflow.' });
    }
    const examinerIds: string[] = data.examinerIds ?? [];
    if (!examinerIds.includes(uid)) {
      return res.status(403).json({ message: 'Only an examiner assigned to this defense may submit this evaluation.' });
    }
    if (data.gradeApproved) {
      return res.status(409).json({ message: 'This grade has already been finalized.' });
    }

    // Project_examiner.docx (data_science's digitized paper form) makes
    // "הערכה מילולית והערות" mandatory, unlike every other faculty's
    // examiner comment, which stays optional — see ExaminerEvaluationModal.tsx's
    // matching client-side check.
    if (data.facultyId === 'data_science' && kind === 'project' && !comment?.trim()) {
      return res.status(400).json({ message: 'A written comment is required.' });
    }

    const rubric: GradingComponentSpec[] = kind === 'project'
      ? data.finalGradeComponents.examinerProjectEvaluation.components
      : data.finalGradeComponents.examinerDefenseEvaluation.components;
    let computed;
    try {
      computed = computeGradingComponentsScore(rubric, scores ?? {});
    } catch (err: any) {
      return res.status(400).json({ message: err.message || 'Invalid evaluation scores.' });
    }

    // Optional file attached alongside the online rubric (e.g. the completed
    // paper form, for the record) — never required, the rubric alone drives
    // the computed grade. See uploadMiddleware (shared with submitStaffRecord).
    const files = ((req as any).files as Express.Multer.File[]) ?? [];
    const fileUrls: string[] = [];
    for (const file of files) {
      const base64 = file.buffer.toString('base64');
      const dataUri = `data:${file.mimetype};base64,${base64}`;
      const result = await cloudinary.uploader.upload(dataUri, { resource_type: 'raw', folder: 'evaluationRecords' });
      fileUrls.push(result.secure_url);
    }

    await milestoneRef.update({
      [`examinerEvaluations.${uid}.${kind}`]: {
        scores: computed.breakdown,
        total: computed.total,
        comment: comment?.trim() ?? '',
        ...(fileUrls.length > 0 ? { fileUrls } : {}),
        submittedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await maybeFinalizeAutoCalculatedGrade(milestoneRef);

    await logAuditEvent({
      userId: uid,
      userRole: req.user?.role ?? 'internal_examiner',
      action: 'examiner_evaluation_submitted',
      entityType: 'milestone',
      entityId: milestoneId,
      newValue: { kind, total: computed.total },
    });

    return res.status(200).json({ success: true, total: computed.total });
  } catch (error: any) {
    console.error('submitExaminerEvaluation error:', error);
    return res.status(500).json({ message: 'Failed to submit evaluation.' });
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
    await logProjectRecordEntry({
      projectId: data.projectId,
      type: data.individualScores?.[studentId] != null ? 'grade_changed' : 'grade_submitted',
      actorId: uid,
      actorRole: req.user?.role ?? '',
      data: { milestoneId, studentId, score: numericScore },
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
  const { fileUrls, submissionNote, formData } = req.body;
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

    // Team milestone — same lock as the web submit route
    // (milestoneController.ts's submitMilestone): once any teammate has
    // submitted, block the rest until it's rejected or fully approved.
    if (studentIds.length > 1 && milestoneData.status !== 'pending' && milestoneData.status !== 'rejected') {
      return res.status(409).json({
        message: 'A teammate already submitted this milestone. Wait for it to be graded and approved before submitting again.',
        messageHe: 'חבר/ת קבוצה כבר הגיש/ה את אבן הדרך הזו. יש להמתין לבדיקה ואישור לפני הגשה נוספת.',
        messageEn: 'A teammate already submitted this milestone. Wait for it to be graded and approved before submitting again.',
      });
    }

    // Same structured-form branch as the web route
    // (milestoneController.ts's submitMilestone) — a milestone with
    // studentFormFields configured is submitted as `formData`, not
    // fileUrls/submissionNote, and validated against its own field list
    // instead of the generic submissionRequirement check below.
    const studentFormFieldsSpec: FormFieldSpec[] = milestoneData.studentFormFields ?? [];
    const isStructuredFormMilestone = studentFormFieldsSpec.length > 0;
    let studentFormData: Record<string, unknown> | undefined;

    if (isStructuredFormMilestone) {
      if (!formData || typeof formData !== 'object') {
        return res.status(400).json({ message: 'formData is required for this milestone.' });
      }
      studentFormData = formData;
      const missing = studentFormFieldsSpec.filter(
        (f) => f.required && !f.locked && (studentFormData![f.key] === undefined || studentFormData![f.key] === null || studentFormData![f.key] === '')
      );
      if (missing.length > 0) {
        return res.status(400).json({ message: `Missing required field(s): ${missing.map((f) => f.labelEn).join(', ')}` });
      }
    } else {
      const hasFile = Array.isArray(fileUrls) && fileUrls.length > 0;
      const hasComment = typeof submissionNote === 'string' && submissionNote.trim().length > 0;
      if (!submissionRequirementMet(milestoneData.submissionRequirement, hasFile, hasComment)) {
        return res.status(400).json({ message: 'This milestone requires ' +
          (milestoneData.submissionRequirement === 'both' ? 'a file and a comment.' : `a ${milestoneData.submissionRequirement}.`) });
      }
    }

    // Preserve the outgoing round before it's overwritten — see
    // services/milestoneRevisions.ts.
    const archiveUpdate = buildRevisionArchiveUpdate(milestoneData);

    await milestoneRef.update({
      status:         'submitted',
      submittedAt:    admin.firestore.FieldValue.serverTimestamp(),
      fileUrls:       fileUrls       ?? [],
      submissionNote: submissionNote ?? '',
      ...(studentFormData ? { studentFormData } : {}),
      ...(archiveUpdate ?? {}),
      // Chain-driven milestones restart the chain on every fresh submission
      // (first-time or resubmission after a student-facing rejection) — the
      // grader(s) evaluate the new content from stage 0, not wherever a
      // previous round left off.
      ...(isChainDriven(milestoneData)
        ? { currentStageIndex: 0, stageScores: {}, stageEnteredAt: admin.firestore.FieldValue.serverTimestamp() }
        : {}),
    });

    // Same project-title propagation as the web submit route
    // (milestoneController.ts's submitMilestone) — see its comment.
    if (milestoneData.type === 'research_proposal' && milestoneData.projectId
      && typeof studentFormData?.projectNameHe === 'string' && typeof studentFormData?.projectNameEn === 'string') {
      await db.collection('projects').doc(milestoneData.projectId).update({
        titleHe: studentFormData.projectNameHe,
        titleEn: studentFormData.projectNameEn,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    await logProjectRecordEntry({
      projectId: milestoneData.projectId,
      type: archiveUpdate ? 'milestone_resubmitted' : 'milestone_submitted',
      actorId: studentId,
      actorRole: 'student',
      data: {
        milestoneId,
        milestoneType: milestoneData.type,
        milestoneName: { he: milestoneData.nameHe ?? milestoneData.type, en: milestoneData.nameEn ?? milestoneData.type },
        note: submissionNote ?? '',
        fileCount: Array.isArray(fileUrls) ? fileUrls.length : 0,
      },
    });

    // ── Notify supervisor + coordinator/administrative-coordinator staff ───
    // This mobile-facing route used to send no staff notification at all —
    // see the web equivalent (controllers/milestoneController.ts's
    // submitMilestone) for the same enrichment applied there.
    const supervisorId   = milestoneData.supervisorId ?? null;
    const projectId      = milestoneData.projectId    ?? null;
    const milestoneTitle = { he: milestoneData.nameHe ?? milestoneData.type, en: milestoneData.nameEn ?? milestoneData.type };
    const projectTitle   = { he: milestoneData.projectTitleHe ?? '', en: milestoneData.projectTitleEn ?? '' };
    const submittedFileCount = Array.isArray(fileUrls) ? fileUrls.length : 0;

    const [studentSnapForNotify, supervisorSnapForNotify] = await Promise.all([
      db.collection('users').doc(studentId).get(),
      supervisorId ? db.collection('users').doc(supervisorId).get() : Promise.resolve(null),
    ]);
    const studentName    = studentSnapForNotify.data()?.displayName || 'Unknown student';
    const supervisorName = supervisorSnapForNotify?.data()?.displayName || null;

    const dueDateForNotify: Date | null = milestoneData.dueDate?.toDate?.() ?? null;
    const timingText = { he: '', en: '' };
    if (dueDateForNotify) {
      const diffDays = Math.round((dueDateForNotify.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      if (diffDays > 0) {
        timingText.he = `הוגש ${diffDays} ${diffDays === 1 ? 'יום' : 'ימים'} לפני המועד האחרון.`;
        timingText.en = `Submitted ${diffDays} day${diffDays === 1 ? '' : 's'} before the due date.`;
      } else if (diffDays < 0) {
        const lateDays = Math.abs(diffDays);
        timingText.he = `הוגש באיחור של ${lateDays} ${lateDays === 1 ? 'יום' : 'ימים'}.`;
        timingText.en = `Submitted ${lateDays} day${lateDays === 1 ? '' : 's'} late.`;
      } else {
        timingText.he = 'הוגש ביום המועד האחרון.';
        timingText.en = 'Submitted on the due date.';
      }
    }

    // Unlike the web submit route (multer), files here are already uploaded
    // by the mobile client before this call — only their URLs arrive in the
    // body, with no original filename attached, so the file line can only
    // report how many were attached, not their names.
    const filesLineHe = submittedFileCount > 0
      ? `קבצים: ${submittedFileCount} ${submittedFileCount === 1 ? 'קובץ צורף' : 'קבצים צורפו'}`
      : 'קבצים: לא צורפו קבצים';
    const filesLineEn = submittedFileCount > 0
      ? `Files: ${submittedFileCount} file${submittedFileCount === 1 ? '' : 's'} attached`
      : 'Files: No files attached';

    const staffBody = {
      he: [
        `${studentName} הגיש/ה את "${milestoneTitle.he}".`,
        projectTitle.he ? `פרויקט: ${projectTitle.he}` : null,
        supervisorName ? `מנחה: ${supervisorName}` : null,
        timingText.he || null,
        filesLineHe,
      ].filter(Boolean).join('\n'),
      en: [
        `${studentName} submitted "${milestoneTitle.en}".`,
        projectTitle.en ? `Project: ${projectTitle.en}` : null,
        supervisorName ? `Supervisor: ${supervisorName}` : null,
        timingText.en || null,
        filesLineEn,
      ].filter(Boolean).join('\n'),
    };

    if (supervisorId) {
      await notifyUser({
        recipientId: supervisorId,
        type: 'milestone_submitted',
        titleHe: 'הגשה חדשה ממתינה לבדיקה 📤',
        titleEn: 'New Milestone Submission 📤',
        bodyHe:  `סטודנט הגיש את "${milestoneTitle.he}".`,
        bodyEn:  `A student submitted "${milestoneTitle.en}".`,
        relatedProjectId: projectId,
        relatedMilestoneId: milestoneId,
        emailData: { milestoneTitle, projectTitle },
        taskKind: 'milestone_action',
      });
    }

    // See the identical change in milestoneController.ts's submitMilestone
    // (the web submit route) — this used to be a hand-rolled in-app+push
    // path with no email, but none of these staff carry an expoPushToken
    // (only the mobile app registers one), so push silently no-opped and
    // they only ever got an unread in-app bell they had no reason to check.
    // Routed through notifyUser now so they get a real email too; SMS stays
    // off to avoid fanning a paid channel out on every submission.
    const notifyStaffMilestoneSubmitted = (recipientId: string) => notifyUser({
      recipientId,
      type: 'milestone_submitted',
      titleHe: 'הגשה חדשה ממתינה לבדיקה 📤',
      titleEn: 'New Milestone Submission 📤',
      bodyHe:  staffBody.he,
      bodyEn:  staffBody.en,
      relatedProjectId: projectId,
      relatedMilestoneId: milestoneId,
      emailData: { milestoneTitle, projectTitle },
      taskKind: 'milestone_action',
      channels: { sms: false },
    });

    const projectScope = await resolveProjectScope(projectId);
    if (projectScope) {
      const [coordinatorIds, adminCoordinatorIds] = await Promise.all([
        resolveStaffForScope('coordinator', projectScope, supervisorId ? [supervisorId] : []),
        resolveStaffForScope('administrative_secretary', projectScope, supervisorId ? [supervisorId] : []),
      ]);
      const staffRecipientIds = [...new Set([...coordinatorIds, ...adminCoordinatorIds])].filter((id) => id !== supervisorId);
      await Promise.all(staffRecipientIds.map((id) => notifyStaffMilestoneSubmitted(id)));
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    return res.status(500).json({ message: 'Milestone submission failed' });
  }
};

export const getProjects = async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Extract the query parameters sent by the frontend
    const { facultyId } = req.query;
    let degreeType: unknown = req.query.degreeType;
    // Default to 'active' so an omitted filter doesn't dump draft/archived
    // projects to whoever calls this. Only staff roles may opt out with
    // status=all — a student passing that should still only see active ones.
    const canSeeAllStatuses = STAFF_ROLES.includes(req.user?.role ?? '');
    const status = (canSeeAllStatuses && req.query.status === 'all')
      ? undefined
      : (req.query.status ?? 'active');

    // This endpoint has no role gate at all — any authenticated user,
    // including a student, can call it — and `degreeType` above is
    // caller-supplied. A masters student must never be able to browse
    // bachelors-only projects (or vice versa) by passing a different
    // ?degreeType=, or by omitting the filter entirely (which previously
    // returned every degree level unfiltered). For a non-staff caller, their
    // own degreeType always wins here, ignoring whatever the query string
    // asked for.
    let effectiveTrack: 'thesis' | 'project' | null = null;
    if (!canSeeAllStatuses) {
      const uid = req.user?.uid;
      const userSnap = uid ? await db.collection('users').doc(uid).get() : null;
      const userData = userSnap?.data();
      degreeType = userData?.degreeType ?? degreeType;
      if (userData) effectiveTrack = resolveEffectiveTrack(userData);
    }

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
      // Canonical field is the `degreeTypes` array (a project can legitimately
      // target more than one degree level at once — see NewProjectModal.tsx's
      // checkboxes); array-contains matches both that and the common case of
      // a single-degree project, same convention as useStudentData.ts's own
      // browse query.
      projectsQuery = projectsQuery.where('degreeTypes', 'array-contains', degreeType);
    }

    // Execute the query
    const snapshot = await projectsQuery.get();

    // Map the documents into a clean array
    let projects = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    // A student's thesis/project track is fixed (see config/studentTrack.ts)
    // — Firestore only allows one array-contains clause per query (already
    // spent on degreeTypes above), so this is filtered in-memory rather than
    // as a second where() clause, same as the major convenience-filter every
    // client-side browse query already does.
    if (effectiveTrack) {
      projects = projects.filter((p: any) => {
        const types: string[] = p.projectTypes ?? (p.projectType ? [p.projectType] : []);
        return types.length === 0 || types.includes(effectiveTrack);
      });
    }

    // Return the data exactly how the frontend expects it: { projects: [...] }
    return res.status(200).json({ projects });

  } catch (error: any) {
    console.error('Error fetching projects list:', error);
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  }
};

const ACTIVE_PROJECTS_ROLES = ['coordinator', 'faculty_admin', 'admin', 'system_admin'];
const ACTIVE_PROJECTS_UNRESTRICTED_ROLES = ['admin', 'system_admin'];

export const getActiveProjects = async(req: AuthenticatedRequest, res: Response) => {
  const uid = req.user?.uid;

  // Verify coordinator/admin roles
  if (!hasAnyRole(req.user, ACTIVE_PROJECTS_ROLES)) {
    return res.status(403).json({ message: 'Unauthorized access' });
  }

  try {
    // A coordinator/faculty_admin oversees one faculty (or a handful, via
    // coordinatorScopes) — this tab should default to every project in that
    // scope, not just ones they personally supervise, so they can see what
    // other supervisors in their faculty are running too. 'admin'/
    // 'system_admin' stay unrestricted (system-wide), matching their
    // behavior everywhere else. facultyId 'all' (administrative-coordinator-
    // style provisioning) is likewise unrestricted rather than an empty/
    // no-match scope.
    let unrestricted = hasAnyRole(req.user, ACTIVE_PROJECTS_UNRESTRICTED_ROLES);
    let facultyIds: string[] = [];
    if (!unrestricted) {
      const coordinatorScopes = req.user?.coordinatorScopes ?? [];
      facultyIds = coordinatorScopes.length > 0
        ? [...new Set(coordinatorScopes.map((s) => s.facultyId))]
        : (req.user?.facultyId ? [req.user.facultyId] : []);
      if (facultyIds.includes('all')) unrestricted = true;
    }

    if (!unrestricted && facultyIds.length === 0) {
      return res.status(200).json({ InProgress: [] });
    }

    // 1. Fetch active projects. status:'active' means "open for applications,
    // not yet enrolled" (see workflowTemplateRetroactiveApply.ts) — an
    // enrolled, ongoing project is 'in_progress'. This endpoint matched only
    // 'active' before, so it always returned zero rows against real data;
    // every sibling "how many active projects" tally (coordinatorController's
    // activeProjects count, projectCoordinatorController/programHeadController/
    // gradSchoolHeadController's isActive checks) treats both as active, so
    // this does too. Firestore allows only one 'in'/'array-contains-any'
    // clause per query, and it's already spent on status, so faculty scoping
    // is applied in-memory below instead of as a second 'in' clause.
    const projectsSnap = await db.collection('projects')
      .where('status', 'in', ['active', 'in_progress'])
      .get();

    if (projectsSnap.empty) {
      return res.status(200).json({ InProgress: [] });
    }

    let rawProjects = projectsSnap.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      // Archived projects (services/projectErasure.ts) keep their last
      // status, which is usually still 'in_progress' — exclude them here too,
      // matching getCoordinatorDashboard's identical isArchived filter.
      .filter((p: any) => !p.isArchived);
    if (!unrestricted) {
      rawProjects = rawProjects.filter((p: any) => facultyIds.includes(p.facultyId));
    }

    if (rawProjects.length === 0) {
      return res.status(200).json({ InProgress: [] });
    }

    // 2. Map through projects and construct per-student relational data structures
    const inProgressPromises = rawProjects.map(async (project: any) => {

      // A. Fetch all milestones linked to this specific project, plus this
      // project's own resolved template (for each milestone type's
      // percentOfFinalGrade — the ProjectStageChain view's "weight" column).
      const [milestonesSnap, templateMilestones] = await Promise.all([
        db.collection('milestones').where('projectId', '==', project.id).get(),
        resolveProjectTemplateMilestones(project),
      ]);
      const weightByType: Record<string, number> = {};
      templateMilestones.forEach((tm) => {
        weightByType[tm.type] = tm.percentOfFinalGrade ?? (tm.type === 'defense' ? 100 : 0);
      });

      const allProjectMilestones = milestonesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      // B. Fetch every student enrolled in this project — via the project
      // doc's own enrolledStudentIds, not a reverse query on the student's
      // scalar activeProjectId. That field only ever points to ONE project
      // even when the TEMP-multi-active-projects bypass
      // (projectEnrollment.ts) has seated a student in several at once, so a
      // student with more than one active project silently disappeared from
      // every one of them except whichever their activeProjectId happened to
      // currently point at — one project showing 1 student and its sibling
      // showing none for the very same enrolled student. Every other
      // dashboard endpoint here already reads enrolledStudentIds directly
      // for this reason (see coordinatorController.ts,
      // supervisorController.ts's getSupervisorProjectDetail).
      const enrolledStudentIds: string[] = project.enrolledStudentIds ?? [];
      const studentDocs = (await Promise.all(
        enrolledStudentIds.map((sid: string) => db.collection('users').doc(sid).get())
      )).filter((snap) => snap.exists);

      // C. Process milestones and progress per individual student
      const studentsArray = studentDocs.map(studentDoc => {
        const studentId = studentDoc.id;
        const studentData = studentDoc.data();

        // Filter out milestones belonging explicitly to this student document ID
        const studentMilestones = allProjectMilestones.filter((m: any) => {
          return Array.isArray(m.studentIds) && m.studentIds.includes(studentId);
        });

        // Sort this specific student's milestones chronologically
        studentMilestones.sort(
          (a: any, b: any) => resolveMilestoneOrder(a) - resolveMilestoneOrder(b)
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
          supervisorScore: m.finalGradeByStudent?.[studentId] ?? m.finalGrade ?? m.supervisorScore ?? null,
          percentOfFinalGrade: weightByType[m.type] ?? 0,
          dueDate: m.dueDate?.toDate?.()?.toISOString() ?? null,
          submittedAt: m.submittedAt?.toDate?.()?.toISOString() ?? null,
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
        supervisorId: project.supervisorId || '',
        supervisorName,
        status: project.status,
        createdAt: project.createdAt?.toDate?.()?.toISOString() ?? null,
        // Editable-field snapshot for the coordinator's "fix a human error"
        // Edit Project control (see EditProjectModal.tsx) — mirrors
        // updateSupervisorProject's own EDITABLE_PROJECT_FIELDS allowlist.
        // Both `maxStudents` and `NumberOfStudents` coexist in real data with
        // no migration; this normalizes to one client-facing field.
        descriptionHe: project.descriptionHe || '',
        descriptionEn: project.descriptionEn || '',
        degreeType: project.degreeType || '',
        projectType: project.projectType || '',
        requiredSkills: project.requiredSkills ?? [],
        maxStudents: project.maxStudents ?? project.NumberOfStudents ?? 1,
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