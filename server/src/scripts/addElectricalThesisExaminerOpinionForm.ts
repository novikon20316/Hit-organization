// src/scripts/addElectricalThesisExaminerOpinionForm.ts
//
// Digitizes Electrical & Electronics Engineering's "טופס בוחן לעבודת תזה
// מחקרית לתואר שני" on the electrical/msc_thesis template's בחינת הגנה
// (defense) milestone, as an examinerOpinionForm (see examinerOpinion.ts):
// each examiner picks one of the paper form's four conclusions and one of
// its three confidentiality requests, writes (or uploads) the detailed
// opinion, and signs digitally.
//
//   1-2 (accept as is / minor corrections at the supervisor's discretion)
//       → 'continue': the administrative coordinator enters and approves
//         the final grade.
//   3   (major corrections, back to me for another review) → 'revise'
//   4   (not acceptable) → 'reject'
//       → back to the administrative coordinator and the supervisor, who
//         tell the student; the coordinator can send the thesis back for
//         corrections, after which only the examiners who asked for changes
//         review it again.
//
// Also on the defense milestone / template:
//   - requiresExaminers: true, 2 examiners (PROVISIONAL — awaiting the
//     faculty's answer on the panel size and how disagreeing examiners
//     combine; today any 'revise'/'reject' sends it back);
//   - the placeholder three-rubric finalGradeComponents (all rubrics empty)
//     is removed — the grade is entered by the administrative coordinator;
//   - its pre-check chain becomes supervisor approve → coordinator approve;
//   - finalGradeSignoffRole becomes administrative_secretary (the faculty:
//     "the administrative coordinator approves the final grade").
//
// SAFE BY DEFAULT: dry run unless you pass --apply. New enrollments only.
//
// Usage (from server/):
//   npx tsx src/scripts/addElectricalThesisExaminerOpinionForm.ts           # dry run
//   npx tsx src/scripts/addElectricalThesisExaminerOpinionForm.ts --apply   # writes

import {
  findApprovedTemplateId,
  proposeWorkflowTemplate,
  approveWorkflowTemplate,
  type WorkflowMilestoneSpec,
  type ExaminerOpinionFormSpec,
  type MilestoneRoutingSpec,
} from '../services/workflowTemplates.js';

const APPLY = process.argv.includes('--apply');
const SEED_ACTOR = 'system-seed-script:addElectricalThesisExaminerOpinionForm';
const FACULTY_ID = 'electrical';
const PROCESS_TYPE = 'msc_thesis' as const;
const MAJOR = 'electrical_engineering';

const PRECHECK: MilestoneRoutingSpec = [
  { id: 'supervisor_ready', role: 'supervisor', action: 'approve', rejectTo: 'student' },
  { id: 'coordinator_ready', role: 'coordinator', action: 'approve', rejectTo: 'student' },
];

export const THESIS_EXAMINER_OPINION_FORM: ExaminerOpinionFormSpec = {
  titleHe: 'טופס בוחן לעבודת תזה מחקרית לתואר שני בהנדסת חשמל ואלקטרוניקה',
  titleEn: "Examiner's Form — M.Sc. Research Thesis in Electrical and Electronics Engineering",
  headerFields: [
    { key: 'student', labelHe: 'עבודת תזה מחקרית לתואר שני של', labelEn: 'M.Sc. research thesis of', type: 'text', required: false, autoFill: 'studentTitledName', locked: true },
    { key: 'supervisors', labelHe: 'בהדרכת', labelEn: 'Supervised by', type: 'text', required: false, autoFill: 'supervisorNames', locked: true },
    { key: 'topic', labelHe: 'הנושא', labelEn: 'Topic', type: 'text', required: false, autoFill: 'projectNameHe', locked: true },
  ],
  conclusions: [
    { value: '1', outcome: 'continue', labelHe: '1. העבודה ראויה להתקבל כעבודת תזה מחקרית בצורתה הנוכחית ללא תיקונים.', labelEn: '1. The thesis is worthy of acceptance as a research thesis in its current form, without corrections.' },
    { value: '2', outcome: 'continue', labelHe: '2. העבודה ראויה להתאשר כעבודת תזה מחקרית לאחר הכנסת תיקונים קלים כמפורט בחוות דעתי — לשיקול דעתו של המנחה.', labelEn: "2. The thesis is worthy of approval after minor corrections as detailed in my opinion — at the supervisor's discretion." },
    { value: '3', outcome: 'revise', labelHe: '3. יש להכניס בעבודה תיקונים מהותיים כמפורט בחוות דעתי, ולהעבירה אלי לבחינה נוספת.', labelEn: '3. Major corrections are required as detailed in my opinion, and the thesis must be sent back to me for another review.' },
    { value: '4', outcome: 'reject', labelHe: '4. העבודה אינה ראויה להתקבל כעבודת תזה. נימוקיי המפורטים כלולים בחוות דעתי.', labelEn: '4. The thesis is not worthy of acceptance. My detailed reasons are included in my opinion.' },
  ],
  confidentialityOptions: [
    { value: 'none', effect: 'none', labelHe: 'אינני מבקש/ת חיסיון.', labelEn: 'I do not request confidentiality.' },
    { value: 'hide_name', effect: 'hide_name', labelHe: 'אני מבקש/ת חיסיון של שמי בפני הסטודנט והמנחה.', labelEn: 'I request that my name be kept confidential from the student and the supervisor.' },
    { value: 'hide_marked', effect: 'hide_marked', labelHe: 'אני מבקש/ת כי החלקים שסימנתי בחוות הדעת לא יועברו לסטודנט ולמנחה.', labelEn: 'I request that the parts I marked in my opinion not be passed on to the student and the supervisor.' },
  ],
};

async function main() {
  const current = await findApprovedTemplateId(FACULTY_ID, PROCESS_TYPE, MAJOR);
  if (!current) {
    console.error(`No approved ${FACULTY_ID}/${PROCESS_TYPE}/major=${MAJOR} template found.`);
    process.exit(1);
  }
  const defense = current.milestones.find((m) => m.type === 'defense');
  if (!defense) {
    console.error(`No defense milestone on template ${current.id} — found: ${current.milestones.map((m) => m.type).join(', ')}.`);
    process.exit(1);
  }
  const fgc = defense.finalGradeComponents;
  const fgcIsPlaceholder = !fgc || [fgc.supervisorEvaluation, fgc.examinerProjectEvaluation, fgc.examinerDefenseEvaluation].every((r) => r.components.length === 0);
  if (!fgcIsPlaceholder) {
    console.error('The defense milestone has a real (non-empty) three-rubric configuration — not removing it automatically. Investigate first.');
    process.exit(1);
  }

  const milestones: WorkflowMilestoneSpec[] = current.milestones.map((m) => {
    if (m.type !== 'defense') return m;
    const { finalGradeComponents: _placeholder, ...rest } = m;
    return { ...rest, requiresExaminers: true, examinerCount: 2, routing: PRECHECK, examinerOpinionForm: THESIS_EXAMINER_OPINION_FORM };
  });

  console.log(`Current template: ${current.id} (finalGradeSignoffRole: ${current.finalGradeSignoffRole ?? 'default'} → administrative_secretary)`);
  console.log(JSON.stringify(milestones.find((m) => m.type === 'defense'), null, 2));

  if (!APPLY) {
    console.log('\nDry run only — re-run with --apply to propose and approve this version.');
    return;
  }

  const { id } = await proposeWorkflowTemplate({
    facultyId: FACULTY_ID,
    processType: PROCESS_TYPE,
    major: MAJOR,
    milestones,
    createdBy: SEED_ACTOR,
    note: "Digitized the M.Sc. thesis examiner's form on the defense milestone (conclusion-driven workflow, confidentiality requests, digital signatures); the administrative coordinator approves the final grade.",
    applyMode: 'from_now_on',
    ...(current.defaultRouting ? { defaultRouting: current.defaultRouting } : {}),
    ...(current.examinerSignoffRole ? { examinerSignoffRole: current.examinerSignoffRole } : {}),
    finalGradeSignoffRole: 'administrative_secretary',
    ...(current.finalReportSignatureRoles ? { finalReportSignatureRoles: current.finalReportSignatureRoles } : {}),
    ...(current.firstStepMode ? { firstStepMode: current.firstStepMode } : {}),
    ...(current.supervisorSelectionRequiresApproval != null ? { supervisorSelectionRequiresApproval: current.supervisorSelectionRequiresApproval } : {}),
  });
  console.log(`\nProposed template ${id}.`);
  await approveWorkflowTemplate(id, SEED_ACTOR);
  console.log(`Approved template ${id}.`);

  const resolved = await findApprovedTemplateId(FACULTY_ID, PROCESS_TYPE, MAJOR);
  if (resolved?.id === id) {
    console.log(`Self-check passed: ${FACULTY_ID}/${PROCESS_TYPE}/${MAJOR} resolves to ${id}.`);
  } else {
    console.error(`Self-check FAILED: resolved to ${resolved?.id ?? 'null'}, expected ${id}.`);
    process.exit(1);
  }
}

if (process.argv[1]?.includes('addElectricalThesisExaminerOpinionForm')) {
  main().catch((err) => {
    console.error('addElectricalThesisExaminerOpinionForm failed:', err);
    process.exit(1);
  });
}
