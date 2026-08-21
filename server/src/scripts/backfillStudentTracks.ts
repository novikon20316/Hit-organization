// src/scripts/backfillStudentTracks.ts
//
// One-off migration: sets trackPolicy/track/trackLocked on every existing
// student doc created before the thesis/project track feature shipped
// (see config/studentTrack.ts). Idempotent — skips any doc that already has
// trackPolicy set, so re-running is safe.
//
// - bachelors, or a masters major that's project_only          -> fixed 'project', locked.
// - coordinator_gated masters (e.g. computer_science)          -> same as a
//   brand-new student: unset/pending, until their coordinator reviews them.
// - signup_choice masters (electrical_engineering,
//   technology_management) -> defaulted to locked 'project' rather than
//   surprising an already-registered student with a retroactive choice
//   prompt; a coordinator/system_admin can flip it via the override endpoint
//   if a student actually wants thesis.
//
// SAFE BY DEFAULT: runs as a dry run (report only, no writes) unless you
// pass --apply. Always run without --apply first and read the report.
//
// Usage (from server/):
//   npx tsx src/scripts/backfillStudentTracks.ts             # dry run
//   npx tsx src/scripts/backfillStudentTracks.ts --apply     # actually writes

import { db } from '../config/firebase.js';
import { resolveTrackPolicy } from '../config/studentTrack.js';

const APPLY = process.argv.includes('--apply');

async function main() {
  const snap = await db.collection('users').where('role', '==', 'student').get();
  const needsBackfill = snap.docs.filter((d) => d.data().trackPolicy === undefined);

  console.log(`students: ${snap.size} total, ${needsBackfill.length} missing trackPolicy.`);
  if (needsBackfill.length === 0) {
    console.log('Nothing to do.');
    return;
  }

  const plans = needsBackfill.map((d) => {
    const data = d.data();
    const policy = resolveTrackPolicy(data.degreeType ?? null, data.major ?? null);
    const update =
      policy === 'coordinator_gated'
        ? { trackPolicy: policy, track: null, trackLocked: false, thesisEligibility: null }
        : { trackPolicy: policy, track: 'project' as const, trackLocked: true, trackLockedReason: 'project_only' as const };
    return { ref: d.ref, id: d.id, degreeType: data.degreeType, major: data.major, policy, update };
  });

  plans.forEach((p) => {
    console.log(`  ${APPLY ? 'Setting' : 'Would set'} trackPolicy=${p.policy} track=${p.update.track ?? 'null'} on ${p.id} (degreeType=${p.degreeType}, major=${p.major})`);
  });

  if (!APPLY) {
    console.log('\nDry run only — re-run with --apply to actually write.');
    return;
  }

  const BATCH_LIMIT = 450;
  let batch = db.batch();
  let opsInBatch = 0;
  const commits: Promise<unknown>[] = [];
  for (const p of plans) {
    batch.update(p.ref, p.update);
    opsInBatch++;
    if (opsInBatch >= BATCH_LIMIT) {
      commits.push(batch.commit());
      batch = db.batch();
      opsInBatch = 0;
    }
  }
  if (opsInBatch > 0) commits.push(batch.commit());
  await Promise.all(commits);
  console.log(`\nDone — backfilled ${plans.length} student(s).`);
}

main().catch((err) => {
  console.error('backfillStudentTracks failed:', err);
  process.exit(1);
});
