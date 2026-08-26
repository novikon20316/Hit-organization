// src/controllers/projectRecordsController.ts
//
// Read-only per-project record: a permanent, immutable timeline (milestone
// submissions, grades, examiner assignments, messages, lifecycle events —
// see services/projectRecords.ts for every write site) plus the role-scoped
// drill-down that gets a viewer to it — supervisor sees their own non-empty
// projects; coordinator/administrative_secretary/faculty_admin/program_head/
// grad_school_head see the supervisors in their faculty scope and drill into
// each; system_admin drills faculty -> major -> supervisor -> project.
// Nothing here writes anything — see projectRecords.ts's own writer.

import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { db } from '../config/firebase.js';
import { effectiveFacultyIds } from '../services/scopeAuthorization.js';
import { MAJORS_BY_FACULTY } from '../config/majors.js';

type AuthUser = NonNullable<AuthenticatedRequest['user']>;

const COORDINATOR_TIER_ROLES = ['coordinator', 'administrative_secretary', 'faculty_admin', 'program_head', 'grad_school_head'];

function serializeTimestamp(value: any): string | null {
  return value?.toDate?.().toISOString?.() ?? null;
}

/** Every real facultyId (never the 'all' sentinel) this caller's role covers
 *  — 'all' means unrestricted (system_admin, or a coordinator-tier account
 *  whose scope explicitly covers every faculty). An empty array means no
 *  access at all (e.g. a coordinator-tier account with no scope configured
 *  yet), matching withinCoordinatorScope's own "deny rather than silently
 *  grant" fallback. */
function callerFacultyScope(user: AuthUser): string[] | 'all' {
  if (user.role === 'system_admin') return 'all';
  if (user.role === 'faculty_admin') return effectiveFacultyIds(user, 'facultyAdminFacultyIds');
  if (user.role === 'program_head') return effectiveFacultyIds(user, 'programHeadFacultyIds');
  if (user.role === 'grad_school_head') return effectiveFacultyIds(user, 'gradSchoolHeadFacultyIds');
  if (user.role === 'coordinator' || user.role === 'administrative_secretary') {
    if (user.coordinatorScopes.length > 0) {
      const ids = new Set<string>();
      for (const scope of user.coordinatorScopes) {
        if (scope.facultyId === 'all') return 'all';
        ids.add(scope.facultyId);
      }
      return [...ids];
    }
    return user.facultyId !== 'all' ? [user.facultyId] : [];
  }
  return [];
}

function facultyWithinScope(scope: string[] | 'all', facultyId: string): boolean {
  return scope === 'all' || scope.includes(facultyId);
}

/**
 * GET /api/project-records/:projectId
 * Full chronological timeline for one project.
 */
export const getProjectRecord = async (req: AuthenticatedRequest, res: Response) => {
  const requester = req.user;
  const { projectId } = req.params;
  if (!requester) return res.status(401).json({ message: 'Unauthorized.' });
  if (!projectId || typeof projectId !== 'string') {
    return res.status(400).json({ message: 'Invalid projectId' });
  }

  try {
    const projectSnap = await db.collection('projects').doc(projectId).get();
    if (!projectSnap.exists) return res.status(404).json({ message: 'Project not found' });
    const project = projectSnap.data()!;

    const isOwnProject =
      project.supervisorId === requester.uid ||
      project.secondarySupervisorId === requester.uid ||
      (project.enrolledStudentIds ?? []).includes(requester.uid);
    const hasStaffScopeAccess =
      requester.role === 'system_admin' ||
      (COORDINATOR_TIER_ROLES.includes(requester.role) &&
        facultyWithinScope(callerFacultyScope(requester), project.facultyId ?? ''));

    if (!isOwnProject && !hasStaffScopeAccess) {
      return res.status(403).json({ message: 'Forbidden.' });
    }

    const entriesSnap = await db.collection('projectRecordEntries')
      .where('projectId', '==', projectId)
      .orderBy('timestamp', 'asc')
      .get();

    const entries = entriesSnap.docs.map((doc) => {
      const e = doc.data();
      return {
        id: doc.id,
        type: e.type,
        actorId: e.actorId,
        actorRole: e.actorRole,
        actorDisplayName: e.actorDisplayName ?? null,
        data: e.data ?? null,
        timestamp: serializeTimestamp(e.timestamp),
      };
    });

    return res.status(200).json({
      project: {
        id: projectId,
        titleHe: project.titleHe ?? '',
        titleEn: project.titleEn ?? '',
        supervisorId: project.supervisorId ?? null,
        status: project.status ?? null,
      },
      entries,
    });
  } catch (error) {
    console.error('getProjectRecord error:', error);
    return res.status(500).json({ message: 'Failed to load project record' });
  }
};

function summarizeProject(doc: FirebaseFirestore.QueryDocumentSnapshot) {
  const p = doc.data();
  return {
    id: doc.id,
    titleHe: p.titleHe ?? '',
    titleEn: p.titleEn ?? '',
    status: p.status ?? null,
    supervisorId: p.supervisorId ?? null,
    enrolledStudentCount: (p.enrolledStudentIds ?? []).length,
  };
}

/**
 * GET /api/project-records/my-projects
 * The signed-in supervisor's own projects that have a record — i.e. at
 * least one student has joined. An empty (no-student) project has no
 * record yet and is deliberately excluded here.
 */
export const getMyProjectRecords = async (req: AuthenticatedRequest, res: Response) => {
  const requester = req.user;
  if (!requester) return res.status(401).json({ message: 'Unauthorized.' });

  try {
    const [asSupervisor, asSecondary] = await Promise.all([
      db.collection('projects').where('supervisorId', '==', requester.uid).get(),
      db.collection('projects').where('secondarySupervisorId', '==', requester.uid).get(),
    ]);
    const byId = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
    [...asSupervisor.docs, ...asSecondary.docs].forEach((doc) => byId.set(doc.id, doc));

    const projects = [...byId.values()]
      .filter((doc) => (doc.data().enrolledStudentIds ?? []).length > 0)
      .map(summarizeProject);

    return res.status(200).json({ projects });
  } catch (error) {
    console.error('getMyProjectRecords error:', error);
    return res.status(500).json({ message: 'Failed to load your project records' });
  }
};

async function queryUsersByRole(role: string): Promise<FirebaseFirestore.QueryDocumentSnapshot[]> {
  const [byRole, byRoles] = await Promise.all([
    db.collection('users').where('role', '==', role).get(),
    db.collection('users').where('roles', 'array-contains', role).get(),
  ]);
  const byId = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
  [...byRole.docs, ...byRoles.docs].forEach((doc) => byId.set(doc.id, doc));
  return [...byId.values()];
}

function supervisorInScope(user: Record<string, unknown>, scope: string[] | 'all'): boolean {
  if (scope === 'all') return true;
  const eff = effectiveFacultyIds(user as any, 'supervisorFacultyIds');
  const ownFacultyId = user.facultyId as string | undefined;
  return (ownFacultyId === 'all') || (eff === 'all') ||
    (typeof ownFacultyId === 'string' && scope.includes(ownFacultyId)) ||
    (Array.isArray(eff) && eff.some((id) => scope.includes(id)));
}

/**
 * GET /api/project-records/supervisors
 * Supervisors within the caller's own faculty scope — coordinator/
 * administrative_secretary/faculty_admin/program_head/grad_school_head only.
 * Every supervisor in scope is listed regardless of whether they currently
 * have a project with a record yet; that filtering happens one level down.
 */
export const getScopedSupervisors = async (req: AuthenticatedRequest, res: Response) => {
  const requester = req.user;
  if (!requester) return res.status(401).json({ message: 'Unauthorized.' });
  if (!COORDINATOR_TIER_ROLES.includes(requester.role)) {
    return res.status(403).json({ message: 'Access denied.' });
  }

  try {
    const scope = callerFacultyScope(requester);
    if (scope !== 'all' && scope.length === 0) {
      return res.status(200).json({ supervisors: [] });
    }

    const supervisorDocs = await queryUsersByRole('supervisor');
    const supervisors = supervisorDocs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .filter((u) => supervisorInScope(u, scope))
      .map((u: any) => ({
        id: u.id,
        displayName: u.displayName ?? u.fullName ?? 'Unknown',
        email: u.email ?? '',
        facultyId: u.facultyId ?? '',
      }));

    return res.status(200).json({ supervisors });
  } catch (error) {
    console.error('getScopedSupervisors error:', error);
    return res.status(500).json({ message: 'Failed to load supervisors' });
  }
};

/**
 * GET /api/project-records/supervisors/:supervisorId/projects
 * One supervisor's own non-empty projects — re-checks the target
 * supervisor's own faculty against the caller's scope (never trust the
 * :supervisorId path param alone) before returning anything.
 */
export const getSupervisorProjectRecords = async (req: AuthenticatedRequest, res: Response) => {
  const requester = req.user;
  const { supervisorId } = req.params;
  if (!requester) return res.status(401).json({ message: 'Unauthorized.' });
  if (!COORDINATOR_TIER_ROLES.includes(requester.role)) {
    return res.status(403).json({ message: 'Access denied.' });
  }
  if (!supervisorId || typeof supervisorId !== 'string') {
    return res.status(400).json({ message: 'Invalid supervisorId' });
  }

  try {
    const scope = callerFacultyScope(requester);
    const supervisorSnap = await db.collection('users').doc(supervisorId).get();
    if (!supervisorSnap.exists) return res.status(404).json({ message: 'Supervisor not found' });
    if (!supervisorInScope({ id: supervisorSnap.id, ...supervisorSnap.data() }, scope)) {
      return res.status(403).json({ message: 'This supervisor is outside your assigned scope.' });
    }

    const [asSupervisor, asSecondary] = await Promise.all([
      db.collection('projects').where('supervisorId', '==', supervisorId).get(),
      db.collection('projects').where('secondarySupervisorId', '==', supervisorId).get(),
    ]);
    const byId = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
    [...asSupervisor.docs, ...asSecondary.docs].forEach((doc) => byId.set(doc.id, doc));

    const projects = [...byId.values()]
      .filter((doc) => (doc.data().enrolledStudentIds ?? []).length > 0)
      .map(summarizeProject);

    return res.status(200).json({ projects });
  } catch (error) {
    console.error('getSupervisorProjectRecords error:', error);
    return res.status(500).json({ message: 'Failed to load this supervisor\'s project records' });
  }
};

/**
 * GET /api/project-records/faculties
 * system_admin only: every faculty -> its majors, so the web/mobile admin
 * screen can drill faculty -> major -> supervisor -> project. Supervisor
 * listing per faculty/major reuses getScopedSupervisors' own query — this
 * endpoint just enumerates the taxonomy itself.
 */
export const getFacultyTaxonomyForRecords = async (req: AuthenticatedRequest, res: Response) => {
  const requester = req.user;
  if (!requester) return res.status(401).json({ message: 'Unauthorized.' });
  if (requester.role !== 'system_admin') {
    return res.status(403).json({ message: 'Access denied: system_admin only.' });
  }

  const faculties = Object.entries(MAJORS_BY_FACULTY).map(([facultyId, majors]) => ({ facultyId, majors }));
  return res.status(200).json({ faculties });
};
