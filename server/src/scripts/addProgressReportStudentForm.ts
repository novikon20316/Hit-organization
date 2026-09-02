// src/scripts/addProgressReportStudentForm.ts
//
// Adds a STUDENT-facing online form to data_science/msc_project's
// progress_report milestone (digitizing Project_midterm.docx — "דו"ח ביניים"
// — as something the student fills, not just the supervisor's supplementary
// staffRecord — see seedDataScienceWorkflowTemplate.ts, whose staffFormFields
// for this milestone this script deliberately does NOT touch or replace).
// Mirrors addResearchProposalStudentForm.ts's shape exactly, with two
// differences: projectNameHe/projectNameEn are locked+autoFill here (the
// project's real name was already established — and coordinator-approved —
// back at research_proposal; see milestoneController.ts's submitMilestone,
// which writes project.titleHe/titleEn the moment research_proposal is
// submitted, and which progress_report can't even start before
// research_proposal reaches coordinator_approved), and this milestone's
// routing/grading (supervisor grades, coordinator approves — the template's
// own DEFAULT_ROUTING) is left untouched, unlike research_proposal's switch
// to a pure sign-off chain.
//
// Per-student fields (name/ID/phone/email) are DELIBERATELY NOT listed in
// studentFormFields below, same reasoning as the proposal form: for a team
// project the paper form repeats that whole block once per student. The
// client resolves and renders one such block per milestone.studentIds entry,
// straight from each teammate's own profile (see ProgressReportFormModal.tsx).
//
// SAFE BY DEFAULT: dry run (prints the full new milestone list, writes
// nothing) unless you pass --apply. Always run without --apply first.
//
// Usage (from server/):
//   npx tsx src/scripts/addProgressReportStudentForm.ts             # dry run
//   npx tsx src/scripts/addProgressReportStudentForm.ts --apply     # actually writes

import {
  findApprovedTemplateId,
  proposeWorkflowTemplate,
  approveWorkflowTemplate,
  type WorkflowMilestoneSpec,
  type FormFieldSpec,
} from '../services/workflowTemplates.js';

const APPLY = process.argv.includes('--apply');
const SEED_ACTOR = 'system-seed-script:addProgressReportStudentForm';
const FACULTY_ID = 'data_science';
const PROCESS_TYPE = 'msc_project' as const;
const MAJOR = null;

// The fields the team fills in TOGETHER, once — everything else on the paper
// form (name/ID/phone/email) is per-student and rendered separately (see
// file header). submissionDate/projectNameHe/projectNameEn are locked+
// autoFill, resolved client-side, never typed by the student — matching
// PROPOSAL_STUDENT_FIELDS's own submissionDate/supervisorName pattern in
// addResearchProposalStudentForm.ts.
const MIDTERM_STUDENT_FIELDS: FormFieldSpec[] = [
  { key: 'submissionDate', labelHe: 'תאריך הגשת דו"ח הביניים', labelEn: 'Progress report submission date', type: 'date', required: true, autoFill: 'submissionDate', locked: true },
  { key: 'projectNameHe', labelHe: 'שם הפרויקט (בעברית)', labelEn: 'Project name (Hebrew)', type: 'text', required: true, autoFill: 'projectNameHe', locked: true },
  { key: 'projectNameEn', labelHe: 'שם הפרויקט (באנגלית)', labelEn: 'Project name (English)', type: 'text', required: true, autoFill: 'projectNameEn', locked: true },
  { key: 'projectPurpose', labelHe: 'מטרת הפרוייקט (כפי שמופיע בהצעת המחקר)', labelEn: 'Project purpose (as stated in the research proposal)', type: 'textarea', required: true },
  { key: 'workPlan', labelHe: 'תוכנית העבודה להתקדמות בפרויקט זה', labelEn: 'Work plan for continuing the project', type: 'textarea', required: true },
  { key: 'resultsAchieved', labelHe: 'תוצאות שהושגו בהתאם להצעת המחקר', labelEn: 'Results achieved per the research proposal', type: 'textarea', required: true },
  { key: 'resultsPending', labelHe: 'תוצאות שעדיין בשלב המחקר', labelEn: 'Results still in progress', type: 'textarea', required: false },
  { key: 'goalChanges', labelHe: 'שינוים ביעדי המחקר (יש לנמק את הסיבה לכל שינוי)', labelEn: 'Changes to the research goals (justify each change)', type: 'textarea', required: false },
  { key: 'bibliography', labelHe: 'ביבליוגרפיה', labelEn: 'Bibliography', type: 'textarea', required: false },
];

async function main() {
  const current = await findApprovedTemplateId(FACULTY_ID, PROCESS_TYPE, MAJOR);
  if (!current) {
    console.error(`No approved template found for ${FACULTY_ID}/${PROCESS_TYPE}/major=${MAJOR} — run seedDataScienceWorkflowTemplate.ts first.`);
    process.exit(1);
  }

  const milestones: WorkflowMilestoneSpec[] = current.milestones.map((m) => {
    if (m.type !== 'progress_report') return m;
    return {
      ...m,
      studentFormFields: MIDTERM_STUDENT_FIELDS,
      // Routing/grading intentionally left unchanged — progress_report keeps
      // whatever routing it already has (the template's own DEFAULT_ROUTING:
      // supervisor grades, coordinator approves), unlike research_proposal's
      // switch to a pure sign-off chain.
    };
  });

  console.log(`Current template: ${current.id}`);
  console.log('New progress_report milestone spec:\n');
  console.log(JSON.stringify(milestones.find((m) => m.type === 'progress_report'), null, 2));

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
    note: 'Added a student-facing online form to progress_report, digitizing Project_midterm.docx as the student\'s own submission instead of only a supervisor staffRecord.',
    // New enrollments only — an already-created progress_report milestone
    // doc for a student mid-flight keeps its own snapshotted state (no
    // studentFormFields at all) and is NOT retroactively rewritten.
    applyMode: 'from_now_on',
    ...(current.defaultRouting ? { defaultRouting: current.defaultRouting } : {}),
    ...(current.examinerSignoffRole ? { examinerSignoffRole: current.examinerSignoffRole } : {}),
    ...(current.finalGradeSignoffRole ? { finalGradeSignoffRole: current.finalGradeSignoffRole } : {}),
    ...(current.firstStepMode ? { firstStepMode: current.firstStepMode } : {}),
    ...(current.supervisorSelectionRequiresApproval !== undefined ? { supervisorSelectionRequiresApproval: current.supervisorSelectionRequiresApproval } : {}),
  });
  console.log(`\nProposed template ${id}.`);

  await approveWorkflowTemplate(id, SEED_ACTOR);
  console.log(`Approved template ${id} — now active for ${FACULTY_ID}/${PROCESS_TYPE} (all majors).`);
}

main().catch((err) => {
  console.error('addProgressReportStudentForm failed:', err);
  process.exit(1);
});
