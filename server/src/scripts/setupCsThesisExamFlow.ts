// src/scripts/setupCsThesisExamFlow.ts
//
// Turns on the thesis exam flow (services/thesisExam.ts) for Computer
// Science's M.Sc. thesis "בחינה" milestone:
//   - proposes + approves a new version of the approved template with
//     `thesisExamFlow: true` (requiresExaminers, 2 examiners) on it, and
//   - flags that milestone on projects already running, when it's still
//     'pending' (nothing in flight). If the milestone before it is already
//     approved, the flow opens right away.
//
// SAFE BY DEFAULT: dry run unless you pass --apply. Deploy the server first.
//
// Usage (from server/):
//   npx tsx src/scripts/setupCsThesisExamFlow.ts           # dry run
//   npx tsx src/scripts/setupCsThesisExamFlow.ts --apply   # writes

import admin from 'firebase-admin';
import { db } from '../config/firebase.js';
import { findApprovedTemplateId, proposeWorkflowTemplate, approveWorkflowTemplate } from '../services/workflowTemplates.js';
import { maybeOpenThesisExamForProject } from '../services/thesisExam.js';

const APPLY = process.argv.includes('--apply');
const SEED_ACTOR = 'system-seed-script:setupCsThesisExamFlow';
const FACULTY_ID = 'sciences';
const MAJOR = 'computer_science';
const PROCESS_TYPE = 'msc_thesis';
const EXAM_TYPE = 'custom_xvpqcqqn'; // "בחינה"

async function main() {
  const current = await findApprovedTemplateId(FACULTY_ID, PROCESS_TYPE, MAJOR);
  if (!current) throw new Error(`No approved ${FACULTY_ID}/${PROCESS_TYPE}/major=${MAJOR} template.`);
  const exam = current.milestones.find((m) => m.type === EXAM_TYPE);
  if (!exam) throw new Error(`Template ${current.id} has no ${EXAM_TYPE} milestone.`);
  console.log(`Template ${current.id} — "${exam.nameHe}" (order ${exam.order}), thesisExamFlow now: ${!!exam.thesisExamFlow}`);

  const snap = await db.collection('milestones').where('type', '==', EXAM_TYPE).get();
  const toUpdate: FirebaseFirestore.QueryDocumentSnapshot[] = [];
  for (const doc of snap.docs) {
    const m = doc.data();
    const label = `${doc.id} [${m.status}] project ${m.projectId}`;
    if (m.thesisExamFlow) console.log(`  already set: ${label}`);
    else if (m.status === 'pending') { toUpdate.push(doc); console.log(`  will update: ${label}`); }
    else console.warn(`  ⚠️ left alone (status ${m.status}) — handle by hand: ${label}`);
  }

  if (!APPLY) {
    console.log('\nDry run only — re-run with --apply to write.');
    return;
  }

  if (!exam.thesisExamFlow) {
    const milestones = current.milestones.map((m) => (m.type === EXAM_TYPE ? { ...m, requiresExaminers: true, examinerCount: 2, thesisExamFlow: true } : m));
    const { id } = await proposeWorkflowTemplate({
      facultyId: FACULTY_ID,
      processType: PROCESS_TYPE,
      major: MAJOR,
      milestones,
      createdBy: SEED_ACTOR,
      note: 'Thesis exam: supervisor nominates 2 examiners → grad school head approves → everyone picks 5 dates/hours → system matches → program head + grad school head approve the date → examiners fill the thesis exam form → committee.',
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
    if (resolved?.id !== id || !resolved.milestones.find((m) => m.type === EXAM_TYPE)?.thesisExamFlow) {
      throw new Error(`Self-check failed: template resolves to ${resolved?.id ?? 'null'}, expected ${id} with thesisExamFlow.`);
    }
    console.log(`Approved template ${id}.`);
  }

  for (const doc of toUpdate) {
    await doc.ref.update({ thesisExamFlow: true, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    await maybeOpenThesisExamForProject(doc.data().projectId);
    const after = (await doc.ref.get()).data()?.status;
    console.log(`  updated ${doc.id} → status ${after}`);
  }
}

main().then(() => process.exit(0)).catch((err) => {
  console.error('setupCsThesisExamFlow failed:', err);
  process.exit(1);
});
