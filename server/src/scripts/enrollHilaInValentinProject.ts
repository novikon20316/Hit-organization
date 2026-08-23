// src/scripts/enrollHilaInValentinProject.ts
//
// One-off: student "Hila" (הילה שטיין) was previously added to project
// NQFGxxNAtkxz29XbQSZh ("פרוייקט חדש - הילה", supervisor ולנטין) via
// addHilaToProject.ts, which — by design — only wrote her uid into that
// project's enrolledStudentIds array and deliberately left her
// activeProjectId/activeProjectIds untouched. The student dashboard reads
// only the latter, so that 3rd project never appeared for her.
//
// This runs her through the real enrollStudentInProject path instead (same
// write enrollStudentInProject.ts already does for a supervisor's own
// application approvals), so she gets real milestones for it and it shows up
// under activeProjectIds like her other 2 active projects — requires the
// TEMP_ALLOW_SECOND_ACTIVE_PROJECT bypass's cap in projectEnrollment.ts to
// already be raised to 3 (MAX_TEMP_ACTIVE_PROJECTS).
//
// SAFE BY DEFAULT: dry run (report only, no writes) unless you pass --apply.
//
// Usage (from server/):
//   npx tsx src/scripts/enrollHilaInValentinProject.ts             # dry run
//   npx tsx src/scripts/enrollHilaInValentinProject.ts --apply     # actually writes

import { db } from '../config/firebase.js';
import { enrollStudentInProject } from '../services/projectEnrollment.js';

const APPLY = process.argv.includes('--apply');
const STUDENT_ID = '45boLhlzcXe2VIGEeaIkBxEib2q2'; // הילה שטיין
const PROJECT_ID = 'NQFGxxNAtkxz29XbQSZh'; // פרוייקט חדש - הילה (supervisor: ולנטין)

async function main() {
  const [studentSnap, projectSnap] = await Promise.all([
    db.collection('users').doc(STUDENT_ID).get(),
    db.collection('projects').doc(PROJECT_ID).get(),
  ]);
  const student = studentSnap.data();
  const project = projectSnap.data();

  if (!student || !project) {
    console.log('Student or project not found — stopping.');
    return;
  }
  if (!project.supervisorId) {
    console.log('Target project has no supervisorId — stopping.');
    return;
  }

  const activeProjectIds: string[] = student.activeProjectIds ?? [];
  console.log(`Student: ${student.displayName} (${STUDENT_ID})`);
  console.log(`  Current activeProjectIds: ${JSON.stringify(activeProjectIds)}`);
  console.log(`Target project: ${project.titleHe} (${PROJECT_ID}), supervisorId=${project.supervisorId}, facultyId=${project.facultyId}`);

  if (activeProjectIds.includes(PROJECT_ID)) {
    console.log('\nAlready in activeProjectIds — nothing to do.');
    return;
  }

  console.log(`\n${APPLY ? 'Will' : 'Would'} call enrollStudentInProject(${PROJECT_ID}, ${STUDENT_ID}, ${project.supervisorId}, ${project.facultyId}) — creating milestones and adding it to activeProjectIds.`);

  if (!APPLY) {
    console.log('\nDry run only — re-run with --apply to actually write.');
    return;
  }

  await enrollStudentInProject(PROJECT_ID, STUDENT_ID, project.supervisorId, project.facultyId, {
    degreeType: project.degreeType,
    projectType: project.projectType,
  });

  console.log('\nDone — Hila is now actively enrolled in the Valentin project.');
}

main().catch((err) => {
  console.error('enrollHilaInValentinProject failed:', err);
  process.exit(1);
});
