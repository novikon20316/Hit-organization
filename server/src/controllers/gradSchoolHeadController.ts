// src/controllers/gradSchoolHeadController.ts
//
// Dashboard for the grad_school_head role — cross-faculty oversight of all
// master's-track projects. Mirrors the batching pattern used by
// projectCoordinatorController.ts / coordinatorController.ts, but unfiltered
// by facultyId (this role's own facultyId is 'all') and grouped BY facultyId
// for the per-faculty processSummaries breakdown.
//
// Response shape is dictated by the already-built frontend —
// mobile/app/grad_school_head/grad_school_head_dashboard.tsx's DashboardData
// interface — field names here must match it exactly.

import admin from 'firebase-admin';
import { Response } from 'express';
import { db } from '../config/firebase.js';
import { AuthenticatedRequest } from '../middleware/auth.js';
import {
  computeMilestoneProgress,
  facultyName,
  trackTypeOf,
  urgencyFromAge,
  MilestoneDoc,
} from '../services/studentProgress.js';
import { transferGradeToMichlol } from '../services/gradeEngine.js';
import { logAuditEvent } from '../services/auditLog.js';
import { hasActionGrant, resolveProjectScope, resolveStaffForScope } from '../services/scopeAuthorization.js';
import { assignExaminersAndNotify, type ExaminerAssignmentInput } from '../services/examinerAccess.js';
import { openDefenseSchedulingIfPanelReady } from '../services/defenseScheduling.js';

const GRAD_SCHOOL_HEAD_ROLES = ['grad_school_head', 'system_admin'];

// Of the 6 pendingApprovals types the frontend supports (supervisor, proposal,
// thesis, examiners, final_grade, template), 'examiners', 'template', and now
// 'final_grade' (computed final grade on a defense milestone awaiting this
// role's sign-off — see the gradeApproved field and approveFinalGrade below)
// have real backing data. 'supervisor', 'proposal', and 'thesis' still have
// no schema/status of their own; nothing is invented for those here.
//
// 'examiners' here specifically means "coordinator already approved, msc_thesis
// only, now awaiting this role's second sign-off" (status: 'coordinator_approved'
// — see coordinatorController.ts's approveExaminerRecommendation, P1 #5). Plain
// 'pending' recommendations haven't even reached the coordinator's own approval
// yet and don't belong on this queue.

export const getGradSchoolHeadDashboard = async (req: AuthenticatedRequest, res: Response) => {
  const uid = req.user?.uid;
  if (!uid) return res.status(401).json({ message: 'Unauthorized.' });
  if (!req.user?.role || !GRAD_SCHOOL_HEAD_ROLES.includes(req.user.role)) {
    return res.status(403).json({ message: 'You do not have permission to view this dashboard.' });
  }

  try {
    const userSnap = await db.collection('users').doc(uid).get();
    if (!userSnap.exists) return res.status(404).json({ message: 'User record not found.' });
    const userData = userSnap.data()!;

    const [projectsSnap, milestonesSnap, examinerRecsSnap, templatesSnap] = await Promise.all([
      // array-contains, not equality — a project open to both bachelors and
      // masters must still count here (see degreeTypes on the projects
      // collection, added alongside the legacy scalar degreeType).
      db.collection('projects').where('degreeTypes', 'array-contains', 'masters').get(),
      db.collection('milestones').get(),
      db.collection('examinerRecommendations').where('status', '==', 'coordinator_approved').get(),
      db.collection('facultyTemplates').where('status', '==', 'pending').get(),
    ]);

    const mastersProjectIds = new Set(projectsSnap.docs.map((d) => d.id));

    const milestonesByProject: Record<string, MilestoneDoc[]> = {};
    milestonesSnap.docs.forEach((doc) => {
      const data = doc.data();
      const pid = data.projectId;
      if (!mastersProjectIds.has(pid)) return; // milestones have no degreeType — filter via project set
      if (!milestonesByProject[pid]) milestonesByProject[pid] = [];
      milestonesByProject[pid].push({ id: doc.id, ...data } as MilestoneDoc);
    });

    // ── Batch-fetch every user identity we'll need to display a name for ──────
    const userIdsToFetch = new Set<string>();
    projectsSnap.docs.forEach((doc) => {
      const data = doc.data();
      if (data.supervisorId) userIdsToFetch.add(data.supervisorId);
      (data.enrolledStudentIds ?? []).forEach((id: string) => userIdsToFetch.add(id));
    });
    examinerRecsSnap.docs.forEach((doc) => {
      const data = doc.data();
      if (data.supervisorId) userIdsToFetch.add(data.supervisorId);
    });
    templatesSnap.docs.forEach((doc) => {
      const data = doc.data();
      if (data.supervisorId) userIdsToFetch.add(data.supervisorId);
    });

    const userSnaps = await Promise.all(
      [...userIdsToFetch].map((id) => db.collection('users').doc(id).get()),
    );
    const usersById: Record<string, string> = {};
    userSnaps.forEach((snap) => {
      if (snap.exists) usersById[snap.id] = snap.data()?.displayName ?? 'Unknown';
    });

    const projectsById: Record<string, FirebaseFirestore.DocumentData> = {};
    projectsSnap.docs.forEach((doc) => {
      projectsById[doc.id] = doc.data();
    });

    // ── Per-faculty process summaries + stuck students + examiner load ────────
    const summariesByFaculty: Record<
      string,
      { total: number; active: number; stuck: number; completed: number; overdue: number }
    > = {};
    const stuckStudents: Array<{
      studentName: string;
      supervisorName: string;
      facultyId: string;
      currentMilestone: string;
      daysInStage: number;
      trackType: string;
    }> = [];

    let completedThisYear = 0;
    const currentYear = new Date().getFullYear();

    projectsSnap.docs.forEach((doc) => {
      const data = doc.data();
      const facultyId: string = data.facultyId ?? 'unknown';
      if (!summariesByFaculty[facultyId]) {
        summariesByFaculty[facultyId] = { total: 0, active: 0, stuck: 0, completed: 0, overdue: 0 };
      }
      const summary = summariesByFaculty[facultyId];
      summary.total++;

      const projectMilestones = milestonesByProject[doc.id] ?? [];
      const progress = computeMilestoneProgress(projectMilestones);

      if (data.status === 'active' || data.status === 'in_progress') summary.active++;
      if (progress.isStuck) summary.stuck++;
      if (progress.isOverdue) summary.overdue++;

      const defenseMilestone = projectMilestones.find((m) => m.type === 'defense');
      const isCompleted = defenseMilestone?.status === 'coordinator_approved';
      if (isCompleted) {
        summary.completed++;
        const approvedAt = defenseMilestone?.coordinatorApprovedAt;
        if (approvedAt?.toDate?.().getFullYear() === currentYear) completedThisYear++;
      }

      if (progress.isStuck) {
        const supervisorName = data.supervisorId ? (usersById[data.supervisorId] ?? 'Unknown') : 'Unassigned';
        (data.enrolledStudentIds ?? []).forEach((sid: string) => {
          stuckStudents.push({
            studentName: usersById[sid] ?? 'Unknown',
            supervisorName,
            facultyId,
            currentMilestone: progress.current?.nameEn ?? progress.current?.type ?? '',
            daysInStage: progress.daysInStage,
            trackType: trackTypeOf(data.projectType),
          });
        });
      }
    });

    const processSummaries = Object.entries(summariesByFaculty).map(([facultyId, s]) => {
      const name = facultyName(facultyId);
      return {
        facultyId,
        facultyNameHe: name.he,
        facultyNameEn: name.en,
        total: s.total,
        active: s.active,
        stuck: s.stuck,
        completed: s.completed,
        overdue: s.overdue,
      };
    });

    // ── Examiner load — tally internal examiners across defense milestones ────
    const examinerLoadById: Record<
      string,
      { activeReviews: number; pending: number; overdue: number }
    > = {};
    Object.values(milestonesByProject).forEach((projectMilestones) => {
      const defenseMilestone = projectMilestones.find((m) => m.type === 'defense');
      if (!defenseMilestone) return;
      const examinerIds = defenseMilestone.examinerIds ?? [];
      const now = Date.now();
      const isOverdue =
        defenseMilestone.status === 'pending' &&
        !!defenseMilestone.dueDate?.toDate &&
        defenseMilestone.dueDate.toDate().getTime() < now;

      examinerIds.forEach((eid, idx) => {
        if (!examinerLoadById[eid]) examinerLoadById[eid] = { activeReviews: 0, pending: 0, overdue: 0 };
        const scored = idx === 0 ? defenseMilestone.examiner1Score : defenseMilestone.examiner2Score;
        if (scored != null) examinerLoadById[eid].activeReviews++;
        else examinerLoadById[eid].pending++;
        if (isOverdue && scored == null) examinerLoadById[eid].overdue++;
      });
    });

    const examinerLoad = Object.entries(examinerLoadById).map(([eid, load]) => ({
      examinerName: usersById[eid] ?? 'Unknown',
      // Only external examiner tokens carry an institution field — internal
      // examiners (the only kind reflected here, via project.examinerIds) have
      // none on their user doc. Known gap, not a blocker.
      institution: '',
      activeReviews: load.activeReviews,
      pending: load.pending,
      overdue: load.overdue,
    }));

    // ── Pending approvals — only the 2 types with real backing data ───────────
    const pendingApprovals = [
      ...examinerRecsSnap.docs.map((doc) => {
        const data = doc.data();
        const project = projectsById[data.projectId];
        const studentName = (project?.enrolledStudentIds ?? [])
          .map((sid: string) => usersById[sid] ?? 'Unknown')
          .join(', ') || 'Unknown';
        return {
          id: doc.id,
          type: 'examiners' as const,
          studentName,
          facultyId: data.facultyId ?? '',
          title: data.projectTitleHe || data.projectTitleEn || '',
          submittedAt: data.createdAt?.toDate?.()?.toISOString?.() ?? '',
          urgency: urgencyFromAge(data.createdAt),
        };
      }),
      ...templatesSnap.docs.map((doc) => {
        const data = doc.data();
        // No student is involved in a template proposal — closest available
        // identity is the proposing supervisor.
        return {
          id: doc.id,
          type: 'template' as const,
          studentName: data.supervisorId ? (usersById[data.supervisorId] ?? 'Unknown') : 'Unknown',
          facultyId: data.facultyId ?? '',
          title: data.titleHe || data.titleEn || '',
          submittedAt: data.createdAt?.toDate?.()?.toISOString?.() ?? '',
          urgency: urgencyFromAge(data.createdAt),
        };
      }),
      // A computed final grade (see submitMilestoneGrade → computeWeightedFinalGrade)
      // on a defense milestone, awaiting this role's approval before it can be
      // transferred to Michlol — see approveFinalGrade below.
      ...Object.entries(milestonesByProject).flatMap(([projectId, milestones]) => {
        const defenseMilestone = milestones.find((m) => m.type === 'defense');
        if (!defenseMilestone) return [];
        if (defenseMilestone.finalGrade == null || defenseMilestone.gradeApproved) return [];
        const project = projectsById[projectId];
        const studentName = (project?.enrolledStudentIds ?? [])
          .map((sid: string) => usersById[sid] ?? 'Unknown')
          .join(', ') || 'Unknown';
        return [{
          id: defenseMilestone.id,
          type: 'final_grade' as const,
          studentName,
          facultyId: project?.facultyId ?? '',
          title: `${project?.titleHe || project?.titleEn || ''} — ${defenseMilestone.finalGrade}`,
          submittedAt: defenseMilestone.gradedAt?.toDate?.()?.toISOString?.() ?? '',
          urgency: urgencyFromAge(defenseMilestone.gradedAt),
        }];
      }),
    ];

    // ── Already-approved final grades — surfaced so an approval can be
    // unlocked for correction (see revertFinalGradeApproval below) without
    // needing a separate lookup screen. Only defense milestones actually
    // carry gradeApproved, so this list is naturally small/recent.
    const approvedFinalGrades = Object.entries(milestonesByProject).flatMap(([projectId, milestones]) => {
      const defenseMilestone = milestones.find((m) => m.type === 'defense');
      if (!defenseMilestone || defenseMilestone.finalGrade == null || !defenseMilestone.gradeApproved) return [];
      const project = projectsById[projectId];
      const studentName = (project?.enrolledStudentIds ?? [])
        .map((sid: string) => usersById[sid] ?? 'Unknown')
        .join(', ') || 'Unknown';
      return [{
        id: defenseMilestone.id,
        studentName,
        facultyId: project?.facultyId ?? '',
        title: project?.titleHe || project?.titleEn || '',
        finalGrade: defenseMilestone.finalGrade,
        approvedAt: defenseMilestone.gradeApprovedAt?.toDate?.()?.toISOString?.() ?? '',
        michlolTransferStatus: defenseMilestone.michlolTransferStatus ?? null,
      }];
    });

    return res.status(200).json({
      headName: userData.displayName ?? '',
      pendingApprovals,
      processSummaries,
      stuckStudents,
      examinerLoad,
      approvedFinalGrades,
      stats: {
        totalMasters: projectsSnap.size,
        pendingCount: pendingApprovals.length,
        stuckCount: stuckStudents.length,
        completedThisYear,
      },
    });
  } catch (error: any) {
    console.error('getGradSchoolHeadDashboard error:', error);
    return res.status(500).json({ message: 'Failed to load grad school head dashboard.' });
  }
};

/**
 * POST /api/grad-school-head/milestones/:id/approve-grade
 * Grad-school-head sign-off on a computed final grade for a thesis defense
 * milestone — previously entirely unimplemented (see the comment at the top
 * of this file). On success, stubs the transfer to Michlol (no live
 * integration exists yet — see services/gradeEngine.ts) and notifies the
 * student(s) whose grade was approved.
 */
export const approveFinalGrade = async (req: AuthenticatedRequest, res: Response) => {
  const uid = req.user?.uid;
  if (!uid) return res.status(401).json({ message: 'Unauthorized.' });

  const { id: milestoneId } = req.params;
  if (!milestoneId || typeof milestoneId !== 'string') {
    return res.status(400).json({ message: 'Invalid milestoneId.' });
  }

  // grad_school_head is intentionally cross-faculty (facultyId 'all') — kept
  // as-is. A non-grad_school_head user may still act here via an explicit
  // approve_grades grant scoped to this milestone's project (checked below,
  // once the milestone/project scope is known).
  const hasRoleAccess = !!req.user?.role && GRAD_SCHOOL_HEAD_ROLES.includes(req.user.role);

  try {
    const milestoneRef = db.collection('milestones').doc(milestoneId);
    const milestoneSnap = await milestoneRef.get();
    if (!milestoneSnap.exists) return res.status(404).json({ message: 'Milestone not found.' });

    const milestone = milestoneSnap.data()!;

    if (!hasRoleAccess) {
      const scope = (await resolveProjectScope(milestone.projectId)) ?? { facultyId: milestone.facultyId ?? '' };
      if (!hasActionGrant(req.user, 'approve_grades', scope)) {
        return res.status(403).json({ message: 'You do not have permission to approve grades.' });
      }
    }

    if (milestone.type !== 'defense') {
      return res.status(400).json({ message: 'Only defense/final-grade milestones can be approved here.' });
    }
    if (milestone.finalGrade == null) {
      return res.status(400).json({ message: 'No final grade has been computed for this milestone yet.' });
    }
    if (milestone.gradeApproved) {
      return res.status(400).json({ message: 'This grade has already been approved.' });
    }

    await milestoneRef.update({
      gradeApproved: true,
      gradeApprovedBy: uid,
      gradeApprovedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await logAuditEvent({
      userId: uid,
      userRole: req.user?.role ?? 'grad_school_head',
      action: 'final_grade_approved',
      entityType: 'milestone',
      entityId: milestoneId,
      oldValue: { gradeApproved: false },
      newValue: { gradeApproved: true, finalGrade: milestone.finalGrade },
    });

    const studentIds: string[] = milestone.studentIds ?? [];
    const transfer = await transferGradeToMichlol({
      milestoneId,
      projectId: milestone.projectId ?? '',
      studentIds,
      finalGrade: milestone.finalGrade,
    });

    await milestoneRef.update({
      michlolTransferStatus: transfer.transferred ? 'transferred' : 'failed',
      michlolTransferredAt: transfer.transferredAt,
    });

    try {
      await Promise.all(studentIds.map((studentId) =>
        db.collection('notifications').add({
          recipientId: studentId,
          type: 'final_grade_approved',
          titleHe: '🎓 הציון הסופי אושר',
          titleEn: '🎓 Final Grade Approved',
          bodyHe: `הציון הסופי שלך (${milestone.finalGrade}) אושר על ידי ראש בית הספר ללימודי מוסמכים והועבר למכלול.`,
          bodyEn: `Your final grade (${milestone.finalGrade}) has been approved by the grad school head and transferred to Michlol.`,
          isRead: false,
          relatedProjectId: milestone.projectId ?? null,
          relatedMilestoneId: milestoneId,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        })
      ));
    } catch (notifyErr) {
      console.error(`approveFinalGrade: failed to notify students for milestone ${milestoneId}:`, notifyErr);
    }

    return res.status(200).json({ success: true, message: 'Final grade approved and transferred to Michlol.' });
  } catch (error: any) {
    console.error('approveFinalGrade error:', error);
    return res.status(500).json({ message: 'Failed to approve final grade.' });
  }
};

/**
 * POST /api/grad-school-head/milestones/:id/unlock-grade
 * Body: { reason: string }
 *
 * Reopens an already-approved final grade for correction. Required so
 * submitMilestoneGrade/submitIndividualGrade's post-approval lock (see
 * projectController.ts) has a legitimate, audited way through it — a grade
 * change after approval must never be silent, so a reason is mandatory and
 * the grader-facing endpoints stay locked until this runs.
 */
export const revertFinalGradeApproval = async (req: AuthenticatedRequest, res: Response) => {
  const uid = req.user?.uid;
  if (!uid) return res.status(401).json({ message: 'Unauthorized.' });

  const { id: milestoneId } = req.params;
  if (!milestoneId || typeof milestoneId !== 'string') {
    return res.status(400).json({ message: 'Invalid milestoneId.' });
  }
  const { reason } = req.body;
  if (!reason || typeof reason !== 'string' || !reason.trim()) {
    return res.status(400).json({ message: 'A reason is required to unlock an approved grade.' });
  }

  const hasRoleAccess = !!req.user?.role && GRAD_SCHOOL_HEAD_ROLES.includes(req.user.role);

  try {
    const milestoneRef = db.collection('milestones').doc(milestoneId);
    const milestoneSnap = await milestoneRef.get();
    if (!milestoneSnap.exists) return res.status(404).json({ message: 'Milestone not found.' });

    const milestone = milestoneSnap.data()!;

    if (!hasRoleAccess) {
      const scope = (await resolveProjectScope(milestone.projectId)) ?? { facultyId: milestone.facultyId ?? '' };
      if (!hasActionGrant(req.user, 'approve_grades', scope)) {
        return res.status(403).json({ message: 'You do not have permission to unlock this grade.' });
      }
    }
    if (!milestone.gradeApproved) {
      return res.status(400).json({ message: 'This grade is not currently approved.' });
    }

    await milestoneRef.update({
      gradeApproved: false,
      gradeApprovedBy: admin.firestore.FieldValue.delete(),
      gradeApprovedAt: admin.firestore.FieldValue.delete(),
      michlolTransferStatus: admin.firestore.FieldValue.delete(),
      michlolTransferredAt: admin.firestore.FieldValue.delete(),
      gradeUnlockReason: reason,
      gradeUnlockedBy: uid,
      gradeUnlockedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await logAuditEvent({
      userId: uid,
      userRole: req.user?.role ?? 'grad_school_head',
      action: 'grade_approval_reverted',
      entityType: 'milestone',
      entityId: milestoneId,
      oldValue: { gradeApproved: true, finalGrade: milestone.finalGrade },
      newValue: { gradeApproved: false },
      explanation: reason,
    });

    const studentIds: string[] = milestone.studentIds ?? [];
    try {
      await Promise.all(studentIds.map((studentId) =>
        db.collection('notifications').add({
          recipientId: studentId,
          type: 'general',
          titleHe: 'הציון הסופי נפתח לתיקון',
          titleEn: 'Final grade reopened for correction',
          bodyHe: `הציון הסופי שלך נפתח לתיקון על ידי ראש בית הספר ללימודי מוסמכים. סיבה: ${reason}`,
          bodyEn: `Your final grade was reopened for correction by the grad school head. Reason: ${reason}`,
          isRead: false,
          relatedProjectId: milestone.projectId ?? null,
          relatedMilestoneId: milestoneId,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        })
      ));
    } catch (notifyErr) {
      console.error(`revertFinalGradeApproval: failed to notify students for milestone ${milestoneId}:`, notifyErr);
    }

    return res.status(200).json({ success: true, message: 'Grade unlocked for correction.' });
  } catch (error: any) {
    console.error('revertFinalGradeApproval error:', error);
    return res.status(500).json({ message: 'Failed to unlock grade.' });
  }
};

/**
 * POST /api/grad-school-head/examiner-recommendations/:id/approve
 *
 * P1 backlog item #5 — second, cross-faculty sign-off for msc_thesis examiner
 * lists a coordinator already approved (status: 'coordinator_approved' — see
 * coordinatorController.ts's approveExaminerRecommendation, which routes
 * msc_thesis recommendations here instead of sending invitations directly).
 * This is the step that actually assigns internal examiners and emails
 * external ones.
 */
export const approveExaminerRecommendationFinal = async (req: AuthenticatedRequest, res: Response) => {
  const uid = req.user?.uid;
  if (!uid) return res.status(401).json({ message: 'Unauthorized.' });
  const { id } = req.params;
  if (!id || typeof id !== 'string') return res.status(400).json({ message: 'Missing recommendation id.' });

  try {
    const recRef = db.collection('examinerRecommendations').doc(id);
    const recSnap = await recRef.get();
    if (!recSnap.exists) return res.status(404).json({ message: 'Recommendation not found.' });
    const rec = recSnap.data()!;

    if (rec.status !== 'coordinator_approved') {
      return res.status(400).json({ message: `This recommendation is not awaiting sign-off (status: ${rec.status}).` });
    }

    const projectId = rec.projectId;
    const projectSnap = await db.collection('projects').doc(projectId).get();
    if (!projectSnap.exists) return res.status(404).json({ message: 'Project not found.' });
    const project = projectSnap.data()!;

    // The role required here is whatever was snapshotted onto this
    // recommendation when the coordinator approved it (see
    // coordinatorController.ts's approveExaminerRecommendation) — any
    // ChainRole, not hardcoded to grad_school_head anymore. Recommendation
    // docs from before this generalization have no `signoffRole` snapshot;
    // all of those were msc_thesis, so `grad_school_head` is the correct
    // legacy meaning. system_admin stays a bypass via resolveStaffForScope
    // — deliberately NOT short-circuited by req.user.role here, since a
    // plain grad_school_head must NOT bypass a template that configured a
    // different role.
    const resource = { facultyId: project.facultyId, major: project.major, degreeLevel: project.degreeType, processType: project.projectType };
    const uids = await resolveStaffForScope(rec.signoffRole ?? 'grad_school_head', resource, [project.supervisorId].filter(Boolean));
    if (!uids.includes(uid)) {
      return res.status(403).json({ message: 'You do not have permission to approve this examiner list.' });
    }

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

    await openDefenseSchedulingIfPanelReady(projectId, result);

    await recRef.update({
      status: 'approved',
      decidedAt: admin.firestore.FieldValue.serverTimestamp(),
      decidedBy: uid,
    });

    await logAuditEvent({
      userId: uid,
      userRole: req.user?.role ?? '',
      action: 'examiner_approval_decided',
      entityType: 'examinerRecommendation',
      entityId: id,
      newValue: { decision: 'approved', projectId },
    });

    return res.status(200).json({
      success: true,
      message: 'Examiner list approved — invitations sent.',
      internalAssigned: result.internalUids,
      externalNotified: result.externalNotified,
      externalFailed: result.externalFailed,
    });
  } catch (error: any) {
    console.error('approveExaminerRecommendationFinal error:', error);
    return res.status(500).json({ message: error.message || 'Failed to approve examiner list.' });
  }
};

/**
 * POST /api/grad-school-head/examiner-recommendations/:id/reject
 * Body: { reason: string }
 * No examiners are assigned — sends the request back to the coordinator,
 * who can propose a different list via assign-examiners.
 */
export const rejectExaminerRecommendationFinal = async (req: AuthenticatedRequest, res: Response) => {
  const uid = req.user?.uid;
  if (!uid) return res.status(401).json({ message: 'Unauthorized.' });
  const { id } = req.params;
  const { reason } = req.body;
  if (!id || typeof id !== 'string') return res.status(400).json({ message: 'Missing recommendation id.' });
  if (!reason || typeof reason !== 'string' || !reason.trim()) {
    return res.status(400).json({ message: 'A reason is required to reject an examiner list.' });
  }

  try {
    const recRef = db.collection('examinerRecommendations').doc(id);
    const recSnap = await recRef.get();
    if (!recSnap.exists) return res.status(404).json({ message: 'Recommendation not found.' });
    const rec = recSnap.data()!;

    if (rec.status !== 'coordinator_approved') {
      return res.status(400).json({ message: `This recommendation is not awaiting sign-off (status: ${rec.status}).` });
    }

    const projectSnap = await db.collection('projects').doc(rec.projectId).get();
    if (!projectSnap.exists) return res.status(404).json({ message: 'Project not found.' });
    const project = projectSnap.data()!;

    // Same role check as approveExaminerRecommendationFinal — see its
    // comment for why this deliberately never short-circuits on req.user.role.
    const resource = { facultyId: project.facultyId, major: project.major, degreeLevel: project.degreeType, processType: project.projectType };
    const uids = await resolveStaffForScope(rec.signoffRole ?? 'grad_school_head', resource, [project.supervisorId].filter(Boolean));
    if (!uids.includes(uid)) {
      return res.status(403).json({ message: 'You do not have permission to reject this examiner list.' });
    }

    await recRef.update({
      status: 'rejected',
      decidedAt: admin.firestore.FieldValue.serverTimestamp(),
      decidedBy: uid,
      rejectionReason: reason,
    });

    await logAuditEvent({
      userId: uid,
      userRole: req.user?.role ?? '',
      action: 'examiner_approval_decided',
      entityType: 'examinerRecommendation',
      entityId: id,
      newValue: { decision: 'rejected', projectId: rec.projectId },
      explanation: reason,
    });

    return res.status(200).json({ success: true, message: 'Examiner list rejected.' });
  } catch (error: any) {
    console.error('rejectExaminerRecommendationFinal error:', error);
    return res.status(500).json({ message: error.message || 'Failed to reject examiner list.' });
  }
};
