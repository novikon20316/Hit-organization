// src/services/workflowTemplateRetroactiveApply.ts
//
// "Now" (retroactive) workflow-template application — touches in-progress
// projects/theses already using an older/superseded template for the same
// facultyId+processType+major, instead of only affecting new enrollments
// (the app's only behavior until now — see workflowTemplates.ts's own
// header comment). No reusable "discover matching projects" query existed
// before this; the shape here mirrors reports.ts's gatherEngagements
// (chained equality .where()s on `projects`, then a chunked `in` query on
// `milestones`) and deadlineOverride.ts's batch-chunking conventions.
//
// Safety invariants (confirmed with the requester before building this):
//   - Never mutates a milestone that isn't still 'pending' — a submitted,
//     graded, or otherwise-advanced milestone is left exactly as it is.
//   - A milestone type the new template adds that a project doesn't have
//     yet IS auto-created (as pending) for every matching in-progress
//     project.
//   - A milestone type the new template drops is left untouched on
//     in-progress projects — existing data is never deleted or hidden.
//   - This only ever runs after the template itself has been approved, and
//     only when that template's applyMode === 'now' — see
//     workflowTemplateController.ts's approveWorkflowTemplateController.

import admin from 'firebase-admin';
import { db } from '../config/firebase.js';
import { logAuditEvent } from './auditLog.js';
import { resolveMilestoneRouting, resolveMilestoneDueDate, type MilestoneRoutingSpec, type ProcessType, type WorkflowMilestoneSpec } from './workflowTemplates.js';

interface MatchingProject {
  id: string;
  facultyId: string;
  supervisorId?: string;
  enrolledStudentIds: string[];
}

// Reverse of workflowTemplates.ts's deriveProcessType — which degreeType/
// projectType combination(s) on a `projects` doc correspond to a given
// ProcessType, for querying. bsc_project matches any projectType, per
// deriveProcessType always collapsing bachelors to bsc_project regardless.
function projectFilterFor(processType: ProcessType): { degreeType: string; requireThesis?: boolean; excludeThesis?: boolean } {
  if (processType === 'msc_thesis') return { degreeType: 'masters', requireThesis: true };
  if (processType === 'msc_project') return { degreeType: 'masters', excludeThesis: true };
  return { degreeType: 'bachelors' };
}

/** Finds in-progress projects matching facultyId+processType+major — shared
 *  by the read-only preview and the real retroactive-apply mutation below. */
async function findMatchingInProgressProjects(
  facultyId: string,
  processType: ProcessType,
  major: string | null,
): Promise<MatchingProject[]> {
  const filter = projectFilterFor(processType);

  // array-contains, not equality, on degreeTypes — a project open to both
  // bachelors and masters must still be found here. Requires
  // backfillDegreeProjectTypes.ts to have run against every pre-existing
  // project (a legacy doc entirely missing the degreeTypes array wouldn't
  // match array-contains at all, even if its old scalar degreeType matches).
  const snap = await db.collection('projects')
    .where('facultyId', '==', facultyId)
    .where('degreeTypes', 'array-contains', filter.degreeType)
    .where('status', '==', 'in_progress') // not 'active' — that means not-yet-enrolled
    .get();

  let projects = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Record<string, any>));
  const projectTypesOf = (p: Record<string, any>): string[] => p.projectTypes ?? (p.projectType ? [p.projectType] : []);
  if (filter.requireThesis) projects = projects.filter((p) => projectTypesOf(p).includes('thesis'));
  if (filter.excludeThesis) projects = projects.filter((p) => !projectTypesOf(p).includes('thesis'));

  if (major) {
    // A project's own `major` is optional ("open to any major") — where
    // unset, fall back to the enrolled student's own major, same precedent
    // as reports.ts's gatherEngagements.
    const needsLookup = projects.filter((p) => !p.major);
    const studentIds = new Set<string>();
    needsLookup.forEach((p) => (p.enrolledStudentIds ?? []).forEach((id: string) => studentIds.add(id)));
    const studentSnaps = await Promise.all([...studentIds].map((id) => db.collection('users').doc(id).get()));
    const majorByStudent: Record<string, string | undefined> = {};
    studentSnaps.forEach((s) => { if (s.exists) majorByStudent[s.id] = s.data()?.major; });

    projects = projects.filter((p) => {
      const resolvedMajor: string | undefined = p.major ?? (p.enrolledStudentIds ?? [])
        .map((id: string) => majorByStudent[id])
        .find((m: string | undefined) => !!m);
      return resolvedMajor === major;
    });
  }

  return projects.map((p) => ({
    id: p.id,
    facultyId: p.facultyId,
    supervisorId: p.supervisorId,
    enrolledStudentIds: p.enrolledStudentIds ?? [],
  }));
}

interface ExistingMilestone {
  ref: FirebaseFirestore.DocumentReference;
  type: string;
  status: string;
  nameHe?: string;
  nameEn?: string;
  dueDate: Date | null;
}

/** Every milestone of the given projects, grouped by projectId. */
async function loadMilestonesByProject(projectIds: string[]): Promise<Record<string, ExistingMilestone[]>> {
  // Firestore 'in' queries cap at 30 values — chunk projectIds accordingly.
  const CHUNK_SIZE = 30;
  const chunks: string[][] = [];
  for (let i = 0; i < projectIds.length; i += CHUNK_SIZE) chunks.push(projectIds.slice(i, i + CHUNK_SIZE));
  const milestoneSnaps = await Promise.all(chunks.map((chunk) => db.collection('milestones').where('projectId', 'in', chunk).get()));
  const milestonesByProject: Record<string, ExistingMilestone[]> = {};
  milestoneSnaps.forEach((snap) => snap.docs.forEach((doc) => {
    const data = doc.data();
    const pid = data.projectId as string;
    (milestonesByProject[pid] ??= []).push({
      ref: doc.ref,
      type: data.type,
      status: data.status,
      nameHe: data.nameHe,
      nameEn: data.nameEn,
      dueDate: data.dueDate?.toDate?.() ?? null,
    });
  }));
  return milestonesByProject;
}

export type RetroactiveAction =
  /** Still 'pending' — name, due date, chain and forms are replaced. */
  | 'update'
  /** The new template adds this milestone — created as 'pending'. */
  | 'create'
  /** Already submitted/graded/etc. — left exactly as it is. */
  | 'keep_started'
  /** The new template drops this milestone — left exactly as it is. */
  | 'keep_removed';

export interface RetroactivePlanItem {
  type: string;
  nameHe: string;
  nameEn: string;
  action: RetroactiveAction;
  status: string | null;
  dueBefore: Date | null;
  dueAfter: Date | null;
  spec?: WorkflowMilestoneSpec;
  existing?: ExistingMilestone;
}

/** What applying `specs` would do to one project's milestones — pure, so
 *  the read-only review and the real apply can't disagree. Encodes the
 *  safety invariants in this file's header. */
function planRetroactiveChanges(existing: ExistingMilestone[], specs: WorkflowMilestoneSpec[], now: Date): RetroactivePlanItem[] {
  const existingByType = new Map(existing.map((m) => [m.type, m]));
  const plan: RetroactivePlanItem[] = specs.map((spec) => {
    const current = existingByType.get(spec.type);
    // Due dates are recomputed from `now` (the approval moment), not from the
    // student's own start date — offset milestones move accordingly.
    const dueAfter = resolveMilestoneDueDate(spec, now, specs);
    if (!current) {
      return { type: spec.type, nameHe: spec.nameHe, nameEn: spec.nameEn, action: 'create', status: null, dueBefore: null, dueAfter, spec };
    }
    // Never touch a milestone that's moved past 'pending' — already
    // submitted/graded/completed stays exactly as it is.
    if (current.status !== 'pending') {
      return { type: spec.type, nameHe: current.nameHe ?? spec.nameHe, nameEn: current.nameEn ?? spec.nameEn, action: 'keep_started', status: current.status, dueBefore: current.dueDate, dueAfter: current.dueDate, spec };
    }
    return { type: spec.type, nameHe: spec.nameHe, nameEn: spec.nameEn, action: 'update', status: current.status, dueBefore: current.dueDate, dueAfter, spec, existing: current };
  });
  const specTypes = new Set(specs.map((s) => s.type));
  for (const m of existing) {
    if (specTypes.has(m.type)) continue;
    plan.push({ type: m.type, nameHe: m.nameHe ?? m.type, nameEn: m.nameEn ?? m.type, action: 'keep_removed', status: m.status, dueBefore: m.dueDate, dueAfter: m.dueDate });
  }
  return plan;
}

export interface RetroactiveProjectImpact {
  id: string;
  studentNames: string[];
  changes: Array<{ type: string; nameHe: string; nameEn: string; action: RetroactiveAction; status: string | null; dueBefore: string | null; dueAfter: string | null }>;
}

/** Read-only — per project, exactly what approving now would change (the
 *  same plan applyTemplateRetroactively executes), for the approver's review. */
export async function previewRetroactiveChanges(
  facultyId: string,
  processType: ProcessType,
  major: string | null,
  milestoneSpecs: WorkflowMilestoneSpec[],
): Promise<RetroactiveProjectImpact[]> {
  const projects = await findMatchingInProgressProjects(facultyId, processType, major);
  if (projects.length === 0) return [];
  const [milestonesByProject, nameByStudent] = await Promise.all([
    loadMilestonesByProject(projects.map((p) => p.id)),
    studentNamesFor(projects),
  ]);
  const now = new Date();
  return projects.map((p) => ({
    id: p.id,
    studentNames: p.enrolledStudentIds.map((id) => nameByStudent[id] ?? id),
    changes: planRetroactiveChanges(milestonesByProject[p.id] ?? [], milestoneSpecs, now).map((item) => ({
      type: item.type,
      nameHe: item.nameHe,
      nameEn: item.nameEn,
      action: item.action,
      status: item.status,
      dueBefore: item.dueBefore?.toISOString() ?? null,
      dueAfter: item.dueAfter?.toISOString() ?? null,
    })),
  }));
}

async function studentNamesFor(projects: MatchingProject[]): Promise<Record<string, string>> {
  const studentIds = new Set<string>();
  projects.forEach((p) => p.enrolledStudentIds.forEach((id) => studentIds.add(id)));
  const studentSnaps = await Promise.all([...studentIds].map((id) => db.collection('users').doc(id).get()));
  const nameByStudent: Record<string, string> = {};
  studentSnaps.forEach((s) => { if (s.exists) nameByStudent[s.id] = (s.data()?.displayName as string) ?? s.id; });
  return nameByStudent;
}

export interface RetroactivePreview {
  count: number;
  projects: Array<{ id: string; studentNames: string[] }>;
}

/** Read-only — used both when the proposer picks "now" (informational) and
 *  again right before the approver confirms (final check, since time may
 *  have passed since the proposal was created). */
export async function previewRetroactiveImpact(
  facultyId: string,
  processType: ProcessType,
  major: string | null,
): Promise<RetroactivePreview> {
  const projects = await findMatchingInProgressProjects(facultyId, processType, major);
  const nameByStudent = await studentNamesFor(projects);

  return {
    count: projects.length,
    projects: projects.map((p) => ({
      id: p.id,
      studentNames: p.enrolledStudentIds.map((id) => nameByStudent[id] ?? id),
    })),
  };
}

/**
 * Retroactively updates in-progress projects matching facultyId+processType+
 * major to the new template's milestone specs. See file header for the
 * safety invariants this must never violate.
 */
export async function applyTemplateRetroactively(
  facultyId: string,
  processType: ProcessType,
  major: string | null,
  milestoneSpecs: WorkflowMilestoneSpec[],
  actingUid: string,
  actingRole: string,
  templateDefaultRouting?: MilestoneRoutingSpec,
): Promise<{ affectedCount: number }> {
  const projects = await findMatchingInProgressProjects(facultyId, processType, major);
  if (projects.length === 0) return { affectedCount: 0 };

  const projectIds = projects.map((p) => p.id);

  const milestonesByProject = await loadMilestonesByProject(projectIds);

  // Firestore batches cap at 500 writes — chunk into multiple batches.
  const BATCH_LIMIT = 450;
  let batch = db.batch();
  let opsInBatch = 0;
  const commits: Promise<unknown>[] = [];
  const queueOp = (fn: (b: FirebaseFirestore.WriteBatch) => void) => {
    fn(batch);
    opsInBatch++;
    if (opsInBatch >= BATCH_LIMIT) {
      commits.push(batch.commit());
      batch = db.batch();
      opsInBatch = 0;
    }
  };

  let affectedCount = 0;
  const now = new Date();
  for (const project of projects) {
    // The plan is the single source of truth for what changes — the same
    // one the read-only review (workflowTemplateReview.ts) shows the
    // approver before they confirm.
    const plan = planRetroactiveChanges(milestonesByProject[project.id] ?? [], milestoneSpecs, now);
    let touched = false;

    for (const item of plan) {
      if (item.action !== 'update' && item.action !== 'create') continue;
      const spec = item.spec!;
      const dueDate = item.dueAfter!;

      if (item.action === 'update') {
        const current = item.existing!;
        queueOp((b) => b.update(current.ref, {
          nameHe: spec.nameHe,
          nameEn: spec.nameEn,
          dueDate: admin.firestore.Timestamp.fromDate(dueDate),
          ...(spec.gradingComponents ? { gradingComponents: spec.gradingComponents } : {}),
          ...(spec.staffRecordMode === 'upload_or_form' ? { staffRecordMode: spec.staffRecordMode, staffFormFields: spec.staffFormFields ?? [] } : {}),
          ...(spec.finalGradeComponents ? { finalGradeComponents: spec.finalGradeComponents } : {}),
          // Refreshes the still-pending milestone's chain to match the newly
          // approved template — never touches currentStageIndex/stageScores/
          // stageEnteredAt, since a still-pending milestone hasn't started
          // its chain yet (position 0, nothing recorded either way). Every
          // milestone gets a routing snapshot now, examiner-requiring or
          // not — see projectEnrollment.ts's identical comment.
          routing: resolveMilestoneRouting(spec, templateDefaultRouting),
          seminarScheduling: spec.seminarScheduling ? true : admin.firestore.FieldValue.delete(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }));
        touched = true;
      } else {
        // A stage the new template adds that this project doesn't have yet
        // — auto-created as pending, per the requester's explicit choice.
        const ref = db.collection('milestones').doc();
        queueOp((b) => b.set(ref, {
          projectId: project.id,
          studentIds: project.enrolledStudentIds,
          supervisorId: project.supervisorId ?? null,
          facultyId: project.facultyId,
          type: spec.type,
          nameHe: spec.nameHe,
          nameEn: spec.nameEn,
          status: 'pending',
          dueDate: admin.firestore.Timestamp.fromDate(dueDate),
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          finalGrade: null,
          fileUrls: [],
          supervisorScore: null,
          ...(spec.requiresExaminers ? { examinerIds: [], examinerScores: {} } : {}),
          // See projectEnrollment.ts's identical comment — every milestone
          // snapshots the chain.
          routing: resolveMilestoneRouting(spec, templateDefaultRouting),
          currentStageIndex: 0,
          stageScores: {},
          stageEnteredAt: admin.firestore.FieldValue.serverTimestamp(),
          ...(spec.gradingComponents ? { gradingComponents: spec.gradingComponents } : {}),
          ...(spec.staffRecordMode === 'upload_or_form' ? { staffRecordMode: spec.staffRecordMode, staffFormFields: spec.staffFormFields ?? [] } : {}),
          ...(spec.finalGradeComponents ? { finalGradeComponents: spec.finalGradeComponents } : {}),
          ...(spec.seminarScheduling ? { seminarScheduling: true } : {}),
        }));
        touched = true;
      }
    }
    if (touched) affectedCount++;
  }
  if (opsInBatch > 0) commits.push(batch.commit());
  await Promise.all(commits);

  await logAuditEvent({
    userId: actingUid,
    userRole: actingRole,
    action: 'workflow_template_retroactively_applied',
    entityType: 'workflowTemplate',
    entityId: `${facultyId}:${processType}:${major ?? 'all'}`,
    newValue: { affectedCount, projectIds },
  });

  return { affectedCount };
}
