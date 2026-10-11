// src/scripts/backfillExaminerFacultyIds.ts
//
// One-off migration: computes `facultyIds` on every existing
// examinerIdentities doc from the real history of examinerTokens that
// invited that examiner — see services/examinerAccess.ts's
// assignExaminersAndNotify, which now accumulates this going forward on
// every NEW token, same resolution logic as
// externalExaminersController.ts's getExternalExaminers (a token's own
// facultyId when set, else the linked project's facultyId).
//
// Needed because the Firestore rules fix for M3 (AUDIT_WEB_SERVER_SECURITY_
// BUGS_2026_10_07.md — examinerIdentities/examinerTaxDocuments/
// examinerBankAccounts were role-only, no faculty check) is already
// deployed and now requires a facultyIds match. Without this backfill, an
// existing examiner with no facultyIds field at all would be invisible to
// EVERY administrative_secretary, including the one who's actually been
// working with them for years — a real regression, not just "narrower than
// before".
//
// SAFE BY DEFAULT: runs as a dry run (report only, no writes) unless you
// pass --apply. Always run without --apply first and read the report.
//
// Usage (from server/):
//   npx tsx src/scripts/backfillExaminerFacultyIds.ts             # dry run
//   npx tsx src/scripts/backfillExaminerFacultyIds.ts --apply     # actually writes

import { db } from '../config/firebase.js';
import { hashExaminerEmail } from '../services/examinerFinancial.js';

const APPLY = process.argv.includes('--apply');

async function main() {
  const tokensSnap = await db.collection('examinerTokens').get();
  const tokens = tokensSnap.docs.map((d) => d.data());

  const projectIds = [...new Set(tokens.map((t) => t.projectId).filter(Boolean))];
  const projectSnaps = await Promise.all(projectIds.map((id) => db.collection('projects').doc(id).get()));
  const projectsById = new Map<string, FirebaseFirestore.DocumentData>();
  projectSnaps.forEach((snap) => { if (snap.exists) projectsById.set(snap.id, snap.data()!); });

  // email -> Set<facultyId>
  const facultyIdsByEmail = new Map<string, Set<string>>();
  for (const t of tokens) {
    const email = (t.examinerEmail as string | undefined)?.trim().toLowerCase();
    if (!email) continue;
    const project = t.projectId ? projectsById.get(t.projectId) : undefined;
    const facultyId: string | undefined = t.facultyId ?? project?.facultyId;
    if (!facultyId) continue;
    if (!facultyIdsByEmail.has(email)) facultyIdsByEmail.set(email, new Set());
    facultyIdsByEmail.get(email)!.add(facultyId);
  }

  console.log(`examinerTokens: ${tokens.length} total, ${facultyIdsByEmail.size} distinct examiner email(s) with a resolvable facultyId.`);

  const identitiesSnap = await db.collection('examinerIdentities').get();
  const existingFacultyIds = new Map<string, string[]>();
  identitiesSnap.docs.forEach((d) => existingFacultyIds.set(d.id, d.data().facultyIds ?? []));

  const toBackfill: Array<{ emailHash: string; email: string; facultyIds: string[] }> = [];
  for (const [email, facultySet] of facultyIdsByEmail) {
    const emailHash = hashExaminerEmail(email);
    const already = new Set(existingFacultyIds.get(emailHash) ?? []);
    const missing = [...facultySet].filter((f) => !already.has(f));
    if (missing.length > 0) {
      toBackfill.push({ emailHash, email, facultyIds: [...new Set([...already, ...facultySet])] });
    }
  }

  console.log(`${toBackfill.length} examinerIdentities doc(s) need facultyIds added/updated.`);
  if (toBackfill.length === 0) {
    console.log('Nothing to do.');
    return;
  }

  toBackfill.forEach(({ emailHash, email, facultyIds }) => {
    console.log(`  ${APPLY ? 'Setting' : 'Would set'} facultyIds=[${facultyIds.join(', ')}] on examinerIdentities/${emailHash} (${email})`);
  });

  if (!APPLY) {
    console.log('\nDry run only — re-run with --apply to actually write.');
    return;
  }

  const BATCH_LIMIT = 450;
  let batch = db.batch();
  let opsInBatch = 0;
  const commits: Promise<unknown>[] = [];
  for (const { emailHash, facultyIds } of toBackfill) {
    // merge:true — an examiner invited before they ever submitted identity/
    // tax/bank info has no examinerIdentities doc yet; this creates one with
    // just facultyIds rather than failing, same as the live arrayUnion path.
    batch.set(db.collection('examinerIdentities').doc(emailHash), { facultyIds }, { merge: true });
    opsInBatch++;
    if (opsInBatch >= BATCH_LIMIT) {
      commits.push(batch.commit());
      batch = db.batch();
      opsInBatch = 0;
    }
  }
  if (opsInBatch > 0) commits.push(batch.commit());
  await Promise.all(commits);
  console.log(`\nDone — backfilled ${toBackfill.length} examinerIdentities doc(s).`);
}

main().catch((err) => {
  console.error('backfillExaminerFacultyIds failed:', err);
  process.exit(1);
});
