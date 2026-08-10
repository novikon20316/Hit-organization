// src/services/coordinatorStatistics.ts
//
// Aggregations backing the administrative coordinator's "Statistics" tab —
// built on gatherEngagements() (reports.ts, unmodified) but NOT wired
// through reportsController.ts's facultyId-scoping: administrative_secretary's
// real scope lives in coordinatorScopes ({facultyId, major?} grants), which
// reportsController.ts deliberately doesn't consult (see its own comment).
// These functions are called directly by projectCoordinatorController.ts,
// which already resolves that scope for its sibling endpoints
// (getStudentsReport, getProjectCoordinatorDashboard) the same way.
//
// A shared-project subtlety drives several `.filter(studentIds.includes(...))`
// calls below: gatherEngagements computes one EngagementRecord PER (project,
// student) pair, but every record for the same project carries the SAME
// combined `milestones` array (every student's docs on that project, not
// just that record's own student) — correct for reports.ts's own per-project
// fields (currentMilestoneType etc, which it also computes on the pooled
// array), but wrong for anything here that needs one specific student's own
// progress/grade on a shared 2-student project. Each fix below re-derives
// the per-student answer from that student's own milestone docs instead of
// trusting the pooled per-project value.

import { db } from '../config/firebase.js';
import { gatherEngagements, type EngagementRecord } from './reports.js';
import { computeMilestoneProgress, type MilestoneDoc } from './studentProgress.js';
import { programLengthYearsFor } from './accountDeletion.js';
import {
  getMilestonesForTemplateId, getActiveMilestonesFor, deriveProcessType,
  type WorkflowTemplateRef,
} from './workflowTemplates.js';
import { computeProjectFinalGrade } from './gradeEngine.js';

const DONE_STATUSES = new Set(['coordinator_approved', 'completed']);

export interface DegreeScope { facultyId: string; major?: string }

function avg(nums: number[]): number {
  return nums.reduce((s, n) => s + n, 0) / nums.length;
}
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
function myMilestonesOf(r: EngagementRecord): MilestoneDoc[] {
  return r.milestones.filter((m) => Array.isArray(m.studentIds) && m.studentIds.includes(r.studentId));
}

/** Gathers every engagement across all of a coordinator's coordinatorScopes
 *  grants (or every faculty, for system_admin), optionally narrowed to one
 *  faculty the caller has already confirmed is within that scope. One
 *  gatherEngagements call per scope entry (same per-scope pattern
 *  getStudentsReport already uses), deduped by (project,student) since two
 *  scope entries could otherwise both match the same faculty. */
export async function gatherScopedEngagements(
  scopes: DegreeScope[],
  isSystemAdmin: boolean,
  facultyId?: string,
): Promise<EngagementRecord[]> {
  if (isSystemAdmin) {
    return gatherEngagements(facultyId ? { facultyId } : {});
  }
  const targetScopes = facultyId ? scopes.filter((s) => s.facultyId === facultyId) : scopes;
  const seen = new Set<string>();
  const all: EngagementRecord[] = [];
  await Promise.all(targetScopes.map(async (scope) => {
    const records = await gatherEngagements({ facultyId: scope.facultyId });
    const filtered = scope.major ? records.filter((r) => r.major === scope.major) : records;
    for (const r of filtered) {
      const key = `${r.projectId}:${r.studentId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      all.push(r);
    }
  }));
  return all;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. How many students are currently at each milestone
// ─────────────────────────────────────────────────────────────────────────────
export interface MilestoneDistributionStudentRow {
  studentId: string;
  studentName: string;
  facultyId: string;
  projectTitleHe: string;
  projectTitleEn: string;
  status: 'overdue' | 'stuck' | 'on_track';
  daysInStage: number;
}

export interface MilestoneDistributionRow {
  type: string;
  nameHe: string;
  nameEn: string;
  count: number;
  percent: number;
  students: MilestoneDistributionStudentRow[];
}

export function milestoneDistributionStats(records: EngagementRecord[]): MilestoneDistributionRow[] {
  const nonClosed = records.filter((r) => !r.isClosed && r.studentId);
  const total = nonClosed.length;
  const byType = new Map<string, MilestoneDistributionRow>();

  for (const r of nonClosed) {
    const progress = computeMilestoneProgress(myMilestonesOf(r));
    const type = progress.current?.type ?? 'none';
    let row = byType.get(type);
    if (!row) {
      row = { type, nameHe: progress.current?.nameHe || type, nameEn: progress.current?.nameEn || type, count: 0, percent: 0, students: [] };
      byType.set(type, row);
    }
    row.count++;
    row.students.push({
      studentId: r.studentId,
      studentName: r.studentName,
      facultyId: r.facultyId,
      projectTitleHe: r.projectTitleHe,
      projectTitleEn: r.projectTitleEn,
      status: progress.isOverdue ? 'overdue' : progress.isStuck ? 'stuck' : 'on_track',
      daysInStage: progress.daysInStage,
    });
  }

  const rows = [...byType.values()];
  rows.forEach((row) => { row.percent = total > 0 ? round1((row.count / total) * 100) : 0; });
  return rows.sort((a, b) => b.count - a.count);
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. How many students have completed each milestone type (count + percent) —
//    also the coordinator's "did anything fall through the cracks" check.
// ─────────────────────────────────────────────────────────────────────────────
export interface MilestoneCompletionRow {
  type: string;
  nameHe: string;
  nameEn: string;
  totalReached: number;
  completed: number;
  percent: number;
}

export function milestoneCompletionStats(records: EngagementRecord[]): MilestoneCompletionRow[] {
  const byType = new Map<string, MilestoneCompletionRow>();
  const seenMilestoneIds = new Set<string>();

  for (const r of records) {
    for (const m of r.milestones) {
      // A shared 2-student project's pooled milestones array would otherwise
      // count each doc twice — once per co-enrolled student's record.
      if (seenMilestoneIds.has(m.id)) continue;
      seenMilestoneIds.add(m.id);
      let row = byType.get(m.type);
      if (!row) {
        row = { type: m.type, nameHe: m.nameHe || m.type, nameEn: m.nameEn || m.type, totalReached: 0, completed: 0, percent: 0 };
        byType.set(m.type, row);
      }
      row.totalReached++;
      if (DONE_STATUSES.has(m.status)) row.completed++;
    }
  }

  const rows = [...byType.values()];
  rows.forEach((row) => { row.percent = row.totalReached > 0 ? round1((row.completed / row.totalReached) * 100) : 0; });
  return rows.sort((a, b) => a.type.localeCompare(b.type));
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Final grades — per-milestone-type averages (incl. rubric components)
//    plus each student's overall weighted project grade where computable.
// ─────────────────────────────────────────────────────────────────────────────
export interface MilestoneGradeStatsRow {
  type: string;
  nameHe: string;
  nameEn: string;
  gradedCount: number;
  averageFinalGrade: number | null;
  averageSupervisorEvaluation: number | null;
  averageExaminerProjectEvaluation: number | null;
  averageExaminerDefenseEvaluation: number | null;
}

export interface StudentFinalGradeRow {
  studentId: string;
  studentName: string;
  facultyId: string;
  projectId: string;
  projectTitleHe: string;
  projectTitleEn: string;
  finalGrade: number | null;
  /** True when the project's workflow template has every milestone type's
   *  percentOfFinalGrade at 0 (the current real-world default — staff
   *  haven't configured it yet) — finalGrade will read 0/null for
   *  essentially everyone until that changes; surfaced so the UI doesn't
   *  misread it as "everyone actually scored zero". */
  unconfigured: boolean;
}

export interface FinalGradesStats {
  byMilestoneType: MilestoneGradeStatsRow[];
  byStudent: StudentFinalGradeRow[];
  averageProjectFinalGrade: number | null;
}

async function resolveTemplateMilestones(projectData: FirebaseFirestore.DocumentData): Promise<{ type: string; percentOfFinalGrade?: number }[]> {
  const refs: WorkflowTemplateRef[] = projectData.workflowTemplateRefs ?? [];
  const degreeType = projectData.degreeType ?? null;
  const projectType = projectData.projectType ?? null;
  const matchingRef = refs.find((ref) => ref.degreeType === degreeType && ref.projectType === projectType);
  if (matchingRef) {
    const resolved = await getMilestonesForTemplateId(matchingRef.templateId);
    if (resolved) return resolved.milestones;
  }
  const processType = deriveProcessType(degreeType, projectType);
  const resolved = await getActiveMilestonesFor(projectData.facultyId ?? '', processType, projectData.major ?? null);
  return resolved.milestones;
}

export async function finalGradesStats(records: EngagementRecord[]): Promise<FinalGradesStats> {
  // ── Per-milestone-type averages (global doc-level tally — dedupe by id,
  // same reasoning as milestoneCompletionStats above) ──
  const byType = new Map<string, { nameHe: string; nameEn: string; finalGrades: number[]; supervisorEvals: number[]; examinerProjectEvals: number[]; examinerDefenseEvals: number[] }>();
  const seenMilestoneIds = new Set<string>();
  for (const r of records) {
    for (const m of r.milestones) {
      if (seenMilestoneIds.has(m.id)) continue;
      seenMilestoneIds.add(m.id);
      let bucket = byType.get(m.type);
      if (!bucket) {
        bucket = { nameHe: m.nameHe || m.type, nameEn: m.nameEn || m.type, finalGrades: [], supervisorEvals: [], examinerProjectEvals: [], examinerDefenseEvals: [] };
        byType.set(m.type, bucket);
      }
      const anyM = m as unknown as {
        finalGrade?: number | null;
        supervisorEvaluation?: { total?: number };
        examinerIds?: string[];
        examinerEvaluations?: Record<string, { project?: { total?: number }; defense?: { total?: number } }>;
      };
      if (anyM.finalGrade != null) bucket.finalGrades.push(anyM.finalGrade);
      if (anyM.supervisorEvaluation?.total != null) bucket.supervisorEvals.push(anyM.supervisorEvaluation.total);
      const examinerIds = anyM.examinerIds ?? [];
      const examinerEvals = anyM.examinerEvaluations ?? {};
      if (examinerIds.length > 0) {
        const projectScores = examinerIds.map((id) => examinerEvals[id]?.project?.total).filter((v): v is number => v != null);
        const defenseScores = examinerIds.map((id) => examinerEvals[id]?.defense?.total).filter((v): v is number => v != null);
        if (projectScores.length > 0) bucket.examinerProjectEvals.push(avg(projectScores));
        if (defenseScores.length > 0) bucket.examinerDefenseEvals.push(avg(defenseScores));
      }
    }
  }
  const byMilestoneType: MilestoneGradeStatsRow[] = [...byType.entries()].map(([type, b]) => ({
    type, nameHe: b.nameHe, nameEn: b.nameEn,
    gradedCount: b.finalGrades.length,
    averageFinalGrade: b.finalGrades.length > 0 ? round1(avg(b.finalGrades)) : null,
    averageSupervisorEvaluation: b.supervisorEvals.length > 0 ? round1(avg(b.supervisorEvals)) : null,
    averageExaminerProjectEvaluation: b.examinerProjectEvals.length > 0 ? round1(avg(b.examinerProjectEvals)) : null,
    averageExaminerDefenseEvaluation: b.examinerDefenseEvals.length > 0 ? round1(avg(b.examinerDefenseEvals)) : null,
  }));

  // ── Per-student overall weighted project grade ──
  const distinctProjectIds = [...new Set(records.map((r) => r.projectId).filter(Boolean))];
  const projectSnaps = await Promise.all(distinctProjectIds.map((id) => db.collection('projects').doc(id).get()));
  const projectDataById = new Map<string, FirebaseFirestore.DocumentData>();
  projectSnaps.forEach((snap) => { if (snap.exists) projectDataById.set(snap.id, snap.data()!); });

  const templateEntries = await Promise.all(
    [...projectDataById.entries()].map(async ([id, data]) => [id, await resolveTemplateMilestones(data)] as const)
  );
  const templateById = new Map(templateEntries);

  const byStudent: StudentFinalGradeRow[] = [];
  for (const r of records) {
    if (!r.studentId) continue;
    const templateMilestones = templateById.get(r.projectId);
    if (!templateMilestones) continue;

    const actualMilestones = myMilestonesOf(r).map((m) => {
      const anyM = m as unknown as { finalGrade?: number | null; finalGradeByStudent?: Record<string, number> };
      return { type: m.type, finalGrade: anyM.finalGradeByStudent?.[r.studentId] ?? anyM.finalGrade ?? null };
    });
    const finalGrade = computeProjectFinalGrade(templateMilestones, actualMilestones);
    const unconfigured = templateMilestones.every((tm) => (tm.percentOfFinalGrade ?? (tm.type === 'defense' ? 100 : 0)) === 0);

    byStudent.push({
      studentId: r.studentId, studentName: r.studentName, facultyId: r.facultyId,
      projectId: r.projectId, projectTitleHe: r.projectTitleHe, projectTitleEn: r.projectTitleEn,
      finalGrade, unconfigured,
    });
  }

  const known = byStudent.map((s) => s.finalGrade).filter((g): g is number => g != null);
  return { byMilestoneType, byStudent, averageProjectFinalGrade: known.length > 0 ? round1(avg(known)) : null };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Applications submitted, broken down by faculty (count + percent of total)
// ─────────────────────────────────────────────────────────────────────────────
export interface ApplicationsByFacultyRow {
  facultyId: string;
  count: number;
  percent: number;
}

export async function applicationsByFacultyStats(scope: string[] | 'all'): Promise<ApplicationsByFacultyRow[]> {
  let docs: FirebaseFirestore.QueryDocumentSnapshot[];
  if (scope === 'all') {
    docs = (await db.collection('applications').get()).docs;
  } else {
    if (scope.length === 0) return [];
    const snaps = await Promise.all(scope.map((fid) => db.collection('applications').where('facultyId', '==', fid).get()));
    docs = snaps.flatMap((s) => s.docs);
  }

  const counts = new Map<string, number>();
  docs.forEach((d) => {
    const fid = (d.data().facultyId as string | undefined) ?? 'unknown';
    counts.set(fid, (counts.get(fid) ?? 0) + 1);
  });
  const total = docs.length;
  return [...counts.entries()]
    .map(([facultyId, count]) => ({ facultyId, count, percent: total > 0 ? round1((count / total) * 100) : 0 }))
    .sort((a, b) => b.count - a.count);
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. On-time completion — actual completion vs. programStartDate + expected
//    program length (same math as reports.ts's statuteYearExceedanceReport,
//    evaluated for already-graduated students instead of active ones).
// ─────────────────────────────────────────────────────────────────────────────
export interface OnTimeCompletionRow {
  facultyId: string;
  onTime: number;
  late: number;
  total: number;
  percentOnTime: number;
}

export async function onTimeCompletionStats(records: EngagementRecord[]): Promise<OnTimeCompletionRow[]> {
  const completed = records.filter((r) => r.projectStatus === 'completed' && r.studentId);
  const studentIds = [...new Set(completed.map((r) => r.studentId))];
  const studentSnaps = await Promise.all(studentIds.map((id) => db.collection('users').doc(id).get()));
  const startDateById = new Map<string, Date | null>();
  studentSnaps.forEach((s) => {
    if (!s.exists) return;
    const d = s.data()!;
    startDateById.set(s.id, d.programStartDate?.toDate?.() ?? d.createdAt?.toDate?.() ?? null);
  });

  const byFaculty = new Map<string, { onTime: number; late: number }>();
  for (const r of completed) {
    const startDate = startDateById.get(r.studentId);
    if (!startDate) continue;

    const defenseMs = myMilestonesOf(r).find((m) => m.type === 'defense');
    const completedAt = defenseMs?.coordinatorApprovedAt?.toDate?.() ?? new Date();
    const years = programLengthYearsFor(r.degreeType || null, r.major || null);
    const expected = new Date(startDate);
    expected.setFullYear(expected.getFullYear() + years);

    const bucket = byFaculty.get(r.facultyId) ?? { onTime: 0, late: 0 };
    if (completedAt <= expected) bucket.onTime++; else bucket.late++;
    byFaculty.set(r.facultyId, bucket);
  }

  return [...byFaculty.entries()].map(([facultyId, b]) => ({
    facultyId, onTime: b.onTime, late: b.late, total: b.onTime + b.late,
    percentOnTime: (b.onTime + b.late) > 0 ? round1((b.onTime / (b.onTime + b.late)) * 100) : 0,
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Year-of-study distribution, with each bucket's average progress — a
//    signal for how many students are close to graduating.
// ─────────────────────────────────────────────────────────────────────────────
export interface YearOfStudyRow {
  yearOfStudy: number | 'unknown';
  count: number;
  averageProgressPercent: number;
}

export function yearOfStudyDistributionStats(records: EngagementRecord[]): YearOfStudyRow[] {
  const active = records.filter((r) => !r.isClosed && r.studentId);
  const byYear = new Map<number | 'unknown', { count: number; progressSum: number }>();
  const seenStudentIds = new Set<string>();

  for (const r of active) {
    if (seenStudentIds.has(r.studentId)) continue; // one row per student
    seenStudentIds.add(r.studentId);
    const year = r.yearOfStudy ?? 'unknown';
    const mine = myMilestonesOf(r);
    const doneCount = mine.filter((m) => DONE_STATUSES.has(m.status)).length;
    const progress = mine.length > 0 ? (doneCount / mine.length) * 100 : 0;

    const bucket = byYear.get(year) ?? { count: 0, progressSum: 0 };
    bucket.count++;
    bucket.progressSum += progress;
    byYear.set(year, bucket);
  }

  return [...byYear.entries()]
    .map(([yearOfStudy, b]) => ({ yearOfStudy, count: b.count, averageProgressPercent: round1(b.progressSum / b.count) }))
    .sort((a, b) => {
      if (a.yearOfStudy === 'unknown') return 1;
      if (b.yearOfStudy === 'unknown') return -1;
      return (a.yearOfStudy as number) - (b.yearOfStudy as number);
    });
}
