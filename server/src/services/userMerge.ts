// src/services/userMerge.ts
//
// Lets a system_admin combine two accounts that belong to the same person
// (e.g. one "Valentin" signed up with a private gmail address, another was
// created with the @hit.ac.il address) into a single user. The admin picks
// which account survives — its uid, Firebase Auth login and email are kept;
// the other account's login is deleted and everything that pointed at it is
// re-pointed at the survivor.
//
// Why a generic deep rewrite instead of a hand-maintained field list: user
// uids are denormalized into dozens of fields across ~every collection
// (supervisorId, studentIds[], examinerIds[], examinerGrading[uid],
// recipientId, participants[], senderId, decidedBy, ...), and that list keeps
// growing. A per-field list would silently miss the next one added. Firebase
// uids are 28-char random strings, so an exact-match string/map-key rewrite
// has no realistic false positives. Only EXACT matches are rewritten — a uid
// embedded inside a longer string (Storage paths/URLs) is left alone, since
// rewriting it would break the link to the still-existing file.
//
// Deliberately NOT rewritten:
//   - auditLog: the audit trail records who actually did what at the time;
//     the merge itself is logged with both uids so history stays traceable.
//   - users/{uid}/private/*: 2FA secrets and login-security state belong to
//     the removed login and are deleted with it, never carried over — with
//     ONE exception: the phone number (private/contact, see
//     services/privateContact.ts) is copied to the kept account when it has
//     none of its own, since it's the person's, not the login's. The push
//     token is not: it belongs to the removed login's device.
//
// Runs as a dry run first (same scan, no writes) so the admin sees what will
// move before confirming. A real run is idempotent-ish: if it fails midway,
// running it again picks up whatever still points at the removed uid.

import { db, auth } from '../config/firebase.js';
import { FieldPath, FieldValue, type DocumentData, type Query, type QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { getEffectiveRoles } from './accountDeletion.js';
import { logAuditEvent } from './auditLog.js';
import { getPrivateContact, writePrivateContact } from './privateContact.js';

const SKIPPED_COLLECTIONS = new Set(['auditLog']);
// Subcollections that hold user-referencing data. Only 'messages' (chats)
// exists today besides users/{uid}/private, which is skipped on purpose.
const SCANNED_SUBCOLLECTION_GROUPS = ['messages'];
const PAGE_SIZE = 500;
const BATCH_LIMIT = 400;

// Same order as mobile/firebase/roles.ts's and web/lib/roles.ts's ROLE_RANK
// (lower = more senior) — keep the three in sync.
const ROLE_RANK: Record<string, number> = {
  system_admin: 0, grad_school_head: 1, dean: 2, faculty_admin: 3, program_head: 4,
  school_head: 4.5, division_head: 5, coordinator: 6, administrative_secretary: 7,
  supervisor: 8, secondary_supervisor: 9, internal_examiner: 10, student: 11,
};
function highestRankedRole(roles: string[]): string | undefined {
  return roles.reduce<string | undefined>((best, r) => (best === undefined || (ROLE_RANK[r] ?? 99) < (ROLE_RANK[best] ?? 99) ? r : best), undefined);
}

// Never copied from the removed account's user doc onto the kept one —
// identity/login/security state that belongs to a specific login.
const NON_INHERITED_USER_FIELDS = new Set([
  'email', 'uid', 'id', 'createdAt',
  'totp_enabled', 'twoFactorExempt', 'mustChangePassword', 'tempPasswordHash',
  'expoPushToken', 'lastLoginAt', 'lastLoginPlatform', 'lastLogoutAt', 'lastLogoutPlatform',
  'pendingDeletion', 'deletionReason', 'deletionRequestedAt', 'deletionScheduledFor', 'accountDeletionClaimed',
  'mergedAccounts',
]);

export interface MergeUserSummary {
  id: string;
  email: string;
  displayName: string;
  roles: string[];
  facultyId: string | null;
}

export interface MergeResult {
  dryRun: boolean;
  keep: MergeUserSummary;
  remove: MergeUserSummary;
  /** collection name (or "chats/*\/messages") → number of documents whose
   *  references get (or got) re-pointed at the kept account. */
  referencesByCollection: Record<string, number>;
  /** Docs whose ID *is* the removed uid (e.g. presence/{uid}) — moved to the
   *  kept uid, or dropped when the kept account already has its own. */
  movedDocs: string[];
  totalDocuments: number;
  warnings: string[];
  /** How the kept account will look afterwards — its login email never
   *  changes; the primary role becomes the highest-ranked of both accounts. */
  keepAfter: { email: string; role: string; roles: string[] };
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && Object.getPrototypeOf(v) === Object.prototype;
}

/** Returns the value with every exact `from` string / map key replaced by
 *  `to`, or the SAME reference when nothing changed (callers compare by
 *  identity). Non-plain objects (Timestamp, GeoPoint, DocumentReference)
 *  are passed through untouched. */
function deepReplace(value: unknown, from: string, to: string): unknown {
  if (value === from) return to;
  if (Array.isArray(value)) {
    let changed = false;
    const mapped = value.map((item) => {
      const next = deepReplace(item, from, to);
      if (next !== item) changed = true;
      return next;
    });
    if (!changed) return value;
    // e.g. examinerIds: [from, to] → [to], not [to, to].
    const seen = new Set<unknown>();
    return mapped.filter((item) => {
      if (typeof item !== 'string') return true;
      if (seen.has(item)) return false;
      seen.add(item);
      return true;
    });
  }
  if (isPlainObject(value)) {
    let changed = false;
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      const next = deepReplace(item, from, to);
      if (next !== item) changed = true;
      if (key === from) {
        changed = true;
        // Kept account already has its own entry under this map (e.g. both
        // were somehow graded on the same milestone) — the kept one wins.
        if (!(to in value)) out[to] = next;
      } else {
        out[key] = next;
      }
    }
    return changed ? out : value;
  }
  return value;
}

/** Top-level fields of `data` that change, with their new values. */
function rewriteDoc(data: DocumentData, from: string, to: string): Record<string, unknown> | null {
  const changes: Record<string, unknown> = {};
  let any = false;
  for (const [key, item] of Object.entries(data)) {
    const next = deepReplace(item, from, to);
    if (key === from) {
      // A top-level field keyed by the uid itself.
      any = true;
      changes[key] = FieldValue.delete();
      if (!(to in data)) changes[to] = next;
    } else if (next !== item) {
      any = true;
      changes[key] = next;
    }
  }
  return any ? changes : null;
}

function summarize(id: string, data: DocumentData): MergeUserSummary {
  return {
    id,
    email: data.email ?? '',
    displayName: data.displayName ?? data.displayNameHe ?? data.displayNameEn ?? '',
    roles: getEffectiveRoles(data),
    facultyId: data.facultyId ?? null,
  };
}

/** The kept user doc after absorbing the removed one: kept values win,
 *  empty kept fields are filled from the removed account, arrays (roles,
 *  activeProjectIds, faculty lists, ...) are unioned. */
function mergeUserDocs(keep: DocumentData, remove: DocumentData, removeUid: string, keepUid: string): Record<string, unknown> {
  const removeData = deepReplace(remove, removeUid, keepUid) as DocumentData;
  const updates: Record<string, unknown> = {};
  for (const [key, removeVal] of Object.entries(removeData)) {
    if (NON_INHERITED_USER_FIELDS.has(key)) continue;
    const keepVal = keep[key];
    if (Array.isArray(removeVal) && (Array.isArray(keepVal) || keepVal == null)) {
      const merged = [...(keepVal ?? [])];
      for (const item of removeVal) {
        const dup = merged.some((m) => JSON.stringify(m) === JSON.stringify(item));
        if (!dup) merged.push(item);
      }
      if (merged.length !== (keepVal ?? []).length) updates[key] = merged;
    } else if (keepVal === undefined || keepVal === null || keepVal === '') {
      if (removeVal !== undefined && removeVal !== null && removeVal !== '') updates[key] = removeVal;
    }
  }
  // Either account having an active project means the merged one does.
  if (remove.hasActiveProject === true && keep.hasActiveProject !== true) updates.hasActiveProject = true;
  // Effective roles from BOTH accounts end up on the merged one, and the
  // primary `role` becomes the highest-ranked of them — firestore.rules and
  // some server checks read only `role`, so keeping the kept account's
  // (e.g. 'supervisor') would silently drop a 'coordinator' the removed
  // account had as its primary.
  const allRoles = [...new Set([...getEffectiveRoles(keep), ...getEffectiveRoles(remove)])];
  if (allRoles.length > getEffectiveRoles(keep).length) updates.roles = allRoles;
  const primary = highestRankedRole(allRoles);
  if (primary && primary !== keep.role) updates.role = primary;
  return updates;
}

async function scanQuery(
  query: Query,
  label: (doc: QueryDocumentSnapshot) => string,
  skip: (doc: QueryDocumentSnapshot) => boolean,
  from: string,
  to: string,
  onChange: (doc: QueryDocumentSnapshot, changes: Record<string, unknown>, bucket: string) => Promise<void>,
): Promise<void> {
  let cursor: QueryDocumentSnapshot | undefined;
  while (true) {
    let page = query.orderBy(FieldPath.documentId()).limit(PAGE_SIZE);
    if (cursor) page = page.startAfter(cursor);
    const snap = await page.get();
    if (snap.empty) break;
    for (const doc of snap.docs) {
      if (skip(doc)) continue;
      const changes = rewriteDoc(doc.data(), from, to);
      if (changes) await onChange(doc, changes, label(doc));
    }
    cursor = snap.docs[snap.docs.length - 1];
    if (snap.size < PAGE_SIZE) break;
  }
}

export async function mergeUsers(input: {
  keepUid: string;
  removeUid: string;
  dryRun: boolean;
  actingAdminUid: string;
  actingAdminRole: string;
  actingAdminDisplayName?: string | undefined;
}): Promise<MergeResult> {
  const { keepUid, removeUid, dryRun } = input;
  if (keepUid === removeUid) throw new MergeError('SAME_USER', 'Pick two different users.');
  if (removeUid === input.actingAdminUid) {
    throw new MergeError('SELF_REMOVE', "You can't merge away the account you're signed in with — keep it instead.");
  }

  const [keepSnap, removeSnap] = await Promise.all([
    db.collection('users').doc(keepUid).get(),
    db.collection('users').doc(removeUid).get(),
  ]);
  if (!keepSnap.exists || !removeSnap.exists) throw new MergeError('NOT_FOUND', 'User not found.');
  const keepData = keepSnap.data()!;
  const removeData = removeSnap.data()!;

  const warnings: string[] = [];
  if (keepData.hasActiveProject && removeData.hasActiveProject) {
    warnings.push('BOTH_ACTIVE_PROJECTS');
  }
  if (keepData.facultyId && removeData.facultyId && keepData.facultyId !== removeData.facultyId) {
    warnings.push('DIFFERENT_FACULTIES');
  }
  if ((keepData.displayName ?? '').trim().toLowerCase() !== (removeData.displayName ?? '').trim().toLowerCase()) {
    warnings.push('DIFFERENT_NAMES');
  }

  const referencesByCollection: Record<string, number> = {};
  const movedDocs: string[] = [];
  let batch = db.batch();
  let pending = 0;
  const flush = async () => {
    if (pending === 0) return;
    await batch.commit();
    batch = db.batch();
    pending = 0;
  };
  const record = async (doc: QueryDocumentSnapshot, changes: Record<string, unknown>, bucket: string) => {
    referencesByCollection[bucket] = (referencesByCollection[bucket] ?? 0) + 1;
    if (dryRun) return;
    // mergeFields (not merge: true) so a rewritten map field is REPLACED
    // wholesale — merge: true would deep-merge and leave the old uid key.
    batch.set(doc.ref, changes, { mergeFields: Object.keys(changes).map((k) => new FieldPath(k)) });
    if (++pending >= BATCH_LIMIT) await flush();
  };

  const collections = await db.listCollections();
  for (const col of collections) {
    if (SKIPPED_COLLECTIONS.has(col.id)) continue;
    // Docs whose ID is one of the two uids are handled separately below
    // (users docs merged by mergeUserDocs, others moved).
    await scanQuery(col, () => col.id, (d) => d.id === removeUid || (col.id === 'users' && d.id === keepUid), removeUid, keepUid, record);

    if (col.id === 'users') continue;
    const ownSnap = await col.doc(removeUid).get();
    if (ownSnap.exists) {
      movedDocs.push(`${col.id}/${removeUid}`);
      if (!dryRun) {
        const targetRef = col.doc(keepUid);
        const targetSnap = await targetRef.get();
        if (!targetSnap.exists) {
          batch.set(targetRef, deepReplace(ownSnap.data(), removeUid, keepUid) as DocumentData);
          pending++;
        }
        batch.delete(ownSnap.ref);
        if (++pending >= BATCH_LIMIT) await flush();
      }
    }
  }
  for (const group of SCANNED_SUBCOLLECTION_GROUPS) {
    await scanQuery(
      db.collectionGroup(group),
      (d) => `${d.ref.parent.parent?.parent.id ?? '?'}/*/${group}`,
      () => false,
      removeUid, keepUid, record,
    );
  }
  await flush();

  const userUpdates = mergeUserDocs(keepData, removeData, removeUid, keepUid);
  const mergedActive = new Set([...(keepData.activeProjectIds ?? []), ...(removeData.activeProjectIds ?? [])]);
  if (mergedActive.size > 3) warnings.push('OVER_ACTIVE_PROJECT_CAP');

  const result: MergeResult = {
    dryRun,
    keep: summarize(keepUid, keepData),
    remove: summarize(removeUid, removeData),
    referencesByCollection,
    movedDocs,
    totalDocuments: Object.values(referencesByCollection).reduce((a, b) => a + b, 0) + movedDocs.length,
    warnings,
    keepAfter: {
      email: keepData.email ?? '',
      role: (userUpdates.role as string | undefined) ?? keepData.role ?? '',
      roles: (userUpdates.roles as string[] | undefined) ?? getEffectiveRoles(keepData),
    },
  };
  if (dryRun) return result;

  await db.collection('users').doc(keepUid).update({
    ...userUpdates,
    mergedAccounts: FieldValue.arrayUnion({
      uid: removeUid,
      email: removeData.email ?? '',
      displayName: removeData.displayName ?? '',
      mergedAt: new Date().toISOString(),
      mergedBy: input.actingAdminUid,
    }),
  });

  // Removed account's login goes last, after every reference is safely
  // re-pointed — a failure above leaves it intact for a retry.
  try {
    await auth.revokeRefreshTokens(removeUid);
    await auth.deleteUser(removeUid);
  } catch (err: any) {
    if (err?.code !== 'auth/user-not-found') throw err;
  }
  // Keep the person's phone number if only the removed account had one —
  // read before its private docs are deleted below.
  const [keepContact, removeContact] = await Promise.all([
    getPrivateContact(keepUid, keepData),
    getPrivateContact(removeUid, removeData),
  ]);
  if (!keepContact.phoneNumber && removeContact.phoneNumber) {
    await writePrivateContact(keepUid, { phoneNumber: removeContact.phoneNumber });
  }

  const privateSnap = await db.collection('users').doc(removeUid).collection('private').get();
  const cleanup = db.batch();
  privateSnap.docs.forEach((d) => cleanup.delete(d.ref));
  cleanup.delete(db.collection('users').doc(removeUid));
  await cleanup.commit();

  await logAuditEvent({
    userId: input.actingAdminUid,
    userRole: input.actingAdminRole,
    action: 'users_merged',
    entityType: 'user',
    entityId: keepUid,
    oldValue: { uid: removeUid, email: removeData.email ?? '', displayName: removeData.displayName ?? '' },
    newValue: { uid: keepUid, email: keepData.email ?? '' },
    explanation: `${result.totalDocuments} document(s) re-pointed`,
    userDisplayName: input.actingAdminDisplayName,
  });

  return result;
}

export class MergeError extends Error {
  constructor(public code: 'SAME_USER' | 'SELF_REMOVE' | 'NOT_FOUND', message: string) {
    super(message);
  }
}
