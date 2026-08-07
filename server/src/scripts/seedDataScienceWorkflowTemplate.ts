// src/scripts/seedDataScienceWorkflowTemplate.ts
//
// One-off: proposes + approves a new workflowTemplates version for
// (facultyId: 'data_science', processType: 'msc_project', major: null) with
// the department's REAL paper-form content, digitized —
// research_proposal/progress_report staff-form fields translated from
// Project_proposal.docx/Project_midterm.docx, the defense milestone's three
// grading rubrics translated from Project_supervisor_evaluation.docx/
// Project_examiner.docx/Project_defence_slides.docx, and a brand-new
// examiner-only 'poster' milestone (placeholder rubric — no real poster
// grading content was supplied).
//
// Deliberately NOT set here (per product decision — staff configures these
// live via web/app/workflow-templates's editor, not this script):
//   - percentOfFinalGrade on any milestone (left at 0 on all four)
//   - the three defense rubrics' own cross-weights (left at the editor's own
//     40/30/30 default — supervisor / examiner-project / examiner-defense —
//     since none of the source documents specify a relative split)
//
// Only ever touches facultyId === 'data_science' — proposeWorkflowTemplate
// always creates a brand-new version, and approving it only supersedes
// data_science's own prior 'approved' doc for this exact
// (processType, major) pair (see workflowTemplates.ts's approveWorkflowTemplate).
// No other faculty's templates or DEFAULT_MILESTONES fallback are touched.
//
// SAFE BY DEFAULT: dry run (prints the full document, writes nothing) unless
// you pass --apply. Always run without --apply first and read the output.
//
// Usage (from server/):
//   npx tsx src/scripts/seedDataScienceWorkflowTemplate.ts             # dry run
//   npx tsx src/scripts/seedDataScienceWorkflowTemplate.ts --apply     # actually writes

import {
  proposeWorkflowTemplate,
  approveWorkflowTemplate,
  type WorkflowMilestoneSpec,
  type FormFieldSpec,
  type GradingComponentSpec,
} from '../services/workflowTemplates.js';

const APPLY = process.argv.includes('--apply');
const SEED_ACTOR = 'system-seed-script:seedDataScienceWorkflowTemplate';

// ─── Project_proposal.docx → research_proposal ───────────────────────────────
const PROPOSAL_FIELDS: FormFieldSpec[] = [
  { key: 'submissionDate', labelHe: 'תאריך הגשה ראשוני', labelEn: 'Initial submission date', type: 'date', required: true },
  { key: 'studentFullName', labelHe: 'שם מלא', labelEn: 'Full name', type: 'text', required: true },
  { key: 'studentId', labelHe: 'תעודת זהות', labelEn: 'ID number', type: 'text', required: true },
  { key: 'studentPhone', labelHe: 'טלפון', labelEn: 'Phone', type: 'text', required: true },
  { key: 'studentEmail', labelHe: 'דואר אלקטרוני', labelEn: 'Email', type: 'text', required: true },
  { key: 'accumulatedCredits', labelHe: 'נ"ז צבור', labelEn: 'Accumulated credits', type: 'number', required: false },
  { key: 'projectNameHe', labelHe: 'שם הפרויקט (בעברית)', labelEn: 'Project name (Hebrew)', type: 'text', required: true },
  { key: 'projectNameEn', labelHe: 'שם הפרויקט (באנגלית)', labelEn: 'Project name (English)', type: 'text', required: true },
  { key: 'abstract', labelHe: 'תקציר (10-15 שורות)', labelEn: 'Abstract (10-15 lines)', type: 'textarea', required: true },
  { key: 'deliverables', labelHe: 'תוצרי הפרויקט', labelEn: 'Project deliverables', type: 'textarea', required: true },
  { key: 'references', labelHe: 'רשימת מקורות', labelEn: 'Reference list', type: 'textarea', required: true },
  { key: 'prerequisites', labelHe: 'דרישות קדם לפרויקט', labelEn: 'Prerequisites', type: 'textarea', required: false },
  {
    key: 'ganttChart',
    labelHe: 'גאנט',
    labelEn: 'Gantt chart',
    type: 'table',
    required: false,
    tableColumns: [
      { key: 'taskDescription', labelHe: 'תיאור המשימה', labelEn: 'Task description', type: 'text' },
      { key: 'milestoneDescription', labelHe: 'תיאור אבן הדרך', labelEn: 'Milestone description', type: 'text' },
      { key: 'month', labelHe: 'חודש', labelEn: 'Month', type: 'number' },
    ],
  },
  { key: 'risks', labelHe: 'סיכונים בהשגת מטרות הפרויקט', labelEn: 'Risks to achieving the project goals', type: 'textarea', required: false },
  { key: 'riskMitigation', labelHe: 'דרכים להקטנת הסיכונים והתמודדות איתם', labelEn: 'Ways to mitigate the risks', type: 'textarea', required: false },
];

// ─── Project_midterm.docx → progress_report ──────────────────────────────────
const MIDTERM_FIELDS: FormFieldSpec[] = [
  { key: 'submissionDate', labelHe: 'תאריך הגשת דו"ח הביניים', labelEn: 'Progress report submission date', type: 'date', required: true },
  { key: 'studentFullName', labelHe: 'שם מלא', labelEn: 'Full name', type: 'text', required: true },
  { key: 'studentId', labelHe: 'תעודת זהות', labelEn: 'ID number', type: 'text', required: true },
  { key: 'studentPhone', labelHe: 'טלפון', labelEn: 'Phone', type: 'text', required: true },
  { key: 'studentEmail', labelHe: 'דואר אלקטרוני', labelEn: 'Email', type: 'text', required: true },
  { key: 'projectNameHe', labelHe: 'שם הפרויקט (בעברית)', labelEn: 'Project name (Hebrew)', type: 'text', required: true },
  { key: 'projectNameEn', labelHe: 'שם הפרויקט (באנגלית)', labelEn: 'Project name (English)', type: 'text', required: true },
  { key: 'projectPurpose', labelHe: 'מטרת הפרוייקט (כפי שמופיע בהצעת המחקר)', labelEn: 'Project purpose (as stated in the research proposal)', type: 'textarea', required: true },
  { key: 'workPlan', labelHe: 'תוכנית העבודה להתקדמות בפרויקט זה', labelEn: 'Work plan for continuing the project', type: 'textarea', required: true },
  { key: 'resultsAchieved', labelHe: 'תוצאות שהושגו בהתאם להצעת המחקר', labelEn: 'Results achieved per the research proposal', type: 'textarea', required: true },
  { key: 'resultsPending', labelHe: 'תוצאות שעדיין בשלב המחקר', labelEn: 'Results still in progress', type: 'textarea', required: false },
  { key: 'goalChanges', labelHe: 'שינוים ביעדי המחקר (יש לנמק את הסיבה לכל שינוי)', labelEn: 'Changes to the research goals (justify each change)', type: 'textarea', required: false },
  { key: 'bibliography', labelHe: 'ביבליוגרפיה', labelEn: 'Bibliography', type: 'textarea', required: false },
];

// ─── Project_supervisor_evaluation.docx → defense.finalGradeComponents.supervisorEvaluation ──
const SUPERVISOR_EVAL_COMPONENTS: GradingComponentSpec[] = [
  { key: 'specDefinition', labelHe: 'הגדרת המפרט/שאלת המחקר ותכנית עבודה מפורטת', labelEn: 'Defining the spec/research question and detailed work plan', maxScore: 10, weight: 10, hasComment: true, visibleToStudent: true },
  { key: 'problemHandling', labelHe: 'איתור בעיות ויכולת התמודדות איתן (עצמאות, יוזמה, רצינות ומקוריות)', labelEn: 'Identifying problems and ability to handle them (independence, initiative, seriousness, originality)', maxScore: 20, weight: 20, hasComment: true, visibleToStudent: true },
  { key: 'meetingDeadlines', labelHe: 'עמידה בלו"ז וביעדים שהוגדרו (דו"ח ביניים)', labelEn: 'Meeting the schedule and defined goals (progress report)', maxScore: 10, weight: 10, hasComment: true, visibleToStudent: true },
  { key: 'deliverableQuality', labelHe: 'עמידת התוצר בדרישות התכנון (בהתאם למפרט) ומענה יסודי על שאלות המחקר', labelEn: 'Deliverable meeting the plan requirements (per spec) and thoroughly answering the research questions', maxScore: 20, weight: 20, hasComment: true, visibleToStudent: true },
  { key: 'writingLevel', labelHe: 'רמת עבודת הגמר המסכמת, כולל רמת הכתיבה הטכנית', labelEn: 'Level of the final written project, including technical writing level', maxScore: 30, weight: 30, hasComment: true, visibleToStudent: true },
  { key: 'overallOriginality', labelHe: 'הערכה כללית - מקוריות וחדשנות', labelEn: 'Overall — originality and innovation', maxScore: 2, weight: 2, hasComment: true, visibleToStudent: true },
  { key: 'overallScope', labelHe: 'הערכה כללית - היקף', labelEn: 'Overall — scope', maxScore: 2, weight: 2, hasComment: true, visibleToStudent: true },
  { key: 'overallInitiative', labelHe: 'הערכה כללית - יוזמה אישית', labelEn: 'Overall — personal initiative', maxScore: 1, weight: 1, hasComment: true, visibleToStudent: true },
  { key: 'overallPublicationPotential', labelHe: 'הערכה כללית - פוטנציאל פרסום מאמר או רישום פטנט', labelEn: 'Overall — potential for a paper or patent', maxScore: 5, weight: 5, hasComment: true, visibleToStudent: true },
];

// ─── Project_examiner.docx → defense.finalGradeComponents.examinerProjectEvaluation ──
const EXAMINER_PROJECT_COMPONENTS: GradingComponentSpec[] = [
  { key: 'specDefinition', labelHe: 'הגדרת המפרט/שאלת המחקר ותכנית עבודה מפורטת', labelEn: 'Defining the spec/research question and detailed work plan', maxScore: 10, weight: 10, hasComment: true, visibleToStudent: true },
  { key: 'deliverableQuality', labelHe: 'עמידת התוצר בדרישות התכנון (בהתאם למפרט) ומענה יסודי על שאלות המחקר', labelEn: 'Deliverable meeting the plan requirements (per spec) and thoroughly answering the research questions', maxScore: 50, weight: 50, hasComment: true, visibleToStudent: true },
  { key: 'writingLevel', labelHe: 'רמת עבודת הגמר המסכמת, כולל רמת הכתיבה הטכנית', labelEn: 'Level of the final written project, including technical writing level', maxScore: 30, weight: 30, hasComment: true, visibleToStudent: true },
  { key: 'overallOriginality', labelHe: 'הערכה כללית - מקוריות וחדשנות', labelEn: 'Overall — originality and innovation', maxScore: 5, weight: 5, hasComment: true, visibleToStudent: true },
  { key: 'overallPublicationPotential', labelHe: 'הערכה כללית - פוטנציאל פרסום מאמר או רישום פטנט', labelEn: 'Overall — potential for a paper or patent', maxScore: 5, weight: 5, hasComment: true, visibleToStudent: true },
];

// ─── Project_defence_slides.docx → defense.finalGradeComponents.examinerDefenseEvaluation ──
const EXAMINER_DEFENSE_COMPONENTS: GradingComponentSpec[] = [
  { key: 'presentationQuality', labelHe: 'איכות המצגת ובהירות ההצגה', labelEn: 'Presentation quality and clarity', maxScore: 50, weight: 50, hasComment: true, visibleToStudent: true },
  { key: 'answeringQuestions', labelHe: 'מענה לשאלות הבוחנים', labelEn: "Answering the examiners' questions", maxScore: 50, weight: 50, hasComment: true, visibleToStudent: true },
];

// ─── New — no source document; placeholder plumbing only ────────────────────
const POSTER_PLACEHOLDER_COMPONENTS: GradingComponentSpec[] = [
  {
    key: 'posterQuality',
    labelHe: 'איכות הפוסטר וההצגה (טרם הוגדר — יש לערוך בעורך התבניות)',
    labelEn: 'Poster quality and presentation (placeholder — edit via the workflow-templates editor)',
    maxScore: 100,
    weight: 100,
    hasComment: true,
    visibleToStudent: true,
  },
];

const MILESTONES: WorkflowMilestoneSpec[] = [
  {
    type: 'research_proposal',
    nameHe: 'הצעת מחקר',
    nameEn: 'Research Proposal',
    order: 1,
    dueDaysFromStart: 30,
    requiresExaminers: false,
    staffRecordMode: 'upload_or_form',
    staffFormFields: PROPOSAL_FIELDS,
    percentOfFinalGrade: 0,
  },
  {
    type: 'progress_report',
    nameHe: 'דו"ח התקדמות',
    nameEn: 'Progress Report',
    order: 2,
    dueDaysFromStart: 120,
    requiresExaminers: false,
    staffRecordMode: 'upload_or_form',
    staffFormFields: MIDTERM_FIELDS,
    percentOfFinalGrade: 0,
  },
  {
    type: 'defense',
    nameHe: 'בחינת הגנה',
    nameEn: 'Defense Exam',
    order: 3,
    dueDaysFromStart: 240,
    requiresExaminers: true,
    examinerCount: 2,
    percentOfFinalGrade: 0,
    finalGradeComponents: {
      // 40/30/30 matches MilestoneRowModal.tsx's own editor default — none of
      // the source documents specify a real cross-rubric split, so this is a
      // clearly-flagged placeholder pending a real decision from staff.
      supervisorEvaluation: { components: SUPERVISOR_EVAL_COMPONENTS, weight: 40 },
      examinerProjectEvaluation: { components: EXAMINER_PROJECT_COMPONENTS, weight: 30 },
      examinerDefenseEvaluation: { components: EXAMINER_DEFENSE_COMPONENTS, weight: 30 },
    },
  },
  {
    type: 'poster',
    nameHe: 'פוסטר',
    nameEn: 'Poster Session',
    order: 4,
    dueDaysFromStart: 260,
    requiresExaminers: true,
    examinerCount: 1,
    percentOfFinalGrade: 0,
    // Examiner-only chain — no supervisor stage at all, per the department's
    // requirement that poster forms are submitted solely by the examiner,
    // then signed off by the coordinator.
    routing: [
      { id: 'examiner_grade', role: 'examiner', action: 'grade', rejectTo: 'student' },
      { id: 'coordinator_approve', role: 'coordinator', action: 'approve', rejectTo: 'student' },
    ],
    gradingComponents: POSTER_PLACEHOLDER_COMPONENTS,
  },
];

async function main() {
  console.log('Proposed Data Science (msc_project) workflow template:\n');
  console.log(JSON.stringify(MILESTONES, null, 2));

  if (!APPLY) {
    console.log('\nDry run only — re-run with --apply to actually propose and approve this version.');
    return;
  }

  const { id } = await proposeWorkflowTemplate({
    facultyId: 'data_science',
    processType: 'msc_project',
    major: null,
    milestones: MILESTONES,
    createdBy: SEED_ACTOR,
    note: 'Seeded from the department\'s real paper forms (Project_proposal/Project_midterm/Project_supervisor_evaluation/Project_examiner/Project_defence_slides/Project_final_grade) plus a new placeholder Poster milestone.',
    applyMode: 'from_now_on',
  });
  console.log(`\nProposed template ${id}.`);

  await approveWorkflowTemplate(id, SEED_ACTOR);
  console.log(`Approved template ${id} — now active for data_science/msc_project (all majors).`);
}

main().catch((err) => {
  console.error('seedDataScienceWorkflowTemplate failed:', err);
  process.exit(1);
});
