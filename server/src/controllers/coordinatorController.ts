import admin from 'firebase-admin';
import { Request, Response } from 'express';
import { db } from '../config/firebase.js';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { assignExaminersAndNotify, ExaminerAssignmentInput } from '../services/examinerAccess.js';
import {
  initDefenseScheduling,
  resolveKeepExaminers,
  resolveReplaceExaminer,
  type DefensePanelMember,
} from '../services/defenseScheduling.js';

/**
 * Builds the 2-member defense panel from an assignExaminersAndNotify() result
 * and opens the defense date-matching window for it. Only fires once exactly
 * 2 examiners were assigned — a defense panel is always 2 people; assignments
 * of 1 (e.g. re-assigning a single examiner) don't start scheduling.
 */
async function maybeOpenDefenseScheduling(
  projectId: string,
  result: { internalUids: string[]; externalNotified: Array<{ name: string; email: string; token: string }> },
): Promise<void> {
  const internalMembers: DefensePanelMember[] = await Promise.all(
    result.internalUids.map(async (uid) => {
      const userSnap = await db.collection('users').doc(uid).get();
      return { type: 'internal' as const, ref: uid, displayName: userSnap.data()?.displayName ?? 'Unknown' };
    }),
  );
  const externalMembers: DefensePanelMember[] = result.externalNotified.map((e) => ({
    type: 'external' as const, ref: e.token, displayName: e.name, email: e.email,
  }));
  const panel = [...internalMembers, ...externalMembers];

  if (panel.length !== 2) return;

  try {
    await initDefenseScheduling(projectId, panel);
  } catch (error) {
    // Most commonly: no 'defense' milestone exists yet for this project.
    // Don't fail the examiner-assignment request over it — log for follow-up.
    console.error(`Failed to open defense scheduling for project ${projectId}:`, error);
  }
}

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
const COORDINATOR_ROLES = ['coordinator', 'project_coordinator', 'system_admin'];

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
  const { examiners, examinerIds, milestoneId, studentIds } = req.body;

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

  try {
    const projectRef = db.collection('projects').doc(projectId);
    const projectSnap = await projectRef.get();

    if (!projectSnap.exists) {
      return res.status(404).json({ message: 'Project not found' });
    }
    const project = projectSnap.data()!;

    let thesisUrl = '';
    if (typeof milestoneId === 'string' && milestoneId) {
      const milestoneSnap = await db.collection('milestones').doc(milestoneId).get();
      thesisUrl = milestoneSnap.data()?.fileUrls?.[0] ?? '';
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
      lang: 'he',
    });

    await projectRef.update({
      examinerIds: result.internalUids,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await maybeOpenDefenseScheduling(projectId, result);

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
  const facultyId = req.user?.facultyId;
  if (!facultyId) return res.status(400).json({ message: 'Coordinator has no facultyId assigned.' });

  try {
    const snap = await db.collection('examinerRecommendations')
      .where('facultyId', '==', facultyId)
      .where('status', '==', 'pending')
      .get();

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

    const studentSnaps = await Promise.all(
      (project.enrolledStudentIds ?? []).map((sid: string) => db.collection('users').doc(sid).get())
    );
    const studentName = studentSnaps.map((s) => s.data()?.displayName).filter(Boolean).join(', ');

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

    await maybeOpenDefenseScheduling(projectId, result);

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

      if (!milestonesByProject[pid]) milestonesByProject[pid] = [];
      milestonesByProject[pid].push({ id: doc.id, ...data });

      // ── pendingMilestones: submitted, supervisor_graded, graded, or coordinator_approved ──
      if (
        data.status === 'submitted' ||
        data.status === 'supervisor_graded' ||
        data.status === 'graded' ||
        data.status === 'coordinator_approved'
      ) {
        const studentNames = (project?.enrolledStudentIds ?? [])
          .map((id: string) => usersById[id] ?? id);

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
  if (!req.user?.role || !COORDINATOR_ROLES.includes(req.user.role)) {
    return res.status(403).json({ message: 'Access denied: coordinator only.' });
  }

  try {
    await db.runTransaction(async (transaction) => {
      const milestoneRef = db.collection('milestones').doc(milestoneId);
      const milestoneSnap = await transaction.get(milestoneRef);

      if (!milestoneSnap.exists) {
        throw new Error('Milestone not found.');
      }

      const milestone = milestoneSnap.data()!;
      const { projectId, supervisorId } = milestone;

      // Resolve student IDs — stored as array on milestones
      const studentIds: string[] = milestone.studentIds ?? [];

      // 1. Update milestone status
      transaction.update(milestoneRef, {
        status: 'coordinator_approved',
        coordinatorApprovedAt: admin.firestore.FieldValue.serverTimestamp(),
        coordinatorId,
      });

      // 2. Notify each student
      studentIds.forEach((studentId) => {
        const notifRef = db.collection('notifications').doc();
        transaction.set(notifRef, {
          recipientId: studentId,
          type: 'milestone_coordinator_approved',
          titleHe: 'אבן דרך אושרה על ידי הרכז',
          titleEn: 'Milestone approved by coordinator',
          bodyHe: `אבן הדרך "${milestone.nameEn ?? milestone.type}" אושרה.`,
          bodyEn: `Your milestone "${milestone.nameEn ?? milestone.type}" has been approved.`,
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
          type: 'milestone_coordinator_approved',
          titleHe: 'אבן דרך אושרה',
          titleEn: 'Milestone approved',
          bodyHe: `הרכז אישר את אבן הדרך "${milestone.nameEn ?? milestone.type}".`,
          bodyEn: `The coordinator approved milestone "${milestone.nameEn ?? milestone.type}".`,
          isRead: false,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          relatedProjectId: projectId ?? null,
          relatedMilestoneId: milestoneId,
          chatId: null,
        });
      }
    });

    return res.status(200).json({ success: true, message: 'Milestone approved by coordinator.' });
  } catch (error: any) {
    console.error('coordinatorApproveMilestone error:', error);
    return res.status(500).json({ message: error.message || 'Failed to approve milestone.' });
  }
};

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
  if (!req.user?.role || !COORDINATOR_ROLES.includes(req.user.role)) {
    return res.status(403).json({ message: 'Access denied: coordinator only.' });
  }
  if (!reason || typeof reason !== 'string') {
    return res.status(400).json({ message: 'A rejection reason is required.' });
  }

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
 * project_coordinator and system_admin roles — same handler, same rules)
 * Sets time/room/building for a defense whose DATE has already been locked
 * in by the examiner date-matching flow (services/defenseScheduling.ts) —
 * the coordinator no longer picks the date here, only the logistics.
 * Body: { time: string (HH:mm), room: string, building: string ('1'-'8') }
 * Notifies the student(s), supervisor, and each internal examiner.
 */
export const assignDefense = async (req: AuthenticatedRequest, res: Response) => {
  const { projectId } = req.params;
  const { time, room, building } = req.body;
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
  if (!time || !room || !building) {
    return res.status(400).json({ message: 'time, room, and building are all required.' });
  }
  if (!DEFENSE_ALLOWED_BUILDINGS.includes(String(building))) {
    return res.status(400).json({
      message: 'Building 9 is under construction and unavailable. Please choose a building from 1-8.',
    });
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

      // 1. Stamp logistics onto the project document
      transaction.update(projectRef, {
        defenseRoom: room,
        defenseBuilding: building,
        defenseTime: time,
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
        examinerIds: internalExaminerIds,
        status: 'scheduled',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      const dateLabel = milestone.dueDate?.toDate?.().toLocaleDateString('en-GB') ?? '';
      const logisticsLabel = `${time} · ${room}, ${building}`;

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