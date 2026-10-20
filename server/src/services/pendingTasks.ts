// services/pendingTasks.ts
// "Something still to do here" tracking for task notifications — what keeps
// a dashboard tab's badge lit until the work is actually DONE, not merely
// until the user opened the tab (opening a tab only marks notifications
// read; see markNotificationsReadForScreens). notifyUser stamps actionable
// notifications with `pendingTask: true` plus how to tell when they're done
// (`taskMode`); reconcileTaskDocs flips them to `pendingTask: false` once:
//
//  - 'state'        — the related milestone moved on (status/stage changed,
//                     or it's gone). Used for review/approve/grade tasks:
//                     the item has left this person's queue for good,
//                     whoever acted on it.
//  - 'action'       — same as 'state', OR the recipient themself made a
//                     successful write referencing that milestone. For
//                     per-person tasks that don't change the milestone's
//                     status (a committee member's vote, a sign-off, an
//                     examiner's defense dates).
//  - 'applications' — the project has no application still awaiting the
//                     supervisor's decision.
//
// Reconciliation runs after every successful API write (resolveTasksAfter
// Mutation, wired as app-level middleware in index.ts), when the user opens
// a tab, and on client start (POST /api/notifications/reconcile-tasks).

import admin from 'firebase-admin';
import { db } from '../config/firebase.js';
import type { NotificationTaskKind } from './notificationTargets.js';

export type TaskMode = 'state' | 'action' | 'applications';

const ACTION_TASK_KINDS: NotificationTaskKind[] = ['signoff', 'deadline_examiner', 'defense', 'committee_conflict'];
const OPEN_APPLICATION_STATUSES = new Set(['applied', 'pending', 'meeting_requested', 'meeting_proposed', 'meeting_confirmed']);

export function taskModeFor(p: {
  type: string;
  taskKind?: NotificationTaskKind | undefined;
  targetScreenOverride?: string | undefined;
  relatedMilestoneId?: string | null | undefined;
  relatedProjectId?: string | null | undefined;
}): TaskMode | null {
  if (p.type === 'application_received' && p.relatedProjectId) return 'applications';
  if (!p.relatedMilestoneId) return null;
  if (p.targetScreenOverride) return p.targetScreenOverride.startsWith('student_') ? null : 'action';
  if (p.taskKind === 'milestone_action') return 'state';
  if (p.taskKind && ACTION_TASK_KINDS.includes(p.taskKind)) return 'action';
  return null;
}

export function milestoneStateKey(m: FirebaseFirestore.DocumentData | undefined): string | null {
  if (!m) return null;
  return `${m.status ?? ''}|${m.currentStageIndex ?? 0}`;
}

/** Fields notifyUser spreads onto a new in-app notification doc. */
export async function pendingTaskFields(mode: TaskMode | null, relatedMilestoneId: string | null): Promise<Record<string, unknown>> {
  if (!mode) return {};
  if (mode === 'applications') return { pendingTask: true, taskMode: mode };
  const snap = await db.collection('milestones').doc(relatedMilestoneId!).get();
  return { pendingTask: true, taskMode: mode, taskStateKey: milestoneStateKey(snap.data()) };
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Resolves whichever of `docs` (pendingTask notification docs) are done.
 * `actor` — the user who just made a successful write, and the request's
 * URL+body text, for 'action'-mode tasks resolved by doing them.
 */
export async function reconcileTaskDocs(
  docs: FirebaseFirestore.QueryDocumentSnapshot[],
  actor?: { uid: string; haystack: string },
): Promise<number> {
  const open = docs.filter((d) => d.data().pendingTask === true);
  if (!open.length) return 0;

  const milestoneIds = [...new Set(open.map((d) => d.data().relatedMilestoneId).filter((id): id is string => typeof id === 'string' && !!id))];
  const projectIds = [...new Set(open.filter((d) => d.data().taskMode === 'applications').map((d) => d.data().relatedProjectId).filter((id): id is string => typeof id === 'string' && !!id))];

  const milestones = new Map<string, FirebaseFirestore.DocumentData | undefined>();
  if (milestoneIds.length) {
    const snaps = await db.getAll(...milestoneIds.map((id) => db.collection('milestones').doc(id)));
    snaps.forEach((s) => milestones.set(s.id, s.exists ? s.data() : undefined));
  }
  const projectsWithOpenApps = new Set<string>();
  for (const ids of chunk(projectIds, 30)) {
    const snap = await db.collection('applications').where('projectId', 'in', ids).get();
    snap.docs.forEach((a) => {
      if (OPEN_APPLICATION_STATUSES.has(a.data().status)) projectsWithOpenApps.add(a.data().projectId);
    });
  }

  const done = open.filter((d) => {
    const n = d.data();
    if (n.taskMode === 'applications') return !projectsWithOpenApps.has(n.relatedProjectId);
    const milestoneId: string | undefined = n.relatedMilestoneId;
    if (!milestoneId) return true;
    const key = milestoneStateKey(milestones.get(milestoneId));
    if (key === null || key !== n.taskStateKey) return true;
    return n.taskMode === 'action' && !!actor && n.recipientId === actor.uid && actor.haystack.includes(milestoneId);
  });
  if (!done.length) return 0;

  for (const group of chunk(done, 400)) {
    const batch = db.batch();
    group.forEach((d) => batch.update(d.ref, {
      // isRead deliberately untouched — a task resolved by someone else's
      // action still shows as unread news until its recipient sees it.
      pendingTask: false,
      taskResolvedAt: admin.firestore.FieldValue.serverTimestamp(),
    }));
    await batch.commit();
  }
  return done.length;
}

/** Every still-open task of one user — tab open / client start. */
export async function reconcileUserTasks(uid: string): Promise<number> {
  const snap = await db.collection('notifications')
    .where('recipientId', '==', uid)
    .where('pendingTask', '==', true)
    .get();
  return reconcileTaskDocs(snap.docs);
}

const FIRESTORE_ID = /[A-Za-z0-9]{20}/g;

/**
 * After a successful write by `uid`: re-checks that user's own open tasks
 * (their own action may have finished one), plus every open task — anyone's
 * — tied to a milestone id that appears in the request (another approver
 * acting on it finishes theirs too).
 */
export async function resolveTasksAfterMutation(uid: string, haystack: string): Promise<void> {
  const ids = [...new Set(haystack.match(FIRESTORE_ID) ?? [])].slice(0, 60);
  const [own, ...related] = await Promise.all([
    db.collection('notifications').where('recipientId', '==', uid).where('pendingTask', '==', true).get(),
    ...chunk(ids, 30).map((group) => db.collection('notifications').where('relatedMilestoneId', 'in', group).get()),
  ]);
  const byId = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
  [own, ...related].forEach((s) => s.docs.forEach((d) => { if (d.data().pendingTask === true) byId.set(d.id, d); }));
  await reconcileTaskDocs([...byId.values()], { uid, haystack });
}
