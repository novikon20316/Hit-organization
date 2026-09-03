// src/scripts/createDataScienceExaminers.ts
//
// Creates 2 test internal_examiner accounts scoped to the data_science
// faculty, for testing the data_science "defense exam" flow (the
// three-rubric defense grading path — see AssignExaminersModal.tsx's
// isThreeRubricDefense check on facultyId === 'data_science' && type ===
// 'defense').
//
// Mirrors createImportedUserAccount (services/userImportExport.ts) — the
// one account-creation path that actually sets BOTH `role` and `roles[]`.
// createAdminUser (controllers/adminController.ts, used by the admin
// panel's "New User" form) only sets `role`, and examinerController.ts's
// getList() — the query that populates the examiner-picker UI — queries
// `roles array-contains 'internal_examiner'`. Without `roles` set, a
// freshly admin-panel-created examiner wouldn't show up there at all.
//
// Usage (from server/):
//   npx tsx src/scripts/createDataScienceExaminers.ts             # dry run
//   npx tsx src/scripts/createDataScienceExaminers.ts --apply     # actually creates

import { db, auth } from '../config/firebase.js';
import { generateTempPassword, setTempPasswordHash } from '../services/userImportExport.js';

const APPLY = process.argv.includes('--apply');

const ACCOUNTS = [
  {
    email: 'dorno+test.ds.examiner1@gmail.com',
    displayNameHe: 'בוחן בדיקה 1',
    displayNameEn: 'Test Examiner 1',
  },
  {
    email: 'dorno+test.ds.examiner2@gmail.com',
    displayNameHe: 'בוחן בדיקה 2',
    displayNameEn: 'Test Examiner 2',
  },
];

async function main() {
  console.log(APPLY ? 'APPLYING — accounts will be created.' : 'DRY RUN — pass --apply to actually create accounts.');
  console.log('');

  const created: { email: string; tempPassword: string }[] = [];

  for (const account of ACCOUNTS) {
    let existing;
    try {
      existing = await auth.getUserByEmail(account.email);
    } catch {
      existing = null;
    }

    if (existing) {
      console.log(`SKIP  ${account.email} — already exists, uid=${existing.uid}`);
      continue;
    }

    console.log(`${APPLY ? 'CREATE' : 'WOULD CREATE'}  ${account.email} (internal_examiner, data_science)`);
    if (!APPLY) continue;

    const tempPassword = generateTempPassword();
    const authUser = await auth.createUser({
      email: account.email,
      password: tempPassword,
      displayName: account.displayNameHe,
      emailVerified: true,
    });

    await db.collection('users').doc(authUser.uid).set({
      uid: authUser.uid,
      email: account.email,
      displayName: account.displayNameHe,
      displayNameHe: account.displayNameHe,
      displayNameEn: account.displayNameEn,
      role: 'internal_examiner',
      roles: ['internal_examiner'],
      facultyId: 'data_science',
      additionalRoles: [],
      phoneNumber: null,
      degreeType: null,
      yearOfStudy: null,
      major: null,
      studentId: null,
      isActive: true,
      profileComplete: true,
      hasActiveProject: false,
      language: 'he',
      expoPushToken: null,
      totp_enabled: false,
      totp_last_verified: null,
      isEligibleForProcess: false,
      mustChangePassword: true,
      createdAt: new Date().toISOString(),
    });
    await setTempPasswordHash(authUser.uid, tempPassword);

    console.log(`   -> created uid=${authUser.uid}`);
    created.push({ email: account.email, tempPassword });
  }

  console.log('');
  if (APPLY && created.length > 0) {
    console.log('Credentials (temp password — user must change on first login):');
    for (const c of created) {
      console.log(`  - ${c.email}  /  ${c.tempPassword}`);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
