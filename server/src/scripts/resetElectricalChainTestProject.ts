// src/scripts/resetElectricalChainTestProject.ts
//
// Resets the Electrical M.Sc. thesis TEST project "הצעת מחקר בדיקה — שרשרת
// אישורים" (kT39pGK9FnJZzh8JX2Ul) back to day one, so its student can submit
// the first milestone again, and makes אסתי טל (estyt@hit.ac.il) its supervisor.
//
// Each milestone doc keeps its id but is OVERWRITTEN (set, not merge) with the
// same fresh shape projectEnrollment.ts writes at enrollment, rebuilt from the
// project's pinned workflow template — so every submission/grade/sign-off/
// examiner field from earlier test runs is gone. Due dates restart from now.
// Also removes that project's examiner opinions, examiner tokens and defense
// access grants, and re-points the student's denormalized supervisorId.
//
// SAFE BY DEFAULT: dry run unless you pass --apply.
//
// Usage (from server/):
//   npx tsx src/scripts/resetElectricalChainTestProject.ts          # dry run
//   npx tsx src/scripts/resetElectricalChainTestProject.ts --apply  # writes

import admin from 'firebase-admin';
import { db } from '../config/firebase.js';
import {
  resolveMilestoneDueDate,
  resolveMilestoneRouting,
  type WorkflowTemplateDoc,
} from '../services/workflowTemplates.js';

const APPLY = process.argv.includes('--apply');
const PROJECT_ID = 'kT39pGK9FnJZzh8JX2Ul';
const NEW_SUPERVISOR_EMAIL = 'estyt@hit.ac.il';
const FV = admin.firestore.FieldValue;

async function main() {
  const projectRef = db.collection('projects').doc(PROJECT_ID);
  const project = (await projectRef.get()).data();
  if (!project) throw new Error(`Project ${PROJECT_ID} not found.`);
  if (!String(project.titleEn ?? '').startsWith('[TEST]')) throw new Error('Refusing: not a [TEST] project.');
  const studentIds: string[] = project.enrolledStudentIds ?? [];
  if (studentIds.length !== 1) throw new Error(`Expected exactly 1 enrolled student, found ${studentIds.length}.`);
  const studentId = studentIds[0]!;

  const supSnap = await db.collection('users').where('email', '==', NEW_SUPERVISOR_EMAIL).get();
  if (supSnap.size !== 1) throw new Error(`Expected 1 user ${NEW_SUPERVISOR_EMAIL}, found ${supSnap.size}.`);
  const sup = supSnap.docs[0]!;
  const supRoles: string[] = sup.data().roles ?? [sup.data().role];
  if (!supRoles.includes('supervisor')) throw new Error(`${NEW_SUPERVISOR_EMAIL} has no supervisor role.`);
  const supervisorId = sup.id;
  console.log(`Project "${project.titleHe}" — supervisor ${project.supervisorId} → ${supervisorId} (${sup.data().displayName})`);

  const ref = (project.workflowTemplateRefs ?? []).find((r: { degreeType: string; projectType: string }) => r.degreeType === project.degreeType && r.projectType === project.projectType);
  if (!ref) throw new Error('Project has no pinned template for its degree/process.');
  const tplSnap = await db.collection('workflowTemplates').doc(ref.templateId).get();
  const tpl = tplSnap.data() as WorkflowTemplateDoc | undefined;
  if (!tpl) throw new Error(`Template ${ref.templateId} not found.`);
  console.log(`Template ${ref.templateId} v${tpl.version} (${tpl.status})`);

  const baseDate = new Date();
  const msSnap = await db.collection('milestones').where('projectId', '==', PROJECT_ID).get();
  const writes: Array<{ ref: FirebaseFirestore.DocumentReference; data: Record<string, unknown> }> = [];
  for (const mDoc of msSnap.docs) {
    const old = mDoc.data();
    const t = tpl.milestones.find((s) => s.type === old.type);
    if (!t) throw new Error(`Milestone ${mDoc.id} (${old.type}) has no matching template spec.`);
    const routing = resolveMilestoneRouting(t, tpl.defaultRouting);
    const dueDate = resolveMilestoneDueDate(t, baseDate, tpl.milestones);
    const data: Record<string, unknown> = {
      projectId: PROJECT_ID, studentIds: [studentId], supervisorId, facultyId: project.facultyId,
      type: t.type, nameHe: t.nameHe, nameEn: t.nameEn, order: t.order,
      requiresExaminers: !!t.requiresExaminers,
      status: 'pending',
      dueDate: admin.firestore.Timestamp.fromDate(dueDate),
      createdAt: old.createdAt ?? FV.serverTimestamp(),
      finalGrade: null, fileUrls: [],
      supervisorScore: null,
      ...(t.gradingComponents?.length ? { gradingComponents: t.gradingComponents } : {}),
      ...(t.staffRecordMode === 'upload_or_form' ? { staffRecordMode: t.staffRecordMode, staffFormFields: t.staffFormFields ?? [] } : {}),
      ...(t.studentFormFields?.length ? { studentFormFields: t.studentFormFields } : {}),
      ...(t.examinerOpinionForm ? { examinerOpinionForm: t.examinerOpinionForm, examinerOpinionRound: 1 } : {}),
      ...(t.submissionRequirement ? { submissionRequirement: t.submissionRequirement } : {}),
      ...(t.allowedFileTypes?.length ? { allowedFileTypes: t.allowedFileTypes } : {}),
      ...(t.finalGradeComponents
        ? { finalGradeComponents: t.finalGradeComponents, supervisorEvaluation: null, examinerEvaluations: {}, autoCalculatedFinalGrade: null, gradeOverride: null }
        : {}),
      ...(t.requiresExaminers
        ? {
            examinerIds: [], examinerScores: {}, examinerCount: t.examinerCount ?? 2,
            ...(t.examinerOnlyGrading ? { examinerOnlyGrading: true } : {}),
            ...(t.examinerFormFields?.length ? { examinerFormFields: t.examinerFormFields, examinerFormAnswers: {} } : {}),
          }
        : {}),
      routing,
      currentStageIndex: 0,
      stageScores: {},
      stageEnteredAt: FV.serverTimestamp(),
      ...(t.seminarScheduling ? { seminarScheduling: true } : {}),
      ...(t.thesisExamFlow ? { thesisExamFlow: true } : {}),
      updatedAt: FV.serverTimestamp(),
    };
    const dropped = Object.keys(old).filter((k) => !(k in data));
    console.log(`  ${t.order}. ${t.nameHe} [${old.status} → pending] due ${dueDate.toISOString().slice(0, 10)} routing ${JSON.stringify(routing.map((s) => `${s.role}/${s.action}`))}`);
    if (dropped.length) console.log(`     clears: ${dropped.join(', ')}`);
    writes.push({ ref: mDoc.ref, data });
  }

  const milestoneIds = msSnap.docs.map((d) => d.id);
  const leftovers: FirebaseFirestore.DocumentReference[] = [];
  for (const id of milestoneIds) {
    const opinions = await db.collection('examinerOpinions')
      .where(admin.firestore.FieldPath.documentId(), '>=', `${id}__`)
      .where(admin.firestore.FieldPath.documentId(), '<', `${id}__`).get();
    const tokens = await db.collection('examinerTokens').where('milestoneId', '==', id).get();
    const grants = await db.collection('defenseAccessGrants').where('milestoneId', '==', id).get();
    for (const d of [...opinions.docs, ...tokens.docs, ...grants.docs]) leftovers.push(d.ref);
  }
  console.log(`  related docs to delete: ${leftovers.map((r) => r.path).join(', ') || 'none'}`);
  console.log(`  student ${studentId}: supervisorId → ${supervisorId}`);

  if (!APPLY) { console.log('\nDry run only — re-run with --apply to write.'); return; }

  const batch = db.batch();
  for (const w of writes) batch.set(w.ref, w.data);
  for (const r of leftovers) batch.delete(r);
  batch.update(projectRef, { supervisorId, projectStartDate: baseDate.toISOString(), updatedAt: FV.serverTimestamp() });
  batch.update(db.collection('users').doc(studentId), { supervisorId });
  await batch.commit();
  console.log('\n✓ applied');
}

main().then(() => process.exit(0)).catch((err) => {
  console.error('resetElectricalChainTestProject failed:', err);
  process.exit(1);
});
