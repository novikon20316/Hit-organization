import { Response } from 'express';
import { db } from '../config/firebase.js';
import { AuthenticatedRequest } from '../middleware/auth.js';

const MILESTONE_ORDER = ['research_proposal', 'progress_report', 'final_report', 'defense'];
const PROJECT_COORDINATOR_DASHBOARD_ROLES = ['administrative_secretary', 'system_admin'];

interface DegreeScope { facultyId: string; major?: string }

/**
 * GET /api/project-coordinator/:uid/dashboard
 * Same faculty-scoped data and permissions as the `coordinator` role's own
 * dashboard (see getCoordinatorDashboard in coordinatorController.ts) — the
 * `administrative_secretary` role is the department coordinator, who manages the
 * same bachelor's/master's project groups within their faculty. Reshaped
 * into "groups" to match administrative_coordinator_dashboard.tsx.
 *
 * administrative_secretary accounts are provisioned with facultyId 'all'
 * (see CROSS_FACULTY_ROLES in userController.ts) — one coordinator can be
 * responsible for a specific degree (e.g. data science) rather than a whole
 * faculty. Her real scope lives in req.user.coordinatorScopes (the same
 * {facultyId, major?} tuples the 'coordinator' role uses — see
 * CoordinatorScopesModal), assigned per-degree by a system_admin. This used
 * to query on req.user.facultyId directly, which is always the literal
 * string 'all' for her — so it silently matched zero real projects. Now
 * resolved from her actual assigned degree(s), and a coordinator responsible
 * for more than one degree sees all of them at once.
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

    // system_admin has no "own" degree — sees everything, unfiltered.
    // administrative_secretary is scoped to her assigned degree(s); with
    // none assigned yet, she has nothing to see (not "the whole
    // institution", which the old facultyId==='all' behavior risked once
    // fixed naively — see withinCoordinatorScope's fallback for the write side).
    const isSystemAdmin = req.user.role === 'system_admin';
    const scopes: DegreeScope[] = isSystemAdmin
      ? []
      : (req.user.coordinatorScopes ?? []).map((s) => (s.major ? { facultyId: s.facultyId, major: s.major } : { facultyId: s.facultyId }));

    if (!isSystemAdmin && scopes.length === 0) {
      return res.status(200).json({
        coordinatorName: userData.displayName ?? '',
        facultyId: null,
        scopes: [],
        groups: [],
        stats: { totalGroups: 0, activeGroups: 0, scheduledDefenses: 0, overdueGroups: 0 },
        noScopeAssigned: true,
      });
    }

    const projectDocsById = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
    if (isSystemAdmin) {
      const allSnap = await db.collection('projects').get();
      allSnap.docs.forEach((d) => projectDocsById.set(d.id, d));
    } else {
      await Promise.all(scopes.map(async (scope) => {
        let q: FirebaseFirestore.Query = db.collection('projects').where('facultyId', '==', scope.facultyId);
        if (scope.major) q = q.where('major', '==', scope.major);
        const snap = await q.get();
        snap.docs.forEach((d) => projectDocsById.set(d.id, d));
      }));
    }
    const projectDocs = [...projectDocsById.values()];

    // Milestones are only ever looked up per matched project id below (via
    // milestonesByProject), so fetching per distinct faculty here — rather
    // than per exact major — can't leak a different major's data into the
    // response; it's just a lookup table keyed by the already major-filtered
    // project ids above.
    const facultyIds = [...new Set(projectDocs.map((d) => d.data().facultyId).filter(Boolean))];
    const milestoneSnaps = facultyIds.length > 0
      ? await Promise.all(facultyIds.map((fid) => db.collection('milestones').where('facultyId', '==', fid).get()))
      : [];

    const milestonesByProject: Record<string, any[]> = {};
    milestoneSnaps.forEach((snap) => snap.docs.forEach((doc) => {
      const data = doc.data();
      const pid = data.projectId;
      if (!milestonesByProject[pid]) milestonesByProject[pid] = [];
      milestonesByProject[pid].push({ id: doc.id, ...data });
    }));

    const userIdsToFetch = new Set<string>();
    projectDocs.forEach((doc) => {
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

    const groups = projectDocs.map((doc) => {
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

      // Per-student grade breakdown — mirrors getActiveProjects'
      // formattedMilestones in projectController.ts, so the coordinator can
      // see (not just track status of) each student's grades for her degree.
      const members = (data.enrolledStudentIds ?? []).map((sid: string) => {
        const studentMilestones = projectMilestones
          .filter((m) => Array.isArray(m.studentIds) && m.studentIds.includes(sid))
          .map((m) => ({
            type: m.type,
            status: m.status,
            finalGrade: m.finalGradeByStudent?.[sid] ?? m.finalGrade ?? null,
            gradeApproved: m.gradeApproved ?? false,
          }));
        return {
          uid: sid,
          name: usersById[sid] ?? 'Unknown',
          milestones: studentMilestones,
        };
      });

      return {
        id: doc.id,
        projectTitle: data.titleHe || data.titleEn || '',
        supervisorName: data.supervisorId ? (usersById[data.supervisorId] ?? 'Unknown') : 'Unassigned',
        facultyId: data.facultyId,
        major: data.major ?? null,
        trackType: data.degreeType === 'masters' ? 'masters_project' : 'bachelor_project',
        members,
        currentMilestone: current ? (current.nameEn ?? current.type) : '',
        // The real milestone doc id (as opposed to the display label above)
        // — needed by SendExaminerModal so an external-examiner invite gets
        // attached to the actual milestone, not a human-readable string.
        currentMilestoneId: current ? current.id : null,
        // Already-assigned internal examiners — SendExaminerModal must
        // include these back in its assign-examiners call (which replaces
        // the whole panel) so inviting one more external examiner doesn't
        // wipe out an existing internal one.
        existingExaminerIds: data.examinerIds ?? [],
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
      facultyId: scopes.length === 1 ? scopes[0]!.facultyId : null,
      scopes,
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
