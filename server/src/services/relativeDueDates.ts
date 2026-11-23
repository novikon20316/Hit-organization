// src/services/relativeDueDates.ts
//
// Sequential ("relative") due dates — used for students imported part-way
// through their project (see importedStudentPlacement.ts and
// projectEnrollment.ts's ImportedProgress). Instead of every milestone being
// "project start + N days" (which can put them all on the same day, and puts
// an imported student's current milestone in the past), each milestone gets
// its own duration and only starts counting when the previous one finishes:
//
//   - the milestone the student is on is due  now + its duration;
//   - every later milestone is flagged `dueDateWaitsForPrevious` with
//     `relativeDueDays`, and carries a provisional date (chained from the
//     current one) only so code that expects a date never sees none;
//   - the moment the milestone before it is done, its real date is set to
//     that moment + its duration (advanceWaitingDueDates), and the
//     provisional dates after it are re-chained from there.
//
// advanceWaitingDueDates is driven by the server's milestone watcher
// (milestoneChangeSignal.ts → noteMilestoneForRelativeDueDates), so it
// catches a milestone finishing through ANY path (coordinator approval,
// chain sign-off, committee, thesis exam, defense…), and re-checks every
// waiting project on startup in case one finished while the server was down.

import admin from 'firebase-admin';
import type { DocumentData } from 'firebase-admin/firestore';
import { db } from '../config/firebase.js';
import { atDueTime } from '../utils/dueTime.js';
import { resolveMilestoneOrder, type WorkflowMilestoneSpec } from './workflowTemplates.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const DONE = new Set(['coordinator_approved', 'completed']);

/** How many days a milestone gets once it becomes the current one: the
 *  template's gap since the previous milestone (dueDaysFromStart difference),
 *  or — when the template gives no gap (e.g. every milestone set to the same
 *  day) — the milestone's own dueDaysFromStart. Never less than 1 day. */
export function relativeDurationDays(orderedSpecs: WorkflowMilestoneSpec[], index: number): number {
  const spec = orderedSpecs[index]!;
  const own = Number(spec.dueDaysFromStart) || 0;
  const prev = index > 0 ? Number(orderedSpecs[index - 1]!.dueDaysFromStart) || 0 : 0;
  const gap = own - prev;
  return Math.max(1, gap > 0 ? gap : own);
}

export function addDaysAtDueTime(from: Date, days: number): Date {
  return atDueTime(new Date(from.getTime() + days * DAY_MS));
}

/** Gives the first waiting milestone whose predecessors are all done its
 *  real due date (now + relativeDueDays), then re-chains the provisional
 *  dates of the waiting ones after it. Idempotent and safe to run from
 *  several server instances at once (the dating is transactional). */
export async function advanceWaitingDueDates(projectId: string): Promise<void> {
  const snap = await db.collection('milestones').where('projectId', '==', projectId).get();
  const docs = snap.docs.slice().sort((a, b) => resolveMilestoneOrder(a.data()) - resolveMilestoneOrder(b.data()));
  const firstNotDone = docs.findIndex((d) => !DONE.has(d.data().status));
  if (firstNotDone === -1) return;
  const current = docs[firstNotDone]!;

  let anchor: Date | null = null;
  if (current.data().dueDateWaitsForPrevious) {
    anchor = await db.runTransaction(async (tx) => {
      const fresh = await tx.get(current.ref);
      const d = fresh.data();
      if (!d?.dueDateWaitsForPrevious) return null; // another instance got here first
      const due = addDaysAtDueTime(new Date(), Number(d.relativeDueDays) || 1);
      tx.update(current.ref, {
        dueDate: admin.firestore.Timestamp.fromDate(due),
        dueDateWaitsForPrevious: false,
        dueDateSetAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return due;
    });
  }
  if (!anchor) return;

  // Re-chain the provisional dates of the milestones still waiting after it.
  let prev = anchor;
  const batch = db.batch();
  let writes = 0;
  for (const d of docs.slice(firstNotDone + 1)) {
    const data = d.data();
    if (!data.dueDateWaitsForPrevious) break;
    prev = addDaysAtDueTime(prev, Number(data.relativeDueDays) || 1);
    batch.update(d.ref, { dueDate: admin.firestore.Timestamp.fromDate(prev) });
    writes++;
  }
  if (writes) await batch.commit();
}

// ── Watcher hook ─────────────────────────────────────────────────────────────
// Fed every milestone snapshot change (including the initial load) by
// milestoneChangeSignal.ts. Tracks which projects still have a waiting
// milestone; any change to a milestone of such a project (e.g. one being
// approved) schedules a debounced advanceWaitingDueDates for it.
const waitingDocsByProject = new Map<string, Set<string>>();
const scheduled = new Set<string>();
let timer: NodeJS.Timeout | null = null;

function schedule(projectId: string) {
  scheduled.add(projectId);
  if (timer) return;
  timer = setTimeout(async () => {
    timer = null;
    const ids = [...scheduled];
    scheduled.clear();
    for (const id of ids) {
      await advanceWaitingDueDates(id).catch((err) => console.error(`advanceWaitingDueDates(${id}) failed:`, err));
    }
  }, 2000);
}

export function noteMilestoneForRelativeDueDates(docId: string, data: DocumentData | null): void {
  // Find the project this doc belonged to (for removals data is null).
  let projectId: string | null = typeof data?.projectId === 'string' ? data.projectId : null;
  if (!projectId) {
    for (const [pid, set] of waitingDocsByProject) if (set.has(docId)) { projectId = pid; break; }
  }
  if (!projectId) return;
  const set = waitingDocsByProject.get(projectId) ?? new Set<string>();
  if (data?.dueDateWaitsForPrevious === true) set.add(docId); else set.delete(docId);
  if (set.size) waitingDocsByProject.set(projectId, set); else waitingDocsByProject.delete(projectId);
  // A project with a milestone still waiting: something changed in it (or
  // we just loaded it) — check whether that milestone's turn has come.
  if (set.size) schedule(projectId);
}
