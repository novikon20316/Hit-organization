// src/controllers/programHeadController.ts
//
// Dashboard for the program_head role — single-faculty oversight of master's
// students in their own program. Same batching shape as
// projectCoordinatorController.ts, scoped additionally to degreeType==='masters'.
//
// Response shape is dictated by the already-built frontend —
// mobile/app/program_head/program_head_dashboard.tsx's DashboardData
// interface — field names here must match it exactly.

import { Response } from 'express';
import { db } from '../config/firebase.js';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { computeMilestoneProgress, trackTypeOf, urgencyFromAge, MilestoneDoc } from '../services/studentProgress.js';

const PROGRAM_HEAD_ROLES = ['program_head', 'system_admin'];

export const getProgramHeadDashboard = async (req: AuthenticatedRequest, res: Response) => {
  const uid = req.user?.uid;
  if (!uid) return res.status(401).json({ message: 'Unauthorized.' });
  if (!req.user?.role || !PROGRAM_HEAD_ROLES.includes(req.user.role)) {
    return res.status(403).json({ message: 'You do not have permission to view this dashboard.' });
  }

  const facultyId = req.user.facultyId;
  if (!facultyId) return res.status(400).json({ message: 'No facultyId assigned.' });

  try {
    const userSnap = await db.collection('users').doc(uid).get();
    if (!userSnap.exists) return res.status(404).json({ message: 'User record not found.' });
    const userData = userSnap.data()!;

    const [projectsSnap, milestonesSnap, examinerRecsSnap, templatesSnap] = await Promise.all([
      // array-contains, not equality — a project open to both bachelors and
      // masters must still count here (see degreeTypes on the projects
      // collection, added alongside the legacy scalar degreeType). One
      // equality clause + one array-contains clause in the same query is
      // fine — Firestore only forbids two array-contains clauses together.
      db.collection('projects').where('facultyId', '==', facultyId).where('degreeTypes', 'array-contains', 'masters').get(),
      db.collection('milestones').where('facultyId', '==', facultyId).get(),
      db.collection('examinerRecommendations').where('facultyId', '==', facultyId).where('status', '==', 'pending').get(),
      db.collection('facultyTemplates').where('facultyId', '==', facultyId).where('status', '==', 'pending').get(),
    ]);

    const milestonesByProject: Record<string, MilestoneDoc[]> = {};
    milestonesSnap.docs.forEach((doc) => {
      const data = doc.data();
      const pid = data.projectId;
      if (!milestonesByProject[pid]) milestonesByProject[pid] = [];
      milestonesByProject[pid].push({ id: doc.id, ...data } as MilestoneDoc);
    });

    const userIdsToFetch = new Set<string>();
    projectsSnap.docs.forEach((doc) => {
      const data = doc.data();
      if (data.supervisorId) userIdsToFetch.add(data.supervisorId);
      (data.enrolledStudentIds ?? []).forEach((id: string) => userIdsToFetch.add(id));
    });
    const userSnaps = await Promise.all(
      [...userIdsToFetch].map((id) => db.collection('users').doc(id).get()),
    );
    const usersById: Record<string, { name: string; email: string }> = {};
    userSnaps.forEach((snap) => {
      if (snap.exists) {
        const d = snap.data()!;
        usersById[snap.id] = { name: d.displayName ?? 'Unknown', email: d.email ?? '' };
      }
    });

    const students: Array<{
      uid: string;
      projectId: string;
      studentName: string;
      trackType: 'thesis' | 'masters_project';
      supervisorName: string;
      currentMilestone: string;
      primaryStatus: string;
      subStatus: string;
      daysInStage: number;
      deadline: string | null;
      isOverdue: boolean;
      isActivelyPaused: boolean;
      facultyId: string;
    }> = [];

    let activeStudents = 0;
    let overdueCount = 0;
    const supervisorLoads: Record<string, number> = {};

    projectsSnap.docs.forEach((doc) => {
      const data = doc.data();
      const projectMilestones = milestonesByProject[doc.id] ?? [];
      const clockPauses = [
        ...(data.activeClockPause ? [data.activeClockPause] : []),
        ...(data.clockPauseHistory ?? []),
      ];
      const progress = computeMilestoneProgress(projectMilestones, clockPauses);
      const supervisorName = data.supervisorId ? (usersById[data.supervisorId]?.name ?? 'Unknown') : 'Unassigned';
      const isActive = data.status === 'active' || data.status === 'in_progress';

      if (data.supervisorId && isActive) {
        supervisorLoads[data.supervisorId] = (supervisorLoads[data.supervisorId] ?? 0) + 1;
      }

      (data.enrolledStudentIds ?? []).forEach((sid: string) => {
        if (isActive) activeStudents++;
        if (progress.isOverdue) overdueCount++;

        students.push({
          uid: sid,
          projectId: doc.id,
          studentName: usersById[sid]?.name ?? 'Unknown',
          trackType: trackTypeOf(data.projectType),
          supervisorName,
          currentMilestone: progress.current?.nameEn ?? progress.current?.type ?? '',
          primaryStatus: data.status ?? '',
          subStatus: progress.current?.status ?? '',
          daysInStage: progress.daysInStage,
          deadline: progress.current?.dueDate?.toDate?.()?.toISOString?.() ?? null,
          isOverdue: progress.isOverdue,
          isActivelyPaused: progress.isActivelyPaused,
          facultyId,
        });
      });
    });

    const pendingApprovals = [
      ...examinerRecsSnap.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          type: 'examiners',
          studentName: data.supervisorId ? (usersById[data.supervisorId]?.name ?? 'Unknown') : 'Unknown',
          description: `${data.projectTitleHe || data.projectTitleEn || ''}`,
          submittedAt: data.createdAt?.toDate?.()?.toISOString?.() ?? '',
        };
      }),
      ...templatesSnap.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          type: 'template',
          studentName: data.supervisorId ? (usersById[data.supervisorId]?.name ?? 'Unknown') : 'Unknown',
          description: `${data.titleHe || data.titleEn || ''}`,
          submittedAt: data.createdAt?.toDate?.()?.toISOString?.() ?? '',
        };
      }),
    ];

    const supervisorLoadList = Object.entries(supervisorLoads).map(([supervisorId, count]) => ({
      supervisorName: usersById[supervisorId]?.name ?? 'Unknown',
      supervisorEmail: usersById[supervisorId]?.email ?? '',
      activeStudents: count,
    }));

    return res.status(200).json({
      headName: userData.displayName ?? '',
      facultyId,
      students,
      pendingApprovals,
      supervisorLoads: supervisorLoadList,
      stats: {
        totalStudents: students.length,
        activeStudents,
        overdueCount,
        pendingCount: pendingApprovals.length,
      },
    });
  } catch (error: any) {
    console.error('getProgramHeadDashboard error:', error);
    return res.status(500).json({ message: 'Failed to load program head dashboard.' });
  }
};
