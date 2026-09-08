// src/scripts/addElectricalInterimReportPreGradeSignoffs.ts
//
// Enables the parallel committee-chair-decision / examiner-#1-signoff gate
// (see workflowTemplates.ts's preGradeSignoffs doc comment) on Electrical &
// Electronics Engineering's "דו"ח ביניים" (Interim Report) milestone —
// items 7, 9, 10 of "טופס הערכת מנחה – דוח ראשון לפרויקט גמר מוסמכים".
// Run this AFTER addElectricalInterimReportStaffForm.ts (items 1-6 +
// auto-fill header), which this script assumes is already applied.
//
// Sets `requiresExaminers: true` on this milestone so
// coordinatorController.ts's assignExaminers' EXISTING fan-out (to every
// non-defense requiresExaminers milestone on a project) populates this
// milestone's own examinerIds automatically whenever a coordinator assigns
// examiners for the project — no new propagation code needed. "Examiner #1"
// is simply examinerIds[0] on this same milestone doc.
//
// SAFE BY DEFAULT: dry run (prints the full new milestone list, writes
// nothing) unless you pass --apply. Always run without --apply first.
//
// Usage (from server/):
//   npx tsx src/scripts/addElectricalInterimReportPreGradeSignoffs.ts             # dry run
//   npx tsx src/scripts/addElectricalInterimReportPreGradeSignoffs.ts --apply     # actually writes

import {
  findApprovedTemplateId,
  proposeWorkflowTemplate,
  approveWorkflowTemplate,
  type WorkflowMilestoneSpec,
} from '../services/workflowTemplates.js';

const APPLY = process.argv.includes('--apply');
const SEED_ACTOR = 'system-seed-script:addElectricalInterimReportPreGradeSignoffs';
const FACULTY_ID = 'electrical';
const PROCESS_TYPE = 'msc_project' as const;
const MAJOR = 'electrical_engineering';
const MILESTONE_TYPE = 'custom_hg9jn1k2'; // "דו"ח ביניים" — see addElectricalInterimReportStaffForm.ts

async function main() {
  const current = await findApprovedTemplateId(FACULTY_ID, PROCESS_TYPE, MAJOR);
  if (!current) {
    console.error(`No approved template found for ${FACULTY_ID}/${PROCESS_TYPE}/major=${MAJOR}.`);
    process.exit(1);
  }

  const target = current.milestones.find((m) => m.type === MILESTONE_TYPE);
  if (!target) {
    console.error(`No milestone of type "${MILESTONE_TYPE}" found on template ${current.id}.`);
    process.exit(1);
  }
  if (!target.staffFormFields || target.staffFormFields.length === 0) {
    console.error(
      `Milestone "${MILESTONE_TYPE}" has no staffFormFields yet — run addElectricalInterimReportStaffForm.ts --apply first.`
    );
    process.exit(1);
  }

  const milestones: WorkflowMilestoneSpec[] = current.milestones.map((m) => {
    if (m.type !== MILESTONE_TYPE) return m;
    return { ...m, requiresExaminers: true, preGradeSignoffs: { committee: true, examinerOne: true } };
  });

  console.log(`Current template: ${current.id}`);
  console.log(`New "${target.nameHe}" (${MILESTONE_TYPE}) milestone spec:\n`);
  console.log(JSON.stringify(milestones.find((m) => m.type === MILESTONE_TYPE), null, 2));

  if (!APPLY) {
    console.log('\nDry run only — re-run with --apply to actually propose and approve this version.');
    return;
  }

  const { id } = await proposeWorkflowTemplate({
    facultyId: FACULTY_ID,
    processType: PROCESS_TYPE,
    major: MAJOR,
    milestones,
    createdBy: SEED_ACTOR,
    note: 'Gated the Interim Report milestone\'s supervisor grade behind a committee-chair decision (#7) and an examiner #1 sign-off (#9), matching the paper form\'s items 7/9/10.',
    // New enrollments only — an already-created Interim Report milestone doc
    // for a student mid-flight keeps its own snapshotted state (no
    // requiresExaminers/preGradeSignoffs at all) and is NOT retroactively
    // rewritten by this script.
    applyMode: 'from_now_on',
    ...(current.defaultRouting ? { defaultRouting: current.defaultRouting } : {}),
    ...(current.examinerSignoffRole ? { examinerSignoffRole: current.examinerSignoffRole } : {}),
    ...(current.finalGradeSignoffRole ? { finalGradeSignoffRole: current.finalGradeSignoffRole } : {}),
    ...(current.firstStepMode ? { firstStepMode: current.firstStepMode } : {}),
    ...(current.supervisorSelectionRequiresApproval !== undefined ? { supervisorSelectionRequiresApproval: current.supervisorSelectionRequiresApproval } : {}),
  });
  console.log(`\nProposed template ${id}.`);

  await approveWorkflowTemplate(id, SEED_ACTOR);
  console.log(`Approved template ${id} — now active for ${FACULTY_ID}/${PROCESS_TYPE}/${MAJOR}.`);
}

main().catch((err) => {
  console.error('addElectricalInterimReportPreGradeSignoffs failed:', err);
  process.exit(1);
});
