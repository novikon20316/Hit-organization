// src/scripts/addElectricalResearchProposalStaffChain.ts
//
// Digitizes "הצעת מחקר - טופס חברי סגל" (the staff research-proposal
// approval form, Electrical & Electronics Engineering faculty, M.Sc. with
// Thesis) into an online 5-stage staff sign-off chain on the
// research_proposal milestone:
//   supervisor -> coordinator -> division_head -> program_head -> dean
// Each stage is a pure sign-off (action: 'approve'), not a numeric grade —
// mirrors addResearchProposalStudentForm.ts's supervisor/coordinator switch
// for data_science/msc_project, extended with three more stages and each
// stage's own small form (see ChainStage.formFields in workflowTemplates.ts).
//
// This is a STAFF-facing form only — the student's own submission for this
// faculty/major is deliberately left untouched (studentFormFields is not
// set here), unlike the data_science precedent which also digitized the
// student's side.
//
// Every stage rejects straight back to the student (rejectTo: 'student') —
// same as the data_science precedent, no silent staff-internal reroutes.
//
// SAFE BY DEFAULT: dry run (prints the full new milestone list, writes
// nothing) unless you pass --apply. Always run without --apply first.
//
// Usage (from server/):
//   npx tsx src/scripts/addElectricalResearchProposalStaffChain.ts             # dry run
//   npx tsx src/scripts/addElectricalResearchProposalStaffChain.ts --apply     # actually writes

import {
  findApprovedTemplateId,
  proposeWorkflowTemplate,
  approveWorkflowTemplate,
  type WorkflowMilestoneSpec,
  type ChainStage,
} from '../services/workflowTemplates.js';

const APPLY = process.argv.includes('--apply');
const SEED_ACTOR = 'system-seed-script:addElectricalResearchProposalStaffChain';
const FACULTY_ID = 'electrical';
const PROCESS_TYPE = 'msc_thesis' as const;
const MAJOR = 'electrical_engineering';

const ROUTING: ChainStage[] = [
  {
    id: 'supervisor_sign',
    role: 'supervisor',
    action: 'approve',
    rejectTo: 'student',
    formFields: [
      {
        key: 'coursesRemaining',
        labelHe: 'קורסים שעל הסטודנט/ית להשלים עד סיום הלימודים',
        labelEn: 'Courses the student must still complete before graduating',
        type: 'textarea',
        required: false,
      },
      {
        key: 'agreeToSupervise',
        labelHe: 'הנני מסכימ/ה כי מחקר זה יבוצע בהנחייתי',
        labelEn: 'I agree that this research will be conducted under my supervision',
        type: 'yesno',
        required: true,
      },
    ],
  },
  {
    id: 'coordinator_sign',
    role: 'coordinator',
    action: 'approve',
    rejectTo: 'student',
    // The tri-state approved/approved_conditionally/rejected decision itself
    // (מאושר / מאושר בתנאי / לא מאושר) is captured via the existing
    // comment/recommendation mechanism (see coordinatorApproveMilestone),
    // not as a formFields entry — these two are the paper form's own
    // "חבר בוועדת מחקר 1/2" lines, free text (not the structured 'committee'
    // entity committeeController.ts manages for defense panels).
    formFields: [
      { key: 'committeeMember1', labelHe: 'חבר/ת ועדת מחקר 1', labelEn: 'Research committee member 1', type: 'text', required: false },
      { key: 'committeeMember2', labelHe: 'חבר/ת ועדת מחקר 2', labelEn: 'Research committee member 2', type: 'text', required: false },
    ],
  },
  {
    id: 'division_head_sign',
    role: 'division_head',
    action: 'approve',
    rejectTo: 'student',
    formFields: [
      { key: 'divisionName', labelHe: 'תחום/חטיבה', labelEn: 'Division / area', type: 'text', required: true },
      {
        key: 'correctedPerComments',
        labelHe: 'ההצעה תוקנה בהתאם להערות הבודק/ים',
        labelEn: 'The proposal was corrected in light of the reviewers’ comments',
        type: 'yesno',
        required: false,
      },
    ],
  },
  // Program Head and Dean: plain approve/reject, no extra fields — the
  // paper form's own sections for these two are just name/date/signature,
  // which the generic {role}SignedAt/{role}SignedByName stamp already
  // covers (see approveChainMilestone).
  { id: 'program_head_sign', role: 'program_head', action: 'approve', rejectTo: 'student' },
  { id: 'dean_sign', role: 'dean', action: 'approve', rejectTo: 'student' },
];

async function main() {
  const current = await findApprovedTemplateId(FACULTY_ID, PROCESS_TYPE, MAJOR);
  if (!current) {
    console.error(
      `No approved template found for ${FACULTY_ID}/${PROCESS_TYPE}/major=${MAJOR} (checked the major-specific template and the faculty's all-majors fallback). ` +
      `Seed a base template for this faculty/process/major first (see seedIEMWorkflowTemplate.ts for the pattern), then re-run this script.`
    );
    process.exit(1);
  }

  const milestones: WorkflowMilestoneSpec[] = current.milestones.map((m) => {
    if (m.type !== 'research_proposal') return m;
    return { ...m, routing: ROUTING };
  });

  console.log(`Current template: ${current.id}`);
  console.log('New research_proposal milestone spec:\n');
  console.log(JSON.stringify(milestones.find((m) => m.type === 'research_proposal'), null, 2));

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
    note: 'Digitized the staff research-proposal approval form (הצעת מחקר - טופס חברי סגל) into a 5-stage sign-off chain: supervisor -> coordinator -> division_head -> program_head -> dean.',
    // New enrollments only — an already-created research_proposal milestone
    // doc for a student mid-flight keeps its own snapshotted routing and is
    // NOT retroactively rewritten by this script.
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
  console.error('addElectricalResearchProposalStaffChain failed:', err);
  process.exit(1);
});
