// src/scripts/addElectricalMscProjectEvaluationForm.ts
//
// Digitizes Electrical & Electronics Engineering's "טופס הערכת פרויקט גמר-
// תואר שני" (2026-2027 version) on the electrical/msc_project template. The
// paper form covers two of the template's milestones, which stay separate
// (each keeps its own student submission, due date, graders and approval —
// the faculty's choice), joined into one online form via a shared
// finalGradeComponents.formGroup:
//
//   ספר הפרויקט (40%)            מנחה 20%  ·  בוחן I 10%  ·  בוחן II 10%
//     (the supervisor grades the book on its own milestone — "הערכת ספר
//     פרויקט / מנחה"; the examiners grade it at the presentation session —
//     the paper form's "ספר" row, "מנחה אינו מעריך ספר בשלב זה")
//   מצגת הפרויקט וההגנה (50%)    מנחה 30%  ·  בוחן I 10%  ·  בוחן II 10%
//   דו"ח ביניים (10%) is graded on its own milestone as before and only
//   shown on the form (its existing M.Sc. staff form is untouched).
//
// Each component is a 0-100 score; per milestone the supervisor's and the
// examiners' (averaged) shares are 50/50 for the book and 60/40 for the
// presentation, so book 85 / examiners 80+90 contributes 17+8+9 = 34 points,
// exactly as on paper. Scored per student (finalGradeComponents.perStudent)
// and digitally signed — see evaluationFormController.ts.
//
// Also on those two milestones:
//   - the panel is 2 examiners (the faculty's "3 examiners" counts the
//     supervisor, who isn't an examiner slot in this system) — the
//     presentation milestone used to say 3;
//   - their pre-check chain becomes supervisor approve → coordinator approve
//     (instead of the template default's supervisor GRADE, whose score
//     would otherwise become the milestone's final grade on its own).
//
// SAFE BY DEFAULT: dry run unless you pass --apply. New enrollments only
// (applyMode 'from_now_on') — projects already in progress keep their
// current milestones.
//
// Usage (from server/):
//   npx tsx src/scripts/addElectricalMscProjectEvaluationForm.ts           # dry run
//   npx tsx src/scripts/addElectricalMscProjectEvaluationForm.ts --apply   # writes

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
const SEED_ACTOR = 'system-seed-script:addElectricalMscProjectEvaluationForm';
const FACULTY_ID = 'electrical';
const PROCESS_TYPE = 'msc_project' as const;
const MAJOR = 'electrical_engineering';

// The two milestone types on the current approved template.
const BOOK_TYPE = 'custom_qztptx0x';          // ספר הפרויקט (40%)
const PRESENTATION_TYPE = 'custom_2m4cylbo';  // מצגת הפרויקט וההגנה (50%)
const FORM_GROUP = 'electrical_msc_project_final';

const PRECHECK: MilestoneRoutingSpec = [
  { id: 'supervisor_ready', role: 'supervisor', action: 'approve', rejectTo: 'student' },
  { id: 'coordinator_ready', role: 'coordinator', action: 'approve', rejectTo: 'student' },
];

const score = (key: string, labelHe: string, labelEn: string): GradingComponentSpec => ({
  key, labelHe, labelEn, maxScore: 100, weight: 100, hasComment: false, visibleToStudent: false,
});

const HEADER_FIELDS: FormFieldSpec[] = [
  { key: 'academicYear', labelHe: 'שנת לימודים', labelEn: 'Academic year', type: 'text', required: false, autoFill: 'academicYear', locked: true },
  { key: 'examDate', labelHe: 'מועד הבחינה', labelEn: 'Exam date', type: 'date', required: false, autoFill: 'defenseDate', locked: true },
  { key: 'studentName', labelHe: 'שם הסטודנט/ית', labelEn: 'Student', type: 'text', required: false, autoFill: 'studentName', locked: true },
  { key: 'supervisors', labelHe: 'שם המנחה/ים', labelEn: 'Supervisor(s)', type: 'text', required: false, autoFill: 'supervisorNames', locked: true },
  { key: 'examiners', labelHe: 'שמות הבוחנים', labelEn: 'Examiners', type: 'text', required: false, autoFill: 'examinerNames', locked: true },
  { key: 'projectName', labelHe: 'נושא הפרויקט', labelEn: 'Project topic', type: 'text', required: false, autoFill: 'projectNameHe', locked: true },
];

const SHARED = {
  perStudent: true,
  formGroup: FORM_GROUP,
  totalsDisplay: 'weighted' as const,
  formTitleHe: 'טופס הערכת פרויקט גמר — תואר שני',
  formTitleEn: 'Final Project Evaluation Form — M.Sc.',
  headerFields: HEADER_FIELDS,
  examinerLabels: [{ he: 'בוחן I', en: 'Examiner I' }, { he: 'בוחן II', en: 'Examiner II' }],
};

const BOOK_FGC: NonNullable<WorkflowMilestoneSpec['finalGradeComponents']> = {
  supervisorEvaluation: { components: [score('book_supervisor', 'הערכת ספר פרויקט', 'Project book evaluation')], weight: 50 },
  examinerProjectEvaluation: { components: [score('book_examiner', 'ספר', 'Project book')], weight: 50 },
  examinerDefenseEvaluation: { components: [], weight: 0 },
  ...SHARED,
};

const PRESENTATION_FGC: NonNullable<WorkflowMilestoneSpec['finalGradeComponents']> = {
  supervisorEvaluation: { components: [score('presentation_supervisor', 'הערכת מצגת הפרויקט וההגנה', 'Project presentation and defense')], weight: 60 },
  examinerProjectEvaluation: { components: [], weight: 0 },
  examinerDefenseEvaluation: { components: [score('presentation_examiner', 'הערכת מצגת הפרויקט וההגנה', 'Project presentation and defense')], weight: 40 },
  ...SHARED,
};

async function main() {
  const current = await findApprovedTemplateId(FACULTY_ID, PROCESS_TYPE, MAJOR);
  if (!current) {
    console.error(`No approved ${FACULTY_ID}/${PROCESS_TYPE}/major=${MAJOR} template found.`);
    process.exit(1);
  }
  const book = current.milestones.find((m) => m.type === BOOK_TYPE);
  const presentation = current.milestones.find((m) => m.type === PRESENTATION_TYPE);
  if (!book || !presentation) {
    console.error(`Expected milestones ${BOOK_TYPE} (book) and ${PRESENTATION_TYPE} (presentation) on template ${current.id} — found: ${current.milestones.map((m) => `${m.type}(${m.nameHe})`).join(', ')}. Investigate before proceeding.`);
    process.exit(1);
  }
  if ((book.percentOfFinalGrade ?? 0) !== 40 || (presentation.percentOfFinalGrade ?? 0) !== 50) {
    console.error(`Expected book 40% / presentation 50%, found ${book.percentOfFinalGrade}% / ${presentation.percentOfFinalGrade}%. The form's weights assume those — investigate first.`);
    process.exit(1);
  }

  const milestones: WorkflowMilestoneSpec[] = current.milestones.map((m) => {
    if (m.type === BOOK_TYPE) return { ...m, requiresExaminers: true, examinerCount: 2, routing: PRECHECK, finalGradeComponents: BOOK_FGC };
    if (m.type === PRESENTATION_TYPE) return { ...m, requiresExaminers: true, examinerCount: 2, routing: PRECHECK, finalGradeComponents: PRESENTATION_FGC };
    return m;
  });

  console.log(`Current template: ${current.id}`);
  console.log(JSON.stringify(milestones.filter((m) => m.type === BOOK_TYPE || m.type === PRESENTATION_TYPE), null, 2));

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
    note: 'Digitized the M.Sc. final-project evaluation form (2026-2027) across the project-book and presentation milestones: per-student scores, digital signatures, 2 examiners.',
    applyMode: 'from_now_on',
    ...(current.defaultRouting ? { defaultRouting: current.defaultRouting } : {}),
    ...(current.examinerSignoffRole ? { examinerSignoffRole: current.examinerSignoffRole } : {}),
    ...(current.finalGradeSignoffRole ? { finalGradeSignoffRole: current.finalGradeSignoffRole } : {}),
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

main().catch((err) => {
  console.error('addElectricalMscProjectEvaluationForm failed:', err);
  process.exit(1);
});
