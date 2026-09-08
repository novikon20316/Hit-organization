// src/scripts/seedElectricalMscThesisWorkflowTemplate.ts
//
// One-off: proposes + approves a BASE workflowTemplates version for
// (facultyId: 'electrical', processType: 'msc_thesis',
// major: 'electrical_engineering') — no approved template exists for this
// faculty/process/major yet (confirmed via findApprovedTemplateId), which
// means resolveWorkflowTemplateRefs (projectController.ts's
// createAdminProject/createSupervisorProject) currently HARD-BLOCKS creating
// any new Electrical Engineering M.Sc.-with-Thesis project — there is
// nothing to "fall back to" the way enrollment's own DEFAULT_MILESTONES
// fallback works elsewhere.
//
// This seeds the same 4 stock milestones as workflowTemplates.ts's own
// DEFAULT_MILESTONES, verbatim (same types/names/order/dueDaysFromStart) —
// i.e. this is a pure "make the implicit default explicit and creatable"
// step, not a new milestone roadmap design. Only research_proposal's routing
// then gets customized, by the follow-up script
// addElectricalResearchProposalStaffChain.ts (run this one FIRST).
//
// SAFE BY DEFAULT: dry run (prints the full document, writes nothing) unless
// you pass --apply. Always run without --apply first and read the output.
//
// Usage (from server/):
//   npx tsx src/scripts/seedElectricalMscThesisWorkflowTemplate.ts             # dry run
//   npx tsx src/scripts/seedElectricalMscThesisWorkflowTemplate.ts --apply     # actually writes

import {
  proposeWorkflowTemplate,
  approveWorkflowTemplate,
  findApprovedTemplateId,
  DEFAULT_MILESTONES,
  type WorkflowMilestoneSpec,
} from '../services/workflowTemplates.js';

const APPLY = process.argv.includes('--apply');
const SEED_ACTOR = 'system-seed-script:seedElectricalMscThesisWorkflowTemplate';
const FACULTY_ID = 'electrical';
const PROCESS_TYPE = 'msc_thesis' as const;
const MAJOR = 'electrical_engineering';

// Verbatim copy of DEFAULT_MILESTONES — see file header. A fresh array/object
// per milestone so this template owns its own independent snapshot, not a
// shared reference to the module-level constant.
const MILESTONES: WorkflowMilestoneSpec[] = DEFAULT_MILESTONES.map((m) => ({ ...m }));

async function main() {
  const existing = await findApprovedTemplateId(FACULTY_ID, PROCESS_TYPE, MAJOR);
  if (existing) {
    console.error(
      `An approved template already exists for ${FACULTY_ID}/${PROCESS_TYPE}/major=${MAJOR} (id: ${existing.id}) — this script only seeds a BASE template where none exists. ` +
      `If you meant to add the research-proposal staff chain, run addElectricalResearchProposalStaffChain.ts instead.`
    );
    process.exit(1);
  }

  console.log(`Proposed base template for ${FACULTY_ID}/${PROCESS_TYPE}/${MAJOR} (DEFAULT_MILESTONES, verbatim):\n`);
  console.log(JSON.stringify(MILESTONES, null, 2));

  if (!APPLY) {
    console.log('\nDry run only — re-run with --apply to actually propose and approve this version.');
    return;
  }

  const { id } = await proposeWorkflowTemplate({
    facultyId: FACULTY_ID,
    processType: PROCESS_TYPE,
    major: MAJOR,
    milestones: MILESTONES,
    createdBy: SEED_ACTOR,
    note: 'Base template for Electrical & Electronics Engineering M.Sc.-with-Thesis — the 4 stock DEFAULT_MILESTONES, made explicit/creatable so a follow-up script can customize research_proposal\'s routing.',
    applyMode: 'from_now_on',
  });
  console.log(`\nProposed template ${id}.`);

  await approveWorkflowTemplate(id, SEED_ACTOR);
  console.log(`Approved template ${id}.`);

  const resolved = await findApprovedTemplateId(FACULTY_ID, PROCESS_TYPE, MAJOR);
  if (resolved?.id === id) {
    console.log(`Self-check passed: findApprovedTemplateId('${FACULTY_ID}', '${PROCESS_TYPE}', '${MAJOR}') resolves to ${id}.`);
  } else {
    console.error(`Self-check FAILED: findApprovedTemplateId resolved to ${resolved?.id ?? 'null'}, expected ${id}. Investigate before relying on this template.`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('seedElectricalMscThesisWorkflowTemplate failed:', err);
  process.exit(1);
});
