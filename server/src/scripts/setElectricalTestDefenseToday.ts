// src/scripts/setElectricalTestDefenseToday.ts
//
// Test shortcut for Electrical's evaluation forms (every Electrical project
// is a test project): puts a test project's defense milestone straight into
// "defense today" so the examiners can log in and fill the evaluation form
// immediately, skipping the student submission, the pre-defense check and
// the date-matching round-trips. Uses the real services for each step, so
// the milestone ends up exactly as the normal flow would leave it:
//   1. marks the pre-defense check chain complete (as approveChainMilestone
//      does on its last stage);
//   2. assigns the examiners like coordinatorController.ts's assignExaminers
//      (project examinerIds/names + openDefenseSchedulingIfPanelReady, which
//      opens date matching and notifies the panel);
//   3. submits today's date for every examiner through
//      submitCandidateDatesAndResolve, which matches it and sets the defense
//      date (status 'defense_date_set').
//
// SAFE BY DEFAULT: dry run unless you pass --apply.
//
// Usage (from server/):
//   npx tsx src/scripts/setElectricalTestDefenseToday.ts --project-title "בדיקה"
//   npx tsx src/scripts/setElectricalTestDefenseToday.ts --project-title "בדיקה" --apply
//   (examiners default to dorno+test.ee.examiner1/2@gmail.com)

import admin from 'firebase-admin';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import { db } from '../config/firebase.js';
import { openDefenseSchedulingIfPanelReady, submitCandidateDatesAndResolve, examinerKeyOf } from '../services/defenseScheduling.js';

dayjs.extend(utc);
dayjs.extend(timezone);

const APPLY = process.argv.includes('--apply');
const arg = (name: string) => { const i = process.argv.indexOf(name); return i !== -1 ? process.argv[i + 1] : undefined; };
const PROJECT_TITLE = arg('--project-title');
const EXAMINER_EMAILS = (arg('--examiners') ?? 'dorno+test.ee.examiner1@gmail.com,dorno+test.ee.examiner2@gmail.com').split(',');
const FACULTY_ID = 'electrical';

async function main() {
  if (!PROJECT_TITLE) {
    console.error('--project-title is required.');
    process.exit(1);
  }
  const projectSnap = await db.collection('projects').where('facultyId', '==', FACULTY_ID).where('titleHe', '==', PROJECT_TITLE).get();
  if (projectSnap.size !== 1) {
    console.error(`Expected exactly one Electrical project titled "${PROJECT_TITLE}", found ${projectSnap.size}.`);
    process.exit(1);
  }
  const projectDoc = projectSnap.docs[0]!;
  const defenseSnap = await db.collection('milestones').where('projectId', '==', projectDoc.id).where('type', '==', 'defense').get();
  const defenseDoc = defenseSnap.docs[0];
  if (!defenseDoc) {
    console.error('This project has no defense milestone (no student enrolled yet?).');
    process.exit(1);
  }
  const defense = defenseDoc.data();
  if (defense.dateMatching || (defense.examinerIds ?? []).length > 0) {
    console.error(`The defense milestone already has examiners/date matching (status ${defense.status}) — not touching it.`);
    process.exit(1);
  }

  const examinerUids: string[] = [];
  for (const email of EXAMINER_EMAILS) {
    const user = await admin.auth().getUserByEmail(email.trim());
    examinerUids.push(user.uid);
  }
  const today = dayjs().tz('Asia/Jerusalem').format('YYYY-MM-DD');
  console.log(`project ${projectDoc.id} "${PROJECT_TITLE}", defense milestone ${defenseDoc.id} (status ${defense.status})`);
  console.log(`  1. pre-defense check → complete (chain: ${(defense.routing ?? []).map((s: { role: string }) => s.role).join(' → ') || 'none'})`);
  console.log(`  2. assign examiners: ${EXAMINER_EMAILS.join(', ')}`);
  console.log(`  3. defense date → ${today}`);
  if (!APPLY) {
    console.log('\nDry run only — re-run with --apply to write.');
    return;
  }

  // 1. Pre-defense check complete.
  await defenseDoc.ref.update({
    chainPrecheckComplete: true,
    currentStageIndex: (defense.routing ?? []).length,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  // 2. Assign the panel, as assignExaminers does.
  const names = await Promise.all(examinerUids.map(async (uid) => (await db.collection('users').doc(uid).get()).data()?.displayName ?? uid));
  await projectDoc.ref.update({ examinerIds: examinerUids, examinerNames: names, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
  await openDefenseSchedulingIfPanelReady(projectDoc.id, { internalUids: examinerUids, externalNotified: [] });
  console.log('  ✓ examiners assigned, date matching opened');

  // 3. Every examiner proposes today → matched.
  for (const uid of examinerUids) {
    const result = await submitCandidateDatesAndResolve(defenseDoc.id, examinerKeyOf({ type: 'internal', ref: uid }), [today]);
    console.log(`  ✓ dates submitted for ${uid}:`, JSON.stringify(result));
  }

  const after = (await defenseDoc.ref.get()).data()!;
  console.log(`\nDefense milestone now: status ${after.status}, date ${after.dueDate?.toDate?.().toISOString?.()}, examiners ${(after.examinerIds ?? []).length}`);
}

main().then(() => process.exit(0)).catch((err) => {
  console.error('setElectricalTestDefenseToday failed:', err);
  process.exit(1);
});
