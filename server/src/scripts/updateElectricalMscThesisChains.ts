// src/scripts/updateElectricalMscThesisChains.ts
//
// Electrical M.Sc. thesis (2026-11-16, per the faculty):
//  - "הצעת מחקר" and "דוח התזה": the final sign-off is no longer the faculty
//    coordinator. Chain becomes supervisor grade → program_head approve →
//    grad_school_head approve. (Both used to inherit the template's
//    defaultRouting, supervisor → coordinator.) "סמינר מצגת" is unchanged.
//  - "בחינת הגנה": only examiner assignment → defense date → grades. The
//    supervisor/coordinator pre-check is removed (empty routing = not
//    chain-driven, see milestoneRouting.ts's isChainDriven), same as
//    removeElectricalMscProjectDefensePrecheck.ts did for the M.Sc. project.
//
// The template editor can't author an empty chain, so this writes the
// template directly. Don't re-save the defense chain in the editor.
//
// Proposes + approves a new msc_thesis version (applyMode 'from_now_on'),
// then re-pins every in-progress Electrical M.Sc. thesis project to it and
// rewrites routing on those milestones that are still 'pending' or
// 'rejected' (back with the student). Milestones already mid-chain or done
// are left as they are and listed.
//
// SAFE BY DEFAULT: dry run unless you pass --apply.
//
// Usage (from server/):
//   npx tsx src/scripts/updateElectricalMscThesisChains.ts          # dry run
//   npx tsx src/scripts/updateElectricalMscThesisChains.ts --apply  # writes

import admin from 'firebase-admin';
import { db } from '../config/firebase.js';
import { resolveStaffForScope } from '../services/scopeAuthorization.js';
import {
  approveWorkflowTemplate,
  findApprovedTemplateId,
  proposeWorkflowTemplate,
  type MilestoneRoutingSpec,
  type WorkflowMilestoneSpec,
} from '../services/workflowTemplates.js';

const APPLY = process.argv.includes('--apply');
const SEED_ACTOR = 'system-seed-script:updateElectricalMscThesisChains';
const FACULTY_ID = 'electrical';
const MAJOR = 'electrical_engineering';
const PROCESS_TYPE = 'msc_thesis';

const HEADS_CHAIN: MilestoneRoutingSpec = [
  { id: 'supervisor', role: 'supervisor', action: 'grade', rejectTo: 'student' },
  { id: 'program_head', role: 'program_head', action: 'approve', rejectTo: 'student' },
  { id: 'grad_school_head', role: 'grad_school_head', action: 'approve', rejectTo: 'student' },
];
const HEADS_CHAIN_NAMES = new Set(['הצעת מחקר', 'דוח התזה']);

const fmt = (r: MilestoneRoutingSpec | undefined) => (r === undefined ? '(template default)' : JSON.stringify(r.map((s) => `${s.role}/${s.action}`)));

function newRoutingFor(spec: { type?: string; nameHe?: string }): MilestoneRoutingSpec | null {
  if (spec.type === 'defense') return [];
  if (spec.nameHe && HEADS_CHAIN_NAMES.has(spec.nameHe.trim())) return HEADS_CHAIN;
  return null;
}

async function main() {
  const current = await findApprovedTemplateId(FACULTY_ID, PROCESS_TYPE, MAJOR);
  if (!current) throw new Error(`No approved ${FACULTY_ID}/${PROCESS_TYPE}/major=${MAJOR} template.`);
  console.log(`Current template ${current.id}  defaultRouting=${fmt(current.defaultRouting)}`);

  const touched = current.milestones.filter((m) => newRoutingFor(m) !== null);
  const names = touched.map((m) => m.nameHe.trim());
  for (const n of HEADS_CHAIN_NAMES) if (!names.includes(n)) throw new Error(`Template has no milestone named "${n}".`);
  if (!current.milestones.some((m) => m.type === 'defense')) throw new Error('Template has no defense milestone.');

  const milestones: WorkflowMilestoneSpec[] = current.milestones.map((m) => {
    const routing = newRoutingFor(m);
    if (routing === null) {
      console.log(`  ${m.order}. ${m.nameHe}: unchanged ${fmt(m.routing)}`);
      return m;
    }
    console.log(`  ${m.order}. ${m.nameHe}: ${fmt(m.routing)} → ${fmt(routing)}`);
    return { ...m, routing };
  });

  // Who will actually be asked to sign — an empty list means the chain would
  // stall at that stage.
  for (const role of ['program_head', 'grad_school_head'] as const) {
    const uids = await resolveStaffForScope(role, { facultyId: FACULTY_ID, major: MAJOR, degreeLevel: 'masters', processType: 'thesis' }, [], [], false);
    const emails = await Promise.all(uids.map(async (uid) => (await db.collection('users').doc(uid).get()).data()?.email ?? uid));
    console.log(`  ${role}: ${uids.length} signer(s) — ${emails.join(', ') || 'NONE (chain would stall here)'}`);
  }

  let templateId = current.id;
  if (APPLY) {
    const { id } = await proposeWorkflowTemplate({
      facultyId: FACULTY_ID,
      processType: PROCESS_TYPE,
      major: MAJOR,
      milestones,
      createdBy: SEED_ACTOR,
      note: 'Research proposal + thesis report: supervisor → program head → grad school head (no faculty coordinator). Defense: no pre-check — examiners, date, grades only.',
      applyMode: 'from_now_on',
      ...(current.defaultRouting ? { defaultRouting: current.defaultRouting } : {}),
      ...(current.finalReportSignatureRoles ? { finalReportSignatureRoles: current.finalReportSignatureRoles } : {}),
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

  const projects = await db.collection('projects').where('facultyId', '==', FACULTY_ID).get();
  for (const projectDoc of projects.docs) {
    const p = projectDoc.data();
    if (p.status !== 'in_progress' || p.degreeType !== 'masters' || p.projectType !== 'thesis' || p.isArchived) continue;
    console.log(`\nproject ${projectDoc.id} "${p.titleHe ?? p.titleEn ?? ''}"`);
    const msSnap = await db.collection('milestones').where('projectId', '==', projectDoc.id).get();
    const batch = db.batch();
    let writes = 0;
    for (const mDoc of msSnap.docs) {
      const d = mDoc.data();
      const routing = newRoutingFor(d);
      if (routing === null) continue;
      if (d.status !== 'pending' && d.status !== 'rejected') {
        console.log(`  ${d.nameHe}: status ${d.status} — left as is (${fmt(d.routing)})`);
        continue;
      }
      console.log(`  ${d.nameHe} [${d.status}]: ${fmt(d.routing)} → ${fmt(routing)}`);
      batch.update(mDoc.ref, {
        routing,
        currentStageIndex: 0,
        stageScores: {},
        supervisorApprovals: {},
        chainPrecheckComplete: admin.firestore.FieldValue.delete(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      writes++;
    }
    const refs: Array<{ degreeType: string; projectType: string; templateId: string }> = p.workflowTemplateRefs ?? [];
    const match = (r: { degreeType: string; projectType: string }) => r.degreeType === p.degreeType && r.projectType === p.projectType;
    const newRefs = refs.some(match)
      ? refs.map((r) => (match(r) ? { ...r, templateId } : r))
      : [...refs, { degreeType: p.degreeType, projectType: p.projectType, templateId }];
    batch.update(projectDoc.ref, { workflowTemplateRefs: newRefs, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    if (APPLY) {
      await batch.commit();
      console.log(`  ✓ applied (${writes} milestone(s), template ref → ${templateId})`);
    }
  }
  if (!APPLY) console.log('\nDry run only — re-run with --apply to write.');
}

main().then(() => process.exit(0)).catch((err) => {
  console.error('updateElectricalMscThesisChains failed:', err);
  process.exit(1);
});
