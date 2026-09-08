// src/scripts/seedElectricalResearchProposalTestProject.ts
//
// Seeds a full live-testable walk of the new Electrical Engineering
// research-proposal 5-stage staff chain (see
// addElectricalResearchProposalStaffChain.ts): creates test student/
// supervisor/coordinator/program_head accounts (electrical faculty; reuses
// the division_head/dean accounts already created by
// createElectricalDivisionHeadAndDeanTestAccounts.ts), a test project, and
// enrolls the student — via the same enrollStudentInProject service every
// real enrollment path uses, so the milestone doc's `routing` snapshot is
// exactly what production would create. The research_proposal milestone is
// then marked 'submitted' (simulating the student's plain file+note
// submission — untouched by this feature, see the feature's own memory) so
// the supervisor test account has something to sign immediately.
//
// Deliberately does NOT walk the chain itself — every stage (supervisor
// through dean) is left for a real login + click-through, since the whole
// point is live-verifying the new UI at each stage, not simulating past it.
//
// Idempotent: re-running skips any account whose email already exists, and
// skips project creation if a project titled with TEST_PROJECT_MARKER
// already exists for this supervisor.
//
// SAFE BY DEFAULT: dry run (prints what would happen, writes nothing) unless
// you pass --apply. Always run without --apply first.
//
// Usage (from server/):
//   npx tsx src/scripts/seedElectricalResearchProposalTestProject.ts             # dry run
//   npx tsx src/scripts/seedElectricalResearchProposalTestProject.ts --apply     # actually writes

import admin from 'firebase-admin';
import { db, auth } from '../config/firebase.js';
import { generateTempPassword, setTempPasswordHash } from '../services/userImportExport.js';
import { resolveWorkflowTemplateRefs } from '../services/workflowTemplates.js';
import { enrollStudentInProject } from '../services/projectEnrollment.js';

const APPLY = process.argv.includes('--apply');
const FACULTY_ID = 'electrical';
const MAJOR = 'electrical_engineering';
const TEST_PROJECT_MARKER = '[TEST] Electrical Research-Proposal Chain';

const ACCOUNTS = [
  { email: 'dorno+test.ee.student1@gmail.com', displayNameHe: 'סטודנט בדיקה חשמל', displayNameEn: 'Test EE Student', role: 'student' as const },
  { email: 'dorno+test.ee.supervisor1@gmail.com', displayNameHe: 'מנחה בדיקה חשמל', displayNameEn: 'Test EE Supervisor', role: 'supervisor' as const },
  { email: 'dorno+test.ee.coordinator1@gmail.com', displayNameHe: 'רכז בדיקה חשמל', displayNameEn: 'Test EE Coordinator', role: 'coordinator' as const },
  { email: 'dorno+test.ee.programhead1@gmail.com', displayNameHe: 'ראש תכנית בדיקה חשמל', displayNameEn: 'Test EE Program Head', role: 'program_head' as const },
];

async function ensureAccount(account: typeof ACCOUNTS[number]): Promise<{ uid: string; created: boolean; tempPassword?: string }> {
  try {
    const existing = await auth.getUserByEmail(account.email);
    console.log(`SKIP account  ${account.email} — already exists, uid=${existing.uid}`);
    return { uid: existing.uid, created: false };
  } catch {
    // not found — fall through to create
  }

  console.log(`${APPLY ? 'CREATE' : 'WOULD CREATE'} account  ${account.email} (${account.role}, ${FACULTY_ID})`);
  if (!APPLY) return { uid: '(dry-run — no uid yet)', created: false };

  const tempPassword = generateTempPassword();
  const authUser = await auth.createUser({
    email: account.email,
    password: tempPassword,
    displayName: account.displayNameHe,
    emailVerified: true,
  });

  const isStudent = account.role === 'student';
  await db.collection('users').doc(authUser.uid).set({
    uid: authUser.uid,
    email: account.email,
    displayName: account.displayNameHe,
    displayNameHe: account.displayNameHe,
    displayNameEn: account.displayNameEn,
    role: account.role,
    roles: [account.role],
    facultyId: FACULTY_ID,
    additionalRoles: [],
    phoneNumber: null,
    degreeType: isStudent ? 'masters' : null,
    yearOfStudy: isStudent ? 1 : null,
    major: isStudent ? MAJOR : null,
    studentId: isStudent ? '000000001' : null,
    isActive: true,
    profileComplete: true,
    hasActiveProject: false,
    language: 'he',
    expoPushToken: null,
    totp_enabled: false,
    totp_last_verified: null,
    isEligibleForProcess: isStudent,
    mustChangePassword: true,
    createdAt: new Date().toISOString(),
  });
  await setTempPasswordHash(authUser.uid, tempPassword);

  console.log(`   -> created uid=${authUser.uid}`);
  return { uid: authUser.uid, created: true, tempPassword };
}

async function main() {
  console.log(APPLY ? 'APPLYING — accounts/project will be created.' : 'DRY RUN — pass --apply to actually create anything.');
  console.log('');

  const uidByRole: Record<string, string> = {};
  const credentials: { email: string; tempPassword: string }[] = [];
  for (const account of ACCOUNTS) {
    const result = await ensureAccount(account);
    uidByRole[account.role] = result.uid;
    if (result.created && result.tempPassword) credentials.push({ email: account.email, tempPassword: result.tempPassword });
  }

  if (!APPLY) {
    console.log('\nDry run only — re-run with --apply to actually create accounts + the test project + enroll the student.');
    return;
  }

  const supervisorId = uidByRole['supervisor']!;
  const studentId = uidByRole['student']!;

  // Idempotency check for the project itself — skip if this supervisor
  // already has the marker-titled test project.
  const existingProjectSnap = await db.collection('projects')
    .where('supervisorId', '==', supervisorId)
    .where('titleEn', '==', TEST_PROJECT_MARKER)
    .limit(1)
    .get();

  let projectId: string;
  if (!existingProjectSnap.empty) {
    projectId = existingProjectSnap.docs[0]!.id;
    console.log(`SKIP project — already exists, id=${projectId}`);
  } else {
    const { refs: workflowTemplateRefs, missing } = await resolveWorkflowTemplateRefs(
      FACULTY_ID, ['masters'], ['thesis'], MAJOR
    );
    if (missing.length > 0) {
      console.error(`No approved workflow template for ${FACULTY_ID}/masters/thesis/${MAJOR} — run seedElectricalMscThesisWorkflowTemplate.ts first.`);
      process.exit(1);
    }

    const newProjectRef = db.collection('projects').doc();
    await newProjectRef.set({
      titleHe: 'הצעת מחקר בדיקה — שרשרת אישורים',
      titleEn: TEST_PROJECT_MARKER,
      descriptionHe: 'פרויקט בדיקה לצורך אימות שרשרת האישורים החדשה של הצעת מחקר.',
      descriptionEn: 'Test project seeded to live-verify the new research-proposal approval chain.',
      degreeType: 'masters',
      degreeTypes: ['masters'],
      projectType: 'thesis',
      projectTypes: ['thesis'],
      workflowTemplateRefs,
      projectFileUrl: null,
      NumberOfStudents: 1,
      requiredSkills: [],
      prerequisites: [],
      facultyId: FACULTY_ID,
      major: MAJOR,
      supervisorId,
      projectId: newProjectRef.id,
      enrolledStudentIds: [],
      status: 'active',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    projectId = newProjectRef.id;
    console.log(`CREATE project — id=${projectId}`);
  }

  // Enroll the student via the real service — creates the milestone docs
  // (including research_proposal's routing snapshot) exactly as any real
  // enrollment would. A no-op (safe to re-run) if the student is already
  // enrolled: enrollStudentInProject's own transaction just re-adds them to
  // existing milestone docs' studentIds, which arrayUnion already dedupes.
  await enrollStudentInProject(projectId, studentId, supervisorId, FACULTY_ID, { degreeType: 'masters', projectType: 'thesis' });
  console.log(`ENROLLED student ${studentId} in project ${projectId}`);

  // Mark the research_proposal milestone 'submitted' — simulates the
  // student's plain file+note submission (untouched by this feature) so the
  // supervisor test account has something to sign immediately, without
  // scripting an actual Cloudinary file upload.
  const milestoneSnap = await db.collection('milestones')
    .where('projectId', '==', projectId)
    .where('type', '==', 'research_proposal')
    .limit(1)
    .get();
  if (milestoneSnap.empty) {
    console.error('research_proposal milestone not found after enrollment — investigate before relying on this seed.');
    process.exit(1);
  }
  const milestoneRef = milestoneSnap.docs[0]!.ref;
  await milestoneRef.update({
    status: 'submitted',
    submittedAt: admin.firestore.FieldValue.serverTimestamp(),
    submissionNote: 'Test submission — seeded for a live pass of the research-proposal chain.',
  });
  console.log(`SUBMITTED research_proposal milestone ${milestoneRef.id} — ready for the supervisor to sign.`);

  console.log('\nChain state: submitted, awaiting supervisor_sign.');
  console.log('Log in as each account below, in order, to walk the chain live:');
  console.log('  1. Supervisor — sign (courses-remaining text + agree-to-supervise)');
  console.log('  2. Coordinator — tri-state decision + 2 committee-member names');
  console.log('  3. Division Head (dorno+test.divisionhead1@gmail.com) — division name + corrected-per-comments');
  console.log('  4. Program Head — plain sign-off');
  console.log('  5. Dean (dorno+test.dean1@gmail.com) — plain sign-off, terminal');

  if (credentials.length > 0) {
    console.log('\nNewly-created credentials (temp password — forced change on first login):');
    for (const c of credentials) console.log(`  - ${c.email}  /  ${c.tempPassword}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
