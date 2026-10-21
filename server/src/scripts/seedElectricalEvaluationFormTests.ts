// src/scripts/seedElectricalEvaluationFormTests.ts
//
// Seeds a live walk-through of Electrical's three digitized evaluation
// forms (every Electrical project is a test project):
//   - 2 B.Sc. test students (one male, one female) enrolled in the B.Sc.
//     test project "בדיקה" — raised to 2 students so the per-student form's
//     "ציון סטודנט I / II" columns can be tested side by side — via the
//     real enrollStudentInProject service, so milestone docs are exactly
//     what production creates;
//   - 2 Electrical internal-examiner test accounts, for the B.Sc. form, the
//     M.Sc. project form and the M.Sc. thesis examiner form alike.
// Submissions, pre-check approvals and examiner assignment are left for the
// live click-through — that's what's being tested.
//
// New accounts get a temporary password (forced change on first login),
// written to the file passed as --credentials-out, never to the console or
// the repo. Idempotent: existing accounts are reused; re-enrolling is a
// no-op.
//
// SAFE BY DEFAULT: dry run unless you pass --apply.
//
// Usage (from server/):
//   npx tsx src/scripts/seedElectricalEvaluationFormTests.ts
//   npx tsx src/scripts/seedElectricalEvaluationFormTests.ts --apply --credentials-out <file>

import fs from 'fs';
import admin from 'firebase-admin';
import { db } from '../config/firebase.js';
import { enrollStudentInProject } from '../services/projectEnrollment.js';
import { setTempPasswordHash } from '../services/userImportExport.js';

const APPLY = process.argv.includes('--apply');
const outIndex = process.argv.indexOf('--credentials-out');
const CREDENTIALS_OUT = outIndex !== -1 ? process.argv[outIndex + 1] : undefined;
const FACULTY_ID = 'electrical';
const MAJOR = 'electrical_engineering';
const PROJECT_TITLE = 'בדיקה';
const auth = admin.auth();

type Account = {
  email: string; displayNameHe: string; displayNameEn: string;
  role: 'student' | 'internal_examiner'; gender?: 'male' | 'female'; studentIdNumber?: string;
};

const ACCOUNTS: Account[] = [
  { email: 'dorno+test.ee.bsc.student1@gmail.com', displayNameHe: 'יוסי בדיקה', displayNameEn: 'Yossi Test', role: 'student', gender: 'male', studentIdNumber: '000000018' },
  { email: 'dorno+test.ee.bsc.student2@gmail.com', displayNameHe: 'מיכל בדיקה', displayNameEn: 'Michal Test', role: 'student', gender: 'female', studentIdNumber: '000000026' },
  { email: 'dorno+test.ee.examiner1@gmail.com', displayNameHe: 'בוחן בדיקה חשמל 1', displayNameEn: 'Test EE Examiner 1', role: 'internal_examiner' },
  { email: 'dorno+test.ee.examiner2@gmail.com', displayNameHe: 'בוחנת בדיקה חשמל 2', displayNameEn: 'Test EE Examiner 2', role: 'internal_examiner' },
];

function tempPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(14));
  return `T!${Array.from(bytes, (b) => chars[b % chars.length]).join('')}9a`;
}

async function ensureAccount(account: Account): Promise<{ uid: string; password?: string }> {
  try {
    const existing = await auth.getUserByEmail(account.email);
    console.log(`reuse   ${account.email} (${existing.uid})`);
    return { uid: existing.uid };
  } catch {
    // not found — create below
  }
  console.log(`${APPLY ? 'create' : 'would create'}  ${account.email} (${account.role})`);
  if (!APPLY) return { uid: '(dry run)' };
  const password = tempPassword();
  const user = await auth.createUser({ email: account.email, password, displayName: account.displayNameHe, emailVerified: true });
  const isStudent = account.role === 'student';
  await db.collection('users').doc(user.uid).set({
    uid: user.uid,
    email: account.email,
    displayName: account.displayNameHe,
    displayNameHe: account.displayNameHe,
    displayNameEn: account.displayNameEn,
    role: account.role,
    roles: [account.role],
    facultyId: FACULTY_ID,
    additionalRoles: [],
    degreeType: isStudent ? 'bachelors' : null,
    yearOfStudy: isStudent ? 4 : null,
    major: isStudent ? MAJOR : null,
    studentId: isStudent ? account.studentIdNumber ?? null : null,
    gender: account.gender ?? null,
    isActive: true,
    profileComplete: true,
    hasActiveProject: false,
    language: 'he',
    totp_enabled: false,
    totp_last_verified: null,
    isEligibleForProcess: isStudent,
    mustChangePassword: true,
    createdAt: new Date().toISOString(),
  });
  await setTempPasswordHash(user.uid, password);
  return { uid: user.uid, password };
}

async function main() {
  console.log(APPLY ? 'APPLYING' : 'DRY RUN — pass --apply to write');
  if (APPLY && !CREDENTIALS_OUT) {
    console.error('--credentials-out <file> is required with --apply (new temporary passwords go there, not to the console).');
    process.exit(1);
  }

  const projectSnap = await db.collection('projects').where('facultyId', '==', FACULTY_ID).where('titleHe', '==', PROJECT_TITLE).get();
  const projectDoc = projectSnap.docs.find((d) => d.data().degreeType === 'bachelors');
  if (!projectDoc) {
    console.error(`No Electrical B.Sc. project titled "${PROJECT_TITLE}" found.`);
    process.exit(1);
  }
  const project = projectDoc.data();
  console.log(`project ${projectDoc.id} "${PROJECT_TITLE}" — maxStudents ${project.maxStudents ?? 1} → 2`);

  const created: Array<{ email: string; password: string }> = [];
  const uids: Record<string, string> = {};
  for (const account of ACCOUNTS) {
    const result = await ensureAccount(account);
    uids[account.email] = result.uid;
    if (result.password) created.push({ email: account.email, password: result.password });
  }
  if (!APPLY) return;

  await projectDoc.ref.update({ maxStudents: 2, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
  for (const account of ACCOUNTS.filter((a) => a.role === 'student')) {
    await enrollStudentInProject(projectDoc.id, uids[account.email]!, project.supervisorId, FACULTY_ID, { degreeType: 'bachelors', projectType: 'project' });
    console.log(`enrolled ${account.email}`);
  }

  if (created.length > 0) {
    const lines = [
      '# Electrical evaluation-form test accounts — temporary passwords (forced change on first login).',
      '# Delete this file once you have logged in.',
      ...created.map((c) => `${c.email}\t${c.password}`),
    ];
    fs.writeFileSync(CREDENTIALS_OUT!, lines.join('\n') + '\n', { encoding: 'utf8', mode: 0o600 });
    console.log(`temporary passwords for ${created.length} new account(s) written to ${CREDENTIALS_OUT}`);
  }

  const milestones = await db.collection('milestones').where('projectId', '==', projectDoc.id).get();
  console.log('milestones:', milestones.docs.map((m) => {
    const d = m.data();
    return `${d.order}:${d.nameHe} [${d.status}]${d.finalGradeComponents?.perStudent ? ' per-student form' : ''} students=${(d.studentIds ?? []).length}`;
  }).sort().join(' | '));
}

main().then(() => process.exit(0)).catch((err) => {
  console.error('seedElectricalEvaluationFormTests failed:', err);
  process.exit(1);
});
