// src/scripts/addHilaToProject.ts
//
// One-off: enroll student "Hila" into a project titled "פרוייקט חדש - הילה"
// in the Data Science department (facultyId 'data_science') — creating the
// project if it doesn't already exist — so she ends up a member of 3
// projects at once, for manually inspecting how multi-project dashboards
// (coordinator Students Report / Project Groups) render that case. Note:
// the student's own `activeProjectId`/`hasActiveProject` (singular fields)
// are intentionally left untouched here — this only adds her uid to
// `enrolledStudentIds` on the target project, since the real single-active-
// project model has no concept of 3 simultaneous "active" projects; this is
// purely to populate `enrolledStudentIds` arrays for the coordinator-side
// group views under inspection.
//
// SAFE BY DEFAULT: runs as a dry run (report only, no writes) unless you
// pass --apply. Always run without --apply first and read the report.
//
// Usage (from server/):
//   npx tsx src/scripts/addHilaToProject.ts             # dry run
//   npx tsx src/scripts/addHilaToProject.ts --apply     # actually writes

import { db } from '../config/firebase.js';

const APPLY = process.argv.includes('--apply');
const PROJECT_TITLE_HE = 'פרוייקט חדש - הילה';
const FACULTY_ID = 'data_science';

async function main() {
  // 1. Find candidate "Hila" student accounts.
  const studentsSnap = await db.collection('users').where('role', '==', 'student').get();
  const candidates = studentsSnap.docs.filter((d) => {
    const name = (d.data().displayName ?? '').toString();
    return name.includes('הילה') || name.toLowerCase().includes('hila');
  });

  console.log(`Found ${candidates.length} student(s) matching "Hila"/"הילה":`);
  candidates.forEach((d) => {
    const data = d.data();
    console.log(`  - ${d.id} | ${data.displayName} | email=${data.email} | facultyId=${data.facultyId} major=${data.major} | activeProjectId=${data.activeProjectId ?? null}`);
  });

  if (candidates.length !== 1) {
    console.log('\nExpected exactly one match — stopping without changes. Refine the script or check the name.');
    return;
  }
  const student = candidates[0]!;

  // 2. Existing project enrollments (enrolledStudentIds contains her uid).
  const enrolledSnap = await db.collection('projects').where('enrolledStudentIds', 'array-contains', student.id).get();
  console.log(`\nCurrently enrolled (member) in ${enrolledSnap.size} project(s):`);
  enrolledSnap.docs.forEach((d) => {
    const data = d.data();
    console.log(`  - ${d.id} | ${data.titleHe || data.titleEn} | facultyId=${data.facultyId}`);
  });

  // 3. Does the target project already exist?
  const targetSnap = await db.collection('projects')
    .where('facultyId', '==', FACULTY_ID)
    .where('titleHe', '==', PROJECT_TITLE_HE)
    .get();

  let targetProjectId: string | null = null;
  if (targetSnap.size > 1) {
    console.log(`\nFound ${targetSnap.size} projects already titled "${PROJECT_TITLE_HE}" in data_science — ambiguous, stopping.`);
    targetSnap.docs.forEach((d) => console.log(`  - ${d.id}`));
    return;
  } else if (targetSnap.size === 1) {
    targetProjectId = targetSnap.docs[0]!.id;
    console.log(`\nTarget project already exists: ${targetProjectId}`);
  } else {
    console.log(`\nTarget project "${PROJECT_TITLE_HE}" does not exist yet in data_science — would create it.`);
  }

  const alreadyMember = targetProjectId ? enrolledSnap.docs.some((d) => d.id === targetProjectId) : false;
  if (alreadyMember) {
    console.log('\nStudent is already a member of the target project — nothing to do.');
    return;
  }

  console.log(`\n${APPLY ? 'Will' : 'Would'} ${targetProjectId ? 'add her to the existing project' : 'create the project and add her'} — resulting in ${enrolledSnap.size + 1} total project membership(s).`);

  if (!APPLY) {
    console.log('\nDry run only — re-run with --apply to actually write.');
    return;
  }

  if (!targetProjectId) {
    const newProjectRef = db.collection('projects').doc();
    await newProjectRef.set({
      titleHe: PROJECT_TITLE_HE,
      titleEn: PROJECT_TITLE_HE,
      descriptionHe: '',
      descriptionEn: '',
      facultyId: FACULTY_ID,
      major: 'data_science',
      degreeType: 'masters',
      projectType: 'project',
      degreeTypes: ['masters'],
      projectTypes: ['project'],
      status: 'active',
      supervisorId: null,
      enrolledStudentIds: [student.id],
      maxStudents: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    targetProjectId = newProjectRef.id;
    console.log(`Created project ${targetProjectId}.`);
  } else {
    await db.collection('projects').doc(targetProjectId).update({
      enrolledStudentIds: [...(targetSnap.docs[0]!.data().enrolledStudentIds ?? []), student.id],
      updatedAt: new Date(),
    });
    console.log(`Added ${student.id} to enrolledStudentIds on ${targetProjectId}.`);
  }

  console.log(`\nDone — ${student.data().displayName} is now enrolled in ${enrolledSnap.size + 1} project(s).`);
}

main().catch((err) => {
  console.error('addHilaToProject failed:', err);
  process.exit(1);
});
