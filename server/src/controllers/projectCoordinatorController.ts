import { Response } from 'express';
import { db } from '../config/firebase.js';
import { AuthenticatedRequest } from '../middleware/auth.js';

const MILESTONE_ORDER = ['research_proposal', 'progress_report', 'final_report', 'defense'];
const PROJECT_COORDINATOR_DASHBOARD_ROLES = ['project_coordinator', 'system_admin'];

/**
 * GET /api/project-coordinator/:uid/dashboard
 * Same faculty-scoped data and permissions as the `coordinator` role's own
 * dashboard (see getCoordinatorDashboard in coordinatorController.ts) — the
 * `project_coordinator` role is the department secretary, who manages the
 * same bachelor's/master's project groups within their faculty. Reshaped
 * into "groups" to match project_coordinator_dashboard.tsx.
 */
export const getProjectCoordinatorDashboard = async (req: AuthenticatedRequest, res: Response) => {
  const uid = req.user?.uid;
  if (!uid) return res.status(401).json({ message: 'Unauthorized.' });
  if (!req.user?.role || !PROJECT_COORDINATOR_DASHBOARD_ROLES.includes(req.user.role)) {
    return res.status(403).json({ message: 'You do not have permission to view this dashboard.' });
  }

  try {
    const userSnap = await db.collection('users').doc(uid).get();
    if (!userSnap.exists) return res.status(404).json({ message: 'User record not found.' });
    const userData = userSnap.data()!;

    const facultyId = req.user.facultyId;
    if (!facultyId) return res.status(400).json({ message: 'No facultyId assigned.' });

    const [projectsSnap, milestonesSnap] = await Promise.all([
      db.collection('projects').where('facultyId', '==', facultyId).get(),
      db.collection('milestones').where('facultyId', '==', facultyId).get(),
    ]);

    const milestonesByProject: Record<string, any[]> = {};
    milestonesSnap.docs.forEach((doc) => {
      const data = doc.data();
      const pid = data.projectId;
      if (!milestonesByProject[pid]) milestonesByProject[pid] = [];
      milestonesByProject[pid].push({ id: doc.id, ...data });
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
    const usersById: Record<string, string> = {};
    userSnaps.forEach((snap) => {
      if (snap.exists) usersById[snap.id] = snap.data()?.displayName ?? 'Unknown';
    });

    const now = Date.now();
    let activeGroups = 0;
    let scheduledDefenses = 0;
    let overdueGroups = 0;

    const groups = projectsSnap.docs.map((doc) => {
      const data = doc.data();
      const projectMilestones = (milestonesByProject[doc.id] ?? [])
        .slice()
        .sort((a, b) => MILESTONE_ORDER.indexOf(a.type) - MILESTONE_ORDER.indexOf(b.type));

      const current = projectMilestones.find(
        (m) => m.status !== 'coordinator_approved' && m.status !== 'completed',
      ) ?? projectMilestones[projectMilestones.length - 1];

      const submissionsCount = projectMilestones.filter(
        (m) => m.status === 'submitted' || m.status === 'supervisor_graded' || m.status === 'graded',
      ).length;

      const overdueMilestones = projectMilestones.filter(
        (m) => m.status === 'pending' && m.dueDate?.toDate?.() && m.dueDate.toDate().getTime() < now,
      );
      const isOverdue = overdueMilestones.length > 0;
      if (isOverdue) overdueGroups++;
      if (data.status === 'active' || data.status === 'in_progress') activeGroups++;
      if (data.defenseDate) scheduledDefenses++;

      const members = (data.enrolledStudentIds ?? []).map((sid: string) => ({
        uid: sid,
        name: usersById[sid] ?? 'Unknown',
      }));

      return {
        id: doc.id,
        projectTitle: data.titleHe || data.titleEn || '',
        supervisorName: data.supervisorId ? (usersById[data.supervisorId] ?? 'Unknown') : 'Unassigned',
        facultyId: data.facultyId,
        trackType: data.degreeType === 'masters' ? 'masters_project' : 'bachelor_project',
        members,
        currentMilestone: current ? (current.nameEn ?? current.type) : '',
        primaryStatus: data.status,
        defenseDate: data.defenseDate?.toDate?.()?.toISOString?.() ?? null,
        defenseRoom: data.defenseRoom ?? null,
        submissionsCount,
        overdueCount: overdueMilestones.length,
        isOverdue,
      };
    });

    return res.status(200).json({
      coordinatorName: userData.displayName ?? '',
      facultyId,
      groups,
      stats: {
        totalGroups: groups.length,
        activeGroups,
        scheduledDefenses,
        overdueGroups,
      },
    });
  } catch (error: any) {
    console.error('getProjectCoordinatorDashboard error:', error);
    return res.status(500).json({ message: 'Failed to load project coordinator dashboard.' });
  }
};
