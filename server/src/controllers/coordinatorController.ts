import admin from 'firebase-admin';
import { Request, Response } from 'express';
import { db } from '../config/firebase.js';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { assignExaminersAndNotify, ExaminerAssignmentInput } from '../services/examinerAccess.js';
import { logAuditEvent } from '../services/auditLog.js';
import {
  resolveKeepExaminers,
  resolveReplaceExaminer,
  openDefenseSchedulingIfPanelReady,
} from '../services/defenseScheduling.js';
import { hasActionGrant, withinCoordinatorScope, resolveProjectScope, resolveMilestoneScope, resolveStaffForScope } from '../services/scopeAuthorization.js';
import { deriveProcessType, type ChainStage } from '../services/workflowTemplates.js';
import { authorizeStageActor, isChainDriven, statusForStage } from '../services/milestoneRouting.js';
import { notifyUser } from '../services/notify.js';

// Matches the Firestore project document shape exactly
interface ProjectDocument {
  academicYear:       string;
  applicationIds:     string[];
  createdAt:          admin.firestore.Timestamp;
  degreeType:         string;
  deletedAt:          admin.firestore.Timestamp | null;
  descriptionEn:      string;
  descriptionHe:      string;
  enrolledStudentIds: string[];
  examinerIds:        string[];
  facultyId:          string;
  isArchived:         boolean;
  maxStudents:        number;
  projectType:        string;
  requiredSkills:     string[];
  semesterStart:      admin.firestore.Timestamp | null;
  status:             string;
  supervisorId:       string;
  titleEn:            string;
  titleHe:            string;
  updatedAt:          admin.firestore.Timestamp;
}

// ─────────────────────────────────────────────────────────────────────────────
// EXISTING
// ─────────────────────────────────────────────────────────────────────────────

// Coordinator-tier actions (examiner assignment, milestone approval, defense-date
// resolution) — same role set already used by assignDefense below. None of these
// checked role at all before; any authenticated user (including a student) could
// reach them with just a valid login token.
const COORDINATOR_ROLES = ['coordinator', 'administrative_secretary', 'system_admin'];

/**
 * POST /api/coordinator/projects/:projectId/assign-examiners
 * Body: { examiners: ExaminerAssignmentInput[], milestoneId?: string, studentIds?: string[] }
 *   (legacy `{ examinerIds: string[] }` is still accepted and treated as all-internal)
 *
 * Internal examiners (existing app users) are written onto the project's
 * examinerIds array — they see the assignment in their own dashboard, same
 * as before. External examiners (no app account) get a one-time access
 * link emailed to them instead — see services/examinerAccess.ts.
 */
export const assignExaminers = async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user?.role || !COORDINATOR_ROLES.includes(req.user.role)) {
    return res.status(403).json({ message: 'Access denied: coordinator only.' });
  }

  const { projectId } = req.params;
  const { examiners, examinerIds, milestoneId, studentIds, lang, weights } = req.body;

  if (typeof projectId !== 'string' || !projectId) {
    return res.status(400).json({ message: 'Invalid or missing projectId' });
  }

  const examinerInputs: ExaminerAssignmentInput[] = Array.isArray(examiners)
    ? examiners
    : Array.isArray(examinerIds)
      ? examinerIds.map((uid: string) => ({ type: 'internal' as const, uid }))
      : [];

  if (examinerInputs.length === 0) {
    return res.status(400).json({ message: 'Invalid examiner list' });
  }

  // Optional custom grade weights (web's AssignExaminersModal / mobile's
  // equivalent both collect and validate these client-side, but nothing
  // ever sent them on — gradeEngine.ts's computeWeightedFinalGrade has
  // always supported a milestone's own gradeWeights field, it just never
  // got written). Fractions summing to 1, re-validated here since the
  // client-side 100% check is only a UX nicety.
  let gradeWeights: { supervisorWeight: number; examiner1Weight: number; examiner2Weight: number } | null = null;
  if (weights && typeof weights === 'object') {
    const supervisorWeight = Number(weights.supervisorWeight);
    const examiner1Weight = Number(weights.examiner1Weight);
    const examiner2Weight = Number(weights.examiner2Weight);
    if (![supervisorWeight, examiner1Weight, examiner2Weight].every((w) => Number.isFinite(w) && w >= 0)) {
      return res.status(400).json({ message: 'Invalid grade weights.' });
    }
    if (Math.abs(supervisorWeight + examiner1Weight + examiner2Weight - 1) > 0.01) {
      return res.status(400).json({ message: 'Grade weights must sum to 100%.' });
    }
    gradeWeights = { supervisorWeight, examiner1Weight, examiner2Weight };
  }

  try {
    const projectRef = db.collection('projects').doc(projectId);
    const projectSnap = await projectRef.get();

    if (!projectSnap.exists) {
      return res.status(404).json({ message: 'Project not found' });
    }
    const project = projectSnap.data()!;

    const assignScope = { facultyId: project.facultyId, major: project.major, degreeLevel: project.degreeType, processType: project.projectType };
    if (!withinCoordinatorScope(req.user, assignScope) && !hasActionGrant(req.user, 'assign_supervisor_examiner', assignScope)) {
      return res.status(403).json({ message: 'This project is outside your assigned scope.' });
    }

    let thesisUrl = '';
    if (typeof milestoneId === 'string' && milestoneId) {
      const milestoneRef = db.collection('milestones').doc(milestoneId);
      const milestoneSnap = await milestoneRef.get();
      // MEDIUM FIX: milestoneId is caller-supplied and was never checked
      // against the projectId this request was already scope-validated
      // for — a coordinator with scope only over their own faculty's
      // project A could pass projectId: A (in-scope) but milestoneId
      // pointing at a different faculty's milestone B, silently
      // overwriting B's gradeWeights and leaking B's fileUrls[0] into the
      // assignment email sent to A's newly-invited examiner.
      if (milestoneSnap.exists && milestoneSnap.data()?.projectId !== projectId) {
        return res.status(400).json({ message: 'milestoneId does not belong to this project.' });
      }
      thesisUrl = milestoneSnap.data()?.fileUrls?.[0] ?? '';
      // Only meaningful once graders are actually assigned to this
      // milestone — computeWeightedFinalGrade reads it off the milestone
      // doc when submitMilestoneGrade finishes scoring.
      if (gradeWeights && milestoneSnap.exists) {
        await milestoneRef.update({ gradeWeights });
      }
    }

    const resolvedStudentIds: string[] = Array.isArray(studentIds) && studentIds.length
      ? studentIds
      : project.enrolledStudentIds ?? [];
    const studentSnaps = await Promise.all(
      resolvedStudentIds.map((sid: string) => db.collection('users').doc(sid).get())
    );
    const studentName = studentSnaps.map((s) => s.data()?.displayName).filter(Boolean).join(', ');

    const result = await assignExaminersAndNotify(examinerInputs, {
      projectId,
      thesisTitle: project.titleHe || project.titleEn || '',
      studentName,
      milestoneId: typeof milestoneId === 'string' ? milestoneId : undefined,
      thesisUrl,
      lang: lang === 'en' ? 'en' : 'he',
    });

    await projectRef.update({
      examinerIds: result.internalUids,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await openDefenseSchedulingIfPanelReady(projectId, result);

    res.status(200).json({
      message: 'Examiners assigned',
      internalAssigned: result.internalUids,
      externalNotified: result.externalNotified,
      externalFailed: result.externalFailed,
    });
  } catch (error) {
    console.error('Assignment failed:', error);
    res.status(500).json({ message: 'Failed to assign examiners' });
  }
};

/**
 * GET /api/coordinator/examiner-recommendations
 * Pending examiner recommendations submitted by supervisors in the
 * coordinator's own faculty. Called by coordinator/home.tsx.
 */
export const getCoordinatorExaminerRecommendations = async (req: AuthenticatedRequest, res: Response) => {
  // Previously missing entirely — any authenticated user with a facultyId
  // (including a student) could reach this. Bring it in line with its
  // sibling coordinator endpoints.
  if (!req.user?.role || !COORDINATOR_ROLES.includes(req.user.role)) {
    return res.status(403).json({ message: 'Access denied: coordinator only.' });
  }
  const facultyId = req.user?.facultyId;
  if (!facultyId) return res.status(400).json({ message: 'Coordinator has no facultyId assigned.' });

  try {
    // Narrow to the coordinator's assigned coordinatorScopes' faculties when
    // configured (see scopeAuthorization.ts) — otherwise falls back to their
    // own facultyId, same as before. A scope covering 'all' faculties means
    // no facultyId filter at all.
    const scopeFacultyIds = req.user.coordinatorScopes.length
      ? Array.from(new Set(req.user.coordinatorScopes.map((s) => s.facultyId)))
      : [facultyId];

    let query: FirebaseFirestore.Query = db.collection('examinerRecommendations').where('status', '==', 'pending');
    if (!scopeFacultyIds.includes('all')) {
      query = query.where('facultyId', 'in', scopeFacultyIds.slice(0, 10));
    }
    const snap = await query.get();

    const recommendations = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    return res.status(200).json({ recommendations });
  } catch (error: any) {
    console.error('getCoordinatorExaminerRecommendations error:', error);
    return res.status(500).json({ message: 'Failed to load examiner recommendations.' });
  }
};

/**
 * POST /api/coordinator/examiner-recommendations/:id/approve
 * Approves the supervisor's recommended examiner list. Internal examiners
 * are assigned onto the project (same effect as assignExaminers); external
 * examiners each get a one-time access link emailed to them.
 */
export const approveExaminerRecommendation = async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const coordinatorId = req.user?.uid;
  if (!coordinatorId) return res.status(401).json({ message: 'Unauthorized.' });
  if (!req.user?.role || !COORDINATOR_ROLES.includes(req.user.role)) {
    return res.status(403).json({ message: 'Access denied: coordinator only.' });
  }
  if (!id || typeof id !== 'string') return res.status(400).json({ message: 'Missing recommendation id.' });

  try {
    const recRef  = db.collection('examinerRecommendations').doc(id);
    const recSnap = await recRef.get();
    if (!recSnap.exists) return res.status(404).json({ message: 'Recommendation not found.' });

    const rec = recSnap.data()!;
    if (rec.status !== 'pending') {
      return res.status(400).json({ message: `Recommendation already ${rec.status}.` });
    }

    const projectId  = rec.projectId;
    const projectSnap = await db.collection('projects').doc(projectId).get();
    if (!projectSnap.exists) return res.status(404).json({ message: 'Project not found.' });
    const project = projectSnap.data()!;

    const approveScope = { facultyId: project.facultyId, major: project.major, degreeLevel: project.degreeType, processType: project.projectType };
    if (!withinCoordinatorScope(req.user, approveScope) && !hasActionGrant(req.user, 'assign_supervisor_examiner', approveScope)) {
      return res.status(403).json({ message: 'This recommendation is outside your assigned scope.' });
    }

    const studentSnaps = await Promise.all(
      (project.enrolledStudentIds ?? []).map((sid: string) => db.collection('users').doc(sid).get())
    );
    const studentName = studentSnaps.map((s) => s.data()?.displayName).filter(Boolean).join(', ');

    // P1 backlog item #5 — master's thesis examiner lists need a second,
    // grad_school_head sign-off before invitations actually go out. Every
    // other process type keeps the coordinator's approval as final, exactly
    // as before.
    const processType = deriveProcessType(project.degreeType, project.projectType);
    if (processType === 'msc_thesis') {
      await recRef.update({
        status: 'coordinator_approved',
        coordinatorApprovedAt: admin.firestore.FieldValue.serverTimestamp(),
        coordinatorApprovedBy: coordinatorId,
      });
      await logAuditEvent({
        userId: coordinatorId,
        userRole: req.user!.role,
        action: 'examiner_approval_requested',
        entityType: 'examinerRecommendation',
        entityId: id,
        newValue: { projectId, processType },
      });
      return res.status(200).json({
        success: true,
        message: 'Approved — awaiting grad-school-head sign-off before invitations are sent.',
        requiresGradSchoolHeadApproval: true,
      });
    }

    const examinerInputs: ExaminerAssignmentInput[] = (rec.recommendedExaminers ?? []).map((ex: any) =>
      ex.type === 'internal'
        ? { type: 'internal' as const, uid: ex.internalUserId }
        : { type: 'external' as const, name: ex.name, email: ex.email, institution: ex.institution }
    );

    const result = await assignExaminersAndNotify(examinerInputs, {
      projectId,
      thesisTitle: rec.projectTitleHe || rec.projectTitleEn || project.titleHe || '',
      studentName,
      lang: 'he',
    });

    await db.collection('projects').doc(projectId).update({
      examinerIds: result.internalUids,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await openDefenseSchedulingIfPanelReady(projectId, result);

    await recRef.update({
      status:     'approved',
      decidedAt:  admin.firestore.FieldValue.serverTimestamp(),
      decidedBy:  coordinatorId,
    });

    return res.status(200).json({
      success: true,
      message: 'Recommendation approved.',
      internalAssigned: result.internalUids,
      externalNotified: result.externalNotified,
      externalFailed:   result.externalFailed,
    });
  } catch (error: any) {
    console.error('approveExaminerRecommendation error:', error);
    return res.status(500).json({ message: error.message || 'Failed to approve recommendation.' });
  }
};

/**
 * POST /api/coordinator/examiner-recommendations/:id/reject
 * No examiners are assigned — the coordinator will pick examiners manually
 * via assign-examiners instead.
 */
export const rejectExaminerRecommendation = async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const coordinatorId = req.user?.uid;
  if (!coordinatorId) return res.status(401).json({ message: 'Unauthorized.' });
  if (!req.user?.role || !COORDINATOR_ROLES.includes(req.user.role)) {
    return res.status(403).json({ message: 'Access denied: coordinator only.' });
  }
  if (!id || typeof id !== 'string') return res.status(400).json({ message: 'Missing recommendation id.' });

  try {
    const recRef  = db.collection('examinerRecommendations').doc(id);
    const recSnap = await recRef.get();
    if (!recSnap.exists) return res.status(404).json({ message: 'Recommendation not found.' });
    const rec = recSnap.data()!;

    const rejectScope = (await resolveProjectScope(rec.projectId)) ?? { facultyId: rec.facultyId ?? '' };
    if (!withinCoordinatorScope(req.user, rejectScope) && !hasActionGrant(req.user, 'assign_supervisor_examiner', rejectScope)) {
      return res.status(403).json({ message: 'This recommendation is outside your assigned scope.' });
    }

    await recRef.update({
      status:    'rejected',
      decidedAt: admin.firestore.FieldValue.serverTimestamp(),
      decidedBy: coordinatorId,
    });

    return res.status(200).json({ success: true, message: 'Recommendation rejected.' });
  } catch (error: any) {
    console.error('rejectExaminerRecommendation error:', error);
    return res.status(500).json({ message: error.message || 'Failed to reject recommendation.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// NEW — 4 missing functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/coordinator/dashboard
 * Returns all projects in the coordinator's faculty, with their milestones
 * stitched in, plus a count of milestones pending coordinator review.
 * Called by coordinator/home.tsx on mount alongside GET /api/users/profile.
 */
export const getCoordinatorDashboard = async (req: AuthenticatedRequest, res: Response) => {
  const coordinatorId = req.user?.uid;
  if (!coordinatorId) return res.status(401).json({ message: 'Unauthorized.' });
  if (!req.user?.role || !COORDINATOR_ROLES.includes(req.user.role)) {
    return res.status(403).json({ message: 'Access denied: coordinator only.' });
  }

  try {
    const coordinatorSnap = await db.collection('users').doc(coordinatorId).get();
    if (!coordinatorSnap.exists) return res.status(404).json({ message: 'Coordinator user record not found.' });

    const coordinatorData = coordinatorSnap.data();
    const facultyId = coordinatorData?.facultyId;
    if (!facultyId) return res.status(400).json({ message: 'Coordinator has no facultyId assigned.' });

    const [projectsSnap, milestonesSnap, notifSnap] = await Promise.all([
      db.collection('projects').where('facultyId', '==', facultyId).get(),
      db.collection('milestones').where('facultyId', '==', facultyId).get(),
      db.collection('notifications')
        .where('recipientId', '==', coordinatorId)
        .where('isRead', '==', false)
        .get(),
    ]);

    // ── Index projects by ID for O(1) lookup ──────────────────────────────
    const projectsById: Record<string, any> = {};
    projectsSnap.docs.forEach((doc) => {
      projectsById[doc.id] = { id: doc.id, ...doc.data() };
    });

    // ── Collect all unique userIds we need to resolve ─────────────────────
    // (supervisors + enrolled students across all projects)
    const userIdsToFetch = new Set<string>();
    projectsSnap.docs.forEach((doc) => {
      const data = doc.data();
      if (data.supervisorId) userIdsToFetch.add(data.supervisorId);
      (data.enrolledStudentIds ?? []).forEach((id: string) => userIdsToFetch.add(id));
    });

    // ── Batch-fetch all users in parallel (one call per user, all parallel) ─
    const userSnaps = await Promise.all(
      [...userIdsToFetch].map((uid) => db.collection('users').doc(uid).get())
    );
    const usersById: Record<string, string> = {}; // uid → displayName
    userSnaps.forEach((snap) => {
      if (snap.exists) usersById[snap.id] = snap.data()?.displayName ?? 'Unknown';
    });

    // ── Build enriched structures in one pass over milestones ─────────────
    const milestonesByProject: Record<string, any[]> = {};
    const pendingMilestones: any[] = [];

    milestonesSnap.docs.forEach((doc) => {
      const data = doc.data();
      const pid  = data.projectId;
      const project = projectsById[pid];

      // Raw milestone docs have no studentNames of their own (that's derived
      // from the project's enrolledStudentIds) — compute it once here so
      // every milestone nested under project.milestones[] has it, not just
      // the ones that make it into pendingMilestones below. The Defenses tab
      // (coordinator/home.tsx) reads milestone.studentNames off every bucket
      // sourced from project.milestones[], including ones that never touch
      // pendingMilestones (stuck-pending, awaiting-date, scheduled-upcoming,
      // expired-ungraded) — omitting it crashed that tab with "Cannot read
      // property 'join' of undefined".
      const studentNames = (project?.enrolledStudentIds ?? [])
        .map((id: string) => usersById[id] ?? id);

      if (!milestonesByProject[pid]) milestonesByProject[pid] = [];
      milestonesByProject[pid].push({ id: doc.id, ...data, studentNames });

      // ── pendingMilestones: submitted, supervisor_graded, graded, or coordinator_approved ──
      if (
        data.status === 'submitted' ||
        data.status === 'supervisor_graded' ||
        data.status === 'graded' ||
        data.status === 'coordinator_approved'
      ) {
        pendingMilestones.push({
          id:               doc.id,
          projectId:        pid,
          projectTitleHe:   project?.titleHe   ?? '',
          projectTitleEn:   project?.titleEn   ?? '',
          facultyId:        data.facultyId     ?? project?.facultyId ?? '',
          type:             data.type,
          status:           data.status,

          // ── The fields the frontend was missing ──────────────────────
          supervisorScore:   data.supervisorScore   ?? null,
          supervisorComment: data.supervisorComment ?? null,
          submissionNote:    data.submissionNote    ?? null,
          fileUrls:          data.fileUrls          ?? [],
          revisionHistory:   data.revisionHistory   ?? [],

          studentNames,
          studentIds:        project?.enrolledStudentIds ?? [],
          supervisorId:      project?.supervisorId       ?? '',
          supervisorName:    project?.supervisorId
                               ? (usersById[project.supervisorId] ?? 'Unknown')
                               : 'Unassigned',

          examinerIds:       data.examinerIds    ?? [],
          examiner1Score:    data.examiner1Score ?? null,
          examiner2Score:    data.examiner2Score ?? null,
          gradeWeights:      data.gradeWeights   ?? null,
          dueDate:           data.dueDate        ?? null,
          defenseDate:       data.defenseDate    ?? null,
          defenseRoom:       data.defenseRoom    ?? null,
        });
      }
    });

    // ── Build final projects list (same as before, now using cached data) ──
    const projects = projectsSnap.docs.map((doc) => {
      const data = doc.data() as ProjectDocument;
      return {
        id:                 doc.id,
        academicYear:       data.academicYear,
        applicationIds:     data.applicationIds,
        createdAt:          data.createdAt,
        degreeType:         data.degreeType,
        descriptionEn:      data.descriptionEn,
        descriptionHe:      data.descriptionHe,
        enrolledStudentIds: data.enrolledStudentIds,
        examinerIds:        data.examinerIds ?? [],
        facultyId:          data.facultyId,
        isArchived:         data.isArchived,
        maxStudents:        data.maxStudents,
        projectType:        data.projectType,
        requiredSkills:     data.requiredSkills,
        semesterStart:      data.semesterStart,
        status:             data.status,
        supervisorId:       data.supervisorId,
        titleEn:            data.titleEn,
        titleHe:            data.titleHe,
        updatedAt:          data.updatedAt,
        supervisorName:     data.supervisorId
                              ? (usersById[data.supervisorId] ?? 'Unknown')
                              : 'Unassigned',
        milestones:         milestonesByProject[doc.id] ?? [],
      };
    });

    return res.status(200).json({
      facultyId,
      projects,
      pendingMilestones,        // ← now populated correctly
      unreadCount: notifSnap.size,
      stats: {
        totalProjects:      projects.length,
        activeProjects:     projects.filter((p) => p.status === 'active' || p.status === 'in_progress').length,
        pendingReviewCount: pendingMilestones.length,
      },
    });

  } catch (error: any) {
    console.error('getCoordinatorDashboard error:', error);
    return res.status(500).json({ message: 'Failed to load coordinator dashboard.' });
  }
};

/** Shared by both the legacy last-stage approve and the chain's last-stage
 *  approve — grade is already final by this point, notify student(s) with
 *  their grade plus the supervisor, best-effort (a notify failure must never
 *  turn an already-committed approval into a 500). */
async function notifyMilestoneApprovalComplete(milestone: FirebaseFirestore.DocumentData, milestoneId: string): Promise<void> {
  const projectId: string | undefined = milestone.projectId;
  const supervisorId: string | undefined = milestone.supervisorId;
  const studentIds: string[] = milestone.studentIds ?? [];
  const finalGradeByStudent: Record<string, number> | undefined = milestone.finalGradeByStudent;
  const milestoneTitle = { he: milestone.nameHe ?? milestone.type ?? '', en: milestone.nameEn ?? milestone.type ?? '' };

  await Promise.all(studentIds.map(async (studentId) => {
    try {
      const grade = finalGradeByStudent?.[studentId] ?? milestone.finalGrade;
      await notifyUser({
        recipientId: studentId,
        type: 'milestone_graded',
        titleHe: 'אבן דרך אושרה על ידי הרכז',
        titleEn: 'Milestone approved by coordinator',
        bodyHe: `אבן הדרך "${milestoneTitle.he}" אושרה${grade != null ? ` עם ציון ${grade}` : ''}. בדוק/י בטאב הציונים של הפרויקט שלך.`,
        bodyEn: `Your milestone "${milestoneTitle.en}" has been approved${grade != null ? ` with grade ${grade}` : ''}. Check your project's Grades section.`,
        relatedProjectId: projectId ?? null,
        relatedMilestoneId: milestoneId,
        emailData: { milestoneTitle, grade: grade != null ? String(grade) : '' },
      });
    } catch (notifyError) {
      console.error(`notifyMilestoneApprovalComplete: student notify failed for ${studentId} on milestone ${milestoneId}:`, notifyError);
    }
  }));

  if (supervisorId) {
    try {
      await notifyUser({
        recipientId: supervisorId,
        type: 'milestone_graded',
        titleHe: 'אבן דרך אושרה',
        titleEn: 'Milestone approved',
        bodyHe: `הרכז אישר את אבן הדרך "${milestoneTitle.he}".`,
        bodyEn: `The coordinator approved milestone "${milestoneTitle.en}".`,
        relatedProjectId: projectId ?? null,
        relatedMilestoneId: milestoneId,
        channels: { email: false, sms: false },
      });
    } catch (notifyError) {
      console.error(`notifyMilestoneApprovalComplete: supervisor notify failed for ${supervisorId} on milestone ${milestoneId}:`, notifyError);
    }
  }
}

/** Chain-aware branch of coordinatorApproveMilestone — advances to the next
 *  configured stage, or (on the chain's last stage) finalizes exactly like
 *  the legacy path does, reusing the same 'coordinator_approved' status and
 *  notification regardless of which role actually approved it. */
async function approveChainMilestone(
  req: AuthenticatedRequest, res: Response, milestoneId: string, milestone: FirebaseFirestore.DocumentData, actorId: string,
): Promise<Response> {
  const routing: ChainStage[] = milestone.routing;
  const currentStageIndex: number = milestone.currentStageIndex ?? 0;
  const stage = routing[currentStageIndex];
  if (!stage || stage.action !== 'approve') {
    return res.status(400).json({ message: 'This milestone is not currently awaiting an approval.' });
  }

  const resource = (await resolveMilestoneScope(milestoneId)) ?? { facultyId: milestone.facultyId ?? '' };
  const projectSupervisorIds = [milestone.supervisorId].filter(Boolean);
  const authorized = await authorizeStageActor(req.user, stage, resource, projectSupervisorIds);
  if (!authorized) return res.status(403).json({ message: 'This milestone is outside your assigned scope for its current stage.' });

  const milestoneRef = db.collection('milestones').doc(milestoneId);
  let previousStatus: string | undefined;
  let finalized = false;
  let finalizedMilestone: FirebaseFirestore.DocumentData | undefined;

  try {
    await db.runTransaction(async (transaction) => {
      const freshSnap = await transaction.get(milestoneRef);
      if (!freshSnap.exists) throw new Error('Milestone not found.');
      const fresh = freshSnap.data()!;
      const freshRouting: ChainStage[] = fresh.routing ?? [];
      const freshIndex: number = fresh.currentStageIndex ?? 0;
      const currentStage = freshRouting[freshIndex];
      if (!currentStage || currentStage.id !== stage.id) {
        throw new Error('This milestone has moved on from this approval stage — refresh and try again.');
      }
      previousStatus = fresh.status;

      const nextStage = freshRouting[freshIndex + 1];
      const update: Record<string, any> = { stageEnteredAt: admin.firestore.FieldValue.serverTimestamp() };
      if (nextStage) {
        update.currentStageIndex = freshIndex + 1;
        update.status = statusForStage(nextStage);
      } else {
        update.status = 'coordinator_approved';
        update.coordinatorApprovedAt = admin.firestore.FieldValue.serverTimestamp();
        update.coordinatorId = actorId;
        finalized = true;
        finalizedMilestone = { ...fresh, ...update };
      }
      transaction.update(milestoneRef, update);
    });

    await logAuditEvent({
      userId: actorId,
      userRole: req.user?.role ?? stage.role,
      action: 'milestone_approved',
      entityType: 'milestone',
      entityId: milestoneId,
      oldValue: { status: previousStatus ?? null },
      newValue: { stageId: stage.id, finalized },
    });

    if (finalized && finalizedMilestone) {
      await notifyMilestoneApprovalComplete(finalizedMilestone, milestoneId);
    }

    return res.status(200).json({
      success: true,
      message: finalized ? 'Milestone approved by coordinator.' : 'Stage approved — advanced to the next reviewer.',
    });
  } catch (error: any) {
    console.error('approveChainMilestone error:', error);
    return res.status(500).json({ message: error.message || 'Failed to approve milestone.' });
  }
}

/**
 * POST /api/coordinator/milestones/:milestoneId/approve
 * Coordinator approves a submitted milestone.
 * Notifies the student and the supervisor.
 * Called by coordinator/home.tsx.
 */
export const coordinatorApproveMilestone = async (req: AuthenticatedRequest, res: Response) => {
  const { milestoneId } = req.params;
  const coordinatorId = req.user?.uid;

  if (!milestoneId || typeof milestoneId !== 'string') {
    return res.status(400).json({ message: 'Invalid or missing milestoneId.' });
  }
  if (!coordinatorId) {
    return res.status(401).json({ message: 'Unauthorized.' });
  }

  // Chain-driven (non-defense) milestone — the stage acting now might not be
  // coordinator-tier at all (could be faculty_admin, grad_school_head, ...),
  // so this bypasses the COORDINATOR_ROLES gate below entirely in favor of
  // authorizeStageActor, which checks the milestone's own configured chain.
  const preSnap = await db.collection('milestones').doc(milestoneId).get();
  if (!preSnap.exists) return res.status(404).json({ message: 'Milestone not found.' });
  const preData = preSnap.data()!;
  if (isChainDriven(preData)) {
    return approveChainMilestone(req, res, milestoneId, preData, coordinatorId);
  }

  if (!req.user?.role || !COORDINATOR_ROLES.includes(req.user.role)) {
    return res.status(403).json({ message: 'Access denied: coordinator only.' });
  }

  const approveMilestoneScope = await resolveMilestoneScope(milestoneId);
  if (!approveMilestoneScope) {
    return res.status(404).json({ message: 'Milestone not found.' });
  }
  if (!withinCoordinatorScope(req.user, approveMilestoneScope) && !hasActionGrant(req.user, 'approve_milestones', approveMilestoneScope)) {
    return res.status(403).json({ message: 'This milestone is outside your assigned scope.' });
  }

  let previousStatus: string | undefined;
  // Captured from the transaction's read so email/push/SMS (external I/O —
  // never allowed inside db.runTransaction) can fire after it commits.
  let approvedMilestone: FirebaseFirestore.DocumentData | undefined;
  try {
    await db.runTransaction(async (transaction) => {
      const milestoneRef = db.collection('milestones').doc(milestoneId);
      const milestoneSnap = await transaction.get(milestoneRef);

      if (!milestoneSnap.exists) {
        throw new Error('Milestone not found.');
      }

      const milestone = milestoneSnap.data()!;
      previousStatus = milestone.status;
      approvedMilestone = milestone;

      // 1. Update milestone status
      transaction.update(milestoneRef, {
        status: 'coordinator_approved',
        coordinatorApprovedAt: admin.firestore.FieldValue.serverTimestamp(),
        coordinatorId,
      });
    });

    await logAuditEvent({
      userId: coordinatorId,
      userRole: req.user?.role ?? 'coordinator',
      action: 'milestone_approved',
      entityType: 'milestone',
      entityId: milestoneId,
      oldValue: { status: previousStatus ?? null },
      newValue: { status: 'coordinator_approved' },
    });

    // Notify students (grade is already final by the time a coordinator
    // approves — see projectController.ts's submitMilestoneGrade) + the
    // supervisor, best-effort — a notify failure must never turn an
    // already-committed approval into a 500.
    if (approvedMilestone) {
      const milestone = approvedMilestone;
      const projectId: string | undefined = milestone.projectId;
      const supervisorId: string | undefined = milestone.supervisorId;
      const studentIds: string[] = milestone.studentIds ?? [];
      const finalGradeByStudent: Record<string, number> | undefined = milestone.finalGradeByStudent;
      const milestoneTitle = { he: milestone.nameHe ?? milestone.type ?? '', en: milestone.nameEn ?? milestone.type ?? '' };

      await Promise.all(studentIds.map(async (studentId) => {
        try {
          const grade = finalGradeByStudent?.[studentId] ?? milestone.finalGrade;
          await notifyUser({
            recipientId: studentId,
            type: 'milestone_graded',
            titleHe: 'אבן דרך אושרה על ידי הרכז',
            titleEn: 'Milestone approved by coordinator',
            bodyHe: `אבן הדרך "${milestoneTitle.he}" אושרה${grade != null ? ` עם ציון ${grade}` : ''}. בדוק/י בטאב הציונים של הפרויקט שלך.`,
            bodyEn: `Your milestone "${milestoneTitle.en}" has been approved${grade != null ? ` with grade ${grade}` : ''}. Check your project's Grades section.`,
            relatedProjectId: projectId ?? null,
            relatedMilestoneId: milestoneId,
            emailData: { milestoneTitle, grade: grade != null ? String(grade) : '' },
          });
        } catch (notifyError) {
          console.error(`coordinatorApproveMilestone: student notify failed for ${studentId} on milestone ${milestoneId}:`, notifyError);
        }
      }));

      if (supervisorId) {
        try {
          await notifyUser({
            recipientId: supervisorId,
            type: 'milestone_graded',
            titleHe: 'אבן דרך אושרה',
            titleEn: 'Milestone approved',
            bodyHe: `הרכז אישר את אבן הדרך "${milestoneTitle.he}".`,
            bodyEn: `The coordinator approved milestone "${milestoneTitle.en}".`,
            relatedProjectId: projectId ?? null,
            relatedMilestoneId: milestoneId,
            channels: { email: false, sms: false },
          });
        } catch (notifyError) {
          console.error(`coordinatorApproveMilestone: supervisor notify failed for ${supervisorId} on milestone ${milestoneId}:`, notifyError);
        }
      }
    }

    return res.status(200).json({ success: true, message: 'Milestone approved by coordinator.' });
  } catch (error: any) {
    console.error('coordinatorApproveMilestone error:', error);
    return res.status(500).json({ message: error.message || 'Failed to approve milestone.' });
  }
};

/** Chain-aware branch of coordinatorRejectMilestone. `rejectTo === 'student'`
 *  behaves exactly like the legacy path (status:'rejected', chain restarts
 *  at stage 0, student+supervisor notified). Any other rejectTo is a silent
 *  staff-internal reroute: currentStageIndex jumps to that stage, status
 *  becomes whatever that stage's action maps to, and ONLY that stage's
 *  resolved staff are notified — the student sees no rejection at all. */
async function rejectChainMilestone(
  req: AuthenticatedRequest, res: Response, milestoneId: string, milestone: FirebaseFirestore.DocumentData, actorId: string, reason: string,
): Promise<Response> {
  const routing: ChainStage[] = milestone.routing;
  const currentStageIndex: number = milestone.currentStageIndex ?? 0;
  const stage = routing[currentStageIndex];
  if (!stage || stage.action !== 'approve') {
    return res.status(400).json({ message: 'This milestone is not currently awaiting an approval, so it cannot be rejected here.' });
  }

  const resource = (await resolveMilestoneScope(milestoneId)) ?? { facultyId: milestone.facultyId ?? '' };
  const projectSupervisorIds = [milestone.supervisorId].filter(Boolean);
  const authorized = await authorizeStageActor(req.user, stage, resource, projectSupervisorIds);
  if (!authorized) return res.status(403).json({ message: 'This milestone is outside your assigned scope for its current stage.' });

  const rejectsToStudent = stage.rejectTo === 'student';
  const targetIndex = rejectsToStudent ? -1 : routing.findIndex((s) => s.id === stage.rejectTo);
  if (!rejectsToStudent && targetIndex === -1) {
    // Should never happen — workflowTemplateController.ts's validateRoutingChain
    // rejects a rejectTo that doesn't resolve to a real stage id at proposal
    // time. Fail closed rather than silently mis-routing if it somehow does.
    return res.status(400).json({ message: "This stage's configured rejection target no longer exists in the chain." });
  }

  const milestoneRef = db.collection('milestones').doc(milestoneId);
  let previousStatus: string | undefined;
  let rejectedMilestone: FirebaseFirestore.DocumentData | undefined;

  try {
    await db.runTransaction(async (transaction) => {
      const freshSnap = await transaction.get(milestoneRef);
      if (!freshSnap.exists) throw new Error('Milestone not found.');
      const fresh = freshSnap.data()!;
      const freshRouting: ChainStage[] = fresh.routing ?? [];
      const freshIndex: number = fresh.currentStageIndex ?? 0;
      const currentStage = freshRouting[freshIndex];
      if (!currentStage || currentStage.id !== stage.id) {
        throw new Error('This milestone has moved on from this approval stage — refresh and try again.');
      }
      previousStatus = fresh.status;
      rejectedMilestone = fresh;

      if (rejectsToStudent) {
        transaction.update(milestoneRef, {
          status: 'rejected',
          currentStageIndex: 0,
          coordinatorRejectedAt: admin.firestore.FieldValue.serverTimestamp(),
          coordinatorId: actorId,
          rejectionReason: reason,
          stageEnteredAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        const studentIds: string[] = fresh.studentIds ?? [];
        studentIds.forEach((studentId) => {
          transaction.set(db.collection('notifications').doc(), {
            recipientId: studentId,
            type: 'milestone_coordinator_rejected',
            titleHe: 'אבן דרך נדחתה',
            titleEn: 'Milestone rejected',
            bodyHe: `אבן הדרך "${fresh.nameEn ?? fresh.type}" נדחתה. סיבה: ${reason}`,
            bodyEn: `Milestone "${fresh.nameEn ?? fresh.type}" was rejected. Reason: ${reason}`,
            isRead: false,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            relatedProjectId: fresh.projectId ?? null,
            relatedMilestoneId: milestoneId,
            chatId: null,
          });
        });
        if (fresh.supervisorId) {
          transaction.set(db.collection('notifications').doc(), {
            recipientId: fresh.supervisorId,
            type: 'milestone_coordinator_rejected',
            titleHe: 'אבן דרך נדחתה על ידי הרכז',
            titleEn: 'Milestone rejected by coordinator',
            bodyHe: `הרכז דחה את אבן הדרך "${fresh.nameEn ?? fresh.type}". סיבה: ${reason}`,
            bodyEn: `The coordinator rejected milestone "${fresh.nameEn ?? fresh.type}". Reason: ${reason}`,
            isRead: false,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            relatedProjectId: fresh.projectId ?? null,
            relatedMilestoneId: milestoneId,
            chatId: null,
          });
        }
      } else {
        const targetStage = freshRouting[targetIndex]!;
        transaction.update(milestoneRef, {
          status: statusForStage(targetStage),
          currentStageIndex: targetIndex,
          stageEnteredAt: admin.firestore.FieldValue.serverTimestamp(),
          // Deliberately no coordinatorRejectedAt/rejectionReason/status:
          // 'rejected' here — this is an internal staff reroute, not a
          // student-facing rejection (see the "fully silent" scope decision).
        });
      }
    });

    await logAuditEvent({
      userId: actorId,
      userRole: req.user?.role ?? stage.role,
      action: 'milestone_rejected',
      entityType: 'milestone',
      entityId: milestoneId,
      oldValue: { status: previousStatus ?? null },
      newValue: { stageId: stage.id, rejectTo: stage.rejectTo },
      explanation: reason,
    });

    // Silent reroute's notification needs an async role→uid resolution, so
    // it happens after the transaction commits — same "external I/O never
    // inside db.runTransaction" rule the legacy path already follows.
    if (!rejectsToStudent && rejectedMilestone) {
      const targetStage = routing[targetIndex]!;
      const targetUids = await resolveStaffForScope(targetStage.role, resource, projectSupervisorIds);
      const milestoneTitle = { he: rejectedMilestone.nameHe ?? rejectedMilestone.type ?? '', en: rejectedMilestone.nameEn ?? rejectedMilestone.type ?? '' };
      await Promise.all(targetUids.map(async (uid) => {
        try {
          await notifyUser({
            recipientId: uid,
            type: 'general',
            titleHe: 'אבן דרך הוחזרה אליך לבדיקה',
            titleEn: 'A milestone was routed back to you',
            bodyHe: `אבן הדרך "${milestoneTitle.he}" הוחזרה לבדיקתך. סיבה: ${reason}`,
            bodyEn: `Milestone "${milestoneTitle.en}" was routed back to you for review. Reason: ${reason}`,
            relatedProjectId: rejectedMilestone!.projectId ?? null,
            relatedMilestoneId: milestoneId,
            channels: { email: false, sms: false },
          });
        } catch (notifyError) {
          console.error(`rejectChainMilestone: reroute notify failed for ${uid} on milestone ${milestoneId}:`, notifyError);
        }
      }));
    }

    return res.status(200).json({
      success: true,
      message: rejectsToStudent ? 'Milestone rejected.' : 'Milestone routed back internally.',
    });
  } catch (error: any) {
    console.error('rejectChainMilestone error:', error);
    return res.status(500).json({ message: error.message || 'Failed to reject milestone.' });
  }
}

/**
 * POST /api/coordinator/milestones/:milestoneId/reject
 * Coordinator rejects a submitted milestone with a reason.
 * Body: { reason: string }
 * Notifies the student and the supervisor.
 * Called by coordinator/home.tsx.
 */
export const coordinatorRejectMilestone = async (req: AuthenticatedRequest, res: Response) => {
  const { milestoneId } = req.params;
  const { reason } = req.body;
  const coordinatorId = req.user?.uid;

  if (!milestoneId || typeof milestoneId !== 'string') {
    return res.status(400).json({ message: 'Invalid or missing milestoneId.' });
  }
  if (!coordinatorId) {
    return res.status(401).json({ message: 'Unauthorized.' });
  }
  if (!reason || typeof reason !== 'string') {
    return res.status(400).json({ message: 'A rejection reason is required.' });
  }

  const preSnap = await db.collection('milestones').doc(milestoneId).get();
  if (!preSnap.exists) return res.status(404).json({ message: 'Milestone not found.' });
  const preData = preSnap.data()!;
  if (isChainDriven(preData)) {
    return rejectChainMilestone(req, res, milestoneId, preData, coordinatorId, reason);
  }

  if (!req.user?.role || !COORDINATOR_ROLES.includes(req.user.role)) {
    return res.status(403).json({ message: 'Access denied: coordinator only.' });
  }

  const rejectMilestoneScope = await resolveMilestoneScope(milestoneId);
  if (!rejectMilestoneScope) {
    return res.status(404).json({ message: 'Milestone not found.' });
  }
  if (!withinCoordinatorScope(req.user, rejectMilestoneScope) && !hasActionGrant(req.user, 'approve_milestones', rejectMilestoneScope)) {
    return res.status(403).json({ message: 'This milestone is outside your assigned scope.' });
  }

  let previousStatus: string | undefined;
  try {
    await db.runTransaction(async (transaction) => {
      const milestoneRef = db.collection('milestones').doc(milestoneId);
      const milestoneSnap = await transaction.get(milestoneRef);

      if (!milestoneSnap.exists) {
        throw new Error('Milestone not found.');
      }

      const milestone = milestoneSnap.data()!;
      const { projectId, supervisorId } = milestone;
      const studentIds: string[] = milestone.studentIds ?? [];
      previousStatus = milestone.status;

      // 1. Revert milestone to pending so it can be resubmitted
      transaction.update(milestoneRef, {
        status: 'rejected',
        coordinatorRejectedAt: admin.firestore.FieldValue.serverTimestamp(),
        coordinatorId,
        rejectionReason: reason,
      });

      // 2. Notify each student
      studentIds.forEach((studentId) => {
        const notifRef = db.collection('notifications').doc();
        transaction.set(notifRef, {
          recipientId: studentId,
          type: 'milestone_coordinator_rejected',
          titleHe: 'אבן דרך נדחתה',
          titleEn: 'Milestone rejected',
          bodyHe: `אבן הדרך "${milestone.nameEn ?? milestone.type}" נדחתה. סיבה: ${reason}`,
          bodyEn: `Milestone "${milestone.nameEn ?? milestone.type}" was rejected. Reason: ${reason}`,
          isRead: false,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          relatedProjectId: projectId ?? null,
          relatedMilestoneId: milestoneId,
          chatId: null,
        });
      });

      // 3. Notify supervisor
      if (supervisorId) {
        const supNotifRef = db.collection('notifications').doc();
        transaction.set(supNotifRef, {
          recipientId: supervisorId,
          type: 'milestone_coordinator_rejected',
          titleHe: 'אבן דרך נדחתה על ידי הרכז',
          titleEn: 'Milestone rejected by coordinator',
          bodyHe: `הרכז דחה את אבן הדרך "${milestone.nameEn ?? milestone.type}". סיבה: ${reason}`,
          bodyEn: `The coordinator rejected milestone "${milestone.nameEn ?? milestone.type}". Reason: ${reason}`,
          isRead: false,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          relatedProjectId: projectId ?? null,
          relatedMilestoneId: milestoneId,
          chatId: null,
        });
      }
    });

    await logAuditEvent({
      userId: coordinatorId,
      userRole: req.user?.role ?? 'coordinator',
      action: 'milestone_rejected',
      entityType: 'milestone',
      entityId: milestoneId,
      oldValue: { status: previousStatus ?? null },
      newValue: { status: 'rejected' },
      explanation: reason,
    });

    return res.status(200).json({ success: true, message: 'Milestone rejected.' });
  } catch (error: any) {
    console.error('coordinatorRejectMilestone error:', error);
    return res.status(500).json({ message: error.message || 'Failed to reject milestone.' });
  }
};

// Buildings 1-9 exist physically, but building 9 is under construction and
// not usable for defenses yet — keep this list as the single source of
// truth so the allowed range only needs to change here once 9 reopens.
export const DEFENSE_ALLOWED_BUILDINGS = ['1', '2', '3', '4', '5', '6', '7', '8'];

/**
 * POST /api/coordinator/projects/:projectId/assign-defense
 * (also mounted at /api/project-coordinator/... and /api/admin/... for the
 * administrative_secretary and system_admin roles — same handler, same rules)
 * Sets time/room/building for a defense whose DATE has already been locked
 * in by the examiner date-matching flow (services/defenseScheduling.ts) —
 * the coordinator no longer picks the date here, only the logistics.
 * Body: { time: string (HH:mm), room: string, building: string ('1'-'8') }
 * Notifies the student(s), supervisor, and each internal examiner.
 */
export const assignDefense = async (req: AuthenticatedRequest, res: Response) => {
  const { projectId } = req.params;
  const { time, room, building, onlineDefenseLink } = req.body;
  const coordinatorId = req.user?.uid;

  if (!projectId || typeof projectId !== 'string') {
    return res.status(400).json({ message: 'Invalid or missing projectId.' });
  }
  if (!coordinatorId) {
    return res.status(401).json({ message: 'Unauthorized.' });
  }
  if (!req.user?.role || !COORDINATOR_ROLES.includes(req.user.role)) {
    return res.status(403).json({ message: 'You do not have permission to set defense logistics.' });
  }
  const defenseScope = await resolveProjectScope(projectId);
  if (!defenseScope) {
    return res.status(404).json({ message: 'Project not found.' });
  }
  if (!withinCoordinatorScope(req.user, defenseScope) && !hasActionGrant(req.user, 'assign_supervisor_examiner', defenseScope)) {
    return res.status(403).json({ message: 'This project is outside your assigned scope.' });
  }
  if (!time || !room || !building) {
    return res.status(400).json({ message: 'time, room, and building are all required.' });
  }
  if (!DEFENSE_ALLOWED_BUILDINGS.includes(String(building))) {
    return res.status(400).json({
      message: 'Building 9 is under construction and unavailable. Please choose a building from 1-8.',
    });
  }
  // Optional — a remote/hybrid defense may add a meeting link alongside the
  // physical room; not required since most defenses stay in-person only.
  if (onlineDefenseLink !== undefined && onlineDefenseLink !== null && onlineDefenseLink !== '') {
    if (typeof onlineDefenseLink !== 'string' || !/^https?:\/\//i.test(onlineDefenseLink)) {
      return res.status(400).json({ message: 'onlineDefenseLink must be a valid http(s) URL.' });
    }
  }

  try {
    const defenseMilestonesSnap = await db.collection('milestones')
      .where('projectId', '==', projectId)
      .where('type', '==', 'defense')
      .limit(1)
      .get();
    if (defenseMilestonesSnap.empty) {
      return res.status(404).json({ message: 'No defense milestone found for this project.' });
    }
    const defenseMilestoneRef = defenseMilestonesSnap.docs[0]!.ref;

    await db.runTransaction(async (transaction) => {
      const projectRef = db.collection('projects').doc(projectId);
      const projectSnap = await transaction.get(projectRef);
      if (!projectSnap.exists) throw new Error('Project not found.');
      const project = projectSnap.data()!;

      const milestoneSnap = await transaction.get(defenseMilestoneRef);
      const milestone = milestoneSnap.data()!;
      if (milestone.status !== 'defense_date_set') {
        throw new Error('Cannot set time/room/building before a defense date has been confirmed.');
      }

      const studentIds: string[] = project.enrolledStudentIds ?? [];
      const supervisorId: string | null = project.supervisorId ?? null;
      const panel: Array<{ type: 'internal' | 'external'; ref: string }> = milestone.defensePanel ?? [];
      const internalExaminerIds = panel.filter((m) => m.type === 'internal').map((m) => m.ref);

      const onlineLink: string | null = onlineDefenseLink || null;

      // 1. Stamp logistics onto the project document
      transaction.update(projectRef, {
        defenseRoom: room,
        defenseBuilding: building,
        defenseTime: time,
        onlineDefenseLink: onlineLink,
        defenseExaminerIds: internalExaminerIds,
        status: 'defense_scheduled',
        defenseSchedulingState: 'scheduled',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // 2. Stamp logistics onto the defense milestone
      transaction.update(defenseMilestoneRef, {
        defenseRoom: room,
        defenseBuilding: building,
        defenseTime: time,
        onlineDefenseLink: onlineLink,
        examinerIds: internalExaminerIds,
        status: 'scheduled',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      const dateLabel = milestone.dueDate?.toDate?.().toLocaleDateString('en-GB') ?? '';
      const logisticsLabel = `${time} · ${room}, ${building}${onlineLink ? ` · ${onlineLink}` : ''}`;

      // 3. Notify students
      studentIds.forEach((studentId) => {
        transaction.set(db.collection('notifications').doc(), {
          recipientId: studentId,
          type: 'defense_scheduled',
          priority: 'normal',
          titleHe: 'פרטי ההגנה עודכנו',
          titleEn: 'Defense logistics set',
          bodyHe: `ההגנה שלך ב-${dateLabel} תתקיים בשעה ${time}, חדר ${room}, בניין ${building}.`,
          bodyEn: `Your defense on ${dateLabel} will be at ${logisticsLabel}.`,
          isRead: false,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          relatedProjectId: projectId,
          relatedMilestoneId: defenseMilestoneRef.id,
          chatId: null,
        });
      });

      // 4. Notify supervisor
      if (supervisorId) {
        transaction.set(db.collection('notifications').doc(), {
          recipientId: supervisorId,
          type: 'defense_scheduled',
          priority: 'normal',
          titleHe: 'פרטי הגנה עודכנו לפרויקט',
          titleEn: 'Defense logistics set for project',
          bodyHe: `ההגנה ב-${dateLabel} תתקיים ב${logisticsLabel}.`,
          bodyEn: `The defense on ${dateLabel} will be at ${logisticsLabel}.`,
          isRead: false,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          relatedProjectId: projectId,
          relatedMilestoneId: defenseMilestoneRef.id,
          chatId: null,
        });
      }

      // 5. Notify each internal examiner (external examiners get this via
      //    their defense-day access grant email instead — they have no
      //    in-app notifications inbox before that grant exists)
      internalExaminerIds.forEach((examinerId) => {
        transaction.set(db.collection('notifications').doc(), {
          recipientId: examinerId,
          type: 'defense_scheduled',
          priority: 'normal',
          titleHe: 'פרטי הגנה עודכנו',
          titleEn: 'Defense logistics set',
          bodyHe: `ההגנה ב-${dateLabel} תתקיים ב${logisticsLabel}.`,
          bodyEn: `Defense on ${dateLabel} will be at ${logisticsLabel}.`,
          isRead: false,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          relatedProjectId: projectId,
          relatedMilestoneId: defenseMilestoneRef.id,
          chatId: null,
        });
      });
    });

    return res.status(200).json({ success: true, message: 'Defense logistics saved successfully.' });
  } catch (error: any) {
    console.error('assignDefense error:', error);
    return res.status(500).json({ message: error.message || 'Failed to save defense logistics.' });
  }
};

/**
 * POST /api/coordinator/milestones/:milestoneId/resolve-date-conflict
 * Resolves a defense milestone stuck in `date_conflict` (the 2 examiners
 * had no common date). Body:
 *   { action: 'keep_examiners' }
 *   { action: 'replace_examiner'; replacedExaminerKey: string; newExaminer: ExaminerAssignmentInput }
 */
export const resolveDefenseDateConflict = async (req: AuthenticatedRequest, res: Response) => {
  const { milestoneId } = req.params;
  const { action, replacedExaminerKey, newExaminer } = req.body;
  const coordinatorId = req.user?.uid;

  if (!milestoneId || typeof milestoneId !== 'string') {
    return res.status(400).json({ message: 'Invalid or missing milestoneId.' });
  }
  if (!coordinatorId) {
    return res.status(401).json({ message: 'Unauthorized.' });
  }
  if (!req.user?.role || !COORDINATOR_ROLES.includes(req.user.role)) {
    return res.status(403).json({ message: 'Access denied: coordinator only.' });
  }
  const conflictScope = await resolveMilestoneScope(milestoneId);
  if (!conflictScope) {
    return res.status(404).json({ message: 'Milestone not found.' });
  }
  if (!withinCoordinatorScope(req.user, conflictScope) && !hasActionGrant(req.user, 'assign_supervisor_examiner', conflictScope)) {
    return res.status(403).json({ message: 'This milestone is outside your assigned scope.' });
  }

  try {
    if (action === 'keep_examiners') {
      const { date } = await resolveKeepExaminers(milestoneId, coordinatorId);
      return res.status(200).json({ success: true, message: 'Defense date auto-selected.', date });
    }

    if (action === 'replace_examiner') {
      if (!replacedExaminerKey || typeof replacedExaminerKey !== 'string') {
        return res.status(400).json({ message: 'replacedExaminerKey is required.' });
      }
      if (!newExaminer || typeof newExaminer !== 'object') {
        return res.status(400).json({ message: 'newExaminer is required.' });
      }
      await resolveReplaceExaminer(milestoneId, coordinatorId, replacedExaminerKey, newExaminer as ExaminerAssignmentInput);
      return res.status(200).json({ success: true, message: 'Examiner replaced — awaiting new date submission.' });
    }

    return res.status(400).json({ message: "action must be 'keep_examiners' or 'replace_examiner'." });
  } catch (error: any) {
    console.error('resolveDefenseDateConflict error:', error);
    return res.status(500).json({ message: error.message || 'Failed to resolve date conflict.' });
  }
};