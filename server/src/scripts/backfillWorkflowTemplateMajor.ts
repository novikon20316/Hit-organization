// src/scripts/backfillWorkflowTemplateMajor.ts
//
// One-off migration: sets `major: null` on every existing `workflowTemplates`
// doc created before major-scoped templates shipped. Required because
// Firestore's `.where('major','==',null)` only matches a field explicitly
// set to null — it does not match a document where the field is simply
// absent — and every pre-existing template predates this field entirely.
// Without this backfill, old templates would silently stop being found by
// getActiveMilestonesFor's "all majors" fallback tier.
//
// SAFE BY DEFAULT: runs as a dry run (report only, no writes) unless you
// pass --apply. Always run without --apply first and read the report.
//
// Usage (from server/):
//   npx tsx src/scripts/backfillWorkflowTemplateMajor.ts             # dry run
//   npx tsx src/scripts/backfillWorkflowTemplateMajor.ts --apply     # actually writes

import { db } from '../config/firebase.js';

const APPLY = process.argv.includes('--apply');

async function main() {
  const snap = await db.collection('workflowTemplates').get();
  const needsBackfill = snap.docs.filter((d) => d.data().major === undefined);

  console.log(`workflowTemplates: ${snap.size} total, ${needsBackfill.length} missing 'major'.`);
  if (needsBackfill.length === 0) {
    console.log('Nothing to do.');
    return;
  }

  needsBackfill.forEach((d) => {
    const data = d.data();
    console.log(`  ${APPLY ? 'Setting' : 'Would set'} major:null on ${d.id} (facultyId=${data.facultyId}, processType=${data.processType}, status=${data.status})`);
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
    batch.update(d.ref, { major: null });
    opsInBatch++;
    if (opsInBatch >= BATCH_LIMIT) {
      commits.push(batch.commit());
      batch = db.batch();
      opsInBatch = 0;
    }
  }
  if (opsInBatch > 0) commits.push(batch.commit());
  await Promise.all(commits);
  console.log(`\nDone — backfilled ${needsBackfill.length} template(s).`);
}

main().catch((err) => {
  console.error('backfillWorkflowTemplateMajor failed:', err);
  process.exit(1);
});
