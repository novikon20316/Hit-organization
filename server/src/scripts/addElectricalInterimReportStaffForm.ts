// src/scripts/addElectricalInterimReportStaffForm.ts
//
// Digitizes "טופס הערכת מנחה – דוח ראשון לפרויקט גמר מוסמכים" (the
// supervisor's evaluation form for the first/interim report, Electrical &
// Electronics Engineering faculty, M.Sc. Final Project course) as this
// faculty's existing "דו"ח ביניים" (Interim Report) milestone's
// staffFormFields — mirrors seedDataScienceWorkflowTemplate.ts's
// MIDTERM_FIELDS pattern (a supervisor-only supplementary record, alongside
// the student's own submission on the same milestone).
//
// The paper form's other three items — the committee chair's continue/
// not-continue decision (#7), the chief examiner's approval (#9), and the
// grade for this report (#10) — are DELIBERATELY NOT included here. Per the
// user, those are never filled by the supervisor (unless that supervisor is
// also this project's committee chair, a case the system still needs to
// detect) — they belong to a follow-up routing-chain change on this same
// milestone (see ChainStage.formFields, already used by
// addElectricalResearchProposalStaffChain.ts for this same faculty/major),
// not to staffFormFields. That follow-up is deliberately left for a separate
// script once the exact routing is decided.
//
// SAFE BY DEFAULT: dry run (prints the full new milestone list, writes
// nothing) unless you pass --apply. Always run without --apply first.
//
// Usage (from server/):
//   npx tsx src/scripts/addElectricalInterimReportStaffForm.ts             # dry run
//   npx tsx src/scripts/addElectricalInterimReportStaffForm.ts --apply     # actually writes

import {
  findApprovedTemplateId,
  proposeWorkflowTemplate,
  approveWorkflowTemplate,
  type WorkflowMilestoneSpec,
  type FormFieldSpec,
} from '../services/workflowTemplates.js';

const APPLY = process.argv.includes('--apply');
const SEED_ACTOR = 'system-seed-script:addElectricalInterimReportStaffForm';
const FACULTY_ID = 'electrical';
const PROCESS_TYPE = 'msc_project' as const;
const MAJOR = 'electrical_engineering';
// The live template's own custom type for "דו"ח ביניים" (order 2) — see
// findApprovedTemplateId('electrical', 'msc_project', 'electrical_engineering').
// Matched by this stable id, not by nameHe (which a faculty could reword).
const MILESTONE_TYPE = 'custom_hg9jn1k2';

const INTERIM_REPORT_STAFF_FIELDS: FormFieldSpec[] = [
  // Header — auto-filled, read-only (see workflowTemplates.ts's autoFill doc).
  { key: 'studentName', labelHe: 'שם הסטודנט', labelEn: 'Student name', type: 'text', required: true, autoFill: 'studentName', locked: true },
  { key: 'studentIdNumber', labelHe: 'ת"ז', labelEn: 'ID number', type: 'text', required: true, autoFill: 'studentIdNumber', locked: true },
  { key: 'projectNameHe', labelHe: 'כותרת הפרויקט (בעברית)', labelEn: 'Project title (Hebrew)', type: 'text', required: true, autoFill: 'projectNameHe', locked: true },
  { key: 'projectNameEn', labelHe: 'כותרת הפרויקט (באנגלית)', labelEn: 'Project title (English)', type: 'text', required: true, autoFill: 'projectNameEn', locked: true },
  { key: 'examinerNames', labelHe: 'שמות הבוחנים', labelEn: 'Examiner names', type: 'text', required: false, autoFill: 'examinerNames', locked: true },
  // Body — filled by the supervisor. Item 6 is the only optional one, per the
  // paper form's own "במידה וקיימים" ("if any") wording.
  { key: 'topicAndNature', labelHe: 'ציין את נושא הפרויקט ואת אופיו (מחקר/סקר/חקר)', labelEn: "State the project's topic and its nature (research / survey / investigation).", type: 'textarea', required: true },
  { key: 'innovation', labelHe: 'ציין את החדשנות של הפרויקט לגבי הקיים כיום במחקר/בתעשייה', labelEn: "State the project's innovation relative to current research/industry.", type: 'textarea', required: true },
  { key: 'levelJustification', labelHe: 'האם הפרויקט בשלב זה עומד ברמה ההולמת לתואר שני (אקדמית/תעשייתית)? נמק', labelEn: "Does the project, at this stage, meet the standard expected of a master's degree (academic/industrial)? Justify.", type: 'textarea', required: true },
  { key: 'progressAssessment', labelHe: 'ציין את אבני הדרך ותוצרי הפרויקט שהושגו עד עתה, והערך את שלבי סיום הפרויקט ועמידה בלו"ז הנדרש', labelEn: 'State the milestones/deliverables achieved so far, and assess progress toward completion and schedule adherence.', type: 'textarea', required: true },
  { key: 'finalDeliverablesAndChanges', labelHe: 'מה יהיו התוצרים הסופיים של הפרויקט, והאם נדרשים שינויים בהגדרה ביחס להצעת הפרויקט? אם כן, נמק', labelEn: 'What will the final deliverables be, and are changes needed relative to the original proposal? If so, justify.', type: 'textarea', required: true },
  { key: 'risksAndMitigation', labelHe: 'ציין את הסיכונים לאי-הגעה ליעדי הפרויקט ולרמה הנדרשת, וציין דרכים להתמודדות במידה וקיימים', labelEn: "State risks of not reaching the project's goals or required level, and mitigation approaches, if any.", type: 'textarea', required: false },
  // Footer — auto-filled, read-only.
  { key: 'supervisorName', labelHe: 'שם המנחה', labelEn: 'Supervisor name', type: 'text', required: true, autoFill: 'supervisorName', locked: true },
  { key: 'submissionDate', labelHe: 'תאריך', labelEn: 'Date', type: 'date', required: true, autoFill: 'submissionDate', locked: true },
];

async function main() {
  const current = await findApprovedTemplateId(FACULTY_ID, PROCESS_TYPE, MAJOR);
  if (!current) {
    console.error(`No approved template found for ${FACULTY_ID}/${PROCESS_TYPE}/major=${MAJOR}.`);
    process.exit(1);
  }

  const target = current.milestones.find((m) => m.type === MILESTONE_TYPE);
  if (!target) {
    console.error(`No milestone of type "${MILESTONE_TYPE}" found on template ${current.id}. Milestone types present: ${current.milestones.map((m) => m.type).join(', ')}`);
    process.exit(1);
  }

  const milestones: WorkflowMilestoneSpec[] = current.milestones.map((m) => {
    if (m.type !== MILESTONE_TYPE) return m;
    return { ...m, staffRecordMode: 'upload_or_form', staffFormFields: INTERIM_REPORT_STAFF_FIELDS };
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
    note: 'Digitized the supervisor evaluation form (טופס הערכת מנחה – דוח ראשון) as the Interim Report milestone\'s staffFormFields.',
    // New enrollments only — an already-created milestone doc for a student
    // mid-flight keeps its own snapshotted state and is NOT retroactively
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
  console.error('addElectricalInterimReportStaffForm failed:', err);
  process.exit(1);
});
