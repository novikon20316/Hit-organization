// src/controllers/schoolHeadController.ts
//
// Dashboard for the school_head role — same shape/idea as
// gradSchoolHeadController.ts's getGradSchoolHeadDashboard, but scoped to
// one or more specific MAJORS (via coordinatorScopes) instead of whole
// faculties, and covering both bachelor's and master's students within
// those majors (grad_school_head is masters-only; school_head isn't — see
// the "head of school" feature request). The actual approve/reject/unlock
// actions (approveFinalGrade, decideGradeOverride, etc.) are NOT
// duplicated here — those already resolve their required signoff role
// generically via resolveStaffForScope/hasActionGrant (see
// scopeAuthorization.ts), so a school_head who's the configured
// finalGradeSignoffRole for a workflow template is authorized by the SAME
// gradSchoolHeadController.ts exports, reused as-is via new routes.

import { Response } from 'express';
import { db } from '../config/firebase.js';
import { AuthenticatedRequest, hasAnyRole } from '../middleware/auth.js';
import {
  computeMilestoneProgress,
  trackTypeOf,
  urgencyFromAge,
  MilestoneDoc,
} from '../services/studentProgress.js';
import { examinerScoreFor } from '../services/gradeEngine.js';

const SCHOOL_HEAD_ROLES = ['school_head', 'system_admin'];

/** This account's assigned majors, from coordinatorScopes — the same field
 *  administrative_secretary/school_head already use for scope narrowing
 *  (see scopeAuthorization.ts's isStudentWithinStaffScope). 'all' means
 *  unfiltered (system_admin browsing this dashboard). Empty array (not
 *  'all') means a school_head with no scope configured yet — the caller
 *  must treat that as "nothing to show", never "everything". */
function assignedMajors(userData: FirebaseFirestore.DocumentData): string[] | 'all' {
  if (userData.role === 'system_admin' || (userData.roles ?? []).includes('system_admin')) return 'all';
  const scopes: Array<{ major?: string }> = userData.coordinatorScopes ?? [];
  return [...new Set(scopes.map((s) => s.major).filter((m): m is string => !!m))];
}

function majorLabel(major: string): { he: string; en: string } {
  // Deliberately just the slug — the client already has the real
  // Hebrew/English label tables (lib/faculties.ts's HIT_FACULTIES) and
  // resolves this the same way it resolves any other major slug shown
  // elsewhere (e.g. the Students List tab).
  return { he: major, en: major };
}

export const getSchoolHeadDashboard = async (req: AuthenticatedRequest, res: Response) => {
  const uid = req.user?.uid;
  if (!uid) return res.status(401).json({ message: 'Unauthorized.' });
  if (!req.user || !hasAnyRole(req.user, SCHOOL_HEAD_ROLES)) {
    return res.status(403).json({ message: 'You do not have permission to view this dashboard.' });
  }

  try {
    const userSnap = await db.collection('users').doc(uid).get();
    if (!userSnap.exists) return res.status(404).json({ message: 'User record not found.' });
    const userData = userSnap.data()!;

    const majors = assignedMajors(userData);
    if (majors !== 'all' && majors.length === 0) {
      return res.status(200).json({
        headName: userData.displayName ?? '',
        noScopeAssigned: true,
        pendingApprovals: [], processSummaries: [], stuckStudents: [], examinerLoad: [], approvedFinalGrades: [],
        stats: { totalStudents: 0, pendingCount: 0, stuckCount: 0, completedThisYear: 0 },
      });
    }

    const majorFilter = (q: FirebaseFirestore.Query): FirebaseFirestore.Query =>
      majors === 'all' ? q : q.where('major', 'in', majors);

    const [projectsSnap, milestonesSnap, examinerRecsSnap, templatesSnap] = await Promise.all([
      majorFilter(db.collection('projects')).get(),
      db.collection('milestones').get(),
      db.collection('examinerRecommendations').where('status', '==', 'coordinator_approved').get(),
      majorFilter(db.collection('facultyTemplates')).where('status', '==', 'pending').get(),
    ]);

    const scopedProjectIds = new Set(projectsSnap.docs.map((d) => d.id));

    const milestonesByProject: Record<string, MilestoneDoc[]> = {};
    milestonesSnap.docs.forEach((doc) => {
      const data = doc.data();
      const pid = data.projectId;
      if (!scopedProjectIds.has(pid)) return;
      if (!milestonesByProject[pid]) milestonesByProject[pid] = [];
      milestonesByProject[pid].push({ id: doc.id, ...data } as MilestoneDoc);
    });

    const projectsById: Record<string, FirebaseFirestore.DocumentData> = {};
    projectsSnap.docs.forEach((doc) => { projectsById[doc.id] = doc.data(); });

    // examinerRecommendations carries no major field of its own (only
    // facultyId) — narrow to this scope via its project's major instead,
    // same in-memory join milestones already needs above.
    const examinerRecDocs = examinerRecsSnap.docs.filter((doc) => scopedProjectIds.has(doc.data().projectId));

    // ── Batch-fetch every user identity we'll need to display a name for ──────
    const userIdsToFetch = new Set<string>();
    projectsSnap.docs.forEach((doc) => {
      const data = doc.data();
      if (data.supervisorId) userIdsToFetch.add(data.supervisorId);
      (data.enrolledStudentIds ?? []).forEach((id: string) => userIdsToFetch.add(id));
    });
    examinerRecDocs.forEach((doc) => {
      const data = doc.data();
      if (data.supervisorId) userIdsToFetch.add(data.supervisorId);
    });
    templatesSnap.docs.forEach((doc) => {
      const data = doc.data();
      if (data.supervisorId) userIdsToFetch.add(data.supervisorId);
    });

    const userSnaps = await Promise.all([...userIdsToFetch].map((id) => db.collection('users').doc(id).get()));
    const usersById: Record<string, string> = {};
    userSnaps.forEach((snap) => { if (snap.exists) usersById[snap.id] = snap.data()?.displayName ?? 'Unknown'; });

    // ── Per-major process summaries + stuck students ───────────────────────────
    const summariesByMajor: Record<string, { total: number; active: number; stuck: number; completed: number; overdue: number }> = {};
    const stuckStudents: Array<{
      studentName: string; supervisorName: string; major: string;
      currentMilestone: string; daysInStage: number; trackType: string;
    }> = [];

    let completedThisYear = 0;
    const currentYear = new Date().getFullYear();

    projectsSnap.docs.forEach((doc) => {
      const data = doc.data();
      const major: string = data.major ?? 'unknown';
      if (!summariesByMajor[major]) summariesByMajor[major] = { total: 0, active: 0, stuck: 0, completed: 0, overdue: 0 };
      const summary = summariesByMajor[major];
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
            major,
            currentMilestone: progress.current?.nameEn ?? progress.current?.type ?? '',
            daysInStage: progress.daysInStage,
            trackType: trackTypeOf(data.projectType),
          });
        });
      }
    });

    const processSummaries = Object.entries(summariesByMajor).map(([major, s]) => {
      const name = majorLabel(major);
      return { major, majorNameHe: name.he, majorNameEn: name.en, ...s };
    });

    // ── Examiner load — tally internal examiners across defense milestones ────
    const examinerLoadById: Record<string, { activeReviews: number; pending: number; overdue: number }> = {};
    Object.values(milestonesByProject).forEach((projectMilestones) => {
      const defenseMilestone = projectMilestones.find((m) => m.type === 'defense');
      if (!defenseMilestone) return;
      const examinerIds = defenseMilestone.examinerIds ?? [];
      const now = Date.now();
      const isOverdue = defenseMilestone.status === 'pending' && !!defenseMilestone.dueDate?.toDate && defenseMilestone.dueDate.toDate().getTime() < now;

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
      institution: '',
      ...load,
    }));

    // ── Pending approvals ───────────────────────────────────────────────────────
    const pendingApprovals = [
      ...examinerRecDocs.map((doc) => {
        const data = doc.data();
        const project = projectsById[data.projectId];
        const studentName = (project?.enrolledStudentIds ?? []).map((sid: string) => usersById[sid] ?? 'Unknown').join(', ') || 'Unknown';
        return {
          id: doc.id, type: 'examiners' as const, studentName,
          major: project?.major ?? '', title: data.projectTitleHe || data.projectTitleEn || '',
          submittedAt: data.createdAt?.toDate?.()?.toISOString?.() ?? '', urgency: urgencyFromAge(data.createdAt),
        };
      }),
      ...templatesSnap.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id, type: 'template' as const,
          studentName: data.supervisorId ? (usersById[data.supervisorId] ?? 'Unknown') : 'Unknown',
          major: data.major ?? '', title: data.titleHe || data.titleEn || '',
          submittedAt: data.createdAt?.toDate?.()?.toISOString?.() ?? '', urgency: urgencyFromAge(data.createdAt),
        };
      }),
      ...Object.entries(milestonesByProject).flatMap(([projectId, milestones]) => {
        const defenseMilestone = milestones.find((m) => m.type === 'defense');
        if (!defenseMilestone) return [];
        if (defenseMilestone.finalGrade == null || defenseMilestone.gradeApproved) return [];
        const project = projectsById[projectId];
        const studentName = (project?.enrolledStudentIds ?? []).map((sid: string) => usersById[sid] ?? 'Unknown').join(', ') || 'Unknown';
        return [{
          id: defenseMilestone.id, type: 'final_grade' as const, studentName,
          major: project?.major ?? '', title: `${project?.titleHe || project?.titleEn || ''} — ${defenseMilestone.finalGrade}`,
          submittedAt: defenseMilestone.gradedAt?.toDate?.()?.toISOString?.() ?? '', urgency: urgencyFromAge(defenseMilestone.gradedAt),
        }];
      }),
    ];

    const approvedFinalGrades = Object.entries(milestonesByProject).flatMap(([projectId, milestones]) => {
      const defenseMilestone = milestones.find((m) => m.type === 'defense');
      if (!defenseMilestone || defenseMilestone.finalGrade == null || !defenseMilestone.gradeApproved) return [];
      const project = projectsById[projectId];
      const studentName = (project?.enrolledStudentIds ?? []).map((sid: string) => usersById[sid] ?? 'Unknown').join(', ') || 'Unknown';
      return [{
        id: defenseMilestone.id, studentName, major: project?.major ?? '',
        title: project?.titleHe || project?.titleEn || '', finalGrade: defenseMilestone.finalGrade,
        approvedAt: defenseMilestone.gradeApprovedAt?.toDate?.()?.toISOString?.() ?? '',
        michlolTransferStatus: defenseMilestone.michlolTransferStatus ?? null,
      }];
    });

    return res.status(200).json({
      headName: userData.displayName ?? '',
      assignedMajors: majors === 'all' ? [] : majors,
      pendingApprovals, processSummaries, stuckStudents, examinerLoad, approvedFinalGrades,
      stats: {
        totalStudents: projectsSnap.size,
        pendingCount: pendingApprovals.length,
        stuckCount: stuckStudents.length,
        completedThisYear,
      },
    });
  } catch (error: any) {
    console.error('getSchoolHeadDashboard error:', error);
    return res.status(500).json({ message: 'Failed to load school head dashboard.' });
  }
};
