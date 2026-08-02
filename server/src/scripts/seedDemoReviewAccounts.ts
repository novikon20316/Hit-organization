// src/scripts/seedDemoReviewAccounts.ts
//
// Creates fixed-credential demo accounts for Apple/Google App Review.
//
// Why this is needed: student signup is gated by matching a pre-loaded
// roster (see services/studentRoster.ts), and every other role is
// admin-provisioned only (see controllers/adminController.ts's
// createAdminUser) — there is no self-signup path at all for staff. App
// Review has no real student ID or institutional email, so as shipped they
// cannot create an account or log in, which is an automatic rejection
// ("app requires a restricted login").
//
// This script creates the accounts the same way createAdminUser does
// (Firebase Auth user + Firestore `users` doc, emailVerified: true so the
// self-signup email-verification gate in login.tsx doesn't apply) but
// differs in two ways specific to a reviewer account:
//   1. mustChangePassword is set to false — the normal admin-provisioning
//      flow forces a password change on first login; that's an extra step
//      that only adds friction/confusion for a reviewer using a fixed
//      password from the store listing notes.
//   2. The student account bypasses checkStudentEligibility entirely (as
//      createAdminUser already does for any role) rather than needing a
//      matching approvedStudents roster row.
//
// EDIT THE ACCOUNTS ARRAY BELOW before running — the emails/names/
// facultyId/major are placeholders. Use real inboxes you control in case
// any in-app notification email fires during review testing.
//
// Idempotent: an account whose email already exists in Firebase Auth is
// left untouched (its Firestore doc is NOT overwritten) and reported as
// "already exists" — re-running is safe.
//
// Usage (from server/):
//   npx tsx src/scripts/seedDemoReviewAccounts.ts             # dry run
//   npx tsx src/scripts/seedDemoReviewAccounts.ts --apply     # actually creates

import { db, auth } from '../config/firebase.js';
import { validateStandardPassword, computeIsEligible } from '../controllers/userController.js';

const APPLY = process.argv.includes('--apply');

// Shared fixed password for every demo account — put this + each email
// verbatim into the "App Review Information" / Play Console reviewer
// access notes. Must satisfy validateStandardPassword's policy (8+ chars,
// upper, lower, digit, symbol).
const DEMO_PASSWORD = 'ReviewDemo2026!';

type DemoAccount = {
  email: string;
  displayNameHe: string;
  displayNameEn: string;
  role: 'student' | 'supervisor' | 'coordinator';
  facultyId: string;
  // student-only fields
  degreeType?: 'bachelors' | 'masters';
  major?: string;
  yearOfStudy?: number;
  studentId?: string;
};

// ── PLACEHOLDERS — edit before running ─────────────────────────────────────
const ACCOUNTS: DemoAccount[] = [
  {
    email: 'dorno+reviewer.student@gmail.com',
    displayNameHe: 'סטודנט בדיקה',
    displayNameEn: 'App Review Student',
    role: 'student',
    facultyId: 'sciences',
    degreeType: 'bachelors',
    major: 'computer_science',
    yearOfStudy: 3, // final year for a 3-year program -> isEligibleForProcess true
    studentId: '999999999',
  },
  {
    email: 'dorno+reviewer.supervisor@gmail.com',
    displayNameHe: 'מנחה בדיקה',
    displayNameEn: 'App Review Supervisor',
    role: 'supervisor',
    facultyId: 'sciences',
  },
  {
    email: 'dorno+reviewer.coordinator@gmail.com',
    displayNameHe: 'רכז בדיקה',
    displayNameEn: 'App Review Coordinator',
    role: 'coordinator',
    facultyId: 'sciences',
  },
];
// ────────────────────────────────────────────────────────────────────────────

async function main() {
  const passwordError = validateStandardPassword(DEMO_PASSWORD);
  if (passwordError) {
    throw new Error(`DEMO_PASSWORD fails policy: ${passwordError}`);
  }
  if (ACCOUNTS.some(a => a.email.startsWith('REPLACE.'))) {
    console.error(
      'Edit the ACCOUNTS array in this script with real emails before running (placeholders still present).'
    );
    process.exit(1);
  }

  console.log(APPLY ? 'APPLYING — accounts will be created.' : 'DRY RUN — pass --apply to actually create accounts.');
  console.log('');

  for (const account of ACCOUNTS) {
    let existing;
    try {
      existing = await auth.getUserByEmail(account.email);
    } catch {
      existing = null;
    }

    if (existing) {
      console.log(`SKIP  ${account.email} (${account.role}) — already exists, uid=${existing.uid}`);
      continue;
    }

    console.log(`${APPLY ? 'CREATE' : 'WOULD CREATE'}  ${account.email} (${account.role})`);
    if (!APPLY) continue;

    const authUser = await auth.createUser({
      email: account.email,
      password: DEMO_PASSWORD,
      displayName: account.displayNameHe,
      emailVerified: true,
    });

    const isStudent = account.role === 'student';
    const isEligibleForProcess = isStudent
      ? computeIsEligible(account.degreeType ?? null, account.major ?? null, account.yearOfStudy ?? null)
      : false;

    await db.collection('users').doc(authUser.uid).set({
      uid: authUser.uid,
      email: account.email,
      displayName: account.displayNameHe,
      displayNameHe: account.displayNameHe,
      displayNameEn: account.displayNameEn,
      role: account.role,
      facultyId: account.facultyId,
      additionalRoles: [],

      degreeType: isStudent ? (account.degreeType ?? null) : null,
      yearOfStudy: isStudent ? (account.yearOfStudy ?? null) : null,
      major: isStudent ? (account.major ?? null) : null,
      studentId: isStudent ? (account.studentId ?? null) : null,

      isActive: true,
      profileComplete: true,
      hasActiveProject: false,
      language: 'he',
      expoPushToken: null,
      totp_enabled: false,
      totp_last_verified: null,
      isEligibleForProcess,
      mustChangePassword: false, // deliberately skipped for reviewer accounts — see file header
      isDemoReviewAccount: true, // flags this account as App Review seed data, not a real user
      createdAt: new Date().toISOString(),
    });

    console.log(`   -> created uid=${authUser.uid}`);
  }

  console.log('');
  if (APPLY) {
    console.log('Credentials for App Review notes (all accounts share one password):');
    console.log(`  Password: ${DEMO_PASSWORD}`);
    for (const account of ACCOUNTS) {
      console.log(`  - ${account.role}: ${account.email}`);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
