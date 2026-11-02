// src/scripts/setupCsSeminarScheduling.ts
//
// Computer Science's "הרצאת סמינר" milestone (M.Sc. thesis) moves off the
// committee: supervisor approval, then the administrative coordinator's
// seminar calendar — see services/seminarScheduling.ts. This turns on
// `seminarScheduling` for it:
//   - proposes + approves a new version of the approved template, and
//   - updates the seminar milestones of projects already running, unless
//     they're finished or sitting at a stage this can't safely move — those
//     are listed for a human.
//
// SAFE BY DEFAULT: dry run unless you pass --apply. Deploy the server first —
// the milestones this changes rely on it.
//
// Usage (from server/):
//   npx tsx src/scripts/setupCsSeminarScheduling.ts           # dry run
//   npx tsx src/scripts/setupCsSeminarScheduling.ts --apply   # writes

import admin from 'firebase-admin';
import { db } from '../config/firebase.js';
import {
  findApprovedTemplateId,
  proposeWorkflowTemplate,
  approveWorkflowTemplate,
  resolveMilestoneRouting,
} from '../services/workflowTemplates.js';

const APPLY = process.argv.includes('--apply');
const SEED_ACTOR = 'system-seed-script:setupCsSeminarScheduling';
const FACULTY_ID = 'sciences';
const MAJOR = 'computer_science';
const PROCESS_TYPE = 'msc_thesis';
const SEMINAR_TYPE = 'custom_keoixg90';
// Not started, or sent back to the student — nothing in flight to disturb.
const SAFE_STATUSES = new Set(['pending', 'rejected']);

async function main() {
  const current = await findApprovedTemplateId(FACULTY_ID, PROCESS_TYPE, MAJOR);
  if (!current) throw new Error(`No approved ${FACULTY_ID}/${PROCESS_TYPE}/major=${MAJOR} template.`);
  const seminar = current.milestones.find((m) => m.type === SEMINAR_TYPE);
  if (!seminar) throw new Error(`Template ${current.id} has no ${SEMINAR_TYPE} milestone.`);

  const updatedSpec = { ...seminar, seminarScheduling: true };
  const routing = resolveMilestoneRouting(updatedSpec, current.defaultRouting ?? null);
  console.log(`Template ${current.id} — "${seminar.nameHe}" (order ${seminar.order})`);
  console.log(`  chain before: ${(seminar.routing ?? current.defaultRouting ?? []).map((s) => `${s.role}:${s.action}`).join(' → ')}`);
  console.log(`  chain after:  ${routing.map((s) => `${s.role}:${s.action}`).join(' → ')}`);
  if (routing.length === 0 || routing[0]!.role !== 'supervisor') throw new Error('Expected the chain to start with the supervisor.');

  const snap = await db.collection('milestones').where('type', '==', SEMINAR_TYPE).get();
  const toUpdate: FirebaseFirestore.QueryDocumentSnapshot[] = [];
  for (const doc of snap.docs) {
    const m = doc.data();
    const project = await db.collection('projects').doc(m.projectId).get();
    const label = `${doc.id} [${m.status}] project "${project.data()?.titleHe ?? m.projectId}"`;
    if (m.seminarScheduling) {
      console.log(`  already set: ${label}`);
    } else if (SAFE_STATUSES.has(m.status)) {
      toUpdate.push(doc);
      console.log(`  will update: ${label}`);
    } else {
      console.warn(`  ⚠️ left alone (status ${m.status}, stage ${m.currentStageIndex ?? 0}) — handle by hand: ${label}`);
    }
  }

  if (!APPLY) {
    console.log('\nDry run only — re-run with --apply to write.');
    return;
  }

  const milestones = current.milestones.map((m) => (m.type === SEMINAR_TYPE ? updatedSpec : m));
  const { id } = await proposeWorkflowTemplate({
    facultyId: FACULTY_ID,
    processType: PROCESS_TYPE,
    major: MAJOR,
    milestones,
    createdBy: SEED_ACTOR,
    note: 'Seminar: no committee — supervisor approval, then the administrative coordinator books the date and confirms the talk.',
    applyMode: 'from_now_on',
    ...(current.defaultRouting ? { defaultRouting: current.defaultRouting } : {}),
    ...(current.examinerSignoffRole ? { examinerSignoffRole: current.examinerSignoffRole } : {}),
    ...(current.finalGradeSignoffRole ? { finalGradeSignoffRole: current.finalGradeSignoffRole } : {}),
    ...(current.finalReportSignatureRoles ? { finalReportSignatureRoles: current.finalReportSignatureRoles } : {}),
    ...(current.firstStepMode ? { firstStepMode: current.firstStepMode } : {}),
    ...(current.supervisorSelectionRequiresApproval != null ? { supervisorSelectionRequiresApproval: current.supervisorSelectionRequiresApproval } : {}),
  });
  await approveWorkflowTemplate(id, SEED_ACTOR);
  const resolved = await findApprovedTemplateId(FACULTY_ID, PROCESS_TYPE, MAJOR);
  if (resolved?.id !== id) throw new Error(`Self-check failed: resolved to ${resolved?.id ?? 'null'}, expected ${id}.`);
  console.log(`✓ template approved as ${id}`);

  for (const doc of toUpdate) {
    await doc.ref.update({
      seminarScheduling: true,
      routing,
      currentStageIndex: 0,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log(`✓ updated milestone ${doc.id}`);
  }
}

main().then(() => process.exit(0)).catch((err) => {
  console.error('setupCsSeminarScheduling failed:', err);
  process.exit(1);
});
