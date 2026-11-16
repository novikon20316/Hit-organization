// src/scripts/backfillDueDatesToNoon.ts
//
// One-off (2026-11-16): due dates are now always 12:00 Israel time on their
// day (utils/dueTime.ts), but existing milestones still carry whatever time
// they were created with (the student's enrollment time, or midnight UTC for
// a staff-picked date). Moves every not-yet-submitted milestone's dueDate to
// 12:00 Israel time on the SAME Israel calendar day.
//
// Skips:
//  - defense milestones — their dueDate is the defense day, with the real
//    time kept separately (defenseTime);
//  - anything already submitted/graded/approved — moving the hour there
//    could flip a recorded on-time/late outcome.
//
// If the deadline-reminder sweep already recorded which due date it reminded
// for (deadlineRemindersDueDateMs), that's moved along with it so the sweep
// doesn't treat the shift as a new date and re-send the 7d/1d reminders.
//
// SAFE BY DEFAULT: dry run unless you pass --apply.
//
// Usage (from server/):
//   npx tsx src/scripts/backfillDueDatesToNoon.ts          # dry run
//   npx tsx src/scripts/backfillDueDatesToNoon.ts --apply  # writes

import admin from 'firebase-admin';
import { db } from '../config/firebase.js';
import { atDueTime, DUE_TZ } from '../utils/dueTime.js';

const APPLY = process.argv.includes('--apply');
const OPEN_STATUSES = new Set(['pending', 'rejected', 'revision_requested', 'needs_revision']);

const snap = await db.collection('milestones').get();
const statusCounts: Record<string, number> = {};
const updates: { ref: FirebaseFirestore.DocumentReference; data: Record<string, unknown>; line: string }[] = [];

for (const doc of snap.docs) {
  const m = doc.data();
  const due: Date | null = m.dueDate?.toDate?.() ?? null;
  if (!due || m.type === 'defense') continue;
  statusCounts[m.status] = (statusCounts[m.status] ?? 0) + 1;
  if (!OPEN_STATUSES.has(m.status) || m.submittedAt) continue;
  const noon = atDueTime(due);
  if (noon.getTime() === due.getTime()) continue;
  const data: Record<string, unknown> = { dueDate: admin.firestore.Timestamp.fromDate(noon) };
  if (typeof m.deadlineRemindersDueDateMs === 'number') data.deadlineRemindersDueDateMs = noon.getTime();
  const fmt = (d: Date) => d.toLocaleString('en-GB', { timeZone: DUE_TZ, dateStyle: 'short', timeStyle: 'short' });
  updates.push({ ref: doc.ref, data, line: `${doc.id} [${m.status}] ${m.nameHe ?? m.type}: ${fmt(due)} → ${fmt(noon)}` });
}

console.log('non-defense milestones by status:', statusCounts);
console.log(`${updates.length} open milestone(s) to move to 12:00 Israel time:`);
for (const u of updates.slice(0, 40)) console.log('  ', u.line);
if (updates.length > 40) console.log(`   … and ${updates.length - 40} more`);

if (!APPLY) {
  console.log('\nDry run — nothing written. Re-run with --apply.');
  process.exit(0);
}
for (let i = 0; i < updates.length; i += 400) {
  const batch = db.batch();
  for (const u of updates.slice(i, i + 400)) batch.update(u.ref, u.data);
  await batch.commit();
}
console.log(`\nUpdated ${updates.length} milestone(s).`);
process.exit(0);
