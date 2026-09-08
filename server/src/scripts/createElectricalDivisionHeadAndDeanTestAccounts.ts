// src/scripts/createElectricalDivisionHeadAndDeanTestAccounts.ts
//
// Creates 2 test accounts — one division_head, one dean — scoped to the
// electrical faculty, for a live pass of the new Electrical Engineering
// M.Sc.-Thesis research-proposal 5-stage staff chain (see
// addElectricalResearchProposalStaffChain.ts). Both roles are brand new to
// this codebase and have no existing test accounts.
//
// Mirrors createDataScienceExaminers.ts exactly — sets both `role` and
// `roles[]` (the query examinerController.ts-style role pickers use),
// idempotent (skips an email that already exists), forces a password change
// on first login.
//
// Usage (from server/):
//   npx tsx src/scripts/createElectricalDivisionHeadAndDeanTestAccounts.ts             # dry run
//   npx tsx src/scripts/createElectricalDivisionHeadAndDeanTestAccounts.ts --apply     # actually creates

import { db, auth } from '../config/firebase.js';
import { generateTempPassword, setTempPasswordHash } from '../services/userImportExport.js';

const APPLY = process.argv.includes('--apply');

const ACCOUNTS = [
  {
    email: 'dorno+test.divisionhead1@gmail.com',
    displayNameHe: 'ראש תחום בדיקה',
    displayNameEn: 'Test Division Head',
    role: 'division_head',
  },
  {
    email: 'dorno+test.dean1@gmail.com',
    displayNameHe: 'דיקן בדיקה',
    displayNameEn: 'Test Dean',
    role: 'dean',
  },
] as const;

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

    console.log(`${APPLY ? 'CREATE' : 'WOULD CREATE'}  ${account.email} (${account.role}, electrical)`);
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
      role: account.role,
      roles: [account.role],
      facultyId: 'electrical',
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
