// src/scripts/syncElectricalTestProjectsToTemplates.ts
//
// Moves Electrical & Electronics Engineering's existing projects onto the
// faculty's CURRENT approved workflow templates — every Electrical project
// is a test project (confirmed by the faculty contact, 2026-10-21), and the
// new evaluation forms (B.Sc. per-student form, M.Sc. project form, M.Sc.
// thesis examiner opinion form) were approved 'from_now_on', so the
// existing projects never got them.
//
// For each in-progress Electrical project:
//   - re-pins its workflowTemplateRefs entry to the current approved
//     template (milestone weights and sign-off roles resolve from it);
//   - re-snapshots each STILL-PENDING milestone's configuration from the
//     template (forms, examiners, routing, rubric) — the same fields
//     projectEnrollment.ts writes at enrollment — and resets its chain to
//     the first stage. Milestones already submitted/graded are left exactly
//     as they are; template milestones the project lacks are reported, not
//     created.
//
// SAFE BY DEFAULT: dry run unless you pass --apply.
//
// Usage (from server/):
//   npx tsx src/scripts/syncElectricalTestProjectsToTemplates.ts           # dry run
//   npx tsx src/scripts/syncElectricalTestProjectsToTemplates.ts --apply   # writes

import admin from 'firebase-admin';
import { db } from '../config/firebase.js';
import { deriveProcessType, findApprovedTemplateId, resolveMilestoneRouting, type ProcessType } from '../services/workflowTemplates.js';

const APPLY = process.argv.includes('--apply');
const FACULTY_ID = 'electrical';
const DELETE = admin.firestore.FieldValue.delete();

async function main() {
  const projects = await db.collection('projects').where('facultyId', '==', FACULTY_ID).get();
  for (const projectDoc of projects.docs) {
    const project = projectDoc.data();
    if (project.status !== 'in_progress') {
      console.log(`${projectDoc.id}: status ${project.status} — skipped.`);
      continue;
    }
    const processType: ProcessType = deriveProcessType(project.degreeType, project.projectType);
    const template = await findApprovedTemplateId(FACULTY_ID, processType, project.major ?? null);
    if (!template) {
      console.log(`${projectDoc.id}: no approved ${processType} template — skipped.`);
      continue;
    }
    console.log(`\n${projectDoc.id} (${processType}) → template ${template.id}`);

    const refs: Array<{ degreeType: string; projectType: string; templateId: string }> = project.workflowTemplateRefs ?? [];
    const matchRef = (r: { degreeType: string; projectType: string }) => r.degreeType === project.degreeType && r.projectType === project.projectType;
    const newRefs = refs.some(matchRef)
      ? refs.map((r) => (matchRef(r) ? { ...r, templateId: template.id } : r))
      : [...refs, { degreeType: project.degreeType, projectType: project.projectType, templateId: template.id }];

    const milestones = await db.collection('milestones').where('projectId', '==', projectDoc.id).get();
    const batch = db.batch();
    batch.update(projectDoc.ref, { workflowTemplateRefs: newRefs, updatedAt: admin.firestore.FieldValue.serverTimestamp() });

    for (const spec of template.milestones) {
      const doc = milestones.docs.find((m) => m.data().type === spec.type);
      if (!doc) {
        console.log(`  ${spec.type} (${spec.nameHe}): not on this project — not created.`);
        continue;
      }
      const m = doc.data();
      if (m.status !== 'pending') {
        console.log(`  ${spec.type} (${spec.nameHe}): status ${m.status} — left as is.`);
        continue;
      }
      const update: Record<string, unknown> = {
        nameHe: spec.nameHe,
        nameEn: spec.nameEn,
        order: spec.order,
        requiresExaminers: spec.requiresExaminers,
        submissionRequirement: spec.submissionRequirement ?? 'both',
        allowedFileTypes: spec.allowedFileTypes ?? DELETE,
        routing: resolveMilestoneRouting(spec, template.defaultRouting),
        currentStageIndex: 0,
        stageScores: {},
        supervisorApprovals: {},
        chainPrecheckComplete: false,
        gradingComponents: spec.gradingComponents?.length ? spec.gradingComponents : DELETE,
        staffRecordMode: spec.staffRecordMode === 'upload_or_form' ? spec.staffRecordMode : DELETE,
        staffFormFields: spec.staffRecordMode === 'upload_or_form' ? spec.staffFormFields ?? [] : DELETE,
        studentFormFields: spec.studentFormFields?.length ? spec.studentFormFields : DELETE,
        preGradeSignoffs: spec.preGradeSignoffs ?? DELETE,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      if (spec.finalGradeComponents) {
        Object.assign(update, { finalGradeComponents: spec.finalGradeComponents, supervisorEvaluation: null, examinerEvaluations: {}, autoCalculatedFinalGrade: null, gradeOverride: null });
      } else {
        Object.assign(update, { finalGradeComponents: DELETE, supervisorEvaluation: DELETE, examinerEvaluations: DELETE, autoCalculatedFinalGrade: DELETE, gradeOverride: DELETE });
      }
      if (spec.examinerOpinionForm) {
        Object.assign(update, { examinerOpinionForm: spec.examinerOpinionForm, examinerOpinionRound: 1, opinionOutcome: null });
      } else {
        Object.assign(update, { examinerOpinionForm: DELETE, examinerOpinionRound: DELETE });
      }
      if (spec.requiresExaminers) {
        if (m.examinerIds === undefined) update.examinerIds = [];
        if (m.examinerScores === undefined) update.examinerScores = {};
      }
      const summary = [
        spec.finalGradeComponents?.perStudent ? 'per-student form' : spec.finalGradeComponents ? 'three-rubric' : null,
        spec.examinerOpinionForm ? 'examiner opinion form' : null,
        spec.requiresExaminers ? `${spec.examinerCount ?? 2} examiners` : null,
        `chain: ${resolveMilestoneRouting(spec, template.defaultRouting).map((s) => `${s.role}/${s.action}`).join(' → ')}`,
      ].filter(Boolean).join(', ');
      console.log(`  ${spec.type} (${spec.nameHe}): pending — refresh (${summary})`);
      batch.update(doc.ref, update);
    }

    if (APPLY) {
      await batch.commit();
      console.log('  ✓ applied');
    }
  }
  if (!APPLY) console.log('\nDry run only — re-run with --apply to write.');
}

main().then(() => process.exit(0)).catch((err) => {
  console.error('syncElectricalTestProjectsToTemplates failed:', err);
  process.exit(1);
});
