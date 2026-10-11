// src/scripts/backfillCoordinatorScopeFacultyIds.ts
//
// One-off migration: sets `coordinatorScopeFacultyIds` (a flattened mirror
// of coordinatorScopes' facultyId values) on every existing user doc that
// already has coordinatorScopes but predates this field — see
// adminController.ts's updateUserRoleAdmin, which now writes it going
// forward, and mobile/firestore.rules's sameFaculty(), which reads it.
//
// Needed because the Firestore rules fix for H7 (AUDIT_WEB_SERVER_SECURITY_
// BUGS_2026_10_07.md — administrative_secretary was unconditionally cross-
// faculty at the rules layer, now scoped to her real coordinatorScopes) is
// already deployed. Any EXISTING administrative_secretary/coordinator
// account whose coordinatorScopes spans more than one faculty, or whose
// single scope's facultyId differs from their own home facultyId field,
// will see empty milestones/grades on their live Firestore listeners
// (coordinator/home's onSnapshot — the Express API itself is unaffected,
// it already reads coordinatorScopes directly) until this runs.
//
// SAFE BY DEFAULT: runs as a dry run (report only, no writes) unless you
// pass --apply. Always run without --apply first and read the report.
//
// Usage (from server/):
//   npx tsx src/scripts/backfillCoordinatorScopeFacultyIds.ts             # dry run
//   npx tsx src/scripts/backfillCoordinatorScopeFacultyIds.ts --apply     # actually writes

import { db } from '../config/firebase.js';

const APPLY = process.argv.includes('--apply');

async function main() {
  const snap = await db.collection('users').get();
  const needsBackfill = snap.docs.filter((d) => {
    const data = d.data();
    return Array.isArray(data.coordinatorScopes) && data.coordinatorScopes.length > 0 && data.coordinatorScopeFacultyIds === undefined;
  });

  console.log(`users: ${snap.size} total, ${needsBackfill.length} with coordinatorScopes missing coordinatorScopeFacultyIds.`);
  if (needsBackfill.length === 0) {
    console.log('Nothing to do.');
    return;
  }

  const computed = needsBackfill.map((d) => {
    const data = d.data();
    const facultyIds = [...new Set((data.coordinatorScopes as Array<{ facultyId: string }>).map((s) => s.facultyId))];
    return { doc: d, facultyIds, role: data.role, email: data.email };
  });

  computed.forEach(({ doc, facultyIds, role, email }) => {
    console.log(`  ${APPLY ? 'Setting' : 'Would set'} coordinatorScopeFacultyIds=[${facultyIds.join(', ')}] on ${doc.id} (role=${role}, email=${email})`);
  });

  if (!APPLY) {
    console.log('\nDry run only — re-run with --apply to actually write.');
    return;
  }

  const BATCH_LIMIT = 450;
  let batch = db.batch();
  let opsInBatch = 0;
  const commits: Promise<unknown>[] = [];
  for (const { doc, facultyIds } of computed) {
    batch.update(doc.ref, { coordinatorScopeFacultyIds: facultyIds });
    opsInBatch++;
    if (opsInBatch >= BATCH_LIMIT) {
      commits.push(batch.commit());
      batch = db.batch();
      opsInBatch = 0;
    }
  }
  if (opsInBatch > 0) commits.push(batch.commit());
  await Promise.all(commits);
  console.log(`\nDone — backfilled ${computed.length} user(s).`);
}

main().catch((err) => {
  console.error('backfillCoordinatorScopeFacultyIds failed:', err);
  process.exit(1);
});
