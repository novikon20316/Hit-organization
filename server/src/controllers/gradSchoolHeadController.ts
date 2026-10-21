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
import { AuthenticatedRequest, hasAnyRole } from '../middleware/auth.js';
import {
  computeMilestoneProgress,
  facultyName,
  trackTypeOf,
  urgencyFromAge,
  MilestoneDoc,
} from '../services/studentProgress.js';
import { transferGradeToMichlol, examinerScoreFor, averageGrade } from '../services/gradeEngine.js';
import { isIdentityKeyedDefense } from '../services/milestoneRouting.js';
import { logAuditEvent } from '../services/auditLog.js';
import { logProjectRecordEntry } from '../services/projectRecords.js';
import { hasActionGrant, resolveStaffForScope, effectiveFacultyIds } from '../services/scopeAuthorization.js';
import { assignExaminersAndNotify, type ExaminerAssignmentInput } from '../services/examinerAccess.js';
import { openDefenseSchedulingIfPanelReady } from '../services/defenseScheduling.js';
import { deriveProcessType, resolveFinalGradeSignoffRole } from '../services/workflowTemplates.js';
import { issueFinalReportLinks } from '../services/finalReport.js';
import { L } from '../utils/localize.js';

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
  if (!uid) return res.status(401).json({ message: L(req, 'Unauthorized.', 'אין הרשאה.') });
  if (!req.user || !hasAnyRole(req.user, GRAD_SCHOOL_HEAD_ROLES)) {
    return res.status(403).json({ message: L(req, 'You do not have permission to view this dashboard.', 'אין לך הרשאה לצפות בלוח הבקרה הזה.') });
  }

  try {
    const userSnap = await db.collection('users').doc(uid).get();
    if (!userSnap.exists) return res.status(404).json({ message: L(req, 'User record not found.', 'רשומת המשתמש לא נמצאה.') });
    const userData = userSnap.data()!;

    // Own faculty plus any extras granted via gradSchoolHeadFacultyIds (see
    // effectiveFacultyIds) — 'all' (system_admin, or a grad_school_head
    // explicitly kept/set cross-faculty) stays fully unfiltered, matching
    // this file's original design. milestones has no facultyId filter of its
    // own below — it's scoped implicitly via mastersProjectIds membership
    // once projects is filtered, so no separate query change needed there.
    const facultyIds = effectiveFacultyIds(userData, 'gradSchoolHeadFacultyIds');
    const facultyFilter = (q: FirebaseFirestore.Query): FirebaseFirestore.Query =>
      facultyIds === 'all' ? q : q.where('facultyId', 'in', facultyIds);

    const [projectsSnap, milestonesSnap, examinerRecsSnap, templatesSnap] = await Promise.all([
      // array-contains, not equality — a project open to both bachelors and
      // masters must still count here (see degreeTypes on the projects
      // collection, added alongside the legacy scalar degreeType).
      facultyFilter(db.collection('projects')).where('degreeTypes', 'array-contains', 'masters').get(),
      db.collection('milestones').get(),
      facultyFilter(db.collection('examinerRecommendations')).where('status', '==', 'coordinator_approved').get(),
      facultyFilter(db.collection('facultyTemplates')).where('status', '==', 'pending').get(),
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
        const scored = examinerScoreFor(defenseMilestone, eid, idx);
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
    return res.status(500).json({ message: L(req, 'Failed to load grad school head dashboard.', 'טעינת לוח הבקרה של ראש בית הספר ללימודי מוסמכים נכשלה.') });
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
/**
 * POST /api/grad-school-head/milestones/:id/grade-override-decision
 * Body: { decision: 'approve_override' | 'keep_auto' }
 *
 * Decides a pending grade override (see supervisorController.ts's
 * decideFinalGrade) — the supervisor proposed changing the computed
 * autoCalculatedFinalGrade with a mandatory reason; this either applies the
 * proposed grade or reverts to the automatic one, either way finalizing
 * (gradeApproved: true) so the milestone leaves the "awaiting decision" state
 * for good. Gated the same way as approveFinalGrade above — the route lives
 * in this controller for consistency with that shared sign-off mechanism,
 * even though the resolved role is commonly the coordinator
 * (administrative_secretary), not necessarily grad_school_head.
 */
export const decideGradeOverride = async (req: AuthenticatedRequest, res: Response) => {
  const uid = req.user?.uid;
  if (!uid) return res.status(401).json({ message: L(req, 'Unauthorized.', 'אין הרשאה.') });

  const { id: milestoneId } = req.params;
  const { decision } = req.body;
  if (!milestoneId || typeof milestoneId !== 'string') {
    return res.status(400).json({ message: L(req, 'Invalid milestoneId.', 'מזהה אבן דרך לא תקין.') });
  }
  if (decision !== 'approve_override' && decision !== 'keep_auto') {
    return res.status(400).json({ message: L(req, 'decision must be "approve_override" or "keep_auto".', 'ההחלטה חייבת להיות "approve_override" או "keep_auto".') });
  }

  try {
    const milestoneRef = db.collection('milestones').doc(milestoneId);
    const milestoneSnap = await milestoneRef.get();
    if (!milestoneSnap.exists) return res.status(404).json({ message: L(req, 'Milestone not found.', 'אבן הדרך לא נמצאה.') });
    const milestone = milestoneSnap.data()!;

    if (milestone.type !== 'defense' || !milestone.finalGradeComponents) {
      return res.status(400).json({ message: L(req, 'This milestone does not use the three-rubric final-grade workflow.', 'אבן דרך זו אינה משתמשת בתהליך הציון הסופי התלת-מרכיבי.') });
    }
    if (milestone.gradeOverride?.status !== 'pending') {
      return res.status(400).json({ message: L(req, 'No grade override is pending for this milestone.', 'אין שינוי ציון ממתין לאבן דרך זו.') });
    }
    if (milestone.gradeApproved) {
      return res.status(400).json({ message: L(req, 'This grade has already been finalized.', 'הציון כבר אושר באופן סופי.') });
    }

    // Same configurable sign-off gating as approveFinalGrade above.
    const projectSnap = await db.collection('projects').doc(milestone.projectId ?? '').get();
    const project = projectSnap.exists ? projectSnap.data()! : {};
    const scope = { facultyId: project.facultyId ?? milestone.facultyId ?? '', major: project.major, degreeLevel: project.degreeType, processType: project.projectType };
    if (!hasActionGrant(req.user, 'approve_grades', scope)) {
      const processType = deriveProcessType(project.degreeType, project.projectType);
      const signoffRole = await resolveFinalGradeSignoffRole(scope.facultyId, processType, project.major ?? null);
      const projectSupervisorIds = [project.supervisorId].filter(Boolean);
      const uids = await resolveStaffForScope(signoffRole, scope, projectSupervisorIds);
      if (!uids.includes(uid)) {
        return res.status(403).json({ message: L(req, 'You do not have permission to decide on this grade override.', 'אין לך הרשאה להכריע בשינוי ציון זה.') });
      }
    }

    // Per-student milestones (finalGradeComponents.perStudent) carry one
    // grade per student; finalGrade keeps the team average for project-level
    // readers, and every per-student reader prefers finalGradeByStudent.
    const finalGradeByStudent: Record<string, number> | null = milestone.finalGradeComponents.perStudent
      ? (decision === 'approve_override' ? milestone.gradeOverride.proposedGrades : milestone.autoCalculatedFinalGradeByStudent) ?? null
      : null;
    const finalGrade = finalGradeByStudent
      ? averageGrade(finalGradeByStudent)
      : decision === 'approve_override' ? milestone.gradeOverride.proposedGrade : milestone.autoCalculatedFinalGrade;

    // Transaction, not the plain get()-then-update() this used to be — same
    // reasoning as approveFinalGrade below: two near-simultaneous decisions
    // on the same pending override could otherwise both pass the
    // gradeApproved check above before either writes, and both go on to call
    // transferGradeToMichlol — a duplicate external transfer. This re-checks
    // and claims gradeApproved atomically; only the first caller proceeds.
    try {
      await db.runTransaction(async (transaction) => {
        const freshSnap = await transaction.get(milestoneRef);
        if (freshSnap.data()?.gradeApproved) {
          throw new Error('ALREADY_APPROVED');
        }
        transaction.update(milestoneRef, {
          finalGrade,
          ...(finalGradeByStudent ? { finalGradeByStudent } : {}),
          gradeApproved: true,
          gradeApprovedBy: uid,
          gradeApprovedAt: admin.firestore.FieldValue.serverTimestamp(),
          gradedAt: admin.firestore.FieldValue.serverTimestamp(),
          'gradeOverride.status': decision === 'approve_override' ? 'approved' : 'rejected',
          'gradeOverride.decidedBy': uid,
          'gradeOverride.decidedAt': admin.firestore.FieldValue.serverTimestamp(),
        });
      });
    } catch (err: any) {
      if (err?.message === 'ALREADY_APPROVED') {
        return res.status(400).json({ message: L(req, 'This grade has already been finalized.', 'הציון כבר אושר באופן סופי.') });
      }
      throw err;
    }

    await logAuditEvent({
      userId: uid,
      userRole: req.user?.role ?? 'administrative_secretary',
      action: decision === 'approve_override' ? 'grade_override_approved' : 'grade_override_rejected',
      entityType: 'milestone',
      entityId: milestoneId,
      oldValue: { autoCalculatedFinalGrade: milestone.autoCalculatedFinalGrade, proposedGrade: milestone.gradeOverride.proposedGrade },
      newValue: { finalGrade, ...(finalGradeByStudent ? { finalGradeByStudent } : {}) },
    });

    const studentIds: string[] = milestone.studentIds ?? [];
    const gradeFor = (studentId: string): number => finalGradeByStudent?.[studentId] ?? finalGrade;
    // One transfer per distinct grade, so each student's own grade is what
    // goes to Michlol.
    const studentsByGrade = new Map<number, string[]>();
    studentIds.forEach((id) => studentsByGrade.set(gradeFor(id), [...(studentsByGrade.get(gradeFor(id)) ?? []), id]));
    const transfers = await Promise.all([...studentsByGrade.entries()].map(([grade, ids]) =>
      transferGradeToMichlol({ milestoneId, projectId: milestone.projectId ?? '', studentIds: ids, finalGrade: grade })));
    const transfer = { transferred: transfers.every((t) => t.transferred), transferredAt: transfers[0]?.transferredAt ?? new Date().toISOString() };
    await milestoneRef.update({
      michlolTransferStatus: transfer.transferred ? 'transferred' : 'failed',
      michlolTransferredAt: transfer.transferredAt,
    });

    try {
      await Promise.all(studentIds.map((studentId) => db.collection('notifications').add({
        recipientId: studentId,
        type: 'final_grade_approved',
        titleHe: '🎓 הציון הסופי אושר',
        titleEn: '🎓 Final Grade Approved',
        bodyHe: `הציון הסופי שלך (${gradeFor(studentId)}) אושר והועבר למכלול.`,
        bodyEn: `Your final grade (${gradeFor(studentId)}) has been approved and transferred to Michlol.`,
        isRead: false,
        relatedProjectId: milestone.projectId ?? null,
        relatedMilestoneId: milestoneId,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        targetScreen: 'student_grades',
      })));
    } catch (notifyErr) {
      console.error('decideGradeOverride: failed to notify students:', notifyErr);
    }
    await issueFinalReportLinks(milestoneId);

    return res.status(200).json({ success: true, finalGrade });
  } catch (error: any) {
    console.error('decideGradeOverride error:', error);
    return res.status(500).json({ message: L(req, 'Failed to decide on the grade override.', 'ההחלטה על שינוי הציון נכשלה.') });
  }
};

export const approveFinalGrade = async (req: AuthenticatedRequest, res: Response) => {
  const uid = req.user?.uid;
  if (!uid) return res.status(401).json({ message: L(req, 'Unauthorized.', 'אין הרשאה.') });

  const { id: milestoneId } = req.params;
  if (!milestoneId || typeof milestoneId !== 'string') {
    return res.status(400).json({ message: L(req, 'Invalid milestoneId.', 'מזהה אבן דרך לא תקין.') });
  }

  try {
    const milestoneRef = db.collection('milestones').doc(milestoneId);
    const milestoneSnap = await milestoneRef.get();
    if (!milestoneSnap.exists) return res.status(404).json({ message: L(req, 'Milestone not found.', 'אבן הדרך לא נמצאה.') });

    const milestone = milestoneSnap.data()!;

    if (milestone.type !== 'defense') {
      return res.status(400).json({ message: L(req, 'Only defense/final-grade milestones can be approved here.', 'ניתן לאשר כאן רק אבני דרך של הגנה/ציון סופי.') });
    }
    if (milestone.finalGrade == null) {
      return res.status(400).json({ message: L(req, 'No final grade has been computed for this milestone yet.', 'עדיין לא חושב ציון סופי לאבן דרך זו.') });
    }
    if (milestone.gradeApproved) {
      return res.status(400).json({ message: L(req, 'This grade has already been approved.', 'הציון כבר אושר.') });
    }

    // Who's required to sign off here is configurable per template (see
    // workflowTemplates.ts's finalGradeSignoffRole) — defaults to
    // grad_school_head, matching today's unconditional behavior. The
    // pre-existing generic approve_grades permission grant stays a true
    // parallel bypass, same as before this generalization.
    const projectSnap = await db.collection('projects').doc(milestone.projectId ?? '').get();
    const project = projectSnap.exists ? projectSnap.data()! : {};
    const scope = { facultyId: project.facultyId ?? milestone.facultyId ?? '', major: project.major, degreeLevel: project.degreeType, processType: project.projectType };
    if (!hasActionGrant(req.user, 'approve_grades', scope)) {
      const processType = deriveProcessType(project.degreeType, project.projectType);
      const signoffRole = await resolveFinalGradeSignoffRole(scope.facultyId, processType, project.major ?? null);
      const projectSupervisorIds = [project.supervisorId].filter(Boolean);
      const uids = await resolveStaffForScope(signoffRole, scope, projectSupervisorIds);
      if (!uids.includes(uid)) {
        return res.status(403).json({ message: L(req, 'You do not have permission to approve grades.', 'אין לך הרשאה לאשר ציונים.') });
      }
    }

    // Transaction, not the plain get()-then-update() this used to be: two
    // near-simultaneous approve calls (a double-click, or two staff who both
    // hold approve_grades) could otherwise both pass the gradeApproved check
    // above before either writes, and both go on to call
    // transferGradeToMichlol below — a duplicate transfer to the external
    // grading system plus duplicate student notifications, with the
    // Firestore doc itself ending up looking perfectly fine. This re-checks
    // and claims gradeApproved atomically; only the first caller proceeds to
    // the external transfer.
    try {
      await db.runTransaction(async (transaction) => {
        const freshSnap = await transaction.get(milestoneRef);
        if (freshSnap.data()?.gradeApproved) {
          throw new Error('ALREADY_APPROVED');
        }
        transaction.update(milestoneRef, {
          gradeApproved: true,
          gradeApprovedBy: uid,
          gradeApprovedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      });
    } catch (err: any) {
      if (err?.message === 'ALREADY_APPROVED') {
        return res.status(400).json({ message: L(req, 'This grade has already been approved.', 'הציון כבר אושר.') });
      }
      throw err;
    }

    await logAuditEvent({
      userId: uid,
      userRole: req.user?.role ?? 'grad_school_head',
      action: 'final_grade_approved',
      entityType: 'milestone',
      entityId: milestoneId,
      oldValue: { gradeApproved: false },
      newValue: { gradeApproved: true, finalGrade: milestone.finalGrade },
    });
    await logProjectRecordEntry({
      projectId: milestone.projectId,
      type: 'final_grade_approved',
      actorId: uid,
      actorRole: req.user?.role ?? 'grad_school_head',
      data: { milestoneId, finalGrade: milestone.finalGrade },
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
    // The student's view-only final report link — see services/finalReport.ts.
    await issueFinalReportLinks(milestoneId);

    return res.status(200).json({ success: true, message: 'Final grade approved and transferred to Michlol.' });
  } catch (error: any) {
    console.error('approveFinalGrade error:', error);
    return res.status(500).json({ message: L(req, 'Failed to approve final grade.', 'אישור הציון הסופי נכשל.') });
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
  if (!uid) return res.status(401).json({ message: L(req, 'Unauthorized.', 'אין הרשאה.') });

  const { id: milestoneId } = req.params;
  if (!milestoneId || typeof milestoneId !== 'string') {
    return res.status(400).json({ message: L(req, 'Invalid milestoneId.', 'מזהה אבן דרך לא תקין.') });
  }
  const { reason } = req.body;
  if (!reason || typeof reason !== 'string' || !reason.trim()) {
    return res.status(400).json({ message: L(req, 'A reason is required to unlock an approved grade.', 'יש לציין סיבה לפתיחת ציון מאושר.') });
  }

  try {
    const milestoneRef = db.collection('milestones').doc(milestoneId);
    const milestoneSnap = await milestoneRef.get();
    if (!milestoneSnap.exists) return res.status(404).json({ message: L(req, 'Milestone not found.', 'אבן הדרך לא נמצאה.') });

    const milestone = milestoneSnap.data()!;

    if (!milestone.gradeApproved) {
      return res.status(400).json({ message: L(req, 'This grade is not currently approved.', 'ציון זה אינו מאושר כעת.') });
    }

    // Same generalized authorization as approveFinalGrade — see its comment.
    const projectSnap = await db.collection('projects').doc(milestone.projectId ?? '').get();
    const project = projectSnap.exists ? projectSnap.data()! : {};
    const scope = { facultyId: project.facultyId ?? milestone.facultyId ?? '', major: project.major, degreeLevel: project.degreeType, processType: project.projectType };
    if (!hasActionGrant(req.user, 'approve_grades', scope)) {
      const processType = deriveProcessType(project.degreeType, project.projectType);
      const signoffRole = await resolveFinalGradeSignoffRole(scope.facultyId, processType, project.major ?? null);
      const projectSupervisorIds = [project.supervisorId].filter(Boolean);
      const uids = await resolveStaffForScope(signoffRole, scope, projectSupervisorIds);
      if (!uids.includes(uid)) {
        return res.status(403).json({ message: L(req, 'You do not have permission to unlock this grade.', 'אין לך הרשאה לפתוח ציון זה.') });
      }
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
    return res.status(500).json({ message: L(req, 'Failed to unlock grade.', 'פתיחת הציון נכשלה.') });
  }
};

/**
 * POST /api/grad-school-head/milestones/:id/reject-grade
 * Body: { reason: string }
 *
 * New capability — previously a computed final grade could only be
 * approved, never rejected pre-approval (only reverted after approval via
 * revertFinalGradeApproval). Sends the grade back for re-grading: clears
 * every score field submitMilestoneGrade wrote, resets status to
 * 'submitted' so grading can happen again, and notifies whoever graded it.
 * Cannot be used on an already-approved grade — that's what unlock-grade is
 * for.
 */
export const rejectFinalGrade = async (req: AuthenticatedRequest, res: Response) => {
  const uid = req.user?.uid;
  if (!uid) return res.status(401).json({ message: L(req, 'Unauthorized.', 'אין הרשאה.') });

  const { id: milestoneId } = req.params;
  if (!milestoneId || typeof milestoneId !== 'string') {
    return res.status(400).json({ message: L(req, 'Invalid milestoneId.', 'מזהה אבן דרך לא תקין.') });
  }
  const { reason } = req.body;
  if (!reason || typeof reason !== 'string' || !reason.trim()) {
    return res.status(400).json({ message: L(req, 'A reason is required to reject a computed grade.', 'יש לציין סיבה לדחיית ציון מחושב.') });
  }

  try {
    const milestoneRef = db.collection('milestones').doc(milestoneId);
    const milestoneSnap = await milestoneRef.get();
    if (!milestoneSnap.exists) return res.status(404).json({ message: L(req, 'Milestone not found.', 'אבן הדרך לא נמצאה.') });

    const milestone = milestoneSnap.data()!;

    if (milestone.type !== 'defense') {
      return res.status(400).json({ message: L(req, 'Only defense/final-grade milestones can be rejected here.', 'ניתן לדחות כאן רק אבני דרך של הגנה/ציון סופי.') });
    }
    if (milestone.finalGrade == null) {
      return res.status(400).json({ message: L(req, 'No final grade has been computed for this milestone yet.', 'עדיין לא חושב ציון סופי לאבן דרך זו.') });
    }
    if (milestone.gradeApproved) {
      return res.status(400).json({ message: L(req, 'This grade has already been approved — unlock it instead of rejecting.', 'הציון כבר אושר — יש לפתוח אותו במקום לדחות אותו.') });
    }

    // Same generalized authorization as approveFinalGrade — see its comment.
    const projectSnap = await db.collection('projects').doc(milestone.projectId ?? '').get();
    const project = projectSnap.exists ? projectSnap.data()! : {};
    const scope = { facultyId: project.facultyId ?? milestone.facultyId ?? '', major: project.major, degreeLevel: project.degreeType, processType: project.projectType };
    if (!hasActionGrant(req.user, 'approve_grades', scope)) {
      const processType = deriveProcessType(project.degreeType, project.projectType);
      const signoffRole = await resolveFinalGradeSignoffRole(scope.facultyId, processType, project.major ?? null);
      const projectSupervisorIds = [project.supervisorId].filter(Boolean);
      const uids = await resolveStaffForScope(signoffRole, scope, projectSupervisorIds);
      if (!uids.includes(uid)) {
        return res.status(403).json({ message: L(req, 'You do not have permission to reject this grade.', 'אין לך הרשאה לדחות ציון זה.') });
      }
    }

    const graderIds = [milestone.supervisorId, ...(milestone.examinerIds ?? [])].filter(Boolean);

    await milestoneRef.update({
      supervisorScore: null, supervisorComment: admin.firestore.FieldValue.delete(),
      // Clear whichever shape this milestone actually uses — legacy
      // positional fields, or the identity-keyed map (reset to {}, matching
      // how a fresh defense milestone is seeded).
      ...(isIdentityKeyedDefense(milestone)
        ? { examinerScores: {} }
        : {
            examiner1Score: null, examiner1Comments: admin.firestore.FieldValue.delete(),
            examiner2Score: null, examiner2Comments: admin.firestore.FieldValue.delete(),
          }),
      finalGrade: null,
      finalGradeByStudent: admin.firestore.FieldValue.delete(),
      gradedAt: admin.firestore.FieldValue.delete(),
      status: 'submitted',
      gradeRejectionReason: reason,
      gradeRejectedBy: uid,
      gradeRejectedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await logAuditEvent({
      userId: uid,
      userRole: req.user?.role ?? 'grad_school_head',
      action: 'final_grade_rejected',
      entityType: 'milestone',
      entityId: milestoneId,
      oldValue: { finalGrade: milestone.finalGrade },
      newValue: { finalGrade: null, status: 'submitted' },
      explanation: reason,
    });

    try {
      await Promise.all(graderIds.map((graderId: string) =>
        db.collection('notifications').add({
          recipientId: graderId,
          type: 'general',
          titleHe: 'הציון הסופי נדחה — נדרש דירוג מחדש',
          titleEn: 'Final grade rejected — re-grading required',
          bodyHe: `הציון שהוזן עבור אבן דרך זו נדחה. סיבה: ${reason}`,
          bodyEn: `The grade submitted for this milestone was rejected. Reason: ${reason}`,
          isRead: false,
          relatedProjectId: milestone.projectId ?? null,
          relatedMilestoneId: milestoneId,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        })
      ));
    } catch (notifyErr) {
      console.error(`rejectFinalGrade: failed to notify graders for milestone ${milestoneId}:`, notifyErr);
    }

    return res.status(200).json({ success: true, message: 'Grade rejected — sent back for re-grading.' });
  } catch (error: any) {
    console.error('rejectFinalGrade error:', error);
    return res.status(500).json({ message: L(req, 'Failed to reject grade.', 'דחיית הציון נכשלה.') });
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
  if (!uid) return res.status(401).json({ message: L(req, 'Unauthorized.', 'אין הרשאה.') });
  const { id } = req.params;
  if (!id || typeof id !== 'string') return res.status(400).json({ message: L(req, 'Missing recommendation id.', 'חסר מזהה המלצה.') });

  try {
    const recRef = db.collection('examinerRecommendations').doc(id);
    const recSnap = await recRef.get();
    if (!recSnap.exists) return res.status(404).json({ message: L(req, 'Recommendation not found.', 'ההמלצה לא נמצאה.') });
    const rec = recSnap.data()!;

    if (rec.status !== 'coordinator_approved') {
      return res.status(400).json({ message: L(req, `This recommendation is not awaiting sign-off (status: ${rec.status}).`, `המלצה זו אינה ממתינה לאישור חתימה (סטטוס: ${rec.status}).`) });
    }

    const projectId = rec.projectId;
    const projectSnap = await db.collection('projects').doc(projectId).get();
    if (!projectSnap.exists) return res.status(404).json({ message: L(req, 'Project not found.', 'הפרויקט לא נמצא.') });
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
      return res.status(403).json({ message: L(req, 'You do not have permission to approve this examiner list.', 'אין לך הרשאה לאשר את רשימת הבוחנים.') });
    }

    const studentSnaps = await Promise.all(
      (project.enrolledStudentIds ?? []).map((sid: string) => db.collection('users').doc(sid).get())
    );
    const studentName = studentSnaps.map((s) => s.data()?.displayName).filter(Boolean).join(', ');

    // Atomically claim this recommendation before sending any invitations —
    // two near-simultaneous approve calls on the same coordinator_approved
    // recommendation could otherwise both pass the status check above and
    // both email the same external examiners. The lock is cleared again if
    // anything below throws, so a failed attempt can still be retried.
    try {
      await db.runTransaction(async (transaction) => {
        const freshSnap = await transaction.get(recRef);
        const freshData = freshSnap.data();
        if (freshData?.status !== 'coordinator_approved' || freshData?.approvalInProgress) throw new Error('ALREADY_DECIDED');
        transaction.update(recRef, { approvalInProgress: true });
      });
    } catch (err: any) {
      if (err?.message === 'ALREADY_DECIDED') {
        const currentStatus = (await recRef.get()).data()?.status;
        return res.status(400).json({ message: L(req, `This recommendation is not awaiting sign-off (status: ${currentStatus}).`, `המלצה זו אינה ממתינה לאישור חתימה (סטטוס: ${currentStatus}).`) });
      }
      throw err;
    }

    let result: Awaited<ReturnType<typeof assignExaminersAndNotify>>;
    try {
      const examinerInputs: ExaminerAssignmentInput[] = (rec.recommendedExaminers ?? []).map((ex: any) =>
        ex.type === 'internal'
          ? { type: 'internal' as const, uid: ex.internalUserId }
          : { type: 'external' as const, name: ex.name, email: ex.email, institution: ex.institution }
      );

      result = await assignExaminersAndNotify(examinerInputs, {
        projectId,
        thesisTitle: rec.projectTitleHe || rec.projectTitleEn || project.titleHe || '',
        studentName,
        lang: 'he',
      });

      await db.collection('projects').doc(projectId).update({
        examinerIds: result.internalUids,
        examinerNames: result.examinerNames,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      await openDefenseSchedulingIfPanelReady(projectId, result);

      await recRef.update({
        status: 'approved',
        decidedAt: admin.firestore.FieldValue.serverTimestamp(),
        decidedBy: uid,
        approvalInProgress: admin.firestore.FieldValue.delete(),
      });
    } catch (err) {
      await recRef.update({ approvalInProgress: admin.firestore.FieldValue.delete() }).catch(() => {});
      throw err;
    }

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
    return res.status(500).json({ message: L(req, 'Failed to approve examiner list.', 'אישור רשימת הבוחנים נכשל.') });
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
  if (!uid) return res.status(401).json({ message: L(req, 'Unauthorized.', 'אין הרשאה.') });
  const { id } = req.params;
  const { reason } = req.body;
  if (!id || typeof id !== 'string') return res.status(400).json({ message: L(req, 'Missing recommendation id.', 'חסר מזהה המלצה.') });
  if (!reason || typeof reason !== 'string' || !reason.trim()) {
    return res.status(400).json({ message: L(req, 'A reason is required to reject an examiner list.', 'יש לציין סיבה לדחיית רשימת הבוחנים.') });
  }

  try {
    const recRef = db.collection('examinerRecommendations').doc(id);
    const recSnap = await recRef.get();
    if (!recSnap.exists) return res.status(404).json({ message: L(req, 'Recommendation not found.', 'ההמלצה לא נמצאה.') });
    const rec = recSnap.data()!;

    if (rec.status !== 'coordinator_approved') {
      return res.status(400).json({ message: L(req, `This recommendation is not awaiting sign-off (status: ${rec.status}).`, `המלצה זו אינה ממתינה לאישור חתימה (סטטוס: ${rec.status}).`) });
    }

    const projectSnap = await db.collection('projects').doc(rec.projectId).get();
    if (!projectSnap.exists) return res.status(404).json({ message: L(req, 'Project not found.', 'הפרויקט לא נמצא.') });
    const project = projectSnap.data()!;

    // Same role check as approveExaminerRecommendationFinal — see its
    // comment for why this deliberately never short-circuits on req.user.role.
    const resource = { facultyId: project.facultyId, major: project.major, degreeLevel: project.degreeType, processType: project.projectType };
    const uids = await resolveStaffForScope(rec.signoffRole ?? 'grad_school_head', resource, [project.supervisorId].filter(Boolean));
    if (!uids.includes(uid)) {
      return res.status(403).json({ message: L(req, 'You do not have permission to reject this examiner list.', 'אין לך הרשאה לדחות את רשימת הבוחנים.') });
    }

    // Transaction, not a plain update(): a reject racing in against a
    // concurrent approveExaminerRecommendationFinal call (which may already
    // be mid-flight sending invitations) could otherwise still flip this to
    // 'rejected' after examiners were actually assigned/notified.
    try {
      await db.runTransaction(async (transaction) => {
        const freshSnap = await transaction.get(recRef);
        if (freshSnap.data()?.status !== 'coordinator_approved') throw new Error('ALREADY_DECIDED');
        transaction.update(recRef, {
          status: 'rejected',
          decidedAt: admin.firestore.FieldValue.serverTimestamp(),
          decidedBy: uid,
          rejectionReason: reason,
        });
      });
    } catch (err: any) {
      if (err?.message === 'ALREADY_DECIDED') {
        const currentStatus = (await recRef.get()).data()?.status;
        return res.status(400).json({ message: L(req, `This recommendation is not awaiting sign-off (status: ${currentStatus}).`, `המלצה זו אינה ממתינה לאישור חתימה (סטטוס: ${currentStatus}).`) });
      }
      throw err;
    }

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
    return res.status(500).json({ message: L(req, 'Failed to reject examiner list.', 'דחיית רשימת הבוחנים נכשלה.') });
  }
};
