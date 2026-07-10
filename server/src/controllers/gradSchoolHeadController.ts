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

const GRAD_SCHOOL_HEAD_ROLES = ['grad_school_head', 'system_admin'];

// Of the 6 pendingApprovals types the frontend supports (supervisor, proposal,
// thesis, examiners, final_grade, template), only 'examiners' and 'template'
// have a real backing collection/status today — see project_faculty_taxonomy-
// adjacent research this session. The other 4 always come back empty; no
// schema/status exists for them yet, so nothing is invented here.

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
      db.collection('projects').where('degreeType', '==', 'masters').get(),
      db.collection('milestones').get(),
      db.collection('examinerRecommendations').where('status', '==', 'pending').get(),
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
    ];

    return res.status(200).json({
      headName: userData.displayName ?? '',
      pendingApprovals,
      processSummaries,
      stuckStudents,
      examinerLoad,
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
