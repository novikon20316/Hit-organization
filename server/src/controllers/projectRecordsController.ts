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
import {
  editProjectRecordEntry as editEntryData,
  deleteProjectRecordEntry as deleteEntryData,
  restoreProjectRecordEntry as restoreEntryData,
} from '../services/projectRecords.js';
import { logAuditEvent } from '../services/auditLog.js';
import { L } from '../utils/localize.js';
import * as XLSX from 'xlsx';
import { facultyName } from '../services/studentProgress.js';

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
  if (!requester) return res.status(401).json({ message: L(req, 'Unauthorized.', 'אין הרשאה.') });
  if (!isValidDocId(projectId)) {
    return res.status(400).json({ message: L(req, 'Invalid projectId', 'מזהה פרויקט לא תקין') });
  }

  try {
    const projectSnap = await db.collection('projects').doc(projectId).get();
    if (!projectSnap.exists) return res.status(404).json({ message: L(req, 'Project not found', 'הפרויקט לא נמצא') });
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
      return res.status(403).json({ message: L(req, 'Forbidden.', 'הגישה נדחתה.') });
    }

    const entriesSnap = await db.collection('projectRecordEntries')
      .where('projectId', '==', projectId)
      .orderBy('timestamp', 'asc')
      .get();

    // Only system_admin can ever see a soft-deleted entry (it's how she
    // confirms a delete/restore actually took effect) — every other role
    // gets the entry filtered out entirely, same as if it never existed.
    const isAdmin = hasAnyRole(requester, ['system_admin']);
    const entries = entriesSnap.docs
      .filter((doc) => isAdmin || doc.data().deleted !== true)
      .map((doc) => {
        const e = doc.data();
        return {
          id: doc.id,
          type: e.type,
          actorId: e.actorId,
          actorRole: e.actorRole,
          actorDisplayName: e.actorDisplayName ?? null,
          data: e.data ?? null,
          timestamp: serializeTimestamp(e.timestamp),
          // Break-glass correction metadata (see services/projectRecords.ts's
          // editProjectRecordEntry/deleteProjectRecordEntry) — only ever
          // meaningful, and only ever sent, to system_admin; every other
          // viewer gets a plain entry with no trace this field group exists.
          ...(isAdmin ? {
            edited: e.edited === true,
            editHistory: (e.editHistory ?? []).map((h: any) => ({
              previousData: h.previousData ?? null,
              editedBy: h.editedBy,
              editedByName: h.editedByName ?? null,
              editedAt: serializeTimestamp(h.editedAt),
              reason: h.reason,
            })),
            deleted: e.deleted === true,
            deletedBy: e.deletedBy ?? null,
            deletedByName: e.deletedByName ?? null,
            deletedAt: serializeTimestamp(e.deletedAt),
            deleteReason: e.deleteReason ?? null,
          } : {}),
        };
      });

    // Currently enrolled students' names, so a staff viewer drilling into a
    // project can see who it belongs to without reading the timeline.
    const studentIds: string[] = (project.enrolledStudentIds ?? []).filter((sid: unknown) => typeof sid === 'string' && isValidDocId(sid));
    const studentSnaps = studentIds.length
      ? await db.getAll(...studentIds.map((sid) => db.collection('users').doc(sid)))
      : [];
    const students = studentSnaps.map((snap) => ({
      id: snap.id,
      displayName: (snap.exists ? snap.data()?.displayName : null) ?? null,
    }));

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
        students,
      },
      entries,
      // Tells the client whether to render the system_admin-only edit/
      // delete/restore/renumber controls — cheaper than re-deriving the
      // role check client-side, and the real enforcement is server-side
      // regardless (every mutating endpoint below re-checks system_admin
      // itself).
      canEdit: isAdmin,
    });
  } catch (error) {
    console.error('getProjectRecord error:', error);
    return res.status(500).json({ message: L(req, 'Failed to load project record', 'טעינת רשומת הפרויקט נכשלה') });
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
  if (!requester) return res.status(401).json({ message: L(req, 'Unauthorized.', 'אין הרשאה.') });

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
    return res.status(500).json({ message: L(req, 'Failed to load your project records', 'טעינת רשומות הפרויקטים שלך נכשלה') });
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
  if (!requester) return res.status(401).json({ message: L(req, 'Unauthorized.', 'אין הרשאה.') });
  if (!hasAnyRole(requester, STAFF_RECORD_ROLES)) {
    return res.status(403).json({ message: L(req, 'Access denied.', 'הגישה נדחתה.') });
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
    return res.status(500).json({ message: L(req, 'Failed to load supervisors', 'טעינת רשימת המנחים נכשלה') });
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
  if (!requester) return res.status(401).json({ message: L(req, 'Unauthorized.', 'אין הרשאה.') });
  if (!hasAnyRole(requester, STAFF_RECORD_ROLES)) {
    return res.status(403).json({ message: L(req, 'Access denied.', 'הגישה נדחתה.') });
  }
  if (!isValidDocId(supervisorId)) {
    return res.status(400).json({ message: L(req, 'Invalid supervisorId', 'מזהה מנחה לא תקין') });
  }

  try {
    const scope = callerRecordScope(requester);
    const supervisorSnap = await db.collection('users').doc(supervisorId).get();
    if (!supervisorSnap.exists) return res.status(404).json({ message: L(req, 'Supervisor not found', 'המנחה לא נמצא') });
    if (!supervisorInScope({ id: supervisorSnap.id, ...supervisorSnap.data() }, scope)) {
      return res.status(403).json({ message: L(req, 'This supervisor is outside your assigned scope.', 'מנחה זה מחוץ לתחום האחריות שהוקצה לך.') });
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
    return res.status(500).json({ message: L(req, 'Failed to load this supervisor\'s project records', 'טעינת רשומות הפרויקטים של מנחה זה נכשלה') });
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
  if (!requester) return res.status(401).json({ message: L(req, 'Unauthorized.', 'אין הרשאה.') });
  if (!hasAnyRole(requester, ['system_admin'])) {
    return res.status(403).json({ message: L(req, 'Access denied: system_admin only.', 'הגישה נדחתה: מנהל מערכת בלבד.') });
  }

  const faculties = Object.entries(MAJORS_BY_FACULTY).map(([facultyId, majors]) => ({ facultyId, majors }));
  return res.status(200).json({ faculties });
};

// ─── system_admin-only break-glass corrections ──────────────────────────────
// Every endpoint below is the deliberate exception to this feature's own
// "permanent, immutable, nobody can edit it" design (see the header comment
// in services/projectRecords.ts) — reserved for system_admin alone, and
// every call is logged twice: once in auditLog (who/when/old→new) and once
// on the entry/project itself (editHistory, deletedAt/deletedBy, so the
// record still visibly shows it was altered rather than silently rewriting
// history). A reason is mandatory on every one of these, same convention
// as every other "overwrite something that already happened" flow in this
// codebase (e.g. UpdateGradeModal.tsx's grade-change reason).

/**
 * PATCH /api/project-records/entries/:entryId
 * Body: { data: object, reason: string }
 */
export const editProjectRecordEntry = async (req: AuthenticatedRequest, res: Response) => {
  const requester = req.user;
  const { entryId } = req.params;
  if (!requester) return res.status(401).json({ message: L(req, 'Unauthorized.', 'אין הרשאה.') });
  if (!hasAnyRole(requester, ['system_admin'])) {
    return res.status(403).json({ message: L(req, 'Access denied: system_admin only.', 'הגישה נדחתה: מנהל מערכת בלבד.') });
  }
  if (!isValidDocId(entryId)) {
    return res.status(400).json({ message: L(req, 'Invalid entryId', 'מזהה רשומה לא תקין') });
  }
  const { data, reason } = req.body ?? {};
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return res.status(400).json({ message: L(req, 'data must be an object.', 'data חייב להיות אובייקט.') });
  }
  if (!reason || typeof reason !== 'string' || !reason.trim()) {
    return res.status(400).json({ message: L(req, 'A reason is required to edit a record entry.', 'יש לציין נימוק לעריכת רשומה.') });
  }

  try {
    const ref = db.collection('projectRecordEntries').doc(entryId);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ message: L(req, 'Record entry not found.', 'הרשומה לא נמצאה.') });
    const before = snap.data()!;

    await editEntryData({
      entryId,
      newData: data,
      editedBy: requester.uid,
      editedByName: requester.displayName ?? '',
      reason: reason.trim(),
    });

    await logAuditEvent({
      userId: requester.uid,
      userRole: requester.role ?? 'system_admin',
      action: 'project_record_entry_edited',
      entityType: 'projectRecordEntry',
      entityId: entryId,
      oldValue: { data: before.data ?? null },
      newValue: { data, reason: reason.trim() },
    });

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('editProjectRecordEntry error:', error);
    return res.status(500).json({ message: L(req, 'Failed to edit record entry.', 'עריכת הרשומה נכשלה.') });
  }
};

/**
 * DELETE /api/project-records/entries/:entryId
 * Body: { reason: string }
 */
export const deleteProjectRecordEntry = async (req: AuthenticatedRequest, res: Response) => {
  const requester = req.user;
  const { entryId } = req.params;
  if (!requester) return res.status(401).json({ message: L(req, 'Unauthorized.', 'אין הרשאה.') });
  if (!hasAnyRole(requester, ['system_admin'])) {
    return res.status(403).json({ message: L(req, 'Access denied: system_admin only.', 'הגישה נדחתה: מנהל מערכת בלבד.') });
  }
  if (!isValidDocId(entryId)) {
    return res.status(400).json({ message: L(req, 'Invalid entryId', 'מזהה רשומה לא תקין') });
  }
  const { reason } = req.body ?? {};
  if (!reason || typeof reason !== 'string' || !reason.trim()) {
    return res.status(400).json({ message: L(req, 'A reason is required to delete a record entry.', 'יש לציין נימוק למחיקת רשומה.') });
  }

  try {
    const ref = db.collection('projectRecordEntries').doc(entryId);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ message: L(req, 'Record entry not found.', 'הרשומה לא נמצאה.') });
    if (snap.data()!.deleted === true) {
      return res.status(409).json({ message: L(req, 'This entry is already deleted.', 'רשומה זו נמחקה כבר.') });
    }

    await deleteEntryData({
      entryId,
      deletedBy: requester.uid,
      deletedByName: requester.displayName ?? '',
      reason: reason.trim(),
    });

    await logAuditEvent({
      userId: requester.uid,
      userRole: requester.role ?? 'system_admin',
      action: 'project_record_entry_deleted',
      entityType: 'projectRecordEntry',
      entityId: entryId,
      oldValue: null,
      newValue: { reason: reason.trim() },
    });

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('deleteProjectRecordEntry error:', error);
    return res.status(500).json({ message: L(req, 'Failed to delete record entry.', 'מחיקת הרשומה נכשלה.') });
  }
};

/**
 * POST /api/project-records/entries/:entryId/restore
 */
export const restoreProjectRecordEntry = async (req: AuthenticatedRequest, res: Response) => {
  const requester = req.user;
  const { entryId } = req.params;
  if (!requester) return res.status(401).json({ message: L(req, 'Unauthorized.', 'אין הרשאה.') });
  if (!hasAnyRole(requester, ['system_admin'])) {
    return res.status(403).json({ message: L(req, 'Access denied: system_admin only.', 'הגישה נדחתה: מנהל מערכת בלבד.') });
  }
  if (!isValidDocId(entryId)) {
    return res.status(400).json({ message: L(req, 'Invalid entryId', 'מזהה רשומה לא תקין') });
  }

  try {
    const ref = db.collection('projectRecordEntries').doc(entryId);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ message: L(req, 'Record entry not found.', 'הרשומה לא נמצאה.') });
    if (snap.data()!.deleted !== true) {
      return res.status(409).json({ message: L(req, 'This entry is not deleted.', 'רשומה זו אינה מחוקה.') });
    }

    await restoreEntryData(entryId);

    await logAuditEvent({
      userId: requester.uid,
      userRole: requester.role ?? 'system_admin',
      action: 'project_record_entry_restored',
      entityType: 'projectRecordEntry',
      entityId: entryId,
      oldValue: null,
      newValue: null,
    });

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('restoreProjectRecordEntry error:', error);
    return res.status(500).json({ message: L(req, 'Failed to restore record entry.', 'שחזור הרשומה נכשל.') });
  }
};

/**
 * PATCH /api/project-records/:projectId/record-number
 * Body: { recordNumber: string, reason: string }
 * system_admin override for a project's own permanent record number (see
 * services/projectRecordNumber.ts) — e.g. correcting a wrong faculty
 * assignment or a duplicate. Deliberately does NOT re-validate the new
 * value against the per-faculty counter/format — an admin override is
 * exactly the escape hatch for when that automatic scheme got it wrong.
 */
export const updateProjectRecordNumber = async (req: AuthenticatedRequest, res: Response) => {
  const requester = req.user;
  const { projectId } = req.params;
  if (!requester) return res.status(401).json({ message: L(req, 'Unauthorized.', 'אין הרשאה.') });
  if (!hasAnyRole(requester, ['system_admin'])) {
    return res.status(403).json({ message: L(req, 'Access denied: system_admin only.', 'הגישה נדחתה: מנהל מערכת בלבד.') });
  }
  if (!isValidDocId(projectId)) {
    return res.status(400).json({ message: L(req, 'Invalid projectId', 'מזהה פרויקט לא תקין') });
  }
  const { recordNumber, reason } = req.body ?? {};
  if (!recordNumber || typeof recordNumber !== 'string' || !recordNumber.trim() || recordNumber.trim().length > 64) {
    return res.status(400).json({ message: L(req, 'recordNumber must be a non-empty string (max 64 characters).', 'recordNumber חייב להיות מחרוזת לא ריקה (עד 64 תווים).') });
  }
  if (!reason || typeof reason !== 'string' || !reason.trim()) {
    return res.status(400).json({ message: L(req, 'A reason is required to change a record number.', 'יש לציין נימוק לשינוי מספר רשומה.') });
  }

  try {
    const ref = db.collection('projects').doc(projectId);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ message: L(req, 'Project not found.', 'הפרויקט לא נמצא.') });
    const before = snap.data()!.recordNumber ?? null;
    const next = recordNumber.trim();

    await ref.update({ recordNumber: next });

    await logAuditEvent({
      userId: requester.uid,
      userRole: requester.role ?? 'system_admin',
      action: 'project_record_number_changed',
      entityType: 'project',
      entityId: projectId,
      oldValue: { recordNumber: before },
      newValue: { recordNumber: next, reason: reason.trim() },
    });

    return res.status(200).json({ success: true, recordNumber: next });
  } catch (error) {
    console.error('updateProjectRecordNumber error:', error);
    return res.status(500).json({ message: L(req, 'Failed to update record number.', 'עדכון מספר הרשומה נכשל.') });
  }
};

// ─── Excel export ────────────────────────────────────────────────────────────
// GET /api/project-records/export?facultyId=&from=YYYY-MM-DD&to=YYYY-MM-DD
// Every record the caller may already see on the records screens
// (callerRecordScope + projectWithinScope — same rule), as an .xlsx the
// college can analyse over time. Two sheets: one row per project with
// summary counts (submissions, rejections, resubmissions, approvals, first
// and last activity), and one row per record. Soft-deleted entries are left
// out for everyone. Filters are optional; the date range applies to the
// records' own timestamps.

const RECORD_TYPE_HE: Record<string, string> = {
  student_joined_project: 'סטודנט הצטרף לפרויקט',
  milestone_submitted: 'אבן דרך הוגשה',
  milestone_resubmitted: 'אבן דרך הוגשה מחדש',
  milestone_approved: 'אבן דרך אושרה',
  milestone_rejected: 'אבן דרך נדחתה',
  grade_submitted: 'ציון הוזן',
  grade_changed: 'ציון עודכן',
  final_grade_approved: 'ציון סופי אושר',
  examiner_assigned: 'בוחן/ת שובץ/ה',
  examiner_removed: 'בוחן/ת הוסר/ה',
  message_sent: 'הודעה נשלחה',
  defense_date_resolved: 'תאריך הגנה נקבע',
  project_status_changed: 'סטטוס הפרויקט השתנה',
  supervisor_reassigned: 'מנחה הוחלף/ה',
};

const ROLE_HE: Record<string, string> = {
  student: 'סטודנט/ית', supervisor: 'מנחה', secondary_supervisor: 'מנחה משני/ה', coordinator: 'רכז/ת',
  administrative_secretary: 'רכז/ת אדמיניסטרטיבי/ת', faculty_admin: 'מנהל/ת פקולטה', program_head: 'ראש תוכנית',
  grad_school_head: 'ראש בית ספר לתארים מתקדמים', dean: 'דיקן/ית', school_head: 'ראש בית ספר', division_head: 'ראש חטיבה',
  internal_examiner: 'בוחן/ת', system_admin: 'מנהל/ת מערכת', system: 'מערכת',
};

function recordDetails(data: unknown): string {
  if (!data || typeof data !== 'object') return '';
  return Object.entries(data as Record<string, unknown>)
    // Internal document ids (supervisorId, milestoneId, ...) mean nothing in a spreadsheet.
    .filter(([k, v]) => v !== null && v !== undefined && v !== '' && !/Ids?$/.test(k))
    .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
    .join(' | ')
    .slice(0, 2000);
}

function parseDay(v: unknown, endOfDay: boolean): number | null {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const ms = Date.parse(`${v}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`);
  return Number.isFinite(ms) ? ms : null;
}

export const exportProjectRecords = async (req: AuthenticatedRequest, res: Response) => {
  const requester = req.user;
  if (!requester) return res.status(401).json({ message: L(req, 'Unauthorized.', 'אין הרשאה.') });
  if (!hasAnyRole(requester, STAFF_RECORD_ROLES)) {
    return res.status(403).json({ message: L(req, 'Access denied.', 'הגישה נדחתה.') });
  }
  const scope = callerRecordScope(requester);
  const facultyFilter = typeof req.query.facultyId === 'string' && req.query.facultyId ? req.query.facultyId : null;
  if (facultyFilter && (!(facultyFilter in MAJORS_BY_FACULTY) || !facultyWithinScope(scope, facultyFilter))) {
    return res.status(403).json({ message: L(req, 'This faculty is outside your scope.', 'פקולטה זו אינה בתחום האחריות שלך.') });
  }
  const fromMs = parseDay(req.query.from, false);
  const toMs = parseDay(req.query.to, true);

  try {
    const projectsSnap = facultyFilter
      ? await db.collection('projects').where('facultyId', '==', facultyFilter).get()
      : await db.collection('projects').get();
    const projects = projectsSnap.docs
      .map((d) => ({ id: d.id, ...d.data() }) as { id: string; facultyId?: string; major?: string; degreeType?: string; [k: string]: any })
      .filter((p) => projectWithinScope(scope, p));

    // Records for those projects ('in' takes at most 30 ids per query).
    const entriesByProject = new Map<string, Array<Record<string, any>>>();
    for (let i = 0; i < projects.length; i += 30) {
      const ids = projects.slice(i, i + 30).map((p) => p.id);
      const snap = await db.collection('projectRecordEntries').where('projectId', 'in', ids).get();
      snap.docs.forEach((d) => {
        const e = d.data();
        if (e.deleted === true) return;
        const ts = e.timestamp?.toMillis?.() ?? null;
        if (fromMs !== null && (ts === null || ts < fromMs)) return;
        if (toMs !== null && (ts === null || ts > toMs)) return;
        const list = entriesByProject.get(e.projectId) ?? [];
        list.push({ ...e, _ms: ts });
        entriesByProject.set(e.projectId, list);
      });
    }

    const supervisorIds = [...new Set(projects.map((p) => p.supervisorId).filter((s): s is string => typeof s === 'string' && isValidDocId(s)))];
    const supervisorSnaps = supervisorIds.length ? await db.getAll(...supervisorIds.map((id) => db.collection('users').doc(id))) : [];
    const supervisorName = new Map(supervisorSnaps.map((s) => [s.id, (s.data()?.displayName as string | undefined) ?? '']));
    // Israel time, sortable text ("2026-10-17 20:31").
    const iso = (ms: number | null) => (ms ? new Date(ms).toLocaleString('sv-SE', { timeZone: 'Asia/Jerusalem' }).slice(0, 16) : '');

    const included = projects.filter((p) => (entriesByProject.get(p.id) ?? []).length > 0 || (fromMs === null && toMs === null));
    const projectRows = included.map((p) => {
      const list = (entriesByProject.get(p.id) ?? []).sort((a, b) => (a._ms ?? 0) - (b._ms ?? 0));
      const count = (t: string) => list.filter((e) => e.type === t).length;
      return {
        'מספר רישום': p.recordNumber ?? '',
        'פקולטה': facultyName(p.facultyId ?? '').he,
        'מגמה': p.major ?? '',
        'תואר': p.degreeType === 'masters' ? 'תואר שני' : p.degreeType === 'bachelors' ? 'תואר ראשון' : (p.degreeType ?? ''),
        'סוג': p.projectType === 'thesis' ? 'תזה' : p.projectType === 'project' ? 'פרויקט' : (p.projectType ?? ''),
        'שם הפרויקט': p.titleHe || p.titleEn || '',
        'מנחה': supervisorName.get(p.supervisorId) ?? '',
        'סטטוס': p.status ?? '',
        'מספר רשומות': list.length,
        'הגשות': count('milestone_submitted'),
        'הגשות חוזרות': count('milestone_resubmitted'),
        'אישורים': count('milestone_approved'),
        'דחיות': count('milestone_rejected'),
        'ציון סופי אושר': count('final_grade_approved') > 0 ? 'כן' : 'לא',
        'פעילות ראשונה': iso(list[0]?._ms ?? null),
        'פעילות אחרונה': iso(list[list.length - 1]?._ms ?? null),
      };
    });

    const recordRows = included.flatMap((p) =>
      (entriesByProject.get(p.id) ?? []).map((e) => ({
        'מספר רישום': p.recordNumber ?? '',
        'שם הפרויקט': p.titleHe || p.titleEn || '',
        'פקולטה': facultyName(p.facultyId ?? '').he,
        'תאריך': iso(e._ms),
        'אירוע': RECORD_TYPE_HE[e.type] ?? e.type ?? '',
        'בוצע על ידי (תפקיד)': ROLE_HE[e.actorRole] ?? e.actorRole ?? '',
        'בוצע על ידי (שם)': e.actorDisplayName ?? '',
        'פרטים': recordDetails(e.data),
      })),
    ).sort((a, b) => String(a['מספר רישום']).localeCompare(String(b['מספר רישום'])) || a['תאריך'].localeCompare(b['תאריך']));

    const wb = XLSX.utils.book_new();
    (wb as any).Workbook = { Views: [{ RTL: true }] };
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(projectRows), 'פרויקטים');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(recordRows), 'רשומות');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    await logAuditEvent({
      userId: requester.uid,
      userRole: requester.role,
      action: 'project_records_exported',
      entityType: 'project',
      entityId: facultyFilter ?? 'all',
      newValue: { facultyId: facultyFilter, from: req.query.from ?? null, to: req.query.to ?? null, projects: projectRows.length, records: recordRows.length },
      userDisplayName: requester.displayName,
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="project-records.xlsx"');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(buffer);
  } catch (error) {
    console.error('exportProjectRecords error:', error);
    return res.status(500).json({ message: L(req, 'Failed to export project records.', 'ייצוא רישומי הפרויקטים נכשל.') });
  }
};
