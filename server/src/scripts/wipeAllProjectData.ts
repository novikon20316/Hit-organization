// src/scripts/wipeAllProjectData.ts
//
// Pre-launch reset: deletes every document in every collection that's scoped
// to a project, so the system can be exercised from a clean slate now that
// the TEMP-2-ACTIVE-PROJECTS bypass (projectEnrollment.ts) has been
// reverted. Covers the full cascade a project can touch:
//   projects, milestones, applications, grades, examinerRecommendations,
//   defenseAccessGrants, examinerTokens, projectErasureRequests,
//   projectRecordEntries
// and clears the project-linking fields (hasActiveProject/activeProjectId/
// activeProjectIds/supervisorId) on every student's own user doc, so no
// dashboard is left pointing at a project that no longer exists.
//
// Deliberately NOT touched: no user account of any kind, chats, or
// notifications — those aren't purely project-scoped, and a stale
// relatedProjectId on an old notification is harmless.
//
// SAFE BY DEFAULT: dry run (report only, no writes) unless you pass --apply.
//
// Usage (from server/):
//   npx tsx src/scripts/wipeAllProjectData.ts             # dry run
//   npx tsx src/scripts/wipeAllProjectData.ts --apply     # actually writes

import admin from 'firebase-admin';
import { db } from '../config/firebase.js';

const APPLY = process.argv.includes('--apply');

// Firestore batched writes cap at 500 operations.
const BATCH_SIZE = 500;

const PROJECT_SCOPED_COLLECTIONS = [
  'projects',
  'milestones',
  'applications',
  'grades',
  'examinerRecommendations',
  'defenseAccessGrants',
  'examinerTokens',
  'projectErasureRequests',
  'projectRecordEntries',
] as const;

async function deleteAllDocs(collectionName: string): Promise<number> {
  const snap = await db.collection(collectionName).get();
  console.log(`  ${collectionName}: ${snap.size} doc(s)${APPLY ? '' : ' (would delete)'}`);
  if (!APPLY || snap.empty) return snap.size;

  const docs = snap.docs;
  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const batch = db.batch();
    docs.slice(i, i + BATCH_SIZE).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
  return snap.size;
}

async function resetStudentProjectFields(): Promise<number> {
  const snap = await db.collection('users').where('role', '==', 'student').get();
  const toReset = snap.docs.filter((d) => {
    const data = d.data();
    return !!data.hasActiveProject || !!data.activeProjectId || (data.activeProjectIds?.length ?? 0) > 0 || !!data.supervisorId;
  });
  console.log(`  users (students with project-linking fields to clear): ${toReset.length} doc(s)${APPLY ? '' : ' (would reset)'}`);
  if (!APPLY || toReset.length === 0) return toReset.length;

  for (let i = 0; i < toReset.length; i += BATCH_SIZE) {
    const batch = db.batch();
    toReset.slice(i, i + BATCH_SIZE).forEach((d) => {
      batch.update(d.ref, {
        hasActiveProject: false,
        activeProjectId: admin.firestore.FieldValue.delete(),
        activeProjectIds: admin.firestore.FieldValue.delete(),
        supervisorId: admin.firestore.FieldValue.delete(),
      });
    });
    await batch.commit();
  }
  return toReset.length;
}

async function main() {
  console.log(APPLY ? 'APPLY MODE — this will permanently delete data.\n' : 'DRY RUN — no writes will be made.\n');

  for (const name of PROJECT_SCOPED_COLLECTIONS) {
    await deleteAllDocs(name);
  }
  await resetStudentProjectFields();

  if (!APPLY) {
    console.log('\nDry run only — re-run with --apply to actually write.');
  } else {
    console.log('\nDone.');
  }
}

main().catch((err) => {
  console.error('wipeAllProjectData failed:', err);
  process.exit(1);
});
