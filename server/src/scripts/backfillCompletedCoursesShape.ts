// src/scripts/backfillCompletedCoursesShape.ts
//
// One-off migration: reshapes any student's legacy `completedCourses` (a
// plain string[] of course names, from before grades were tracked) into the
// new [{subject, grade?}] shape — grade left unset, since there's no real
// grade to fill in for these entries. Purely cosmetic: normalizeCompletedCourses
// (services/prerequisites.ts) already treats both shapes identically at read
// time, so this changes nothing about how the app behaves — it just cleans
// up the stored data. Skips any student whose completedCourses is missing
// entirely (nothing to reshape) or already fully in the new shape.
//
// SAFE BY DEFAULT: runs as a dry run (report only, no writes) unless you
// pass --apply. Always run without --apply first and read the report.
//
// Usage (from server/):
//   npx tsx src/scripts/backfillCompletedCoursesShape.ts             # dry run
//   npx tsx src/scripts/backfillCompletedCoursesShape.ts --apply     # actually writes

import { db } from '../config/firebase.js';
import { normalizeCompletedCourses } from '../services/prerequisites.js';

const APPLY = process.argv.includes('--apply');

async function main() {
  const snap = await db.collection('users').where('role', '==', 'student').get();

  const needsBackfill = snap.docs.filter((d) => {
    const raw = d.data().completedCourses;
    return Array.isArray(raw) && raw.some((entry) => typeof entry === 'string');
  });

  console.log(`students: ${snap.size} total, ${needsBackfill.length} with legacy string[] completedCourses.`);
  if (needsBackfill.length === 0) {
    console.log('Nothing to do.');
    return;
  }

  needsBackfill.forEach((d) => {
    const data = d.data();
    const before = data.completedCourses;
    const after = normalizeCompletedCourses(before);
    console.log(`  ${APPLY ? 'Reshaping' : 'Would reshape'} ${d.id} (${data.displayName ?? data.email ?? 'unknown'}):`);
    console.log(`    before: ${JSON.stringify(before)}`);
    console.log(`    after:  ${JSON.stringify(after)}`);
  });

  if (!APPLY) {
    console.log('\nDry run only — re-run with --apply to actually write.');
    return;
  }

  const BATCH_LIMIT = 450;
  let batch = db.batch();
  let opsInBatch = 0;
  const commits: Promise<unknown>[] = [];
  for (const d of needsBackfill) {
    batch.update(d.ref, { completedCourses: normalizeCompletedCourses(d.data().completedCourses) });
    opsInBatch++;
    if (opsInBatch >= BATCH_LIMIT) {
      commits.push(batch.commit());
      batch = db.batch();
      opsInBatch = 0;
    }
  }
  if (opsInBatch > 0) commits.push(batch.commit());
  await Promise.all(commits);
  console.log(`\nDone — reshaped ${needsBackfill.length} student(s).`);
}

main().catch((err) => {
  console.error('backfillCompletedCoursesShape failed:', err);
  process.exit(1);
});
