// src/services/fixedDateRollover.ts
//
// Auto-advances a workflow template's fixed-calendar-date milestones
// (WorkflowMilestoneSpec.dateMode === 'fixed') to next year once that date
// has passed AND at least one real submission has come in for that exact
// milestone — so a recurring "everyone submits by March 15" deadline
// doesn't need a coordinator to manually bump the year every year, but also
// doesn't jump ahead while this year's cohort might still be mid-cycle (e.g.
// an extension granted past the nominal date, or the deadline simply hasn't
// produced any submissions yet). Only ever touches APPROVED templates — a
// still-pending proposal's dates are still being authored, not live.
//
// Matches a milestone doc back to the template entry that produced it by
// (facultyId, type, dueDate) rather than a template/project join — dueDate
// is deterministically resolved from fixedDate at enrollment (see
// resolveMilestoneDueDate), so an exact-date match is a reliable enough
// signal without needing major/processType stored on every milestone doc.
// A same-faculty collision (two different templates using the identical
// milestone `type` string AND the identical fixedDate) is not a realistic
// concern in practice.
//
// Run daily (see index.ts) — same in-process setInterval pattern as
// services/accountDeletion.ts / services/notificationScheduler.ts.

import admin from 'firebase-admin';
import { db } from '../config/firebase.js';
import type { WorkflowMilestoneSpec } from './workflowTemplates.js';

async function hasAnySubmission(facultyId: string, type: string, fixedDate: Date): Promise<boolean> {
  const snap = await db.collection('milestones')
    .where('facultyId', '==', facultyId)
    .where('type', '==', type)
    .where('dueDate', '==', admin.firestore.Timestamp.fromDate(fixedDate))
    .get();
  return snap.docs.some((d) => !!d.data().submittedAt);
}

/** Advances by whole years until back in the future — handles the server
 *  having missed more than one deadline (e.g. downtime spanning a year), not
 *  just the common single-year case. */
function nextFutureDate(fixedDate: Date, now: Date): Date {
  const next = new Date(fixedDate);
  while (next.getTime() < now.getTime()) {
    next.setUTCFullYear(next.getUTCFullYear() + 1);
  }
  return next;
}

/** Run daily (see index.ts). */
export async function advancePastFixedMilestoneDates(): Promise<void> {
  const now = new Date();
  const snap = await db.collection('workflowTemplates').where('status', '==', 'approved').get();

  for (const doc of snap.docs) {
    const data = doc.data();
    const facultyId: string | undefined = data.facultyId;
    const milestones: WorkflowMilestoneSpec[] = data.milestones ?? [];
    if (!facultyId || milestones.length === 0) continue;

    let changed = false;
    const nextMilestones: WorkflowMilestoneSpec[] = [];
    for (const m of milestones) {
      if (m.dateMode !== 'fixed' || !m.fixedDate) {
        nextMilestones.push(m);
        continue;
      }
      const fixed = new Date(m.fixedDate);
      if (Number.isNaN(fixed.getTime()) || fixed.getTime() >= now.getTime()) {
        nextMilestones.push(m);
        continue;
      }

      try {
        const submitted = await hasAnySubmission(facultyId, m.type, fixed);
        if (!submitted) {
          nextMilestones.push(m);
          continue;
        }
        const advanced = nextFutureDate(fixed, now);
        changed = true;
        nextMilestones.push({ ...m, fixedDate: advanced.toISOString().slice(0, 10) });
      } catch (err) {
        console.error(`advancePastFixedMilestoneDates: check failed for template ${doc.id} milestone "${m.type}":`, err);
        nextMilestones.push(m);
      }
    }

    if (changed) {
      try {
        await doc.ref.update({ milestones: nextMilestones });
        console.log(`advancePastFixedMilestoneDates: rolled forward fixedDate(s) on template ${doc.id}`);
      } catch (err) {
        console.error(`advancePastFixedMilestoneDates: failed to persist template ${doc.id}:`, err);
      }
    }
  }
}
