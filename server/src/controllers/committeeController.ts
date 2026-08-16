// src/controllers/committeeController.ts
//
// Thesis/final-project review committees — one committee per
// (facultyId, major, type) triple, doc id `${facultyId}_${major}_${type}`
// for natural uniqueness (no query needed to check "does this committee
// already exist"). A committee has a member list and one designated
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
import { AuthenticatedRequest } from '../middleware/auth.js';

export type CommitteeType = 'thesis' | 'final_project';

export interface CommitteeDoc {
  id: string;
  facultyId: string;
  major: string;
  type: CommitteeType;
  chairmanId: string | null;
  memberIds: string[];
  createdAt?: admin.firestore.Timestamp;
  updatedAt?: admin.firestore.Timestamp;
}

export function committeeDocId(facultyId: string, major: string, type: CommitteeType): string {
  return `${facultyId}_${major}_${type}`;
}

function isSystemAdmin(req: AuthenticatedRequest): boolean {
  return req.user?.role === 'system_admin' || (req.user?.roles ?? []).includes('system_admin');
}

/** GET /api/committees?facultyId=... — system_admin only (the full admin
 *  list view; a non-admin's own committees come from GET /api/committees/mine
 *  instead, which doesn't require this broad a view). */
export const listCommittees = async (req: AuthenticatedRequest, res: Response) => {
  if (!isSystemAdmin(req)) return res.status(403).json({ message: 'Access denied: system_admin only.' });
  try {
    const { facultyId } = req.query;
    let query: FirebaseFirestore.Query = db.collection('committees');
    if (typeof facultyId === 'string' && facultyId) query = query.where('facultyId', '==', facultyId);
    const snap = await query.get();
    const committees = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    return res.status(200).json({ committees });
  } catch (error: any) {
    console.error('listCommittees error:', error);
    return res.status(500).json({ message: 'Failed to load committees.' });
  }
};

/** GET /api/committees/mine — every committee the caller chairs or is a
 *  plain member of. Role-agnostic on purpose: a chairman can be anyone a
 *  system_admin picked, not necessarily a program_head account. */
export const getMyCommittees = async (req: AuthenticatedRequest, res: Response) => {
  const uid = req.user?.uid;
  if (!uid) return res.status(401).json({ message: 'Unauthorized.' });
  try {
    const snap = await db.collection('committees').where('memberIds', 'array-contains', uid).get();
    const committees = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    return res.status(200).json({ committees });
  } catch (error: any) {
    console.error('getMyCommittees error:', error);
    return res.status(500).json({ message: 'Failed to load your committees.' });
  }
};

/** GET /api/committees/eligible-members?facultyId=... — candidate accounts
 *  for committee membership: any non-student account, drawn from the
 *  requested faculty plus every cross-faculty ('all') staff account. Not a
 *  hard eligibility restriction — deliberately broad (a committee, unlike a
 *  workflow-chain role, isn't tied to one specific existing role) — just a
 *  helpful default candidate pool for the picker UI. */
export const listEligibleCommitteeMembers = async (req: AuthenticatedRequest, res: Response) => {
  if (!isSystemAdmin(req) && !(await isAnyCommitteeChairman(req.user?.uid))) {
    return res.status(403).json({ message: 'Access denied: system_admin or a committee chairman only.' });
  }
  const { facultyId } = req.query;
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
    return res.status(500).json({ message: 'Failed to load candidate members.' });
  }
};

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
  if (!isSystemAdmin(req)) return res.status(403).json({ message: 'Access denied: system_admin only.' });
  const { facultyId, major, type, chairmanId, memberIds } = req.body ?? {};
  if (!facultyId || !major || (type !== 'thesis' && type !== 'final_project')) {
    return res.status(400).json({ message: 'facultyId, major, and type (thesis|final_project) are required.' });
  }
  const members: string[] = Array.isArray(memberIds) ? memberIds.filter((m) => typeof m === 'string') : [];
  if (chairmanId && !members.includes(chairmanId)) members.push(chairmanId);

  try {
    const id = committeeDocId(facultyId, major, type);
    const ref = db.collection('committees').doc(id);
    const exists = (await ref.get()).exists;
    await ref.set({
      facultyId, major, type,
      chairmanId: chairmanId || null,
      memberIds: members,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      ...(exists ? {} : { createdAt: admin.firestore.FieldValue.serverTimestamp() }),
    }, { merge: true });
    return res.status(200).json({ success: true, id });
  } catch (error: any) {
    console.error('createCommittee error:', error);
    return res.status(500).json({ message: 'Failed to create committee.' });
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
  if (!uid) return res.status(401).json({ message: 'Unauthorized.' });
  if (!id) return res.status(400).json({ message: 'Invalid committee id.' });

  try {
    const ref = db.collection('committees').doc(id);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ message: 'Committee not found.' });
    const data = snap.data() as CommitteeDoc;

    const admin_ = isSystemAdmin(req);
    const isChairman = data.chairmanId === uid;
    if (!admin_ && !isChairman) {
      return res.status(403).json({ message: 'Only this committee\'s chairman or a system_admin may edit it.' });
    }

    const { memberIds, chairmanId } = req.body ?? {};
    const update: Record<string, unknown> = { updatedAt: admin.firestore.FieldValue.serverTimestamp() };

    if (Array.isArray(memberIds)) {
      update.memberIds = memberIds.filter((m) => typeof m === 'string');
    }
    if (chairmanId !== undefined) {
      const nextMembers: string[] = (update.memberIds as string[] | undefined) ?? data.memberIds ?? [];
      if (chairmanId && !nextMembers.includes(chairmanId) && !admin_) {
        return res.status(400).json({ message: 'The chairman must already be a committee member.' });
      }
      if (chairmanId && !nextMembers.includes(chairmanId) && admin_) {
        nextMembers.push(chairmanId);
        update.memberIds = nextMembers;
      }
      update.chairmanId = chairmanId || null;
    }

    await ref.update(update);
    return res.status(200).json({ success: true });
  } catch (error: any) {
    console.error('updateCommittee error:', error);
    return res.status(500).json({ message: 'Failed to update committee.' });
  }
};

/** Resolves the single committee (if any) that a project's milestone should
 *  route to — (facultyId, major, type) where type is 'thesis' iff the
 *  project's own projectType is 'thesis', else 'final_project'. Falls back
 *  to the first enrolled student's own major when the project doc has none
 *  set (an open-to-any-major project) — same fallback direction as
 *  firestore.rules' studentCanReadProjectByMajor. Returns null if no
 *  committee has been configured for that scope yet. */
export async function resolveCommitteeForProject(projectData: {
  facultyId?: string;
  major?: string;
  projectType?: string;
  enrolledStudentIds?: string[];
}): Promise<CommitteeDoc | null> {
  const facultyId = projectData.facultyId ?? '';
  let major = projectData.major ?? '';
  if (!major && projectData.enrolledStudentIds?.length) {
    const firstStudent = await db.collection('users').doc(projectData.enrolledStudentIds[0]!).get();
    major = firstStudent.data()?.major ?? '';
  }
  if (!facultyId || !major) return null;
  const type: CommitteeType = projectData.projectType === 'thesis' ? 'thesis' : 'final_project';
  const snap = await db.collection('committees').doc(committeeDocId(facultyId, major, type)).get();
  return snap.exists ? ({ id: snap.id, ...snap.data() } as CommitteeDoc) : null;
}
