import admin from 'firebase-admin';
import { Request, Response } from 'express';
import { db } from '../config/firebase.js';
import { AuthenticatedRequest } from '../middleware/auth.js';

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

/**
 * POST /api/coordinator/projects/:projectId/assign-examiners
 */
export const assignExaminers = async (req: Request, res: Response) => {
  const { projectId } = req.params;
  const { examinerIds } = req.body;

  if (!Array.isArray(examinerIds) || examinerIds.length === 0) {
    return res.status(400).json({ message: 'Invalid examiner list' });
  }
  if (typeof projectId !== 'string' || !projectId) {
    return res.status(400).json({ message: 'Invalid or missing projectId' });
  }

  try {
    const projectRef = db.collection('projects').doc(projectId);
    const projectSnap = await projectRef.get();

    if (!projectSnap.exists) {
      return res.status(404).json({ message: 'Project not found' });
    }

    await projectRef.update({
      examinerIds,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.status(200).json({ message: 'Examiners assigned' });
  } catch (error) {
    console.error('Assignment failed:', error);
    res.status(500).json({ message: 'Failed to assign examiners' });
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

      // ── pendingMilestones: submitted or supervisor_graded ─────────────
      if (data.status === 'submitted' || data.status === 'supervisor_graded' || data.status === 'graded') {
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

/**
 * POST /api/coordinator/projects/:projectId/assign-defense
 * Schedules a defense date for a project and assigns the defense panel.
 * Body: { defenseDate: string (ISO), location?: string, examinerIds?: string[] }
 * Notifies the student(s), supervisor, and each examiner.
 * Called by coordinator/home.tsx.
 */
export const assignDefense = async (req: AuthenticatedRequest, res: Response) => {
  const { projectId } = req.params;
  const { defenseDate, location, examinerIds } = req.body;
  const coordinatorId = req.user?.uid;

  if (!projectId || typeof projectId !== 'string') {
    return res.status(400).json({ message: 'Invalid or missing projectId.' });
  }
  if (!coordinatorId) {
    return res.status(401).json({ message: 'Unauthorized.' });
  }
  if (!defenseDate) {
    return res.status(400).json({ message: 'defenseDate is required.' });
  }

  const parsedDate = new Date(defenseDate);
  if (isNaN(parsedDate.getTime())) {
    return res.status(400).json({ message: 'defenseDate is not a valid ISO date string.' });
  }

  try {
    await db.runTransaction(async (transaction) => {
      const projectRef = db.collection('projects').doc(projectId);
      const projectSnap = await transaction.get(projectRef);

      if (!projectSnap.exists) {
        throw new Error('Project not found.');
      }

      const project = projectSnap.data()!;
      const studentIds: string[] = project.studentIds ?? [];
      const supervisorId: string | null = project.supervisorId ?? null;
      const resolvedExaminerIds: string[] = examinerIds ?? project.examinerIds ?? [];

      // 1. Stamp the defense slot onto the project document
      transaction.update(projectRef, {
        defenseDate: admin.firestore.Timestamp.fromDate(parsedDate),
        defenseLocation: location ?? null,
        defenseExaminerIds: resolvedExaminerIds,
        status: 'defense_scheduled',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // 2. Find the defense milestone and update it too
      //    (we can't query inside a transaction, so we do a regular get beforehand)
      const defenseMilestonesSnap = await db.collection('milestones')
        .where('projectId', '==', projectId)
        .where('type', '==', 'defense')
        .limit(1)
        .get();
      if(!defenseMilestonesSnap.docs[0]){
        return res.status(500).json({
          message: "Error inside assignDefense about defenseMilestonesSnap.docs[0] incorrect"
        })
      }
      if (!defenseMilestonesSnap.empty) {
        const defenseMilestoneRef = defenseMilestonesSnap.docs[0].ref;
        transaction.update(defenseMilestoneRef, {
          dueDate: admin.firestore.Timestamp.fromDate(parsedDate),
          defenseLocation: location ?? null,
          examinerIds: resolvedExaminerIds,
          status: 'scheduled',
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      const dateLabel = parsedDate.toLocaleDateString('en-GB');

      // 3. Notify students
      studentIds.forEach((studentId) => {
        const notifRef = db.collection('notifications').doc();
        transaction.set(notifRef, {
          recipientId: studentId,
          type: 'defense_scheduled',
          titleHe: 'נקבע מועד הגנה',
          titleEn: 'Defense date scheduled',
          bodyHe: `ההגנה שלך נקבעה ל-${dateLabel}${location ? ` במיקום: ${location}` : ''}.`,
          bodyEn: `Your defense is scheduled for ${dateLabel}${location ? ` at ${location}` : ''}.`,
          isRead: false,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          relatedProjectId: projectId,
          relatedMilestoneId: null,
          chatId: null,
        });
      });

      // 4. Notify supervisor
      if (supervisorId) {
        const supNotifRef = db.collection('notifications').doc();
        transaction.set(supNotifRef, {
          recipientId: supervisorId,
          type: 'defense_scheduled',
          titleHe: 'נקבע מועד הגנה לפרויקט',
          titleEn: 'Defense date assigned to project',
          bodyHe: `הרכז קבע הגנה בתאריך ${dateLabel}${location ? ` במיקום: ${location}` : ''}.`,
          bodyEn: `Coordinator scheduled a defense on ${dateLabel}${location ? ` at ${location}` : ''}.`,
          isRead: false,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          relatedProjectId: projectId,
          relatedMilestoneId: null,
          chatId: null,
        });
      }

      // 5. Notify each examiner
      resolvedExaminerIds.forEach((examinerId) => {
        const examNotifRef = db.collection('notifications').doc();
        transaction.set(examNotifRef, {
          recipientId: examinerId,
          type: 'defense_assigned_examiner',
          titleHe: 'הוזמנת לשמש כבוחן בהגנה',
          titleEn: 'You have been assigned as a defense examiner',
          bodyHe: `הגנה בתאריך ${dateLabel}${location ? ` במיקום: ${location}` : ''}.`,
          bodyEn: `Defense on ${dateLabel}${location ? ` at ${location}` : ''}.`,
          isRead: false,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          relatedProjectId: projectId,
          relatedMilestoneId: null,
          chatId: null,
        });
      });
    });

    return res.status(200).json({ success: true, message: 'Defense scheduled successfully.' });
  } catch (error: any) {
    console.error('assignDefense error:', error);
    return res.status(500).json({ message: error.message || 'Failed to schedule defense.' });
  }
};