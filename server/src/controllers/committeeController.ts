// src/controllers/committeeController.ts
//
// Thesis/final-project review committees — one committee per
// (facultyId, major, degreeLevel, type) quadruple, doc id
// `${facultyId}_${major}_${degreeLevel}_${type}` for natural uniqueness (no
// query needed to check "does this committee already exist"). degreeLevel is
// its own axis (not folded into `type`) because a major's slug is shared
// across degree levels (see lib/faculties.ts — e.g. 'computer_science' is
// both bsc_cs and msc_cs), so without it a bachelor's final_project
// committee and a master's project-track committee for the same major would
// silently collide onto one doc. Bachelor's has no thesis/project split
// (matches workflowTemplates.ts's ProcessType: 'bsc_project' is the only
// bachelor's process) — degreeLevel 'bachelors' always pairs with type
// 'final_project'. A committee has a member list and one designated
// chairman (a plain member flag, NOT derived from the program_head role —
// program_head today only scopes to a whole faculty, not a specific major,
// so "head of computer_science" vs "head of applied_mathematics" — both
// under the 'sciences' faculty — can't be told apart via role/scope alone).
//
// Permission model: system_admin can create/edit any committee (including
// reassigning its chairman, for fixing a stuck/misconfigured committee);
// a committee's own current chairman can edit ITS membership/chairman
// going forward. Nobody else can write. See services/workflowTemplates.ts's
// new 'committee' ChainRole for how a milestone actually routes to one of
// these at submission time.

import { Response } from 'express';
import admin from 'firebase-admin';
import { db } from '../config/firebase.js';
import { AuthenticatedRequest, hasAnyRole } from '../middleware/auth.js';
import { findCommitteeConflictsForScopes } from '../services/committeeConflicts.js';
import { onEnterCommitteeStage } from './committeeReviewController.js';
import { L } from '../utils/localize.js';

export type CommitteeType = 'thesis' | 'final_project';
export type CommitteeDegreeLevel = 'bachelors' | 'masters';

export interface CommitteeDoc {
  id: string;
  facultyId: string;
  major: string;
  degreeLevel: CommitteeDegreeLevel;
  type: CommitteeType;
  chairmanId: string | null;
  memberIds: string[];
  createdAt?: admin.firestore.Timestamp;
  updatedAt?: admin.firestore.Timestamp;
}

export function committeeDocId(facultyId: string, major: string, degreeLevel: CommitteeDegreeLevel, type: CommitteeType): string {
  return `${facultyId}_${major}_${degreeLevel}_${type}`;
}

function isSystemAdmin(req: AuthenticatedRequest): boolean {
  return req.user?.role === 'system_admin' || (req.user?.roles ?? []).includes('system_admin');
}

// Same roles that can already author workflow templates (PROPOSER_ROLES in
// workflowTemplateController.ts) — they need to browse committees for their
// own faculty to populate the template editor's committee picker (see
// workflowTemplates.ts's ChainStage.committeeId).
const TEMPLATE_AUTHOR_ROLES = ['coordinator', 'faculty_admin', 'program_head', 'administrative_secretary', 'grad_school_head'];

/** GET /api/committees?facultyId=... — system_admin gets the full admin list
 *  view (any faculty, or all committees when facultyId is omitted). A
 *  template author may also list committees, but only for a facultyId within
 *  her own scope (single facultyId for most roles; any of her assigned
 *  coordinatorScopes for a coordinator) — never anyone else's faculty. A
 *  non-admin's own committees also come from GET /api/committees/mine, which
 *  doesn't need this broad a view. */
export const listCommittees = async (req: AuthenticatedRequest, res: Response) => {
  const { facultyId } = req.query;
  if (!isSystemAdmin(req)) {
    if (!hasAnyRole(req.user, TEMPLATE_AUTHOR_ROLES)) {
      return res.status(403).json({ message: L(req, 'Access denied.', 'הגישה נדחתה.') });
    }
    if (typeof facultyId !== 'string' || !facultyId) {
      return res.status(400).json({ message: L(req, 'facultyId is required.', 'שדה הפקולטה נדרש.') });
    }
    // administrative_secretary (also in TEMPLATE_AUTHOR_ROLES) is provisioned
    // with facultyId 'all' (see CROSS_FACULTY_ROLES in userController.ts) —
    // her real scope lives in coordinatorScopes, same as 'coordinator'. The
    // old check only consulted coordinatorScopes when role included
    // 'coordinator', so an administrative_secretary always fell through to
    // comparing the literal 'all' against a real facultyId and always lost —
    // 403ing her out of every faculty's committee list. Checking
    // coordinatorScopes regardless of role (harmless for roles that never
    // populate it) fixes that; the plain-facultyId fallback still covers
    // faculty_admin/program_head/grad_school_head, who each hold a real
    // single facultyId.
    const ownsFaculty =
      (req.user?.coordinatorScopes ?? []).some((s) => s.facultyId === facultyId) ||
      (!!req.user?.facultyId && req.user.facultyId !== 'all' && req.user.facultyId === facultyId);
    if (!ownsFaculty) return res.status(403).json({ message: L(req, 'Access denied for this faculty.', 'הגישה לפקולטה זו נדחתה.') });
  }
  try {
    let query: FirebaseFirestore.Query = db.collection('committees');
    if (typeof facultyId === 'string' && facultyId) query = query.where('facultyId', '==', facultyId);
    const snap = await query.get();
    const committees = await attachMemberDetails(snap.docs.map((d) => ({ id: d.id, ...d.data() } as CommitteeDoc)));
    return res.status(200).json({ committees });
  } catch (error: any) {
    console.error('listCommittees error:', error);
    return res.status(500).json({ message: L(req, 'Failed to load committees.', 'טעינת הוועדות נכשלה.') });
  }
};

/** GET /api/committees/mine — every committee the caller chairs or is a
 *  plain member of. Role-agnostic on purpose: a chairman can be anyone a
 *  system_admin picked, not necessarily a program_head account. */
export const getMyCommittees = async (req: AuthenticatedRequest, res: Response) => {
  const uid = req.user?.uid;
  if (!uid) return res.status(401).json({ message: L(req, 'Unauthorized.', 'לא מורשה.') });
  try {
    const snap = await db.collection('committees').where('memberIds', 'array-contains', uid).get();
    const committees = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    return res.status(200).json({ committees });
  } catch (error: any) {
    console.error('getMyCommittees error:', error);
    return res.status(500).json({ message: L(req, 'Failed to load your committees.', 'טעינת הוועדות שלך נכשלה.') });
  }
};

/** GET /api/committees/eligible-members?facultyId=... — candidate accounts
 *  for committee membership: any non-student account, drawn from the
 *  requested faculty plus every cross-faculty ('all') staff account. Not a
 *  hard eligibility restriction — deliberately broad (a committee, unlike a
 *  workflow-chain role, isn't tied to one specific existing role) — just a
 *  helpful default candidate pool for the picker UI. */
export const listEligibleCommitteeMembers = async (req: AuthenticatedRequest, res: Response) => {
  const { facultyId, major } = req.query;
  // "Replace Committee Member" passes the project's major — the stand-in
  // must then be active staff of that very faculty AND major (see
  // isStaffOfMajor), never a student, a system_admin or administrative
  // coordinator account, or a cross-faculty ('all') account from outside
  // the department.
  if (typeof major === 'string' && major) {
    return listEligibleReplacementsForMajor(req, res, typeof facultyId === 'string' ? facultyId : '', major);
  }
  // administrative_secretary needs this for "Replace Committee Member" —
  // scoped to a facultyId she's actually assigned to (coordinatorScopes),
  // never an arbitrary one, unlike system_admin/a chairman's open access.
  const isScopedSecretary =
    hasAnyRole(req.user, ['administrative_secretary']) &&
    typeof facultyId === 'string' && !!facultyId &&
    (req.user?.coordinatorScopes ?? []).some((s) => s.facultyId === facultyId);
  if (!isSystemAdmin(req) && !isScopedSecretary && !(await isAnyCommitteeChairman(req.user?.uid))) {
    return res.status(403).json({ message: L(req, 'Access denied: system_admin, a scoped administrative coordinator, or a committee chairman only.', 'הגישה נדחתה: מנהל מערכת, רכז אדמיניסטרטיבי מוסמך בתחום, או יושב ראש ועדה בלבד.') });
  }
  try {
    const queries = [db.collection('users').where('facultyId', '==', 'all').get()];
    if (typeof facultyId === 'string' && facultyId) {
      queries.unshift(db.collection('users').where('facultyId', '==', facultyId).get());
    }
    const snaps = await Promise.all(queries);
    const byId = new Map<string, { id: string; displayName: string; email: string; role: string; facultyId: string }>();
    snaps.forEach((snap) => snap.docs.forEach((doc) => {
      const data = doc.data();
      if (data.role === 'student') return;
      byId.set(doc.id, {
        id: doc.id,
        displayName: data.displayName ?? '',
        email: data.email ?? '',
        role: data.role ?? '',
        facultyId: data.facultyId ?? '',
      });
    }));
    return res.status(200).json({ members: [...byId.values()] });
  } catch (error: any) {
    console.error('listEligibleCommitteeMembers error:', error);
    return res.status(500).json({ message: L(req, 'Failed to load candidate members.', 'טעינת רשימת המועמדים נכשלה.') });
  }
};

/** Primary roles that never sit on a review committee as a stand-in —
 *  administrative accounts, not academic staff. */
const NON_COMMITTEE_ROLES = ['system_admin', 'administrative_secretary'];

/** A user counts as staff of `major` when tied to it through their own
 *  major, the majors a system_admin restricted them to (assignedMajors), or
 *  a coordinatorScopes entry naming that faculty+major. A whole-faculty
 *  scope (no major) deliberately does NOT count — it isn't specific to this
 *  department. */
function isStaffOfMajor(user: FirebaseFirestore.DocumentData, facultyId: string, major: string): boolean {
  return user.major === major
    || (Array.isArray(user.assignedMajors) && user.assignedMajors.includes(major))
    || (user.coordinatorScopes ?? []).some((s: { facultyId?: string; major?: string }) => s.facultyId === facultyId && s.major === major);
}

/** GET /api/committees/eligible-members?facultyId=...&major=... — the
 *  replacement pool for "Replace Committee Member". Only active staff of the
 *  project's own faculty and major: no students, no system_admin or
 *  administrative coordinator accounts,
 *  no deactivated accounts, no cross-faculty ('all') accounts. */
async function listEligibleReplacementsForMajor(req: AuthenticatedRequest, res: Response, facultyId: string, major: string) {
  if (!facultyId) return res.status(400).json({ message: L(req, 'facultyId is required.', 'שדה הפקולטה נדרש.') });
  const inScope = (req.user?.coordinatorScopes ?? []).some(
    (s) => s.facultyId === facultyId && (!s.major || s.major === major)
  );
  if (!isSystemAdmin(req) && !(hasAnyRole(req.user, ['administrative_secretary']) && inScope)) {
    return res.status(403).json({ message: L(req, 'Access denied for this department.', 'הגישה למחלקה זו נדחתה.') });
  }
  try {
    const snap = await db.collection('users').where('facultyId', '==', facultyId).get();
    const members = snap.docs
      .filter((doc) => {
        const u = doc.data();
        const roles: string[] = [u.role, ...(u.roles ?? [])].filter(Boolean);
        if (roles.includes('student')) return false;
        if (NON_COMMITTEE_ROLES.includes(u.role)) return false;
        if (u.isActive === false) return false;
        return isStaffOfMajor(u, facultyId, major);
      })
      .map((doc) => {
        const u = doc.data();
        return { id: doc.id, displayName: u.displayName ?? '', email: u.email ?? '', role: u.role ?? '', facultyId: u.facultyId ?? '' };
      });
    return res.status(200).json({ members });
  } catch (error: any) {
    console.error('listEligibleReplacementsForMajor error:', error);
    return res.status(500).json({ message: L(req, 'Failed to load candidate members.', 'טעינת רשימת המועמדים נכשלה.') });
  }
}

/** Joins each committee's memberIds to {id, displayName, email} at read
 *  time (never stored on the committee doc itself — resolving live avoids
 *  the two-screens-disagree drift a denormalized copy would eventually hit
 *  if a member's name changed). One batched db.getAll across every distinct
 *  member id in the whole list, not one query per committee. */
async function attachMemberDetails<T extends { memberIds: string[] }>(
  committees: T[]
): Promise<(T & { members: { id: string; displayName: string; email: string }[] })[]> {
  const allIds = new Set<string>();
  committees.forEach((c) => (c.memberIds ?? []).forEach((id) => allIds.add(id)));
  const byId = new Map<string, { id: string; displayName: string; email: string }>();
  if (allIds.size > 0) {
    const refs = [...allIds].map((id) => db.collection('users').doc(id));
    const snaps = await db.getAll(...refs);
    snaps.forEach((snap) => {
      if (!snap.exists) return;
      const data = snap.data()!;
      byId.set(snap.id, { id: snap.id, displayName: data.displayName ?? '', email: data.email ?? '' });
    });
  }
  return committees.map((c) => ({
    ...c,
    members: (c.memberIds ?? []).map((id) => byId.get(id) ?? { id, displayName: id, email: '' }),
  }));
}

async function isAnyCommitteeChairman(uid: string | undefined): Promise<boolean> {
  if (!uid) return false;
  const snap = await db.collection('committees').where('chairmanId', '==', uid).limit(1).get();
  return !snap.empty;
}

/** POST /api/committees — system_admin only: create (or fully reset) the
 *  one committee for a given (facultyId, major, type). Upsert by design —
 *  calling this again for the same triple replaces membership/chairman
 *  rather than erroring, since "fix a misconfigured committee" is exactly
 *  the system_admin use case this exists for. */
export const createCommittee = async (req: AuthenticatedRequest, res: Response) => {
  if (!isSystemAdmin(req)) return res.status(403).json({ message: L(req, 'Access denied: system_admin only.', 'הגישה נדחתה: מנהל מערכת בלבד.') });
  const { facultyId, major, degreeLevel, type, chairmanId, memberIds } = req.body ?? {};
  if (!facultyId || !major || (degreeLevel !== 'bachelors' && degreeLevel !== 'masters') || (type !== 'thesis' && type !== 'final_project')) {
    return res.status(400).json({ message: L(req, 'facultyId, major, degreeLevel (bachelors|masters), and type (thesis|final_project) are required.', 'יש לציין פקולטה, חוג, רמת תואר (bachelors|masters) וסוג (thesis|final_project).') });
  }
  if (degreeLevel === 'bachelors' && type !== 'final_project') {
    return res.status(400).json({ message: L(req, "Bachelor's committees have no thesis track — type must be final_project.", 'לוועדות תואר ראשון אין מסלול תזה — הסוג חייב להיות final_project.') });
  }
  const members: string[] = Array.isArray(memberIds) ? memberIds.filter((m) => typeof m === 'string') : [];
  if (chairmanId && !members.includes(chairmanId)) members.push(chairmanId);

  try {
    const id = committeeDocId(facultyId, major, degreeLevel, type);
    const ref = db.collection('committees').doc(id);
    const exists = (await ref.get()).exists;
    await ref.set({
      facultyId, major, degreeLevel, type,
      chairmanId: chairmanId || null,
      memberIds: members,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      ...(exists ? {} : { createdAt: admin.firestore.FieldValue.serverTimestamp() }),
    }, { merge: true });
    return res.status(200).json({ success: true, id });
  } catch (error: any) {
    console.error('createCommittee error:', error);
    return res.status(500).json({ message: L(req, 'Failed to create committee.', 'יצירת הוועדה נכשלה.') });
  }
};

/** PUT /api/committees/:id — system_admin, or the committee's OWN current
 *  chairman, may update memberIds/chairmanId. A chairman may reassign the
 *  chair to anyone already in memberIds (stepping down); only system_admin
 *  may hand the chair to someone not yet a member (auto-added) — matches
 *  "fixing problems" being the admin escape hatch, not routine handoff. */
export const updateCommittee = async (req: AuthenticatedRequest, res: Response) => {
  const uid = req.user?.uid;
  const { id } = req.params as { id: string };
  if (!uid) return res.status(401).json({ message: L(req, 'Unauthorized.', 'לא מורשה.') });
  if (!id) return res.status(400).json({ message: L(req, 'Invalid committee id.', 'מזהה ועדה לא תקין.') });

  try {
    const ref = db.collection('committees').doc(id);
    const { memberIds, chairmanId } = req.body ?? {};
    const admin_ = isSystemAdmin(req);

    // Transaction, not a plain get()-then-update(): memberIds/chairmanId are
    // each written as a whole-field replace, derived from a stale read of
    // `data` — two near-simultaneous edits touching the same field (e.g. the
    // chairman adding a member while system_admin reassigns the chair) could
    // otherwise lost-update each other. Re-reads fresh inside the
    // transaction so authorization and the nextMembers computation always
    // see whatever the other request actually committed.
    try {
      await db.runTransaction(async (transaction) => {
        const snap = await transaction.get(ref);
        if (!snap.exists) throw new Error('NOT_FOUND');
        const data = snap.data() as CommitteeDoc;

        const isChairman = data.chairmanId === uid;
        if (!admin_ && !isChairman) throw new Error('FORBIDDEN');

        const update: Record<string, unknown> = { updatedAt: admin.firestore.FieldValue.serverTimestamp() };

        if (Array.isArray(memberIds)) {
          update.memberIds = memberIds.filter((m) => typeof m === 'string');
        }
        if (chairmanId !== undefined) {
          const nextMembers: string[] = (update.memberIds as string[] | undefined) ?? data.memberIds ?? [];
          if (chairmanId && !nextMembers.includes(chairmanId) && !admin_) {
            throw new Error('CHAIRMAN_NOT_MEMBER');
          }
          if (chairmanId && !nextMembers.includes(chairmanId) && admin_) {
            nextMembers.push(chairmanId);
            update.memberIds = nextMembers;
          }
          update.chairmanId = chairmanId || null;
        }

        transaction.update(ref, update);
      });
    } catch (err: any) {
      if (err?.message === 'NOT_FOUND') return res.status(404).json({ message: L(req, 'Committee not found.', 'הוועדה לא נמצאה.') });
      if (err?.message === 'FORBIDDEN') return res.status(403).json({ message: L(req, 'Only this committee\'s chairman or a system_admin may edit it.', 'רק יושב ראש הוועדה או מנהל מערכת יכולים לערוך אותה.') });
      if (err?.message === 'CHAIRMAN_NOT_MEMBER') return res.status(400).json({ message: L(req, 'The chairman must already be a committee member.', 'היושב ראש חייב להיות כבר חבר בוועדה.') });
      throw err;
    }

    return res.status(200).json({ success: true });
  } catch (error: any) {
    console.error('updateCommittee error:', error);
    return res.status(500).json({ message: L(req, 'Failed to update committee.', 'עדכון הוועדה נכשל.') });
  }
};

/** Resolves the single committee (if any) that a project's milestone should
 *  route to — (facultyId, major, degreeLevel, type) where degreeLevel is
 *  'masters' iff the project's own degreeType is 'masters', else
 *  'bachelors'; type is 'thesis' iff degreeLevel is 'masters' AND the
 *  project's own projectType is 'thesis', else 'final_project' (bachelor's
 *  has no thesis track — see deriveProcessType in services/workflowTemplates.ts).
 *  Falls back to the first enrolled student's own major/degreeType when the
 *  project doc has none set (an open-to-any-major project) — same fallback
 *  direction as firestore.rules' studentCanReadProjectByMajor. Returns null
 *  if no committee has been configured for that scope yet. */
export async function resolveCommitteeForProject(projectData: {
  facultyId?: string;
  major?: string;
  degreeType?: string;
  projectType?: string;
  enrolledStudentIds?: string[];
  /** Per-project chairman/member recusal — see "Replace Committee Member"
   *  (administrative_secretary's conflict-of-interest tab). Maps an
   *  ORIGINAL committee-doc uid to the REPLACEMENT chosen for this project
   *  only — the shared department committee doc itself is never touched, so
   *  every other project reviewed by the same committee is unaffected. */
  committeeMemberSubstitutions?: Record<string, string> | null;
}): Promise<CommitteeDoc | null> {
  const facultyId = projectData.facultyId ?? '';
  let major = projectData.major ?? '';
  let degreeType = projectData.degreeType ?? '';
  if ((!major || !degreeType) && projectData.enrolledStudentIds?.length) {
    const firstStudent = await db.collection('users').doc(projectData.enrolledStudentIds[0]!).get();
    const studentData = firstStudent.data();
    major = major || (studentData?.major ?? '');
    degreeType = degreeType || (studentData?.degreeType ?? '');
  }
  if (!facultyId || !major) return null;
  const degreeLevel: CommitteeDegreeLevel = degreeType === 'masters' ? 'masters' : 'bachelors';
  const type: CommitteeType = degreeLevel === 'masters' && projectData.projectType === 'thesis' ? 'thesis' : 'final_project';
  const snap = await db.collection('committees').doc(committeeDocId(facultyId, major, degreeLevel, type)).get();
  if (!snap.exists) return null;
  const committee = { id: snap.id, ...snap.data() } as CommitteeDoc;
  return applyCommitteeSubstitutions(committee, projectData.committeeMemberSubstitutions);
}

/** Swaps any chairman/member uid that has a per-project substitution entry
 *  for its replacement — see resolveCommitteeForProject's doc comment.
 *  Applied at every point a project's EFFECTIVE (not raw shared-doc)
 *  committee membership is needed: authorization, voting, notifications. */
export function applyCommitteeSubstitutions(
  committee: CommitteeDoc,
  substitutions: Record<string, string> | null | undefined
): CommitteeDoc {
  if (!substitutions || Object.keys(substitutions).length === 0) return committee;
  const chairmanId = committee.chairmanId ? (substitutions[committee.chairmanId] ?? committee.chairmanId) : committee.chairmanId;
  const memberIds = [...new Set(committee.memberIds.map((id) => substitutions[id] ?? id))];
  return { ...committee, chairmanId, memberIds };
}

/** A milestone's effective substitution map — the project-level map (the
 *  original, whole-project recusal) overlaid by the milestone's own map (CS
 *  pilot: the administrative coordinator picks the replacement per
 *  milestone, so two milestones of one project can each have a different
 *  stand-in). The milestone's own entry wins for the same original uid. */
export function mergedCommitteeSubstitutions(
  projectData: { committeeMemberSubstitutions?: Record<string, string> | null } | null | undefined,
  milestoneData: { committeeMemberSubstitutions?: Record<string, string> | null } | null | undefined,
): Record<string, string> {
  return { ...(projectData?.committeeMemberSubstitutions ?? {}), ...(milestoneData?.committeeMemberSubstitutions ?? {}) };
}

/** The committee a milestone is (or is about to be) reviewed by, with every
 *  substitution that applies to it already swapped in. Honors a stage's
 *  pinned committeeId (see workflowTemplates.ts's ChainStage) for the
 *  current stage if it's a committee stage, else the next committee stage
 *  in the chain — falls back to the per-project dynamic lookup otherwise. */
export async function resolveCommitteeForMilestone(
  milestoneData: FirebaseFirestore.DocumentData,
  projectData: FirebaseFirestore.DocumentData,
): Promise<CommitteeDoc | null> {
  const routing: Array<{ role?: string; committeeId?: string | null }> = milestoneData.routing ?? [];
  const currentIndex: number = milestoneData.currentStageIndex ?? 0;
  const committeeStage = routing.slice(currentIndex).find((s) => s?.role === 'committee');
  const substitutions = mergedCommitteeSubstitutions(projectData, milestoneData);
  if (committeeStage?.committeeId) {
    const pinnedSnap = await db.collection('committees').doc(committeeStage.committeeId).get();
    return pinnedSnap.exists ? applyCommitteeSubstitutions({ id: pinnedSnap.id, ...pinnedSnap.data() } as CommitteeDoc, substitutions) : null;
  }
  return resolveCommitteeForProject({ ...projectData, committeeMemberSubstitutions: substitutions });
}

export interface SupervisorCommitteeConflict {
  userId: string;
  conflictRole: 'chairman' | 'member';
  supervisorRole: 'supervisor' | 'secondary_supervisor';
}

/** Every one of the project's supervisors who still sits on `committee`
 *  (pass the EFFECTIVE committee, substitutions already applied — an
 *  already-recused supervisor is no longer a conflict). */
export function findSupervisorConflicts(
  committee: CommitteeDoc,
  projectData: { supervisorId?: string | null; secondarySupervisorId?: string | null },
): SupervisorCommitteeConflict[] {
  const entries: Array<{ id: string | null | undefined; role: SupervisorCommitteeConflict['supervisorRole'] }> = [
    { id: projectData.supervisorId, role: 'supervisor' },
    { id: projectData.secondarySupervisorId, role: 'secondary_supervisor' },
  ];
  const conflicts: SupervisorCommitteeConflict[] = [];
  for (const { id, role } of entries) {
    if (!id) continue;
    const conflictRole = committee.chairmanId === id ? 'chairman' : committee.memberIds.includes(id) ? 'member' : null;
    if (conflictRole) conflicts.push({ userId: id, conflictRole, supervisorRole: role });
  }
  return conflicts;
}

// ─── "Replace Committee Member" (administrative_secretary) ────────────────

/** GET /api/committees/conflicts — every project in the caller's own
 *  coordinatorScopes where her stage is currently pending AND the project's
 *  supervisor (or secondary supervisor) is also chairman/member of the
 *  committee reviewing it. administrative_secretary only (system_admin can
 *  already see everything via the committees list itself) — see
 *  services/committeeConflicts.ts. */
export const getCommitteeConflicts = async (req: AuthenticatedRequest, res: Response) => {
  if (!hasAnyRole(req.user, ['administrative_secretary'])) {
    return res.status(403).json({ message: L(req, 'Access denied: administrative coordinator only.', 'הגישה נדחתה: רכז אדמיניסטרטיבי בלבד.') });
  }
  try {
    const conflicts = await findCommitteeConflictsForScopes(req.user?.coordinatorScopes ?? []);
    return res.status(200).json({ conflicts });
  } catch (error: any) {
    console.error('getCommitteeConflicts error:', error);
    return res.status(500).json({ message: L(req, 'Failed to load committee conflicts.', 'טעינת ניגודי העניינים בוועדות נכשלה.') });
  }
};

/** POST /api/committees/projects/:projectId/substitute-member
 *  Body: { originalUserId, replacementUserId }
 *
 *  Recuses `originalUserId` from THIS project's committee review only — see
 *  resolveCommitteeForProject's doc comment for why this is a per-project
 *  map, not an edit to the shared committee doc. administrative_secretary
 *  may only do this within her own coordinatorScopes (the project's
 *  facultyId/major must be one she's assigned to); system_admin unrestricted. */
export const substituteCommitteeMember = async (req: AuthenticatedRequest, res: Response) => {
  const uid = req.user?.uid;
  if (!uid) return res.status(401).json({ message: L(req, 'Unauthorized.', 'לא מורשה.') });
  const { projectId } = req.params as { projectId: string };
  const { originalUserId, replacementUserId, milestoneId } = req.body ?? {};
  if (!projectId) return res.status(400).json({ message: L(req, 'Invalid projectId.', 'מזהה פרויקט לא תקין.') });
  if (typeof originalUserId !== 'string' || !originalUserId) {
    return res.status(400).json({ message: L(req, 'originalUserId is required.', 'שדה originalUserId נדרש.') });
  }
  if (typeof replacementUserId !== 'string' || !replacementUserId) {
    return res.status(400).json({ message: L(req, 'replacementUserId is required.', 'שדה replacementUserId נדרש.') });
  }
  if (originalUserId === replacementUserId) {
    return res.status(400).json({ message: L(req, 'The replacement must be a different person.', 'המחליף/ה חייב/ת להיות אדם אחר.') });
  }

  try {
    const projectRef = db.collection('projects').doc(projectId);
    const projectSnap = await projectRef.get();
    if (!projectSnap.exists) return res.status(404).json({ message: L(req, 'Project not found.', 'הפרויקט לא נמצא.') });
    const project = projectSnap.data()!;

    if (!isSystemAdmin(req)) {
      if (!hasAnyRole(req.user, ['administrative_secretary'])) {
        return res.status(403).json({ message: L(req, 'Access denied: administrative coordinator only.', 'הגישה נדחתה: רכז אדמיניסטרטיבי בלבד.') });
      }
      const inScope = (req.user?.coordinatorScopes ?? []).some(
        (s) => s.facultyId === project.facultyId && (!s.major || s.major === project.major)
      );
      if (!inScope) return res.status(403).json({ message: L(req, 'This project is outside your assigned scope.', 'פרויקט זה מחוץ לתחום שהוקצה לך.') });
    }

    // The replacement can't be the very thing being fixed — someone who's
    // ALSO one of this project's supervisors would just recreate the same
    // conflict under a different name.
    if (replacementUserId === project.supervisorId || replacementUserId === project.secondarySupervisorId) {
      return res.status(400).json({ message: L(req, "The replacement can't be this project's own supervisor.", 'המחליף/ה לא יכול/ה להיות המנחה של הפרויקט עצמו.') });
    }

    // With a milestoneId (CS pilot — see config/csPilot.ts), the swap applies
    // to that one milestone only, so each milestone of the same project can
    // get its own stand-in; without one, the original whole-project recusal.
    let milestoneRef: FirebaseFirestore.DocumentReference | null = null;
    let milestone: FirebaseFirestore.DocumentData | null = null;
    if (typeof milestoneId === 'string' && milestoneId) {
      milestoneRef = db.collection('milestones').doc(milestoneId);
      const milestoneSnap = await milestoneRef.get();
      if (!milestoneSnap.exists || milestoneSnap.data()?.projectId !== projectId) {
        return res.status(404).json({ message: L(req, 'Milestone not found for this project.', 'אבן הדרך לא נמצאה בפרויקט זה.') });
      }
      milestone = milestoneSnap.data()!;
    }

    const committee = milestone
      ? await resolveCommitteeForMilestone(milestone, project)
      : await resolveCommitteeForProject(project);
    if (!committee) return res.status(400).json({ message: L(req, 'No committee is configured for this project yet.', 'לא הוגדרה ועדה לפרויקט זה עדיין.') });
    const isCurrentMember = committee.chairmanId === originalUserId || committee.memberIds.includes(originalUserId);
    if (!isCurrentMember) {
      return res.status(400).json({ message: L(req, 'That person is not currently on this project\'s committee.', 'אדם זה אינו חבר בוועדת הפרויקט כעת.') });
    }
    if (committee.memberIds.includes(replacementUserId) || committee.chairmanId === replacementUserId) {
      return res.status(400).json({ message: L(req, 'The replacement is already on this committee.', 'המחליף/ה כבר חבר/ה בוועדה זו.') });
    }

    const replacementSnap = await db.collection('users').doc(replacementUserId).get();
    if (!replacementSnap.exists || replacementSnap.data()?.role === 'student') {
      return res.status(400).json({ message: L(req, 'Invalid replacement — must be an existing staff account.', 'מחליף לא תקין — יש לבחור חשבון צוות קיים.') });
    }
    // Same pool listEligibleReplacementsForMajor offers — enforced here too,
    // so a direct API call can't pick someone the picker would never show.
    const replacement = replacementSnap.data()!;
    const replacementRoles: string[] = [replacement.role, ...(replacement.roles ?? [])].filter(Boolean);
    const outsideDepartment = !!project.major && (
      replacement.facultyId !== project.facultyId
      || NON_COMMITTEE_ROLES.includes(replacement.role)
      || replacementRoles.includes('student')
      || replacement.isActive === false
      || !isStaffOfMajor(replacement, project.facultyId, project.major)
    );
    if (outsideDepartment) {
      return res.status(400).json({ message: L(req, "The replacement must be active staff of this project's own department.", 'המחליף/ה חייב/ת להיות איש/אשת צוות פעיל/ה מהמחלקה של הפרויקט.') });
    }

    if (milestoneRef && milestone) {
      // committeeSubstituteIds is only a lookup index (Firestore can't query
      // map values) — lets getMyPendingCommitteeReviews and firestore.rules
      // find the milestones a stand-in reviews. Membership itself is always
      // re-derived live from the substitution maps, never from this list.
      await milestoneRef.update({
        [`committeeMemberSubstitutions.${originalUserId}`]: replacementUserId,
        committeeSubstituteIds: admin.firestore.FieldValue.arrayUnion(replacementUserId),
      });
      // A held milestone (see onEnterCommitteeStage) is re-entered: if that
      // was the last conflict, the committee now receives it.
      if (milestone.committeeConflictHold) {
        const fresh = (await milestoneRef.get()).data()!;
        await onEnterCommitteeStage(milestoneRef.id, fresh);
      }
    } else {
      await projectRef.set(
        { committeeMemberSubstitutions: { [originalUserId]: replacementUserId } },
        { merge: true }
      );
    }

    return res.status(200).json({ success: true });
  } catch (error: any) {
    console.error('substituteCommitteeMember error:', error);
    return res.status(500).json({ message: L(req, 'Failed to substitute the committee member.', 'החלפת חבר הוועדה נכשלה.') });
  }
};
