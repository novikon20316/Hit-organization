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
import { AuthenticatedRequest, getUserRoles, hasAnyRole } from '../middleware/auth.js';
import { db } from '../config/firebase.js';
import { effectiveFacultyIds } from '../services/scopeAuthorization.js';
import { MAJORS_BY_FACULTY } from '../config/majors.js';
import { isValidDocId } from '../services/idValidation.js';

type AuthUser = NonNullable<AuthenticatedRequest['user']>;

// Every staff role with read access to this feature, including system_admin
// — callerRecordScope/supervisorInScope already special-case system_admin's
// 'all' scope, so it's safe to fold in here rather than re-deriving an
// explicit system_admin bypass at every call site (a bug the admin drill-down
// screen actually hit: getScopedSupervisors/getSupervisorProjectRecords used
// to gate on the narrower list below, 403ing system_admin on its own feature).
//
// dean and school_head added alongside the per-faculty recordNumber feature
// — both were previously locked out of this screen entirely. See
// callerRecordScope for how each role's scope narrows (dean: own faculty,
// every major/degree; school_head: own major(s) via coordinatorScopes, both
// degrees; grad_school_head: every granted faculty but masters only).
const STAFF_RECORD_ROLES = ['coordinator', 'administrative_secretary', 'faculty_admin', 'program_head', 'grad_school_head', 'dean', 'school_head', 'system_admin'];

function serializeTimestamp(value: any): string | null {
  return value?.toDate?.().toISOString?.() ?? null;
}

/** One faculty/major/degree-level restriction this caller's scope is built
 *  from — 'all' on facultyId means every faculty, major/degreeLevel absent
 *  means every major/degree within that faculty. A caller's full scope is
 *  the union of these (any one entry matching is enough), or the literal
 *  string 'all' meaning no restriction whatsoever. */
interface RecordScopeEntry {
  facultyId: string;
  major?: string;
  degreeLevel?: 'bachelors' | 'masters';
}
type RecordScope = RecordScopeEntry[] | 'all';

/** This caller's full record-viewing scope — the project-level filter
 *  (projectWithinScope) is what actually gates access; facultyWithinScope
 *  is only used for the coarser "which faculties/supervisors to list at
 *  all" step. An empty array means no access at all (e.g. a coordinator-
 *  tier or school_head account with no scope configured yet), matching
 *  withinCoordinatorScope's own "deny rather than silently grant" fallback. */
function callerRecordScope(user: AuthUser): RecordScope {
  const roles = getUserRoles(user);
  if (roles.includes('system_admin')) return 'all';
  if (roles.includes('faculty_admin')) {
    const ids = effectiveFacultyIds(user, 'facultyAdminFacultyIds');
    return ids === 'all' ? 'all' : ids.map((facultyId) => ({ facultyId }));
  }
  if (roles.includes('program_head')) {
    const ids = effectiveFacultyIds(user, 'programHeadFacultyIds');
    return ids === 'all' ? 'all' : ids.map((facultyId) => ({ facultyId }));
  }
  // Every faculty she's granted, but masters only — regardless of any
  // coordinatorScopes she might also carry; grad_school_head's entire
  // reason to exist is the masters/thesis track, never bachelor's.
  if (roles.includes('grad_school_head')) {
    const ids = effectiveFacultyIds(user, 'gradSchoolHeadFacultyIds');
    return (ids === 'all' ? ['all'] : ids).map((facultyId) => ({ facultyId, degreeLevel: 'masters' as const }));
  }
  // dean: own faculty only, every major/degree within it — no *FacultyIds
  // multi-grant field exists for this role today (unlike faculty_admin/
  // program_head/grad_school_head above).
  if (roles.includes('dean')) {
    return user.facultyId && user.facultyId !== 'all' ? [{ facultyId: user.facultyId }] : [];
  }
  // school_head, coordinator, administrative_secretary all share the same
  // coordinatorScopes mechanism — school_head's scope entries are simply
  // expected to always carry a `major` (that's this role's entire reason
  // to exist, see scopeAuthorization.ts), but nothing here requires it; an
  // entry with no major still works, it just means "this whole faculty".
  if (roles.includes('coordinator') || roles.includes('administrative_secretary') || roles.includes('school_head')) {
    if (user.coordinatorScopes.length > 0) {
      const entries: RecordScopeEntry[] = [];
      for (const scope of user.coordinatorScopes) {
        if (scope.facultyId === 'all') return 'all';
        entries.push({
          facultyId: scope.facultyId,
          ...(scope.major ? { major: scope.major } : {}),
          ...(scope.degreeLevel ? { degreeLevel: scope.degreeLevel } : {}),
        });
      }
      return entries;
    }
    return user.facultyId !== 'all' ? [{ facultyId: user.facultyId }] : [];
  }
  return [];
}

function facultyWithinScope(scope: RecordScope, facultyId: string): boolean {
  return scope === 'all' || scope.some((e) => e.facultyId === 'all' || e.facultyId === facultyId);
}

/** The real project-level gate — unlike facultyWithinScope above, this also
 *  honors a scope entry's own major/degreeLevel restriction, so a
 *  school_head only sees her own major's projects (not her faculty's other
 *  majors) and a grad_school_head only sees masters projects, even though
 *  both are listed under a faculty that also has other majors/degrees. */
function projectWithinScope(scope: RecordScope, project: { facultyId?: string | null; major?: string | null; degreeType?: string | null }): boolean {
  if (scope === 'all') return true;
  const facultyId = project.facultyId ?? '';
  return scope.some((e) =>
    (e.facultyId === 'all' || e.facultyId === facultyId) &&
    (!e.major || e.major === project.major) &&
    (!e.degreeLevel || e.degreeLevel === project.degreeType)
  );
}

/**
 * GET /api/project-records/:projectId
 * Full chronological timeline for one project.
 */
export const getProjectRecord = async (req: AuthenticatedRequest, res: Response) => {
  const requester = req.user;
  const { projectId } = req.params;
  if (!requester) return res.status(401).json({ message: 'Unauthorized.' });
  if (!isValidDocId(projectId)) {
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
      hasAnyRole(requester, ['system_admin']) ||
      (hasAnyRole(requester, STAFF_RECORD_ROLES) &&
        projectWithinScope(callerRecordScope(requester), project));

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
        // Permanent per-faculty record number (see services/
        // projectRecordNumber.ts) — null for a project created before this
        // feature existed and not yet covered by the backfill script.
        recordNumber: project.recordNumber ?? null,
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
    recordNumber: p.recordNumber ?? null,
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

// Approximate, faculty-only check — just decides which supervisors are
// worth listing at all in the drill-down. The precise major/degreeLevel
// restriction (school_head/grad_school_head/coordinator-with-a-narrow-
// scope) is enforced for real where it matters, at the PROJECT level, by
// projectWithinScope in getSupervisorProjectRecords/getProjectRecord below
// — a supervisor who teaches both the caller's major and another one still
// shows up here, but drilling into them only reveals the in-scope projects.
function supervisorInScope(user: Record<string, unknown>, scope: RecordScope): boolean {
  if (scope === 'all') return true;
  const eff = effectiveFacultyIds(user as any, 'supervisorFacultyIds');
  const ownFacultyId = user.facultyId as string | undefined;
  return (ownFacultyId === 'all') || (eff === 'all') ||
    (typeof ownFacultyId === 'string' && facultyWithinScope(scope, ownFacultyId)) ||
    (Array.isArray(eff) && eff.some((id) => facultyWithinScope(scope, id)));
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
  if (!hasAnyRole(requester, STAFF_RECORD_ROLES)) {
    return res.status(403).json({ message: 'Access denied.' });
  }

  try {
    const scope = callerRecordScope(requester);
    if (scope !== 'all' && scope.length === 0) {
      return res.status(200).json({ supervisors: [] });
    }

    const supervisorDocs = await queryUsersByRole('supervisor');
    const scopedSupervisors = supervisorDocs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .filter((u) => supervisorInScope(u, scope));

    // Read-only "monitor the supervisor's work, without interfering" view —
    // how many student submissions are currently sitting in each
    // supervisor's review queue (status === 'submitted', the same status
    // milestoneController.ts's submitMilestone sets and immediately
    // notifies the supervisor about) and how long the oldest one has been
    // waiting. No coordinator-facing action reads/writes these milestones
    // through this endpoint — it's a count, not a queue they can act on.
    const supervisorIds = new Set(scopedSupervisors.map((u: any) => u.id));
    const pendingBySupervisor = new Map<string, { count: number; oldestMs: number | null }>();
    if (supervisorIds.size > 0) {
      const pendingSnap = await db.collection('milestones').where('status', '==', 'submitted').get();
      pendingSnap.docs.forEach((doc) => {
        const m = doc.data();
        const sid: string | undefined = m.supervisorId;
        if (!sid || !supervisorIds.has(sid)) return;
        const submittedMs: number | null = m.submittedAt?.toMillis?.() ?? null;
        const entry = pendingBySupervisor.get(sid) ?? { count: 0, oldestMs: null };
        entry.count += 1;
        if (submittedMs !== null && (entry.oldestMs === null || submittedMs < entry.oldestMs)) entry.oldestMs = submittedMs;
        pendingBySupervisor.set(sid, entry);
      });
    }

    const supervisors = scopedSupervisors.map((u: any) => {
      const pending = pendingBySupervisor.get(u.id);
      return {
        id: u.id,
        displayName: u.displayName ?? u.fullName ?? 'Unknown',
        email: u.email ?? '',
        facultyId: u.facultyId ?? '',
        // Written by server/src/controllers/userController.ts's
        // logLogin/logout handlers — ISO strings, null if never recorded.
        lastLoginAt: u.lastLoginAt ?? null,
        lastLoginPlatform: u.lastLoginPlatform ?? null,
        lastLogoutAt: u.lastLogoutAt ?? null,
        lastLogoutPlatform: u.lastLogoutPlatform ?? null,
        pendingReviewCount: pending?.count ?? 0,
        oldestPendingSubmittedAt: pending?.oldestMs != null ? new Date(pending.oldestMs).toISOString() : null,
      };
    });

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
  if (!hasAnyRole(requester, STAFF_RECORD_ROLES)) {
    return res.status(403).json({ message: 'Access denied.' });
  }
  if (!isValidDocId(supervisorId)) {
    return res.status(400).json({ message: 'Invalid supervisorId' });
  }

  try {
    const scope = callerRecordScope(requester);
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

    // supervisorInScope above is only the coarse "is this supervisor worth
    // showing at all" check (faculty-level) — a supervisor can teach
    // several majors/degrees, so each of THEIR projects still needs its
    // own precise major/degreeLevel check against the caller's real scope
    // (a school_head must not see this supervisor's other-major projects
    // just because the supervisor themselves passed the coarse check).
    const projects = [...byId.values()]
      .filter((doc) => (doc.data().enrolledStudentIds ?? []).length > 0)
      .filter((doc) => projectWithinScope(scope, doc.data()))
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
  if (!hasAnyRole(requester, ['system_admin'])) {
    return res.status(403).json({ message: 'Access denied: system_admin only.' });
  }

  const faculties = Object.entries(MAJORS_BY_FACULTY).map(([facultyId, majors]) => ({ facultyId, majors }));
  return res.status(200).json({ faculties });
};
