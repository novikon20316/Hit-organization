// src/scripts/setElectricalFinalGradeSignoffRole.ts
//
// Points the Electrical B.Sc. and M.Sc. project templates' final-grade
// sign-off at the administrative coordinator (administrative_secretary) —
// the faculty's rule ("the administrative coordinator approves the final
// grade"). Both had 'coordinator', which resolves to the literal
// 'coordinator' role: the grade-approval queue lives on the administrative
// coordinator's dashboard, so the real approver was refused (403) unless she
// held an approve_grades grant, and the approval notifications went to the
// wrong people. resolveFinalGradeSignoffRole reads the current approved
// template live, so this applies to projects already in progress too.
//
// A new template version per subject (milestones unchanged, applyMode
// 'from_now_on'). SAFE BY DEFAULT: dry run unless you pass --apply.
//
// Usage (from server/):
//   npx tsx src/scripts/setElectricalFinalGradeSignoffRole.ts           # dry run
//   npx tsx src/scripts/setElectricalFinalGradeSignoffRole.ts --apply   # writes

import { findApprovedTemplateId, proposeWorkflowTemplate, approveWorkflowTemplate, type ProcessType } from '../services/workflowTemplates.js';

const APPLY = process.argv.includes('--apply');
const SEED_ACTOR = 'system-seed-script:setElectricalFinalGradeSignoffRole';
const FACULTY_ID = 'electrical';
const MAJOR = 'electrical_engineering';
const TARGET = 'administrative_secretary' as const;

async function main() {
  for (const processType of ['bsc_project', 'msc_project'] as ProcessType[]) {
    const current = await findApprovedTemplateId(FACULTY_ID, processType, MAJOR);
    if (!current) {
      console.log(`${processType}: no approved template — skipped.`);
      continue;
    }
    if (current.finalGradeSignoffRole === TARGET) {
      console.log(`${processType}: already ${TARGET} (template ${current.id}) — nothing to do.`);
      continue;
    }
    console.log(`${processType}: template ${current.id} finalGradeSignoffRole ${current.finalGradeSignoffRole ?? 'default'} → ${TARGET}`);
    if (!APPLY) continue;
    const { id } = await proposeWorkflowTemplate({
      facultyId: FACULTY_ID,
      processType,
      major: MAJOR,
      milestones: current.milestones,
      createdBy: SEED_ACTOR,
      note: 'Final-grade sign-off by the administrative coordinator (faculty rule).',
      applyMode: 'from_now_on',
      ...(current.defaultRouting ? { defaultRouting: current.defaultRouting } : {}),
      ...(current.examinerSignoffRole ? { examinerSignoffRole: current.examinerSignoffRole } : {}),
      finalGradeSignoffRole: TARGET,
      ...(current.finalReportSignatureRoles ? { finalReportSignatureRoles: current.finalReportSignatureRoles } : {}),
      ...(current.firstStepMode ? { firstStepMode: current.firstStepMode } : {}),
      ...(current.supervisorSelectionRequiresApproval != null ? { supervisorSelectionRequiresApproval: current.supervisorSelectionRequiresApproval } : {}),
    });
    await approveWorkflowTemplate(id, SEED_ACTOR);
    const resolved = await findApprovedTemplateId(FACULTY_ID, processType, MAJOR);
    console.log(resolved?.id === id ? `  approved ${id} — self-check passed.` : `  self-check FAILED: resolved to ${resolved?.id ?? 'null'}, expected ${id}.`);
  }
  if (!APPLY) console.log('\nDry run only — re-run with --apply to write.');
}

main().then(() => process.exit(0)).catch((err) => {
  console.error('setElectricalFinalGradeSignoffRole failed:', err);
  process.exit(1);
});
