// src/scripts/addElectricalResearchProposalStudentForm.ts
//
// Digitizes "הצעת מחקר עם תזה - סטודנט" (the STUDENT'S OWN copy of the
// research-proposal form, Electrical & Electronics Engineering faculty,
// M.Sc. with Thesis) as an online form for the research_proposal milestone
// — the student-facing counterpart to addElectricalResearchProposalStaffChain.ts's
// staff sign-off chain, which deliberately left studentFormFields untouched.
//
// Per-student fields the paper form's own table already covers (name/ID/
// phone/email/photo/accumulated credits) are DELIBERATELY NOT listed below
// — same reasoning as addResearchProposalStudentForm.ts (data_science):
// ResearchProposalFormModal.tsx already renders one such block per teammate,
// straight from their own profile ("ת.ז." already stands in for the paper
// form's תעודת זהות line). studentFormFields only covers what's genuinely
// new: the student's address (not part of that block), and the long-form
// sections (D-K) the student writes themselves. The student's own signature
// isn't a field either — like every other signature in this system, it's a
// name+timestamp stamp shown at submit time (see ResearchProposalFormModal's
// own submission-time signature preview), not something typed in.
//
// Deliberately SKIPPED (administrative/registry metadata, not student-
// authored content — matches the data_science precedent's own scope, which
// also skips any pure catalog/registry-number field):
//   - "מספר עבודת מחקר" (research work number) / "קורס מס' 555XX" (course
//     number) — administrative identifiers, not modeled anywhere in this
//     system's milestone data today.
//   - The header's "דו"ח ראשון / דו"ח שני / סיום" (report/completion) dates —
//     these duplicate the template's own progress_report/final_report/
//     defense due dates, already tracked per-milestone elsewhere.
//   - Supervisor's phone/email (paper form's "פרטי המנחה" block) — only
//     supervisorName has an autoFill today; left as a placeholder for a
//     later pass rather than guessing a new autoFill resolution now.
// Confirm these omissions with faculty staff before relying on this as the
// complete digitization.
//
// Also flips the existing research_proposal milestone's supervisor_sign
// stage (added by addElectricalResearchProposalStaffChain.ts) to
// requireAllAssignedSupervisors: true — when a project has a secondary
// supervisor, the paper form's "מנחה / מנחה נוסף" both get their own
// signature line, so both must independently sign before the chain advances
// to coordinator_sign (see coordinatorController.ts's approveChainMilestone
// dual-signature branch). A project with no secondary supervisor is
// unaffected. Every other stage/field on that chain (coordinator/
// division_head/program_head/dean, and the supervisor stage's own
// coursesRemaining/agreeToSupervise fields) is carried over UNCHANGED.
//
// SAFE BY DEFAULT: dry run (prints the full new milestone list, writes
// nothing) unless you pass --apply. Always run without --apply first.
//
// Usage (from server/):
//   npx tsx src/scripts/addElectricalResearchProposalStudentForm.ts             # dry run
//   npx tsx src/scripts/addElectricalResearchProposalStudentForm.ts --apply     # actually writes

import {
  findApprovedTemplateId,
  proposeWorkflowTemplate,
  approveWorkflowTemplate,
  type WorkflowMilestoneSpec,
  type FormFieldSpec,
} from '../services/workflowTemplates.js';

const APPLY = process.argv.includes('--apply');
const SEED_ACTOR = 'system-seed-script:addElectricalResearchProposalStudentForm';
const FACULTY_ID = 'electrical';
const PROCESS_TYPE = 'msc_thesis' as const;
const MAJOR = 'electrical_engineering';

// The fields the student fills in themselves — everything table 1 on the
// paper form covers (name/ID/phone/email/photo/נ"ז) is per-student and
// rendered separately (see file header). supervisorName/submissionDate are
// locked+autoFill, resolved client-side, never typed by the student.
const PROPOSAL_STUDENT_FIELDS: FormFieldSpec[] = [
  { key: 'submissionDate', labelHe: 'תאריך הגשה ראשוני', labelEn: 'Initial submission date', type: 'date', required: true, autoFill: 'submissionDate', locked: true },
  { key: 'supervisorName', labelHe: 'שם המנחה', labelEn: "Supervisor's name", type: 'text', required: true, autoFill: 'supervisorName', locked: true },
  { key: 'studentAddress', labelHe: 'כתובת', labelEn: 'Address', type: 'text', required: true },
  { key: 'projectNameHe', labelHe: 'כותרת עבודת המחקר (בעברית)', labelEn: 'Research title (Hebrew)', type: 'text', required: true },
  { key: 'projectNameEn', labelHe: 'כותרת עבודת המחקר (באנגלית)', labelEn: 'Research title (English)', type: 'text', required: true },
  { key: 'background', labelHe: 'רקע ורציונל למחקר (רקע כללי ותיאורטי, מוטיבציה, חשיבות המחקר, חדשנות וכו\')', labelEn: 'Background and rationale (general/theoretical background, motivation, significance, novelty, etc.)', type: 'textarea', required: true },
  { key: 'objective', labelHe: 'מטרת המחקר (הגדרה ברורה של מטרת המחקר ושאלת המחקר)', labelEn: 'Research objective (a clear statement of the research goal and question)', type: 'textarea', required: true },
  { key: 'workPlan', labelHe: 'תכנית עבודת המחקר (שיטות, מתודולוגיות וכלים)', labelEn: 'Research work plan (methods, methodologies and tools)', type: 'textarea', required: true },
  { key: 'references', labelHe: 'רשימה ביבליוגרפית', labelEn: 'Bibliography', type: 'textarea', required: true },
  { key: 'deliverables', labelHe: 'תוצרי המחקר (מדדים להצלחת המחקר)', labelEn: 'Research deliverables (success metrics)', type: 'textarea', required: true },
  {
    key: 'ganttChart',
    labelHe: 'פעילויות ואבני דרך בביצוע המחקר (גאנט)',
    labelEn: 'Research activities and milestones (Gantt chart)',
    type: 'table',
    required: false,
    tableColumns: [
      { key: 'taskDescription', labelHe: 'תיאור המשימה', labelEn: 'Task description', type: 'text' },
      { key: 'milestoneDescription', labelHe: 'תיאור אבן הדרך', labelEn: 'Milestone description', type: 'text' },
      { key: 'month', labelHe: 'חודש', labelEn: 'Month', type: 'number' },
    ],
  },
  { key: 'equipment', labelHe: 'הציוד הנדרש לביצוע מחקר', labelEn: 'Equipment required for the research', type: 'textarea', required: false },
  { key: 'risks', labelHe: 'סיכונים בהשגת מטרות המחקר', labelEn: 'Risks to achieving the research goals', type: 'textarea', required: false },
  { key: 'riskMitigation', labelHe: 'דרכי התמודדות עם הסיכונים', labelEn: 'Ways to mitigate the risks', type: 'textarea', required: false },
];

async function main() {
  const current = await findApprovedTemplateId(FACULTY_ID, PROCESS_TYPE, MAJOR);
  if (!current) {
    console.error(
      `No approved template found for ${FACULTY_ID}/${PROCESS_TYPE}/major=${MAJOR} — ` +
      `run seedElectricalMscThesisWorkflowTemplate.ts and addElectricalResearchProposalStaffChain.ts first.`
    );
    process.exit(1);
  }

  const researchProposal = current.milestones.find((m) => m.type === 'research_proposal');
  if (!researchProposal?.routing || researchProposal.routing.length === 0) {
    console.error(
      `research_proposal has no routing on the current approved template (id: ${current.id}) — ` +
      `expected addElectricalResearchProposalStaffChain.ts's 5-stage chain to already be in place. Investigate before proceeding.`
    );
    process.exit(1);
  }

  const milestones: WorkflowMilestoneSpec[] = current.milestones.map((m) => {
    if (m.type !== 'research_proposal') return m;
    return {
      ...m,
      studentFormFields: PROPOSAL_STUDENT_FIELDS,
      routing: m.routing!.map((stage) =>
        stage.id === 'supervisor_sign' ? { ...stage, requireAllAssignedSupervisors: true } : stage
      ),
    };
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
    note: 'Added the student-facing online research-proposal form (הצעת מחקר עם תזה - סטודנט), and required the secondary supervisor (when one exists) to also sign supervisor_sign before it advances.',
    // New enrollments only — an already-created research_proposal milestone
    // doc for a student mid-flight keeps its own snapshotted (staff-chain-
    // only) routing and has no studentFormFields at all; it is NOT
    // retroactively rewritten by this script.
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

  const resolved = await findApprovedTemplateId(FACULTY_ID, PROCESS_TYPE, MAJOR);
  if (resolved?.id === id) {
    console.log(`Self-check passed: findApprovedTemplateId('${FACULTY_ID}', '${PROCESS_TYPE}', '${MAJOR}') resolves to ${id}.`);
  } else {
    console.error(`Self-check FAILED: findApprovedTemplateId resolved to ${resolved?.id ?? 'null'}, expected ${id}. Investigate before relying on this template.`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('addElectricalResearchProposalStudentForm failed:', err);
  process.exit(1);
});
