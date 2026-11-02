// src/scripts/updateElectricalEvaluationForms.ts
//
// Electrical & Electronics Engineering's evaluation forms, per the faculty's
// 2026-11-02 instructions and the latest "טופס הערכת פרויקט גמר- תואר שני":
//
// Who signs (all three then go to the administrative coordinator for final
// approval, which closes the project — see projectCompletion.ts):
//   B.Sc.          supervisor, 2 examiners
//   M.Sc. project  supervisor, 2 examiners, coordinator
//   M.Sc. thesis   2 examiners (their opinions), supervisor, head of school
//
// M.Sc. project grade structure:
//   דו"ח ביניים        10%  supervisor, 0-100, on its own milestone
//   ספר הפרויקט        20%  supervisor, 0-100, on its own milestone
//   מצגת הפרויקט וההגנה 70%  the last milestone, type 'defense':
//     presentation     supervisor 30%, examiner I 10%, examiner II 10%
//     book             examiner I 10%, examiner II 10%
// so the form the graders see lives on the last milestone alone, which also
// gives it defense-date matching and final-grade handling. The book milestone
// no longer has examiners. Rubric weights are the exact shares of that 70%.
//
// SAFE BY DEFAULT: dry run unless you pass --apply. New enrollments only
// (applyMode 'from_now_on'); run syncElectricalTestProjectsToTemplates.ts
// afterwards for the existing test projects. Deploy the server first.
//
// Usage (from server/):
//   npx tsx src/scripts/updateElectricalEvaluationForms.ts                      # dry run
//   npx tsx src/scripts/updateElectricalEvaluationForms.ts --apply              # writes
//   npx tsx src/scripts/updateElectricalEvaluationForms.ts --head=program_head  # which role is the head of school

import {
  findApprovedTemplateId,
  proposeWorkflowTemplate,
  approveWorkflowTemplate,
  type ChainRole,
  type FormFieldSpec,
  type GradingComponentSpec,
  type MilestoneRoutingSpec,
  type ProcessType,
  type WorkflowMilestoneSpec,
} from '../services/workflowTemplates.js';
import { resolveStaffForScope } from '../services/scopeAuthorization.js';

const APPLY = process.argv.includes('--apply');
const HEAD_OF_SCHOOL = (process.argv.find((a) => a.startsWith('--head='))?.slice('--head='.length) ?? 'school_head') as ChainRole;
const SEED_ACTOR = 'system-seed-script:updateElectricalEvaluationForms';
const FACULTY_ID = 'electrical';
const MAJOR = 'electrical_engineering';

const BOOK_TYPE = 'custom_qztptx0x';
const OLD_PRESENTATION_TYPE = 'custom_2m4cylbo';

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

const PRESENTATION_LABEL = ['הערכת מצגת הפרויקט וההגנה', 'Project presentation and defense'] as const;

const MSC_PROJECT_FORM: NonNullable<WorkflowMilestoneSpec['finalGradeComponents']> = {
  supervisorEvaluation: { components: [score('presentation_supervisor', ...PRESENTATION_LABEL)], weight: (30 / 70) * 100 },
  examinerDefenseEvaluation: { components: [score('presentation_examiner', ...PRESENTATION_LABEL)], weight: (20 / 70) * 100 },
  examinerProjectEvaluation: { components: [score('book_examiner', 'ספר', 'Project book')], weight: (20 / 70) * 100 },
  perStudent: true,
  totalsDisplay: 'weighted',
  formLayout: 'graderColumns',
  gradeDecimals: 2,
  formTitleHe: 'טופס הערכת פרויקט גמר — תואר שני',
  formTitleEn: 'Final Project Evaluation Form — M.Sc.',
  headerFields: HEADER_FIELDS,
  examinerLabels: [{ he: 'בוחן I', en: 'Examiner I' }, { he: 'בוחן II', en: 'Examiner II' }],
  formSignoffRoles: ['coordinator'],
};

function mscProjectMilestones(milestones: WorkflowMilestoneSpec[]): WorkflowMilestoneSpec[] {
  const book = milestones.find((m) => m.type === BOOK_TYPE);
  const last = milestones.find((m) => m.type === OLD_PRESENTATION_TYPE);
  if (!book || !last) throw new Error(`Expected milestones ${BOOK_TYPE} and ${OLD_PRESENTATION_TYPE}; found ${milestones.map((m) => m.type).join(', ')}. Already updated?`);
  return milestones.map((m) => {
    if (m.type === BOOK_TYPE) {
      const { finalGradeComponents: _form, routing: _routing, examinerCount: _count, ...plain } = m;
      return { ...plain, requiresExaminers: false, percentOfFinalGrade: 20 };
    }
    if (m.type === OLD_PRESENTATION_TYPE) {
      return { ...m, type: 'defense', requiresExaminers: true, examinerCount: 2, routing: PRECHECK, percentOfFinalGrade: 70, finalGradeComponents: MSC_PROJECT_FORM };
    }
    return m;
  });
}

function mscThesisMilestones(milestones: WorkflowMilestoneSpec[]): WorkflowMilestoneSpec[] {
  return milestones.map((m) => (m.examinerOpinionForm
    ? { ...m, examinerOpinionForm: { ...m.examinerOpinionForm, formSignoffRoles: ['supervisor', HEAD_OF_SCHOOL] as ChainRole[] } }
    : m));
}

const UPDATES: Array<{ processType: ProcessType; reportRoles: ChainRole[]; note: string; milestones: (m: WorkflowMilestoneSpec[]) => WorkflowMilestoneSpec[] }> = [
  {
    processType: 'bsc_project',
    reportRoles: ['supervisor', 'administrative_secretary'],
    note: 'B.Sc. form: no coordinator signature (supervisor and examiners sign, then the administrative coordinator approves).',
    milestones: (m) => m,
  },
  {
    processType: 'msc_project',
    reportRoles: ['supervisor', 'coordinator', 'administrative_secretary'],
    note: 'M.Sc. project form rebuilt on the last milestone (interim 10, book 20, last milestone 70); coordinator signs the form.',
    milestones: mscProjectMilestones,
  },
  {
    processType: 'msc_thesis',
    reportRoles: ['supervisor', HEAD_OF_SCHOOL, 'administrative_secretary'],
    note: 'M.Sc. thesis form: supervisor and head of school sign before the administrative coordinator approves.',
    milestones: mscThesisMilestones,
  },
];

async function main() {
  // A thesis form can't complete if nobody holds the role that has to sign it.
  const heads = await resolveStaffForScope(HEAD_OF_SCHOOL, { facultyId: FACULTY_ID, major: MAJOR, degreeLevel: 'masters', processType: 'thesis' }, [], [], false);
  console.log(`Head of school role: ${HEAD_OF_SCHOOL} — ${heads.length} account(s) in scope.`);
  if (heads.length === 0) console.warn(`⚠️ Nobody holds ${HEAD_OF_SCHOOL} for Electrical: thesis forms will wait for that signature until someone does.`);

  for (const update of UPDATES) {
    const current = await findApprovedTemplateId(FACULTY_ID, update.processType, MAJOR);
    if (!current) throw new Error(`No approved ${FACULTY_ID}/${update.processType}/major=${MAJOR} template.`);
    const milestones = update.milestones(current.milestones);
    const total = milestones.reduce((sum, m) => sum + (m.percentOfFinalGrade ?? 0), 0);
    if (Math.abs(total - 100) > 0.01) throw new Error(`${update.processType}: milestone percents sum to ${total}.`);

    console.log(`\n${update.processType}: template ${current.id} (final sign-off: ${current.finalGradeSignoffRole ?? 'default'}) → report roles ${update.reportRoles.join(', ')}`);
    for (const m of [...milestones].sort((a, b) => a.order - b.order)) {
      console.log(`  ${m.order}. ${m.type} "${m.nameHe}" ${m.percentOfFinalGrade ?? 0}%${m.requiresExaminers ? ` · ${m.examinerCount} examiners` : ''}${m.finalGradeComponents ? ' · form' : ''}${m.examinerOpinionForm?.formSignoffRoles ? ` · signs: ${m.examinerOpinionForm.formSignoffRoles.join(', ')}` : ''}${m.finalGradeComponents?.formSignoffRoles ? ` · signs: ${m.finalGradeComponents.formSignoffRoles.join(', ')}` : ''}`);
    }
    if (!APPLY) continue;

    const { id } = await proposeWorkflowTemplate({
      facultyId: FACULTY_ID,
      processType: update.processType,
      major: MAJOR,
      milestones,
      createdBy: SEED_ACTOR,
      note: update.note,
      applyMode: 'from_now_on',
      finalReportSignatureRoles: update.reportRoles,
      ...(current.defaultRouting ? { defaultRouting: current.defaultRouting } : {}),
      ...(current.examinerSignoffRole ? { examinerSignoffRole: current.examinerSignoffRole } : {}),
      ...(current.finalGradeSignoffRole ? { finalGradeSignoffRole: current.finalGradeSignoffRole } : {}),
      ...(current.firstStepMode ? { firstStepMode: current.firstStepMode } : {}),
      ...(current.supervisorSelectionRequiresApproval != null ? { supervisorSelectionRequiresApproval: current.supervisorSelectionRequiresApproval } : {}),
    });
    await approveWorkflowTemplate(id, SEED_ACTOR);
    const resolved = await findApprovedTemplateId(FACULTY_ID, update.processType, MAJOR);
    if (resolved?.id !== id) throw new Error(`Self-check failed: ${update.processType} resolved to ${resolved?.id ?? 'null'}, expected ${id}.`);
    console.log(`  ✓ approved as ${id}`);
  }
  if (!APPLY) console.log('\nDry run only — re-run with --apply to propose and approve these versions.');
}

main().then(() => process.exit(0)).catch((err) => {
  console.error('updateElectricalEvaluationForms failed:', err);
  process.exit(1);
});
