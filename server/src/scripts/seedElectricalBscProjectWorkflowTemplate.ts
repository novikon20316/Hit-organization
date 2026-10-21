// src/scripts/seedElectricalBscProjectWorkflowTemplate.ts
//
// Creates Electrical & Electronics Engineering's first B.Sc. (bsc_project)
// workflow template — the faculty only ever had M.Sc. ones, so no B.Sc.
// project could even be created (project creation requires an approved
// template). Based on the M.Sc. project template (electrical/msc_project),
// per the faculty's instruction, with the B.Sc. weighting:
//
//   1. הצעת פרויקט      0%   (as in M.Sc.)
//   2. דו"ח ביניים       25%  (M.Sc.: 10%) — supervisor grade → coordinator
//   3. הגנה והערכת פרויקט גמר  75% — replaces M.Sc.'s separate "ספר הפרויקט"
//      (40%) and "מצגת הפרויקט וההגנה" (50%): the B.Sc. paper form
//      ("טופס הערכת פרויקט גמר הנדסי לתואר B.Sc.") scores the book AND the
//      presentation together, so they're one milestone here.
//   M.Sc.'s 0% "סמינר" is dropped (not part of the B.Sc. track).
//
// Deliberately NOT carried over from M.Sc.: the interim report's 13-field
// staffFormFields (that's the M.Sc. interim-report evaluation form —
// addElectricalInterimReportStaffForm.ts) — the B.Sc. interim report is a
// plain supervisor grade until the faculty supplies its own B.Sc. form.
//
// The final milestone digitizes the B.Sc. evaluation form as a per-student
// three-rubric evaluation (finalGradeComponents.perStudent — see
// evaluationFormController.ts): the supervisor scores the six rows the
// paper form ticks "מנחה" (45 points), each examiner scores "הצגת הפרויקט"
// and "ספר הפרויקט" (15 + 15, averaged across the panel), every student
// separately. Rubric weights 60/20/20 over 45/15/15 points make the
// milestone grade exactly points/75*100, and the milestone's 75% share of
// the project grade then turns that back into the paper form's "out of 75".
//
// Due-day offsets are PLACEHOLDERS copied from the M.Sc. project template
// (which itself uses 90/180/90) — coordinators adjust them in the Workflow
// Templates screen.
//
// SAFE BY DEFAULT: dry run unless you pass --apply.
//
// Usage (from server/):
//   npx tsx src/scripts/seedElectricalBscProjectWorkflowTemplate.ts           # dry run
//   npx tsx src/scripts/seedElectricalBscProjectWorkflowTemplate.ts --apply   # writes

import {
  findApprovedTemplateId,
  proposeWorkflowTemplate,
  approveWorkflowTemplate,
  type WorkflowMilestoneSpec,
  type GradingComponentSpec,
  type FormFieldSpec,
  type MilestoneRoutingSpec,
} from '../services/workflowTemplates.js';

const APPLY = process.argv.includes('--apply');
const SEED_ACTOR = 'system-seed-script:seedElectricalBscProjectWorkflowTemplate';
const FACULTY_ID = 'electrical';
const PROCESS_TYPE = 'bsc_project' as const;
const MAJOR = 'electrical_engineering';

// Same template-level chain as electrical/msc_project.
const DEFAULT_ROUTING: MilestoneRoutingSpec = [
  { id: 'supervisor', role: 'supervisor', action: 'grade', rejectTo: 'student' },
  { id: 'coordinator', role: 'coordinator', action: 'approve', rejectTo: 'supervisor' },
];

// The defense's own pre-defense check: the supervisor and then the
// coordinator confirm the submitted book/presentation is ready, which opens
// examiner scheduling (see milestoneRouting.ts's isChainDriven). 'approve',
// not the default chain's 'grade' — the real grade comes from the
// evaluation form after the defense.
const DEFENSE_PRECHECK: MilestoneRoutingSpec = [
  { id: 'supervisor_ready', role: 'supervisor', action: 'approve', rejectTo: 'student' },
  { id: 'coordinator_ready', role: 'coordinator', action: 'approve', rejectTo: 'student' },
];

const component = (key: string, groupHe: string, groupEn: string, labelHe: string, labelEn: string, maxScore: number): GradingComponentSpec => ({
  key, groupHe, groupEn, labelHe, labelEn, maxScore, weight: maxScore, hasComment: false, visibleToStudent: false,
});

// "נותן ההערכה: מנחה" rows — 45 points.
const SUPERVISOR_COMPONENTS: GradingComponentSpec[] = [
  component('spec_and_plan', 'מהלך הפרויקט', 'Project process', 'הגדרת המפרט/שאלת המחקר ותכנית עבודה מפורטת', 'Defining the specification/research question and a detailed work plan', 5),
  component('independent_problem_solving', 'מהלך הפרויקט', 'Project process', 'איתור בעיות, אסטרטגיה להתמודדות ופתרון בצורה עצמאית', 'Identifying problems, coping strategy and solving them independently', 15),
  component('schedule', 'מהלך הפרויקט', 'Project process', 'עמידה בלו"ז המתוכנן - בהתאם לתכנית העבודה שבפרויקט', 'Meeting the planned schedule, per the project work plan', 5),
  component('meets_requirements', 'מהלך הפרויקט', 'Project process', 'עמידת התוצר בדרישות התכנון (בהתאם למפרט) או מענה אקדמי נאות על שאלת המחקר', 'Product meets the design requirements (per the spec) or an adequate academic answer to the research question', 10),
  component('beyond_expectations', 'מהלך הפרויקט', 'Project process', 'ביצוע משימות מעל ומעבר — מקוריות +1, היקף +1, יוזמה +1 ופרסום מאמר/כנס +2', 'Going above and beyond — originality +1, scope +1, initiative +1, paper/conference publication +2', 5),
  component('technical_writing', 'סיכום', 'Summary', 'כתיבה טכנית (טבלאות, איורים, נוסחאות לפי נוהל פרויקטים)', 'Technical writing (tables, figures, equations per the projects procedure)', 5),
];

// "נותן ההערכה: בוחן" rows — 15 + 15 points, averaged across examiners.
const EXAMINER_DEFENSE_COMPONENTS: GradingComponentSpec[] = [
  component('presentation', 'הצגת הפרויקט', 'Project presentation', 'מצגת, הדגמה ומענה על שאלות הבוחנים', "Presentation, demonstration and answering the examiners' questions", 15),
];
const EXAMINER_PROJECT_COMPONENTS: GradingComponentSpec[] = [
  component('project_book', 'ספר הפרויקט', 'Project book', 'רמה אקדמית, מוצר/אב טיפוס', 'Academic level, product/prototype', 15),
];

// The paper form's header — every line filled in by the system.
const HEADER_FIELDS: FormFieldSpec[] = [
  { key: 'projectStartDate', labelHe: 'תאריך תחילת פרויקט', labelEn: 'Project start date', type: 'date', required: false, autoFill: 'projectStartDate', locked: true },
  { key: 'academicYear', labelHe: 'שנה"ל', labelEn: 'Academic year', type: 'text', required: false, autoFill: 'academicYear', locked: true },
  { key: 'defenseDate', labelHe: 'תאריך ההגנה', labelEn: 'Defense date', type: 'date', required: false, autoFill: 'defenseDate', locked: true },
  { key: 'supervisorName', labelHe: 'שם המנחה', labelEn: 'Supervisor', type: 'text', required: false, autoFill: 'supervisorName', locked: true },
  { key: 'projectName', labelHe: 'נושא הפרויקט', labelEn: 'Project topic', type: 'text', required: false, autoFill: 'projectNameHe', locked: true },
  { key: 'examiners', labelHe: 'בוחנים', labelEn: 'Examiners', type: 'text', required: false, autoFill: 'examinerNames', locked: true },
];

const MILESTONES: WorkflowMilestoneSpec[] = [
  {
    type: 'custom_i1pa1e38',
    nameHe: 'הצעת פרויקט',
    nameEn: 'Project Proposal',
    order: 1,
    dueDaysFromStart: 90,
    requiresExaminers: false,
    submissionRequirement: 'both',
    allowedFileTypes: ['pdf', 'word'],
    percentOfFinalGrade: 0,
  },
  {
    type: 'custom_hg9jn1k2',
    nameHe: 'דו"ח ביניים',
    nameEn: 'Interim Report',
    order: 2,
    dueDaysFromStart: 180,
    requiresExaminers: false,
    submissionRequirement: 'both',
    allowedFileTypes: ['pdf'],
    percentOfFinalGrade: 25,
  },
  {
    type: 'defense',
    nameHe: 'הגנה והערכת פרויקט גמר',
    nameEn: 'Final Project Defense & Evaluation',
    order: 3,
    dueDaysFromStart: 270,
    requiresExaminers: true,
    examinerCount: 2,
    submissionRequirement: 'both',
    allowedFileTypes: ['pdf', 'powerpoint'],
    routing: DEFENSE_PRECHECK,
    percentOfFinalGrade: 75,
    finalGradeComponents: {
      supervisorEvaluation: { components: SUPERVISOR_COMPONENTS, weight: 60 },
      examinerDefenseEvaluation: { components: EXAMINER_DEFENSE_COMPONENTS, weight: 20 },
      examinerProjectEvaluation: { components: EXAMINER_PROJECT_COMPONENTS, weight: 20 },
      perStudent: true,
      formTitleHe: 'טופס הערכת פרויקט גמר הנדסי לתואר B.Sc.',
      formTitleEn: 'B.Sc. Engineering Final Project Evaluation Form',
      headerFields: HEADER_FIELDS,
    },
  },
];

async function main() {
  const existing = await findApprovedTemplateId(FACULTY_ID, PROCESS_TYPE, MAJOR);
  if (existing) {
    console.error(`An approved ${FACULTY_ID}/${PROCESS_TYPE} template already applies to major=${MAJOR} (id: ${existing.id}). Edit it instead of seeding a new one.`);
    process.exit(1);
  }

  console.log('New template milestones:\n');
  console.log(JSON.stringify(MILESTONES, null, 2));

  if (!APPLY) {
    console.log('\nDry run only — re-run with --apply to propose and approve this template.');
    return;
  }

  const { id } = await proposeWorkflowTemplate({
    facultyId: FACULTY_ID,
    processType: PROCESS_TYPE,
    major: MAJOR,
    milestones: MILESTONES,
    createdBy: SEED_ACTOR,
    note: 'First Electrical B.Sc. project template, based on the M.Sc. project template: interim report 25%, final defense with the per-student B.Sc. evaluation form 75%.',
    applyMode: 'from_now_on',
    defaultRouting: DEFAULT_ROUTING,
    examinerSignoffRole: 'none',
    finalGradeSignoffRole: 'coordinator',
    firstStepMode: 'browse_projects',
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

main().catch((err) => {
  console.error('seedElectricalBscProjectWorkflowTemplate failed:', err);
  process.exit(1);
});
