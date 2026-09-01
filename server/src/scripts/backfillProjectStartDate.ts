// src/scripts/backfillProjectStartDate.ts
//
// One-off migration: sets `projectStartDate` on every existing `projects`
// doc created before that field existed (see projectEnrollment.ts's
// enrollStudentInProject, which now sets it going forward, at first
// enrollment). "תאריך תחילת פרויקט" on the Data Science examiner evaluation
// form (Project_examiner.docx) needs this for every project an examiner
// might evaluate, including ones enrolled long before this field existed —
// for those, the project's own `createdAt` is used as an approximation
// (decided explicitly with the product owner: exact "supervisor approved
// the application" moment isn't recoverable for pre-existing projects).
//
// Only touches projects missing `projectStartDate` AND with no
// enrolledStudentIds enrolled after this feature shipped (i.e. every
// already-enrolled project) — a project with enrolledStudentIds but no
// projectStartDate can only be a pre-existing one, since
// enrollStudentInProject now always sets it at first enrollment.
//
// SAFE BY DEFAULT: runs as a dry run (report only, no writes) unless you
// pass --apply. Always run without --apply first and read the report.
//
// Usage (from server/):
//   npx tsx src/scripts/backfillProjectStartDate.ts             # dry run
//   npx tsx src/scripts/backfillProjectStartDate.ts --apply     # actually writes

import { db } from '../config/firebase.js';

const APPLY = process.argv.includes('--apply');

async function main() {
  const snap = await db.collection('projects').get();
  const needsBackfill = snap.docs.filter((d) => {
    const data = d.data();
    return data.projectStartDate === undefined && data.createdAt !== undefined;
  });

  console.log(`projects: ${snap.size} total, ${needsBackfill.length} missing projectStartDate (with a createdAt to backfill from).`);
  if (needsBackfill.length === 0) {
    console.log('Nothing to do.');
    return;
  }

  needsBackfill.forEach((d) => {
    const data = d.data();
    console.log(`  ${APPLY ? 'Setting' : 'Would set'} projectStartDate:=createdAt on ${d.id} (facultyId=${data.facultyId}, status=${data.status})`);
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
    const data = d.data();
    batch.update(d.ref, { projectStartDate: data.createdAt });
    opsInBatch++;
    if (opsInBatch >= BATCH_LIMIT) {
      commits.push(batch.commit());
      batch = db.batch();
      opsInBatch = 0;
    }
  }
  if (opsInBatch > 0) commits.push(batch.commit());
  await Promise.all(commits);
  console.log(`\nDone — backfilled ${needsBackfill.length} project(s).`);
}

main().catch((err) => {
  console.error('backfillProjectStartDate failed:', err);
  process.exit(1);
});
