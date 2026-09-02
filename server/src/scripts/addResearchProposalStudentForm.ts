// src/scripts/addResearchProposalStudentForm.ts
//
// Adds a STUDENT-facing online form to data_science/msc_project's
// research_proposal milestone (digitizing Project_proposal.docx as something
// the student fills, not just the supervisor's supplementary staffRecord —
// see seedDataScienceWorkflowTemplate.ts, whose staffFormFields for this
// milestone this script deliberately does NOT touch or replace) and switches
// that milestone's approval chain so the supervisor SIGNS OFF (action:
// 'approve') instead of numerically GRADING it — the rest of the template
// (progress_report/defense/poster) is carried over unchanged from whatever is
// currently approved.
//
// Per-student fields (name/ID/phone/email/photo/accumulated credits) are
// DELIBERATELY NOT listed in studentFormFields below — for a team project the
// paper form repeats that whole block once per student, which doesn't fit a
// flat FormFieldSpec list. The client resolves and renders one such block per
// milestone.studentIds entry, straight from each teammate's own profile (see
// ResearchProposalFormModal.tsx) — studentFormFields only covers the fields
// the team fills ONCE, together.
//
// SAFE BY DEFAULT: dry run (prints the full new milestone list, writes
// nothing) unless you pass --apply. Always run without --apply first.
//
// Usage (from server/):
//   npx tsx src/scripts/addResearchProposalStudentForm.ts             # dry run
//   npx tsx src/scripts/addResearchProposalStudentForm.ts --apply     # actually writes

import {
  findApprovedTemplateId,
  proposeWorkflowTemplate,
  approveWorkflowTemplate,
  type WorkflowMilestoneSpec,
  type FormFieldSpec,
} from '../services/workflowTemplates.js';

const APPLY = process.argv.includes('--apply');
const SEED_ACTOR = 'system-seed-script:addResearchProposalStudentForm';
const FACULTY_ID = 'data_science';
const PROCESS_TYPE = 'msc_project' as const;
const MAJOR = null;

// The fields the team fills in TOGETHER, once — everything else on the paper
// form (name/ID/phone/email/photo/נ"ז) is per-student and rendered separately
// (see file header). supervisorName/submissionDate are locked+autoFill,
// resolved server-side, never typed by the student.
const PROPOSAL_STUDENT_FIELDS: FormFieldSpec[] = [
  { key: 'submissionDate', labelHe: 'תאריך הגשה ראשוני', labelEn: 'Initial submission date', type: 'date', required: true, autoFill: 'submissionDate', locked: true },
  { key: 'supervisorName', labelHe: 'שם המנחה', labelEn: "Supervisor's name", type: 'text', required: true, autoFill: 'supervisorName', locked: true },
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

async function main() {
  const current = await findApprovedTemplateId(FACULTY_ID, PROCESS_TYPE, MAJOR);
  if (!current) {
    console.error(`No approved template found for ${FACULTY_ID}/${PROCESS_TYPE}/major=${MAJOR} — run seedDataScienceWorkflowTemplate.ts first.`);
    process.exit(1);
  }

  const milestones: WorkflowMilestoneSpec[] = current.milestones.map((m) => {
    if (m.type !== 'research_proposal') return m;
    return {
      ...m,
      studentFormFields: PROPOSAL_STUDENT_FIELDS,
      // The supervisor now signs off (pure approve), not grade — the
      // template's own DEFAULT_ROUTING (grade → approve) is what this
      // milestone silently inherited before, since it had no routing of its
      // own. coordinator's stage stays 'approve' — see
      // coordinatorApproveMilestone/approveChainMilestone's new
      // `recommendation` param for the tri-state
      // approved/approved_conditionally/rejected UI layered on top of this
      // same stage.
      routing: [
        { id: 'supervisor_sign', role: 'supervisor' as const, action: 'approve' as const, rejectTo: 'student' as const },
        { id: 'coordinator_sign', role: 'coordinator' as const, action: 'approve' as const, rejectTo: 'student' as const },
      ],
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
    note: 'Added a student-facing online form + supervisor sign-off (was grade) to research_proposal, digitizing Project_proposal.docx as the student\'s own submission instead of only a supervisor staffRecord.',
    // New enrollments only — an already-created research_proposal milestone
    // doc for a student mid-flight keeps its own snapshotted (old,
    // grade-based) routing and has no studentFormFields at all; it is NOT
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
  console.log(`Approved template ${id} — now active for ${FACULTY_ID}/${PROCESS_TYPE} (all majors).`);
}

main().catch((err) => {
  console.error('addResearchProposalStudentForm failed:', err);
  process.exit(1);
});
