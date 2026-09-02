// One-off: retires the stale, duplicate data_science/msc_project workflow
// template (id Pf9rGWMniZ4XnIbbh0Bv, major: "data_science", approved
// 2026-08-07) by marking it 'superseded'.
//
// Why: findApprovedTemplateId(facultyId, processType, major) tries the exact
// major match FIRST and returns immediately if found — it only falls back to
// the major:null ("whole faculty") template when no exact match exists. A
// second, unrelated "approved" template for the SAME (facultyId,
// processType) but major:null was created later (by
// seedDataScienceWorkflowTemplate.ts / addResearchProposalStudentForm.ts /
// addProgressReportStudentForm.ts) and is the one that's actually been
// maintained since — but approveWorkflowTemplate's superseding logic only
// supersedes a prior 'approved' doc with the EXACT SAME major, so approving
// that null-major lineage never touched this data_science-major doc. Result:
// any project whose own `major` field is explicitly "data_science" (as all 5
// real in-progress data_science projects checked turned out to be) resolves
// to THIS stale doc — missing every bit of digitization work done since
// 2026-08-07 (research_proposal form, progress_report/midterm form, defense/
// examiner rubrics).
//
// Safe: getMilestonesForTemplateId (used by already-enrolled projects to
// read their own frozen milestone docs) fetches by doc id directly and
// never checks `status` — so this does not affect the 5 existing real
// projects' ability to read their already-created milestones. It only
// changes what NEW findApprovedTemplateId resolutions (new projects, new
// enrollments/team-joins) pick going forward, making them correctly fall
// through to the maintained major:null template.
//
// SAFE BY DEFAULT: dry run (prints what would change, writes nothing) unless
// you pass --apply.
//
// Usage (from server/):
//   npx tsx src/scripts/retireStaleDataScienceTemplate.ts             # dry run
//   npx tsx src/scripts/retireStaleDataScienceTemplate.ts --apply     # actually writes

import { db } from '../config/firebase.js';
import { findApprovedTemplateId } from '../services/workflowTemplates.js';

const APPLY = process.argv.includes('--apply');
const STALE_TEMPLATE_ID = 'Pf9rGWMniZ4XnIbbh0Bv';

async function main() {
  const ref = db.collection('workflowTemplates').doc(STALE_TEMPLATE_ID);
  const snap = await ref.get();
  if (!snap.exists) {
    console.error(`Template ${STALE_TEMPLATE_ID} not found — nothing to do (already handled?).`);
    process.exit(1);
  }
  const data = snap.data()!;
  if (data.facultyId !== 'data_science' || data.processType !== 'msc_project' || data.major !== 'data_science') {
    console.error('Template does not match the expected stale doc — aborting. Found:', {
      facultyId: data.facultyId, processType: data.processType, major: data.major,
    });
    process.exit(1);
  }
  if (data.status !== 'approved') {
    console.error(`Template status is "${data.status}", not "approved" — nothing to do (already handled?).`);
    process.exit(1);
  }

  console.log(`Found stale template ${STALE_TEMPLATE_ID}: facultyId=${data.facultyId} processType=${data.processType} major=${data.major} status=${data.status} version=${data.version}`);
  console.log(APPLY ? 'APPLYING — marking it superseded.' : 'DRY RUN — pass --apply to actually write.');

  if (!APPLY) return;

  await ref.update({
    status: 'superseded',
    supersededNote: 'Retired 2026-09-02: duplicate of the major:null data_science/msc_project template, which is the one actually maintained since 2026-08-07. See project_ds_midterm_form_and_template_split memory for the full incident.',
  });
  console.log('Done — marked superseded.');

  console.log('\nVerifying resolution now falls through correctly...');
  const resolved = await findApprovedTemplateId('data_science', 'msc_project', 'data_science');
  console.log(`findApprovedTemplateId('data_science','msc_project','data_science') -> id=${resolved?.id}`);
  const resolvedNull = await findApprovedTemplateId('data_science', 'msc_project', null);
  console.log(`findApprovedTemplateId('data_science','msc_project',null) -> id=${resolvedNull?.id}`);
  if (resolved?.id !== resolvedNull?.id) {
    console.error('WARNING: the two resolutions still disagree — investigate further before trusting this fix.');
  } else {
    console.log('Both resolve to the same (maintained) template now. Fixed.');
  }
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
