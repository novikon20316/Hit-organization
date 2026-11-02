// src/scripts/removeElectricalMscProjectDefensePrecheck.ts
//
// Electrical M.Sc. project: the last milestone (type 'defense') carried a
// two-stage pre-check chain — supervisor approve, then coordinator approve —
// that no screen ever offered while the milestone was still 'pending': the
// supervisor's pending list only holds 'submitted' milestones, the chain
// sign-off widget only handles research proposals, and the student has no
// Submit button on a defense. It also hid the milestone from the Defenses
// tab (see coordinator/home/DefenseTab.tsx's stuckPending filter), so the
// defense could never be started.
//
// Per the faculty contact (2026-11-02): once the student reaches the last
// milestone, the administrative coordinator starts the defense herself from the
// Defenses tab (assign examiners → date matching → logistics), with no
// pre-check. An empty routing is how a milestone opts out of the chain — it
// is then not chain-driven (milestoneRouting.ts's isChainDriven) and goes
// straight to the examiner scheduling/grading engine, like a defense with no
// pre-check anywhere else.
//
// The template editor cannot author an empty chain (validateRoutingChain
// rejects it), so this writes the template directly, like
// updateElectricalEvaluationForms.ts. Don't re-save this milestone's chain in
// the editor.
//
// Proposes + approves a new msc_project version (applyMode 'from_now_on'), then
// re-pins every in-progress Electrical M.Sc. project to it and clears the
// pre-check on its still-pending defense milestone. Milestones already past
// pending are left alone.
//
// SAFE BY DEFAULT: dry run unless you pass --apply.
//
// Usage (from server/):
//   npx tsx src/scripts/removeElectricalMscProjectDefensePrecheck.ts          # dry run
//   npx tsx src/scripts/removeElectricalMscProjectDefensePrecheck.ts --apply  # writes

import admin from 'firebase-admin';
import { db } from '../config/firebase.js';
import { approveWorkflowTemplate, findApprovedTemplateId, proposeWorkflowTemplate } from '../services/workflowTemplates.js';

const APPLY = process.argv.includes('--apply');
const SEED_ACTOR = 'system-seed-script:removeElectricalMscProjectDefensePrecheck';
const FACULTY_ID = 'electrical';
const MAJOR = 'electrical_engineering';
const PROCESS_TYPE = 'msc_project';

async function main() {
  const current = await findApprovedTemplateId(FACULTY_ID, PROCESS_TYPE, MAJOR);
  if (!current) throw new Error(`No approved ${FACULTY_ID}/${PROCESS_TYPE}/major=${MAJOR} template.`);
  const defense = current.milestones.find((m) => m.type === 'defense');
  if (!defense) throw new Error(`Template ${current.id} has no 'defense' milestone.`);
  console.log(`Current template ${current.id}: defense routing = ${JSON.stringify((defense.routing ?? []).map((s) => `${s.role}/${s.action}`))}`);

  let templateId = current.id;
  if ((defense.routing ?? []).length === 0 && defense.routing !== undefined) {
    console.log('Template already has no pre-check on the defense milestone — not proposing a new version.');
  } else {
    const milestones = current.milestones.map((m) => (m.type === 'defense' ? { ...m, routing: [] } : m));
    console.log('→ new version: defense routing = [] (no pre-check)');
    if (APPLY) {
      const { id } = await proposeWorkflowTemplate({
        facultyId: FACULTY_ID,
        processType: PROCESS_TYPE,
        major: MAJOR,
        milestones,
        createdBy: SEED_ACTOR,
        note: 'Last milestone (defense) has no pre-check approvals: once the student reaches it, the administrative coordinator starts the defense from the Defenses tab.',
        applyMode: 'from_now_on',
        ...(current.finalReportSignatureRoles ? { finalReportSignatureRoles: current.finalReportSignatureRoles } : {}),
        ...(current.defaultRouting ? { defaultRouting: current.defaultRouting } : {}),
        ...(current.examinerSignoffRole ? { examinerSignoffRole: current.examinerSignoffRole } : {}),
        ...(current.finalGradeSignoffRole ? { finalGradeSignoffRole: current.finalGradeSignoffRole } : {}),
        ...(current.firstStepMode ? { firstStepMode: current.firstStepMode } : {}),
        ...(current.supervisorSelectionRequiresApproval != null ? { supervisorSelectionRequiresApproval: current.supervisorSelectionRequiresApproval } : {}),
      });
      await approveWorkflowTemplate(id, SEED_ACTOR);
      const resolved = await findApprovedTemplateId(FACULTY_ID, PROCESS_TYPE, MAJOR);
      if (resolved?.id !== id) throw new Error(`Self-check failed: resolved to ${resolved?.id ?? 'null'}, expected ${id}.`);
      templateId = id;
      console.log(`✓ approved as ${id}`);
    }
  }

  const projects = await db.collection('projects').where('facultyId', '==', FACULTY_ID).get();
  for (const projectDoc of projects.docs) {
    const p = projectDoc.data();
    if (p.status !== 'in_progress' || p.degreeType !== 'masters' || p.projectType !== 'project') continue;
    console.log(`\nproject ${projectDoc.id} "${p.titleHe}"`);
    const milestones = await db.collection('milestones').where('projectId', '==', projectDoc.id).get();
    const defenseDoc = milestones.docs.find((m) => m.data().type === 'defense');
    if (!defenseDoc) { console.log('  no defense milestone — skipped.'); continue; }
    const d = defenseDoc.data();
    if (d.status !== 'pending') { console.log(`  defense status ${d.status} — left as is.`); continue; }
    console.log(`  defense ${defenseDoc.id}: routing ${JSON.stringify((d.routing ?? []).map((s: { role: string; action: string }) => `${s.role}/${s.action}`))} → []`);
    if (!APPLY) continue;
    const refs: Array<{ degreeType: string; projectType: string; templateId: string }> = p.workflowTemplateRefs ?? [];
    const match = (r: { degreeType: string; projectType: string }) => r.degreeType === p.degreeType && r.projectType === p.projectType;
    const newRefs = refs.some(match)
      ? refs.map((r) => (match(r) ? { ...r, templateId } : r))
      : [...refs, { degreeType: p.degreeType, projectType: p.projectType, templateId }];
    const batch = db.batch();
    batch.update(projectDoc.ref, { workflowTemplateRefs: newRefs, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    batch.update(defenseDoc.ref, {
      routing: [],
      currentStageIndex: 0,
      stageScores: {},
      supervisorApprovals: {},
      chainPrecheckComplete: admin.firestore.FieldValue.delete(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    await batch.commit();
    console.log('  ✓ applied');
  }
  if (!APPLY) console.log('\nDry run only — re-run with --apply to write.');
}

main().then(() => process.exit(0)).catch((err) => {
  console.error('removeElectricalMscProjectDefensePrecheck failed:', err);
  process.exit(1);
});
