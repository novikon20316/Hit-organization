import { Response } from 'express';
import * as XLSX from 'xlsx';
import { db } from '../config/firebase.js';
import { AuthenticatedRequest, hasAnyRole } from '../middleware/auth.js';
import { withinCoordinatorScope } from '../services/scopeAuthorization.js';
import {
  gatherScopedEngagements,
  milestoneDistributionStats,
  milestoneCompletionStats,
  finalGradesStats,
  applicationsByFacultyStats,
  onTimeCompletionStats,
  yearOfStudyDistributionStats,
  supervisorCreditPointsStats,
  getSupervisorPaymentRates,
  setSupervisorPaymentRates,
  type SupervisorPaymentRates,
} from '../services/coordinatorStatistics.js';
import { FACULTY_NAMES } from '../services/studentProgress.js';
import { resolveMilestoneOrder } from '../services/workflowTemplates.js';
import { resolveTrackPolicy } from '../config/studentTrack.js';

const PROJECT_COORDINATOR_DASHBOARD_ROLES = ['administrative_secretary', 'system_admin'];

// Broader than PROJECT_COORDINATOR_DASHBOARD_ROLES above — the statistics
// feature is also surfaced on the plain `coordinator` role's own dashboard
// (app/coordinator/home), which is otherwise backed by a completely separate
// controller (coordinatorController.ts). Kept as its own constant rather than
// widening PROJECT_COORDINATOR_DASHBOARD_ROLES itself, so `coordinator`
// doesn't also gain access to this file's OTHER endpoints (the groups
// dashboard/students-report/grade-overrides), which were never part of this request.
const COORDINATOR_STATISTICS_ROLES = ['administrative_secretary', 'coordinator', 'system_admin'];

// Same "own scoped constant instead of widening PROJECT_COORDINATOR_DASHBOARD_ROLES"
// precedent as COORDINATOR_STATISTICS_ROLES above — getStudentDetail is also
// where the student thesis/project track (config/studentTrack.ts) is shown
// and, for a computer_science masters student, where the plain `coordinator`
// role (who the business rule actually names) grants thesis eligibility.
// grad_school_head added so a CS grad-school head can actually open the page
// their own dashboard's Thesis Eligibility Lookup search links to — that
// search box and the page's own THESIS_AVERAGE_ROLES already allowed
// grad_school_head, but this endpoint backing the page's data load didn't,
// so every grad_school_head account 403'd immediately on click-through.
// faculty_admin added for the same reason — already in studentTrackController.ts's
// THESIS_ELIGIBILITY_ROLES (can call the write endpoints) but missing here.
const STUDENT_DETAIL_ROLES = ['administrative_secretary', 'coordinator', 'program_head', 'grad_school_head', 'faculty_admin', 'system_admin'];

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
  if (!req.user || !hasAnyRole(req.user, PROJECT_COORDINATOR_DASHBOARD_ROLES)) {
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
    const isSystemAdmin = hasAnyRole(req.user, ['system_admin']);
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
    // Archived — see services/projectErasure.ts — excluded in-memory since
    // older project docs predate isArchived (a missing field never matches
    // an equality filter, so this can't be pushed into the queries above).
    const projectDocs = [...projectDocsById.values()].filter((d) => !d.data().isArchived);

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
    // Lets her click a student's name in a project card and get a way to
    // actually reach them — email/phoneNumber are already collected at
    // signup (see userImportExport.ts), just never surfaced here before.
    const contactById: Record<string, { email: string; phoneNumber: string | null }> = {};
    userSnaps.forEach((snap) => {
      if (!snap.exists) return;
      const data = snap.data();
      usersById[snap.id] = data?.displayName ?? 'Unknown';
      contactById[snap.id] = { email: data?.email ?? '', phoneNumber: data?.phoneNumber ?? null };
    });

    const now = Date.now();
    let activeGroups = 0;
    let scheduledDefenses = 0;
    let overdueGroups = 0;

    const groups = projectDocs.map((doc) => {
      const data = doc.data();
      const projectMilestones = (milestonesByProject[doc.id] ?? [])
        .slice()
        .sort((a, b) => resolveMilestoneOrder(a) - resolveMilestoneOrder(b));

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
            fileUrls: m.fileUrls ?? [],
            submissionNote: m.submissionNote ?? '',
          }));
        return {
          uid: sid,
          name: usersById[sid] ?? 'Unknown',
          email: contactById[sid]?.email ?? '',
          phoneNumber: contactById[sid]?.phoneNumber ?? null,
          milestones: studentMilestones,
        };
      });

      return {
        id: doc.id,
        projectTitle: data.titleHe || data.titleEn || '',
        // Exposed alongside the resolved name so the dashboard can group
        // projects by supervisor reliably (two supervisors can share a
        // display name) instead of grouping on the name string itself.
        supervisorId: data.supervisorId ?? null,
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

const DONE_MILESTONE_STATUSES = new Set(['coordinator_approved', 'completed']);
const PENDING_APPLICATION_STATUSES = ['applied', 'meeting_requested'];
const DAY_MS = 24 * 60 * 60 * 1000;

// Firestore 'in' caps at 30 values.
function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// programStartDate (a real Timestamp, set at signup specifically for
// students — see projectEnrollment.ts's header comment and userController.ts's
// syncData) is the reliable anchor for "days since signup." createdAt is a
// fallback for accounts that predate that field or were admin/bulk-created —
// it may be a Timestamp OR a plain ISO string depending on which code path
// created the doc, so both shapes are handled defensively (see reports.ts's
// identical fallback for the same reason).
function resolveSignupDate(data: FirebaseFirestore.DocumentData): Date | null {
  const started = data.programStartDate?.toDate?.();
  if (started) return started;
  const created = data.createdAt;
  if (created?.toDate) return created.toDate();
  if (typeof created === 'string') {
    const parsed = new Date(created);
    if (!isNaN(parsed.getTime())) return parsed;
  }
  return null;
}

export type StudentReportStatus = 'not_in_project' | 'applied' | 'in_project' | 'awaiting_defense' | 'finished';

/**
 * GET /api/project-coordinator/students-report
 * A full roster of every student in the coordinator's assigned degree(s)
 * (or, for system_admin, every student) — unlike getProjectCoordinatorDashboard
 * above, this is rooted at the `users` collection so a student who hasn't
 * enrolled in a project yet still appears (with a null project/supervisor/
 * milestone and a "searching for a project" day count instead). Same
 * coordinatorScopes-based scope resolution as getProjectCoordinatorDashboard.
 */
export const getStudentsReport = async (req: AuthenticatedRequest, res: Response) => {
  const uid = req.user?.uid;
  if (!uid) return res.status(401).json({ message: 'Unauthorized.' });
  if (!req.user || !hasAnyRole(req.user, PROJECT_COORDINATOR_DASHBOARD_ROLES)) {
    return res.status(403).json({ message: 'You do not have permission to view this report.' });
  }

  try {
    const isSystemAdmin = hasAnyRole(req.user, ['system_admin']);
    const scopes: DegreeScope[] = isSystemAdmin
      ? []
      : (req.user.coordinatorScopes ?? []).map((s) => (s.major ? { facultyId: s.facultyId, major: s.major } : { facultyId: s.facultyId }));

    if (!isSystemAdmin && scopes.length === 0) {
      return res.status(200).json({ students: [], noScopeAssigned: true });
    }

    // 1. Every student in scope.
    const studentDocsById = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
    if (isSystemAdmin) {
      const snap = await db.collection('users').where('role', '==', 'student').get();
      snap.docs.forEach((d) => studentDocsById.set(d.id, d));
    } else {
      await Promise.all(scopes.map(async (scope) => {
        let q: FirebaseFirestore.Query = db.collection('users').where('role', '==', 'student').where('facultyId', '==', scope.facultyId);
        if (scope.major) q = q.where('major', '==', scope.major);
        const snap = await q.get();
        snap.docs.forEach((d) => studentDocsById.set(d.id, d));
      }));
    }
    const students = [...studentDocsById.values()].map((d) => ({ id: d.id, ...d.data() }));

    // 2. Projects for every enrolled student (batched, deduped).
    const projectIds = [...new Set(students.map((s: any) => s.activeProjectId).filter(Boolean))];
    const projectSnaps = await Promise.all(projectIds.map((id) => db.collection('projects').doc(id as string).get()));
    const projectsById: Record<string, any> = {};
    projectSnaps.forEach((snap) => { if (snap.exists) projectsById[snap.id] = { id: snap.id, ...snap.data() }; });

    // 3. Milestones for those same projects, chunked (Firestore 'in' cap).
    const milestonesByProject: Record<string, any[]> = {};
    if (projectIds.length > 0) {
      const milestoneSnaps = await Promise.all(
        chunk(projectIds as string[], 30).map((ids) => db.collection('milestones').where('projectId', 'in', ids).get())
      );
      milestoneSnaps.forEach((snap) => snap.docs.forEach((doc) => {
        const data = doc.data();
        (milestonesByProject[data.projectId] ??= []).push({ id: doc.id, ...data });
      }));
    }

    // 4. Supervisor display names for those projects.
    const supervisorIds = [...new Set(Object.values(projectsById).map((p: any) => p.supervisorId).filter(Boolean))];
    const supervisorSnaps = await Promise.all(supervisorIds.map((id) => db.collection('users').doc(id as string).get()));
    const supervisorNameById: Record<string, string> = {};
    supervisorSnaps.forEach((snap) => { if (snap.exists) supervisorNameById[snap.id] = snap.data()?.displayName ?? ''; });

    // 5. Pending applications (not yet decided) for students still searching
    // — applications denormalize facultyId, so scope the same way as students
    // above. Doesn't carry `major`, so (like milestoneController.ts's own
    // administrative_secretary branch) this scopes to faculty only.
    const applicationDocs: FirebaseFirestore.QueryDocumentSnapshot[] = [];
    if (isSystemAdmin) {
      const snap = await db.collection('applications').where('status', 'in', PENDING_APPLICATION_STATUSES).get();
      applicationDocs.push(...snap.docs);
    } else {
      const facultyIds = [...new Set(scopes.map((s) => s.facultyId))];
      const snaps = await Promise.all(
        facultyIds.map((fid) => db.collection('applications').where('facultyId', '==', fid).where('status', 'in', PENDING_APPLICATION_STATUSES).get())
      );
      snaps.forEach((snap) => applicationDocs.push(...snap.docs));
    }
    const applicationsByStudent: Record<string, any[]> = {};
    applicationDocs.forEach((doc) => {
      const data = doc.data();
      (applicationsByStudent[data.studentId] ??= []).push(data);
    });

    const now = Date.now();

    const rows = students.map((s: any) => {
      const enrolled = !!s.hasActiveProject && !!s.activeProjectId && !!projectsById[s.activeProjectId];
      const project = enrolled ? projectsById[s.activeProjectId] : null;

      let status: StudentReportStatus;
      let projectTitleHe: string | null = null;
      let projectTitleEn: string | null = null;
      let supervisorName: string | null = null;
      let milestoneNameHe: string | null = null;
      let milestoneNameEn: string | null = null;
      let days: number | null = null;
      let appliedProjects: Array<{ titleHe: string; titleEn: string }> = [];

      if (enrolled && project) {
        projectTitleHe = project.titleHe || project.titleEn || '';
        projectTitleEn = project.titleEn || project.titleHe || '';
        supervisorName = project.supervisorId ? (supervisorNameById[project.supervisorId] ?? null) : null;

        const studentMilestones = (milestonesByProject[project.id] ?? [])
          .filter((m) => Array.isArray(m.studentIds) && m.studentIds.includes(s.id))
          .sort((a, b) => resolveMilestoneOrder(a) - resolveMilestoneOrder(b));
        const current = studentMilestones.find((m) => !DONE_MILESTONE_STATUSES.has(m.status)) ?? studentMilestones[studentMilestones.length - 1];

        if (current) {
          milestoneNameHe = current.nameHe ?? current.type;
          milestoneNameEn = current.nameEn ?? current.type;
          const dueDate = current.dueDate?.toDate?.() ?? null;
          const daysUntilDue = dueDate ? Math.ceil((dueDate.getTime() - now) / DAY_MS) : null;
          const isDefense = current.type === 'defense';
          const isDone = DONE_MILESTONE_STATUSES.has(current.status);

          if (isDefense && isDone) {
            status = 'finished';
            days = null; // nothing left to submit
          } else if (isDefense) {
            status = 'awaiting_defense';
            days = daysUntilDue;
          } else {
            status = 'in_project';
            days = daysUntilDue;
          }
        } else {
          // Enrolled but no milestone docs yet (shouldn't normally happen —
          // enrollment always creates them — but don't crash on stale data).
          status = 'in_project';
        }
      } else {
        const pending = applicationsByStudent[s.id] ?? [];
        if (pending.length > 0) {
          status = 'applied';
          appliedProjects = pending.map((a) => ({
            titleHe: a.projectTitleHe || a.projectTitleEn || '',
            titleEn: a.projectTitleEn || a.projectTitleHe || '',
          }));
        } else {
          status = 'not_in_project';
        }
        const signupDate = resolveSignupDate(s);
        days = signupDate ? Math.floor((now - signupDate.getTime()) / DAY_MS) : null;
      }

      return {
        id: s.id,
        name: s.displayName ?? '',
        facultyId: s.facultyId ?? null,
        major: s.major ?? null,
        degreeType: s.degreeType ?? null,
        status,
        appliedProjects,
        projectTitleHe,
        projectTitleEn,
        supervisorName,
        milestoneNameHe,
        milestoneNameEn,
        days,
      };
    });

    return res.status(200).json({ students: rows });
  } catch (error: any) {
    console.error('getStudentsReport error:', error);
    return res.status(500).json({ message: 'Failed to load students report.' });
  }
};

/**
 * GET /api/project-coordinator/students/:studentId/detail
 * Single-student drill-down, reached by clicking a row in the Students
 * Report tab above — the student's profile, their active project (if any),
 * and the full milestone list (with grades) for that project. Access is
 * scoped the same way as getStudentsReport, but checked against the
 * student's own facultyId/major (not the project's — a student can be in
 * scope even before enrolling in a project).
 */
export const getStudentDetail = async (req: AuthenticatedRequest, res: Response) => {
  const uid = req.user?.uid;
  if (!uid) return res.status(401).json({ message: 'Unauthorized.' });
  if (!req.user || !hasAnyRole(req.user, STUDENT_DETAIL_ROLES)) {
    return res.status(403).json({ message: 'You do not have permission to view this student.' });
  }

  const { studentId } = req.params;
  if (!studentId || typeof studentId !== 'string') {
    return res.status(400).json({ message: 'Invalid studentId.' });
  }

  try {
    const studentSnap = await db.collection('users').doc(studentId).get();
    if (!studentSnap.exists || studentSnap.data()?.role !== 'student') {
      return res.status(404).json({ message: 'Student not found.' });
    }
    const studentData = studentSnap.data()!;

    if (!withinCoordinatorScope(req.user, { facultyId: studentData.facultyId ?? '', major: studentData.major || undefined })) {
      return res.status(403).json({ message: 'Forbidden.' });
    }

    const activeProjectId: string | null = studentData.hasActiveProject ? (studentData.activeProjectId ?? null) : null;
    let project: { id: string; titleHe: string; titleEn: string; supervisorName: string | null; academicYear: string | null } | null = null;
    let milestoneRows: any[] = [];
    let currentMilestone: { id: string; type: string; nameHe: string; nameEn: string; status: string; dueDate: string | null } | null = null;

    if (activeProjectId) {
      const projectSnap = await db.collection('projects').doc(activeProjectId).get();
      if (projectSnap.exists) {
        const projectData = projectSnap.data()!;
        let supervisorName: string | null = null;
        if (projectData.supervisorId) {
          const supSnap = await db.collection('users').doc(projectData.supervisorId).get();
          supervisorName = supSnap.data()?.displayName ?? null;
        }
        project = {
          id: projectSnap.id,
          titleHe: projectData.titleHe || projectData.titleEn || '',
          titleEn: projectData.titleEn || projectData.titleHe || '',
          supervisorName,
          // The academic year the project/enrollment started — "study year"
          // as opposed to the student's own yearOfStudy below.
          academicYear: projectData.academicYear ?? null,
        };

        const milestonesSnap = await db.collection('milestones')
          .where('projectId', '==', activeProjectId)
          .where('studentIds', 'array-contains', studentId)
          .get();

        milestoneRows = milestonesSnap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a: any, b: any) => resolveMilestoneOrder(a) - resolveMilestoneOrder(b));

        const current = milestoneRows.find((m) => !DONE_MILESTONE_STATUSES.has(m.status)) ?? milestoneRows[milestoneRows.length - 1];
        if (current) {
          currentMilestone = {
            id: current.id,
            type: current.type,
            nameHe: current.nameHe ?? current.type,
            nameEn: current.nameEn ?? current.type,
            status: current.status,
            dueDate: current.dueDate?.toDate?.()?.toISOString?.() ?? null,
          };
        }
      }
    }

    return res.status(200).json({
      student: {
        id: studentSnap.id,
        name: studentData.displayName ?? '',
        facultyId: studentData.facultyId ?? null,
        major: studentData.major ?? null,
        degreeType: studentData.degreeType ?? null,
        email: studentData.email ?? '',
        phoneNumber: studentData.phoneNumber ?? null,
        yearOfStudy: studentData.yearOfStudy ?? null,
        // Thesis/project track — see config/studentTrack.ts. trackPolicy is
        // re-resolved live (not read off the student's own snapshotted copy)
        // so this always reflects the current config even for a student doc
        // written before this feature existed.
        trackPolicy: resolveTrackPolicy(studentData.degreeType, studentData.major),
        track: studentData.track ?? null,
        trackLocked: studentData.trackLocked ?? false,
        thesisEligibility: studentData.thesisEligibility ?? null,
      },
      project,
      currentMilestone,
      // Already-submitted milestones (anything past 'pending') — the
      // student's history of what she handed in and what she got for it.
      milestones: milestoneRows
        .filter((m) => m.status !== 'pending')
        .map((m) => ({
          id: m.id,
          type: m.type,
          nameHe: m.nameHe ?? m.type,
          nameEn: m.nameEn ?? m.type,
          status: m.status,
          dueDate: m.dueDate?.toDate?.()?.toISOString?.() ?? null,
          submittedAt: m.submittedAt?.toDate?.()?.toISOString?.() ?? null,
          finalGrade: m.finalGradeByStudent?.[studentId] ?? m.finalGrade ?? null,
          gradeApproved: m.gradeApproved ?? false,
        })),
      // Every milestone on the track, pending ones included — powers the
      // coordinator's visual progress roadmap (components/MilestoneTimeline)
      // so she can see the whole path, not just what's been submitted so far.
      milestoneRoadmap: milestoneRows.map((m: any) => ({
        id: m.id,
        type: m.type,
        order: typeof m.order === 'number' ? m.order : undefined,
        status: m.status,
        dueDate: m.dueDate?.toDate?.()?.toISOString?.() ?? null,
        submittedAt: m.submittedAt?.toDate?.()?.toISOString?.() ?? null,
        fileUrls: m.fileUrls ?? [],
        submissionNote: m.submissionNote ?? '',
        finalGrade: m.finalGradeByStudent?.[studentId] ?? m.finalGrade ?? null,
        supervisorScore: m.supervisorScore ?? null,
        // CRITICAL FIX: was reading m.defenseDate — that field has never
        // actually existed on a milestone doc. The resolved defense date
        // (see defenseScheduling.ts's finalizeMatchedDate) is written to
        // `dueDate`, the same field every other milestone type's due date
        // lives in (already read above, on line 585).
        defenseDate: m.dueDate?.toDate?.()?.toISOString?.() ?? null,
        defenseRoom: m.defenseRoom ?? null,
        defenseBuilding: m.defenseBuilding ?? null,
        defenseTime: m.defenseTime ?? null,
        onlineDefenseLink: m.onlineDefenseLink ?? null,
        examinerNames: m.examinerNames ?? [],
        examinerIds: m.examinerIds ?? [],
      })),
    });
  } catch (error: any) {
    console.error('getStudentDetail error:', error);
    return res.status(500).json({ message: 'Failed to load student detail.' });
  }
};

/**
 * GET /api/project-coordinator/grade-overrides
 * Every defense milestone with a pending grade override (see
 * supervisorController.ts's decideFinalGrade) in the coordinator's assigned
 * degree(s) — the auto-calculated grade, the supervisor's proposed grade and
 * reason, so she can approve the change or keep the automatic one (see
 * gradSchoolHeadController.ts's decideGradeOverride, which this queue's
 * actions call into). Same coordinatorScopes-based scope resolution as
 * getProjectCoordinatorDashboard/getStudentsReport above.
 */
export const getPendingGradeOverrides = async (req: AuthenticatedRequest, res: Response) => {
  const uid = req.user?.uid;
  if (!uid) return res.status(401).json({ message: 'Unauthorized.' });
  if (!req.user || !hasAnyRole(req.user, PROJECT_COORDINATOR_DASHBOARD_ROLES)) {
    return res.status(403).json({ message: 'You do not have permission to view this queue.' });
  }

  try {
    const isSystemAdmin = hasAnyRole(req.user, ['system_admin']);
    const scopes: DegreeScope[] = isSystemAdmin
      ? []
      : (req.user.coordinatorScopes ?? []).map((s) => (s.major ? { facultyId: s.facultyId, major: s.major } : { facultyId: s.facultyId }));

    if (!isSystemAdmin && scopes.length === 0) {
      return res.status(200).json({ overrides: [] });
    }

    // Milestones don't carry `major` — same faculty-only scoping limitation
    // as milestoneController.ts's administrative_secretary branch.
    const milestoneDocsById = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
    if (isSystemAdmin) {
      const snap = await db.collection('milestones').where('gradeOverride.status', '==', 'pending').get();
      snap.docs.forEach((d) => milestoneDocsById.set(d.id, d));
    } else {
      const facultyIds = [...new Set(scopes.map((s) => s.facultyId))];
      await Promise.all(facultyIds.map(async (facultyId) => {
        const snap = await db.collection('milestones')
          .where('facultyId', '==', facultyId)
          .where('gradeOverride.status', '==', 'pending')
          .get();
        snap.docs.forEach((d) => milestoneDocsById.set(d.id, d));
      }));
    }
    const milestones = [...milestoneDocsById.values()].map((d) => ({ id: d.id, ...d.data() } as Record<string, any>));

    const projectIds = [...new Set(milestones.map((m) => m.projectId).filter(Boolean))];
    const projectSnaps = await Promise.all(projectIds.map((id) => db.collection('projects').doc(id).get()));
    const projectsById: Record<string, any> = {};
    projectSnaps.forEach((snap) => { if (snap.exists) projectsById[snap.id] = snap.data(); });

    const studentIds = [...new Set(milestones.flatMap((m) => m.studentIds ?? []))];
    const studentSnaps = await Promise.all(studentIds.map((id) => db.collection('users').doc(id).get()));
    const studentNameById: Record<string, string> = {};
    studentSnaps.forEach((snap) => { if (snap.exists) studentNameById[snap.id] = snap.data()?.displayName ?? snap.id; });

    const overrides = milestones.map((m) => {
      const project = projectsById[m.projectId] ?? {};
      // What actually drove autoCalculatedFinalGrade (see
      // projectController.ts's maybeFinalizeAutoCalculatedGrade) — the
      // coordinator sees only the two aggregate numbers otherwise, with no
      // way to tell whether a disputed grade came from the supervisor's
      // evaluation or an examiner's before deciding on an override.
      const examinerIds: string[] = m.examinerIds ?? [];
      const examinerEvals: Record<string, { project?: { total: number; fileUrls?: string[] }; defense?: { total: number; fileUrls?: string[] } }> = m.examinerEvaluations ?? {};
      const examinerProjectAvg = examinerIds.length > 0
        ? Math.round(examinerIds.reduce((sum, id) => sum + (examinerEvals[id]?.project?.total ?? 0), 0) / examinerIds.length)
        : null;
      const examinerDefenseAvg = examinerIds.length > 0
        ? Math.round(examinerIds.reduce((sum, id) => sum + (examinerEvals[id]?.defense?.total ?? 0), 0) / examinerIds.length)
        : null;
      // Any file attached alongside a rubric/decision (optional — see
      // projectController.ts's submitSupervisorEvaluation/submitExaminerEvaluation
      // and supervisorController.ts's decideFinalGrade) so the coordinator
      // can open the actual paper-form record behind a disputed grade, not
      // just the numbers.
      const supervisorEvaluationFileUrls: string[] = m.supervisorEvaluation?.fileUrls ?? [];
      const examinerProjectFileUrls: string[] = Object.values(examinerEvals).flatMap((e) => e.project?.fileUrls ?? []);
      const examinerDefenseFileUrls: string[] = Object.values(examinerEvals).flatMap((e) => e.defense?.fileUrls ?? []);
      const gradeOverrideFileUrls: string[] = m.gradeOverride?.fileUrls ?? [];

      return {
        milestoneId: m.id,
        projectId: m.projectId ?? null,
        projectTitleHe: project.titleHe ?? '',
        projectTitleEn: project.titleEn ?? '',
        studentNames: (m.studentIds ?? []).map((sid: string) => studentNameById[sid] ?? sid),
        // 'auto_confirmed' means the supervisor accepted the computed grade
        // as-is (no dispute) — still routed here so the coordinator signs
        // off on every final grade, not just contested ones. Legacy docs
        // written before this field existed default to 'override' so older
        // pending rows keep rendering with the two-way compare UI.
        kind: m.gradeOverride?.kind ?? 'override',
        autoCalculatedFinalGrade: m.autoCalculatedFinalGrade ?? null,
        proposedGrade: m.gradeOverride?.proposedGrade ?? null,
        reason: m.gradeOverride?.reason ?? '',
        proposedAt: m.gradeOverride?.proposedAt?.toDate?.()?.toISOString?.() ?? null,
        supervisorEvaluationTotal: m.supervisorEvaluation?.total ?? null,
        examinerProjectAvg,
        examinerDefenseAvg,
        supervisorEvaluationFileUrls,
        examinerProjectFileUrls,
        examinerDefenseFileUrls,
        gradeOverrideFileUrls,
      };
    });

    return res.status(200).json({ overrides });
  } catch (error: any) {
    console.error('getPendingGradeOverrides error:', error);
    return res.status(500).json({ message: 'Failed to load pending grade overrides.' });
  }
};

/** Resolves the caller's scope plus the optional `?facultyId=` query filter —
 *  one faculty within scope, or omitted for the aggregate view across every
 *  faculty the caller can see. Shared by getCoordinatorStatistics and
 *  exportCoordinatorStatistics so both stay in sync.
 *
 *  Scope differs per role, since this endpoint now serves two different
 *  dashboards:
 *  - system_admin: unrestricted (every faculty).
 *  - administrative_secretary: her `facultyId` field is a useless 'all'
 *    sentinel (see CROSS_FACULTY_ROLES) — her real scope lives ONLY in
 *    coordinatorScopes, same as getProjectCoordinatorDashboard/
 *    getStudentsReport above. No coordinatorScopes assigned means nothing
 *    to see (noScopeAssigned), not "everything."
 *  - coordinator: a real single facultyId (coordinatorController.ts's
 *    getCoordinatorDashboard reads it directly, no coordinatorScopes
 *    involved there) — falls back to that facultyId whenever coordinatorScopes
 *    is empty, which is the common case for this role. coordinatorScopes is a
 *    shared, non-exclusive field (see CoordinatorScopesModal) that CAN also be
 *    set on a `coordinator` account to narrow/replace that default — when
 *    present, it wins, same as it does for administrative_secretary. */
function resolveStatisticsScope(req: AuthenticatedRequest): {
  error?: { status: number; message: string };
  isSystemAdmin: boolean;
  scopes: DegreeScope[];
  allowedFacultyIds: string[];
  requestedFacultyId?: string;
} {
  const isSystemAdmin = hasAnyRole(req.user, ['system_admin']);
  const coordinatorScopes: DegreeScope[] = (req.user!.coordinatorScopes ?? []).map(
    (s) => (s.major ? { facultyId: s.facultyId, major: s.major } : { facultyId: s.facultyId })
  );
  const scopes: DegreeScope[] = isSystemAdmin
    ? []
    : coordinatorScopes.length > 0
      ? coordinatorScopes
      : (hasAnyRole(req.user, ['coordinator']) && req.user!.facultyId)
        ? [{ facultyId: req.user!.facultyId }]
        : [];
  // system_admin has no coordinatorScopes/facultyId of its own to derive this
  // from (unrestricted by design) — without this, its faculty filter dropdown
  // would have no options to narrow by at all. Every other role's dropdown is
  // still built from their real scopes above, never this full list.
  const allowedFacultyIds = isSystemAdmin
    ? Object.keys(FACULTY_NAMES)
    : [...new Set(scopes.map((s) => s.facultyId))];

  const requestedFacultyId = (req.query.facultyId as string | undefined) || undefined;
  if (requestedFacultyId && !isSystemAdmin && !allowedFacultyIds.includes(requestedFacultyId)) {
    return {
      error: { status: 403, message: 'You may only view statistics for your own assigned faculties.' },
      isSystemAdmin, scopes, allowedFacultyIds,
    };
  }

  const result: ReturnType<typeof resolveStatisticsScope> = { isSystemAdmin, scopes, allowedFacultyIds };
  if (requestedFacultyId) result.requestedFacultyId = requestedFacultyId;
  return result;
}

/**
 * GET /api/project-coordinator/statistics
 * The six job-relevant statistics an administrative coordinator asked for:
 * milestone distribution, milestone completion rates, final grades, applications
 * per faculty, on-time completion, and year-of-study distribution — each
 * computable both across every faculty in the caller's scope (no `facultyId`
 * query param) and narrowed to one (see coordinatorStatistics.ts for the
 * actual aggregation logic). Same coordinatorScopes-based scope resolution as
 * getProjectCoordinatorDashboard/getStudentsReport above — NOT
 * reportsController.ts's facultyId model, which administrative_secretary
 * can't use (her real scope lives in coordinatorScopes, not req.user.facultyId).
 */
export const getCoordinatorStatistics = async (req: AuthenticatedRequest, res: Response) => {
  const uid = req.user?.uid;
  if (!uid) return res.status(401).json({ message: 'Unauthorized.' });
  if (!req.user || !hasAnyRole(req.user, COORDINATOR_STATISTICS_ROLES)) {
    return res.status(403).json({ message: 'You do not have permission to view these statistics.' });
  }

  try {
    const scope = resolveStatisticsScope(req);
    if (scope.error) return res.status(scope.error.status).json({ message: scope.error.message });
    const { isSystemAdmin, scopes, allowedFacultyIds, requestedFacultyId } = scope;

    if (!isSystemAdmin && scopes.length === 0) {
      return res.status(200).json({ noScopeAssigned: true, allowedFacultyIds: [] });
    }

    const records = await gatherScopedEngagements(scopes, isSystemAdmin, requestedFacultyId);
    const applicationScope: string[] | 'all' = requestedFacultyId
      ? [requestedFacultyId]
      : (isSystemAdmin ? 'all' : allowedFacultyIds);

    const [finalGrades, applicationsByFaculty, onTimeCompletion, supervisorPaymentRates] = await Promise.all([
      finalGradesStats(records),
      applicationsByFacultyStats(applicationScope),
      onTimeCompletionStats(records),
      getSupervisorPaymentRates(),
    ]);

    return res.status(200).json({
      allowedFacultyIds,
      milestoneDistribution: milestoneDistributionStats(records),
      milestoneCompletion: milestoneCompletionStats(records),
      finalGrades,
      applicationsByFaculty,
      onTimeCompletion,
      yearOfStudyDistribution: yearOfStudyDistributionStats(records),
      supervisorPaymentRates,
      supervisorCreditPoints: supervisorCreditPointsStats(records, supervisorPaymentRates),
    });
  } catch (error: any) {
    console.error('getCoordinatorStatistics error:', error);
    return res.status(500).json({ message: 'Failed to load statistics.' });
  }
};

/**
 * PUT /api/project-coordinator/supervisor-payment-rates
 * Lets an administrative coordinator (or coordinator/system_admin) fill in
 * the per-faculty×category credit-point rate she uses to approve supervisor
 * payments (see supervisorCreditPointsStats above) — the values themselves
 * aren't fixed yet, so this exists to let her set/adjust them over time
 * rather than have them hardcoded. Body: { rates: { [facultyId]: {
 * msc_thesis, msc_project, bsc_project } } } — same scope rules as the
 * statistics endpoint (resolveStatisticsScope): system_admin may edit any
 * faculty, everyone else only their own allowedFacultyIds.
 */
export const updateSupervisorPaymentRates = async (req: AuthenticatedRequest, res: Response) => {
  const uid = req.user?.uid;
  if (!uid) return res.status(401).json({ message: 'Unauthorized.' });
  if (!req.user || !hasAnyRole(req.user, COORDINATOR_STATISTICS_ROLES)) {
    return res.status(403).json({ message: 'You do not have permission to edit these rates.' });
  }

  try {
    const scope = resolveStatisticsScope(req);
    if (scope.error) return res.status(scope.error.status).json({ message: scope.error.message });
    const { isSystemAdmin, allowedFacultyIds } = scope;

    const body = (req.body?.rates ?? {}) as SupervisorPaymentRates;
    if (typeof body !== 'object' || body === null) {
      return res.status(400).json({ message: 'Invalid rates payload.' });
    }

    const updates: SupervisorPaymentRates = {};
    for (const [facultyId, row] of Object.entries(body)) {
      if (!isSystemAdmin && !allowedFacultyIds.includes(facultyId)) {
        return res.status(403).json({ message: `You may only edit rates for your own assigned faculties (not ${facultyId}).` });
      }
      const clean = { msc_thesis: null as number | null, msc_project: null as number | null, bsc_project: null as number | null };
      for (const cat of ['msc_thesis', 'msc_project', 'bsc_project'] as const) {
        const v = (row as any)?.[cat];
        if (v === null || v === undefined || v === '') continue;
        const n = Number(v);
        if (!Number.isFinite(n) || n < 0) {
          return res.status(400).json({ message: `Invalid rate for ${facultyId}/${cat}.` });
        }
        clean[cat] = n;
      }
      updates[facultyId] = clean;
    }

    const rates = await setSupervisorPaymentRates(updates);
    return res.status(200).json({ rates });
  } catch (error: any) {
    console.error('updateSupervisorPaymentRates error:', error);
    return res.status(500).json({ message: 'Failed to save rates.' });
  }
};

function addStatsSheet(workbook: XLSX.WorkBook, name: string, rows: Record<string, any>[]) {
  const worksheet = XLSX.utils.json_to_sheet(rows.length > 0 ? rows : [{ Info: 'No data' }]);
  if (rows.length > 0) {
    const headers = Object.keys(rows[0]!);
    worksheet['!cols'] = headers.map((h) => ({ wch: Math.max(h.length + 2, 14) }));
  }
  XLSX.utils.book_append_sheet(workbook, worksheet, name.slice(0, 31));
}

/**
 * GET /api/project-coordinator/statistics/export
 * Same data as getCoordinatorStatistics, as a multi-sheet .xlsx — one sheet
 * per section — reusing reportsController.ts's exact
 * json_to_sheet/book_new/book_append_sheet/write buffer-streaming pattern
 * (not that controller's access control, for the same reason as above).
 */
export const exportCoordinatorStatistics = async (req: AuthenticatedRequest, res: Response) => {
  const uid = req.user?.uid;
  if (!uid) return res.status(401).json({ message: 'Unauthorized.' });
  if (!req.user || !hasAnyRole(req.user, COORDINATOR_STATISTICS_ROLES)) {
    return res.status(403).json({ message: 'You do not have permission to export these statistics.' });
  }

  try {
    const scope = resolveStatisticsScope(req);
    if (scope.error) return res.status(scope.error.status).json({ message: scope.error.message });
    const { isSystemAdmin, scopes, allowedFacultyIds, requestedFacultyId } = scope;

    if (!isSystemAdmin && scopes.length === 0) {
      return res.status(400).json({ message: 'No degree assigned — nothing to export.' });
    }

    const records = await gatherScopedEngagements(scopes, isSystemAdmin, requestedFacultyId);
    const applicationScope: string[] | 'all' = requestedFacultyId
      ? [requestedFacultyId]
      : (isSystemAdmin ? 'all' : allowedFacultyIds);

    const [finalGrades, applicationsByFaculty, onTimeCompletion, supervisorPaymentRates] = await Promise.all([
      finalGradesStats(records),
      applicationsByFacultyStats(applicationScope),
      onTimeCompletionStats(records),
      getSupervisorPaymentRates(),
    ]);
    const milestoneDistribution = milestoneDistributionStats(records);
    const milestoneCompletion = milestoneCompletionStats(records);
    const yearOfStudyDistribution = yearOfStudyDistributionStats(records);
    const supervisorCreditPoints = supervisorCreditPointsStats(records, supervisorPaymentRates);

    const workbook = XLSX.utils.book_new();
    addStatsSheet(workbook, 'MilestoneDistribution', milestoneDistribution.map((r) => ({
      Type: r.nameEn || r.type, Count: r.count, Percent: r.percent,
    })));
    addStatsSheet(workbook, 'MilestoneCompletion', milestoneCompletion.map((r) => ({
      Type: r.nameEn || r.type, TotalReached: r.totalReached, Completed: r.completed, Percent: r.percent,
    })));
    addStatsSheet(workbook, 'FinalGrades', finalGrades.byStudent.map((r) => ({
      Student: r.studentName, Faculty: r.facultyId, Project: r.projectTitleEn || r.projectTitleHe,
      FinalGrade: r.finalGrade ?? '', Unconfigured: r.unconfigured ? 'Yes' : 'No',
    })));
    addStatsSheet(workbook, 'ApplicationsByFaculty', applicationsByFaculty.map((r) => ({
      Faculty: r.facultyId, Count: r.count, Percent: r.percent,
    })));
    addStatsSheet(workbook, 'OnTimeCompletion', onTimeCompletion.map((r) => ({
      Faculty: r.facultyId, OnTime: r.onTime, Late: r.late, Total: r.total, PercentOnTime: r.percentOnTime,
    })));
    addStatsSheet(workbook, 'YearOfStudy', yearOfStudyDistribution.map((r) => ({
      Year: r.yearOfStudy, Count: r.count, AvgProgressPercent: r.averageProgressPercent,
    })));
    addStatsSheet(workbook, 'SupervisorCreditPoints', supervisorCreditPoints.map((r) => ({
      Faculty: r.facultyId, Supervisor: r.supervisorName,
      ThesisCount: r.counts.msc_thesis, MastersProjectCount: r.counts.msc_project, BachelorsProjectCount: r.counts.bsc_project,
      TotalProjects: r.totalProjects, TotalPoints: r.totalPoints, RatesIncomplete: r.incompleteRates ? 'Yes' : 'No',
    })));

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="coordinator-statistics.xlsx"');
    return res.status(200).send(buffer);
  } catch (error: any) {
    console.error('exportCoordinatorStatistics error:', error);
    return res.status(500).json({ message: 'Failed to export statistics.' });
  }
};
