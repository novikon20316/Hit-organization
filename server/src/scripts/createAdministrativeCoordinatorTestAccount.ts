// src/scripts/createAdministrativeCoordinatorTestAccount.ts
//
// Creates 1 test administrative_secretary ("administrative coordinator")
// account, scoped to the sciences faculty (a real single facultyId, empty
// coordinatorScopes — resolveCoordinatorScopes in projectCoordinatorController.ts
// falls back to that facultyId), so the Students Report tab has something to
// show. One-off, for live-verifying the new Median Grade column.
//
// Mirrors createElectricalDivisionHeadAndDeanTestAccounts.ts exactly.
//
// Usage (from server/):
//   npx tsx src/scripts/createAdministrativeCoordinatorTestAccount.ts             # dry run
//   npx tsx src/scripts/createAdministrativeCoordinatorTestAccount.ts --apply     # actually creates

import { db, auth } from '../config/firebase.js';
import { generateTempPassword, setTempPasswordHash } from '../services/userImportExport.js';

const APPLY = process.argv.includes('--apply');

const ACCOUNT = {
  email: 'dorno+test.admincoordinator1@gmail.com',
  displayNameHe: 'רכז מנהלי בדיקה',
  displayNameEn: 'Test Administrative Coordinator',
  role: 'administrative_secretary',
  facultyId: 'sciences',
} as const;

async function main() {
  console.log(APPLY ? 'APPLYING — account will be created.' : 'DRY RUN — pass --apply to actually create the account.');

  let existing;
  try {
    existing = await auth.getUserByEmail(ACCOUNT.email);
  } catch {
    existing = null;
  }

  if (existing) {
    console.log(`SKIP  ${ACCOUNT.email} — already exists, uid=${existing.uid}`);
    return;
  }

  console.log(`${APPLY ? 'CREATE' : 'WOULD CREATE'}  ${ACCOUNT.email} (${ACCOUNT.role}, ${ACCOUNT.facultyId})`);
  if (!APPLY) return;

  const tempPassword = generateTempPassword();
  const authUser = await auth.createUser({
    email: ACCOUNT.email,
    password: tempPassword,
    displayName: ACCOUNT.displayNameHe,
    emailVerified: true,
  });

  await db.collection('users').doc(authUser.uid).set({
    uid: authUser.uid,
    email: ACCOUNT.email,
    displayName: ACCOUNT.displayNameHe,
    displayNameHe: ACCOUNT.displayNameHe,
    displayNameEn: ACCOUNT.displayNameEn,
    role: ACCOUNT.role,
    roles: [ACCOUNT.role],
    facultyId: ACCOUNT.facultyId,
    coordinatorScopes: [],
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
    mustChangePassword: false,
    createdAt: new Date().toISOString(),
  });
  await setTempPasswordHash(authUser.uid, tempPassword);

  console.log(`   -> created uid=${authUser.uid}`);
  console.log(`   -> password: ${tempPassword}`);
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
