// src/scripts/migrateAdministrativeSecretaryRole.ts
//
// One-off migration: the role stored as 'project_coordinator' was renamed to
// 'administrative_secretary' throughout the codebase (mobile/firebase/roles.ts,
// firestore.rules, server role checks). This script updates existing Firestore
// `users` docs still holding the old value so those accounts keep their access.
//
// SAFE BY DEFAULT: runs as a dry run (report only, no writes) unless you pass
// --apply. Always run without --apply first and read the report.
//
// Usage (from server/):
//   npx tsx src/scripts/migrateAdministrativeSecretaryRole.ts             # dry run
//   npx tsx src/scripts/migrateAdministrativeSecretaryRole.ts --apply     # actually writes

import { db } from '../config/firebase.js';

const APPLY = process.argv.includes('--apply');

const OLD_ROLE = 'project_coordinator';
const NEW_ROLE = 'administrative_secretary';

async function main() {
  console.log(APPLY ? '🚀 APPLY mode — writing changes to Firestore' : '🔎 DRY RUN — no writes will be made (pass --apply to write)');
  console.log('');

  const snap = await db.collection('users').where('role', '==', OLD_ROLE).get();
  console.log(`Found ${snap.size} user(s) with role "${OLD_ROLE}".`);

  if (snap.empty) {
    console.log('Nothing to migrate.');
    return;
  }

  const batch = db.batch();
  snap.docs.forEach((doc) => {
    console.log(`  ${doc.id}: "${OLD_ROLE}" → "${NEW_ROLE}"`);
    const data = doc.data();
    const roles: string[] = Array.isArray(data.roles) ? data.roles : [];
    const nextRoles = roles.map((r) => (r === OLD_ROLE ? NEW_ROLE : r));
    if (APPLY) {
      batch.update(doc.ref, { role: NEW_ROLE, roles: nextRoles });
    }
  });

  if (APPLY) {
    await batch.commit();
    console.log(`\n✅ Migrated ${snap.size} user(s).`);
  } else {
    console.log('\nThis was a dry run — nothing was written. Re-run with --apply once the report looks right.');
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
