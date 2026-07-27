// src/scripts/backfillDegreeProjectTypes.ts
//
// One-off migration: sets `degreeTypes: [degreeType]` / `projectTypes:
// [projectType]` on every existing `projects` doc created before the
// multi-select Add Project flow shipped. Required because the student browse
// query and applyApplication's eligibility check now read the array fields
// (`where('degreeTypes','array-contains', studentDegree)`, `.includes(...)`)
// — a project doc missing them entirely would silently stop matching either
// check. `postingGroupId`/`workflowTemplateRefs` are intentionally left
// untouched here: every consumer of those two has its own explicit fallback
// for a legacy doc that lacks them (see projectEnrollment.ts).
//
// SAFE BY DEFAULT: runs as a dry run (report only, no writes) unless you
// pass --apply. Always run without --apply first and read the report.
//
// Usage (from server/):
//   npx tsx src/scripts/backfillDegreeProjectTypes.ts             # dry run
//   npx tsx src/scripts/backfillDegreeProjectTypes.ts --apply     # actually writes

import { db } from '../config/firebase.js';

const APPLY = process.argv.includes('--apply');

async function main() {
  const snap = await db.collection('projects').get();
  const needsBackfill = snap.docs.filter((d) => {
    const data = d.data();
    return data.degreeTypes === undefined || data.projectTypes === undefined;
  });

  console.log(`projects: ${snap.size} total, ${needsBackfill.length} missing degreeTypes/projectTypes.`);
  if (needsBackfill.length === 0) {
    console.log('Nothing to do.');
    return;
  }

  needsBackfill.forEach((d) => {
    const data = d.data();
    console.log(`  ${APPLY ? 'Setting' : 'Would set'} degreeTypes:[${data.degreeType}] projectTypes:[${data.projectType}] on ${d.id} (facultyId=${data.facultyId}, status=${data.status})`);
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
    batch.update(d.ref, {
      degreeTypes: [data.degreeType ?? 'bachelors'],
      projectTypes: [data.projectType ?? 'project'],
    });
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
  console.error('backfillDegreeProjectTypes failed:', err);
  process.exit(1);
});
