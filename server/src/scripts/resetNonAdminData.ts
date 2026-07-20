// src/scripts/resetNonAdminData.ts
//
// One-off reset for QA: deletes every user (Firestore doc + Firebase Auth
// account) except role === 'system_admin', plus every collection that
// references users, so testing starts from a genuinely clean slate instead
// of leaving dangling uid references scattered across ~13 collections.
//
// KEPT (not touched): admin_audit, auditLog (history), approvedStudents
// (student pre-registration roster, not tied to specific accounts),
// infoFiles, system (institution-wide config, not user data).
//
// SAFE BY DEFAULT: runs as a dry run (report only, no writes/deletes) unless
// you pass --apply. Always run without --apply first and read the report.
//
// Usage (from server/):
//   npx tsx src/scripts/resetNonAdminData.ts             # dry run
//   npx tsx src/scripts/resetNonAdminData.ts --apply     # actually deletes

import { db, auth } from '../config/firebase.js';

const APPLY = process.argv.includes('--apply');

// Collections deleted in their entirety — every doc referencing a user
// (project, milestone, chat, notification, ...) becomes meaningless once
// that user is gone, and there's no partial state worth preserving.
const WHOLESALE_COLLECTIONS: Array<{ name: string; subcollections?: string[] }> = [
  { name: 'projects' },
  { name: 'milestones' },
  { name: 'chats', subcollections: ['messages'] },
  { name: 'notifications' },
  { name: 'applications' },
  { name: 'feedbackMessages' },
  { name: 'grades' },
  { name: 'workflowTemplates' },
  { name: 'facultyTemplates' },
  { name: 'examinerTokens' },
  { name: 'defenseAccessGrants' },
  { name: 'examinerRecommendations' },
];

const BATCH_LIMIT = 450;

async function deleteRefsBatched(refs: FirebaseFirestore.DocumentReference[]) {
  let batch = db.batch();
  let ops = 0;
  const commits: Promise<unknown>[] = [];

  for (const ref of refs) {
    batch.delete(ref);
    ops++;
    if (ops >= BATCH_LIMIT) {
      commits.push(batch.commit());
      batch = db.batch();
      ops = 0;
    }
  }
  if (ops > 0) commits.push(batch.commit());
  await Promise.all(commits);
}

async function wipeCollection(plan: { name: string; subcollections?: string[] }): Promise<number> {
  const snap = await db.collection(plan.name).get();

  if (APPLY) {
    for (const sub of plan.subcollections ?? []) {
      for (const doc of snap.docs) {
        const subSnap = await doc.ref.collection(sub).get();
        if (!subSnap.empty) {
          await deleteRefsBatched(subSnap.docs.map((d) => d.ref));
        }
      }
    }
    await deleteRefsBatched(snap.docs.map((d) => d.ref));
  }

  return snap.size;
}

interface UserPlan {
  uid: string;
  email: string | undefined;
  role: string | undefined;
}

async function main() {
  console.log(APPLY ? '🚀 APPLY mode — deleting for real' : '🔎 DRY RUN — nothing will be deleted (pass --apply to actually run this)');
  console.log('');

  // ── 1. Users + Auth accounts ──────────────────────────────────────────────
  const usersSnap = await db.collection('users').get();
  const toDelete: UserPlan[] = [];
  const kept: UserPlan[] = [];

  for (const doc of usersSnap.docs) {
    const data = doc.data();
    const plan: UserPlan = { uid: doc.id, email: data.email, role: data.role };
    if (data.role === 'system_admin') kept.push(plan);
    else toDelete.push(plan);
  }

  console.log(`── users ──`);
  console.log(`  kept (system_admin): ${kept.length}`);
  kept.forEach((u) => console.log(`    ${u.uid}  ${u.email ?? '(no email)'}`));
  console.log(`  to delete: ${toDelete.length}`);
  toDelete.forEach((u) => console.log(`    ${u.uid}  ${u.email ?? '(no email)'}  role=${u.role ?? '(none)'}`));

  if (APPLY) {
    for (const u of toDelete) {
      // Private subcollection (e.g. TOTP secrets) — Firestore doesn't cascade
      // subcollection deletes when the parent doc is deleted.
      const privateSnap = await db.collection('users').doc(u.uid).collection('private').get();
      if (!privateSnap.empty) {
        await deleteRefsBatched(privateSnap.docs.map((d) => d.ref));
      }

      await db.collection('users').doc(u.uid).delete();

      try {
        await auth.deleteUser(u.uid);
      } catch (err: any) {
        // Already gone from Auth, or never had an Auth account (e.g. a
        // Firestore-only row from the createAdminUser bug) — not fatal.
        console.error(`  ⚠️  Auth delete failed for ${u.uid} (${u.email ?? 'no email'}): ${err.message}`);
      }
    }
  }

  // ── 2. Wholesale collections ──────────────────────────────────────────────
  for (const plan of WHOLESALE_COLLECTIONS) {
    const count = await wipeCollection(plan);
    console.log(`\n── ${plan.name} ──`);
    console.log(`  ${APPLY ? 'deleted' : 'would delete'}: ${count}`);
  }

  if (!APPLY) {
    console.log('\nThis was a dry run — nothing was deleted. Re-run with --apply once the report looks right.');
  } else {
    console.log('\nDone.');
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Reset failed:', err);
    process.exit(1);
  });
