// src/services/reports.ts
//
// The reports suite from the requirements doc (section 12) — 9 named reports,
// all built on one shared "gather every non-closed engagement" pass so each
// report is a cheap shaping/filtering step rather than its own Firestore
// round-trip. Unlike the grad-school-head/program-head dashboards (which are
// masters-only), these cover every degree/process type — bachelor's included.

import { db } from '../config/firebase.js';
import { DEGREE_LENGTHS } from '../config/degreeLengths.js';
import { getAcademicCalendar } from './academicCalendar.js';
import { computeGraduationEligibleDate, programLengthYearsFor } from './accountDeletion.js';
import {
  computeMilestoneProgress,
  facultyName,
  MilestoneDoc,
  STUCK_THRESHOLD_DAYS,
} from './studentProgress.js';

export interface ReportFilters {
  facultyId?: string | undefined;
  startYear?: number | undefined;
  degreeType?: string | undefined;   // 'bachelors' | 'masters'
  projectType?: string | undefined;  // 'project' | 'thesis'
  processStatus?: string | undefined; // project.status
  advisorId?: string | undefined;
  examinerId?: string | undefined;
  milestoneType?: string | undefined;
  overdueOnly?: boolean | undefined;
}

export interface EngagementRecord {
  studentId: string;
  studentName: string;
  facultyId: string;
  facultyNameHe: string;
  facultyNameEn: string;
  degreeType: string;
  projectType: string;
  major: string;
  yearOfStudy: number | null;
  startYear: number | null;
  advisorId: string;
  advisorName: string;
  secondaryAdvisorId: string | null;
  secondaryAdvisorName: string | null;
  projectId: string;
  projectTitleHe: string;
  projectTitleEn: string;
  projectStatus: string;
  milestones: MilestoneDoc[];
  currentMilestoneType: string | null;
  currentMilestoneNameHe: string;
  currentMilestoneNameEn: string;
  enteredStageAt: string | null;
  daysInStage: number;
  isOverdue: boolean;
  isStuck: boolean;
  isClosed: boolean;
}

const CLOSED_STATUSES = new Set(['completed', 'withdrawn', 'admin_closed']);

/**
 * The shared base pass — every project not yet formally closed, joined with
 * its students, advisor(s), and milestones. Persistence requirement (section
 * 2 of the requirements doc): a case file must not disappear from reports
 * due to a year-rollover/registration-status mechanism — this queries the
 * `projects` collection directly and never touches academic-year state.
 */
export async function gatherEngagements(filters: ReportFilters = {}): Promise<EngagementRecord[]> {
  let projectsQuery: FirebaseFirestore.Query = db.collection('projects');
  if (filters.facultyId) projectsQuery = projectsQuery.where('facultyId', '==', filters.facultyId);
  if (filters.advisorId) projectsQuery = projectsQuery.where('supervisorId', '==', filters.advisorId);
  if (filters.processStatus) projectsQuery = projectsQuery.where('status', '==', filters.processStatus);

  const projectsSnap = await projectsQuery.get();
  let projects = projectsSnap.docs.map((d) => ({ id: d.id, ...d.data() } as any));

  // degreeType/projectType filtering happens in-memory, not via Firestore
  // .where() — a project can now be open to more than one of each
  // (degreeTypes/projectTypes arrays), and Firestore only allows one
  // array-contains clause per query, which facultyId/advisorId/processStatus
  // above may already be competing for. `?? [scalar]` keeps this correct
  // against pre-migration projects that only ever had the single scalar
  // field.
  if (filters.degreeType) {
    const wanted = filters.degreeType;
    projects = projects.filter((p) => (p.degreeTypes ?? (p.degreeType ? [p.degreeType] : [])).includes(wanted));
  }
  if (filters.projectType) {
    const wanted = filters.projectType;
    projects = projects.filter((p) => (p.projectTypes ?? (p.projectType ? [p.projectType] : [])).includes(wanted));
  }

  if (projects.length === 0) return [];

  const projectIds = projects.map((p) => p.id);

  // Firestore 'in' queries cap at 30 values — chunk if this ever grows past that.
  const milestonesByProject: Record<string, MilestoneDoc[]> = {};
  for (let i = 0; i < projectIds.length; i += 30) {
    const chunk = projectIds.slice(i, i + 30);
    const milestonesSnap = await db.collection('milestones').where('projectId', 'in', chunk).get();
    milestonesSnap.docs.forEach((doc) => {
      const data = doc.data();
      const pid = data.projectId;
      if (!milestonesByProject[pid]) milestonesByProject[pid] = [];
      milestonesByProject[pid].push({ id: doc.id, ...data } as MilestoneDoc);
    });
  }

  // Batch-fetch every identity (students + advisors) referenced.
  const userIds = new Set<string>();
  projects.forEach((p) => {
    if (p.supervisorId) userIds.add(p.supervisorId);
    if (p.secondarySupervisorId) userIds.add(p.secondarySupervisorId);
    (p.enrolledStudentIds ?? []).forEach((id: string) => userIds.add(id));
  });
  const userSnaps = await Promise.all([...userIds].map((id) => db.collection('users').doc(id).get()));
  const usersById: Record<string, FirebaseFirestore.DocumentData> = {};
  userSnaps.forEach((snap) => { if (snap.exists) usersById[snap.id] = snap.data()!; });

  const records: EngagementRecord[] = [];

  for (const project of projects) {
    const isClosed = CLOSED_STATUSES.has(project.status);
    const projectMilestones = milestonesByProject[project.id] ?? [];
    const progress = computeMilestoneProgress(projectMilestones);
    const fname = facultyName(project.facultyId ?? '');
    const advisor = project.supervisorId ? usersById[project.supervisorId] : undefined;
    const secondaryAdvisor = project.secondarySupervisorId ? usersById[project.secondarySupervisorId] : undefined;

    if (filters.examinerId) {
      const defenseMs = projectMilestones.find((m) => m.type === 'defense');
      if (!defenseMs || !(defenseMs.examinerIds ?? []).includes(filters.examinerId)) continue;
    }
    if (filters.milestoneType && progress.current?.type !== filters.milestoneType) continue;
    if (filters.overdueOnly && !progress.isOverdue) continue;

    const studentIds: string[] = project.enrolledStudentIds ?? [];
    const studentEntries = studentIds.length > 0 ? studentIds : [null]; // initiation-stage projects may have no student yet

    for (const studentId of studentEntries) {
      const student = studentId ? usersById[studentId] : undefined;
      const startYear = student?.programStartDate?.toDate?.()?.getFullYear?.()
        ?? student?.createdAt?.toDate?.()?.getFullYear?.()
        ?? null;
      if (filters.startYear && startYear !== filters.startYear) continue;

      records.push({
        studentId: studentId ?? '',
        studentName: student?.displayName ?? (studentId ? 'Unknown' : ''),
        facultyId: project.facultyId ?? '',
        facultyNameHe: fname.he,
        facultyNameEn: fname.en,
        degreeType: project.degreeType ?? '',
        projectType: project.projectType ?? '',
        major: student?.major ?? '',
        yearOfStudy: student?.yearOfStudy ?? null,
        startYear,
        advisorId: project.supervisorId ?? '',
        advisorName: advisor?.displayName ?? (project.supervisorId ? 'Unknown' : 'Unassigned'),
        secondaryAdvisorId: project.secondarySupervisorId ?? null,
        secondaryAdvisorName: secondaryAdvisor?.displayName ?? null,
        projectId: project.id,
        projectTitleHe: project.titleHe ?? '',
        projectTitleEn: project.titleEn ?? '',
        projectStatus: project.status ?? '',
        milestones: projectMilestones,
        currentMilestoneType: progress.current?.type ?? null,
        currentMilestoneNameHe: progress.current?.nameHe ?? '',
        currentMilestoneNameEn: progress.current?.nameEn ?? '',
        enteredStageAt: null,
        daysInStage: progress.daysInStage,
        isOverdue: progress.isOverdue,
        isStuck: progress.isStuck,
        isClosed,
      });
    }
  }

  return records;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Full status report
// ─────────────────────────────────────────────────────────────────────────────
export async function fullStatusReport(filters: ReportFilters) {
  const records = await gatherEngagements(filters);
  return records.filter((r) => !r.isClosed);
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. No advisor / topic report — stuck in initiation
// ─────────────────────────────────────────────────────────────────────────────
export async function noAdvisorReport(filters: ReportFilters) {
  const records = await gatherEngagements(filters);
  return records.filter((r) => !r.isClosed && (!r.advisorId || !r.projectTitleHe) && r.daysInStage > STUCK_THRESHOLD_DAYS);
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Proposal / project delay report
// ─────────────────────────────────────────────────────────────────────────────
export async function proposalDelayReport(filters: ReportFilters) {
  const records = await gatherEngagements(filters);
  return records.filter((r) =>
    !r.isClosed &&
    r.currentMilestoneType === 'research_proposal' &&
    (r.isOverdue || r.daysInStage > STUCK_THRESHOLD_DAYS)
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Examiner tracking report
// ─────────────────────────────────────────────────────────────────────────────
export interface ExaminerTrackingRow {
  examinerName: string;
  examinerType: 'internal' | 'external';
  studentName: string;
  projectTitle: string;
  invitedAt: string | null;
  acceptedAt: string | null;
  submittedAt: string | null;
  daysElapsed: number | null;
  opinionStatus: 'pending' | 'accepted' | 'declined' | 'submitted';
  exceptionLevel: 'none' | 'warning' | 'overdue';
}

export async function examinerTrackingReport(filters: ReportFilters): Promise<ExaminerTrackingRow[]> {
  const rows: ExaminerTrackingRow[] = [];
  const now = Date.now();

  // External examiners — examinerTokens carries the full timeline.
  const tokensSnap = await db.collection('examinerTokens').get();

  // Batch-fetch every referenced project up front (Promise.all) instead of
  // one sequential await per token inside the loop below — the previous
  // per-token round-trip meant a facultyId-filtered report with N tokens
  // took N sequential round-trips instead of one parallel batch.
  const projectFacultyById: Record<string, string | undefined> = {};
  if (filters.facultyId) {
    const projectIds = new Set<string>();
    tokensSnap.docs.forEach((doc) => {
      const pid = doc.data().projectId;
      if (pid) projectIds.add(pid);
    });
    const projectSnaps = await Promise.all([...projectIds].map((id) => db.collection('projects').doc(id).get()));
    projectSnaps.forEach((snap) => { if (snap.exists) projectFacultyById[snap.id] = snap.data()?.facultyId; });
  }

  for (const doc of tokensSnap.docs) {
    const t = doc.data();
    if (filters.facultyId && projectFacultyById[t.projectId] !== filters.facultyId) continue;
    const invitedAt = t.createdAt ? new Date(t.createdAt) : null;
    const daysElapsed = invitedAt ? Math.floor((now - invitedAt.getTime()) / 86_400_000) : null;
    const expiresAt = t.expiresAt ? new Date(t.expiresAt) : null;
    const exceptionLevel: ExaminerTrackingRow['exceptionLevel'] =
      t.status === 'submitted' ? 'none' :
      expiresAt && now > expiresAt.getTime() ? 'overdue' :
      expiresAt && (expiresAt.getTime() - now) < 7 * 86_400_000 ? 'warning' : 'none';

    rows.push({
      examinerName: t.examinerName ?? 'Unknown',
      examinerType: 'external',
      studentName: t.studentName ?? '',
      projectTitle: t.thesisTitle ?? '',
      invitedAt: t.createdAt ?? null,
      acceptedAt: t.acceptedAt ?? null,
      submittedAt: t.submittedAt ?? null,
      daysElapsed,
      opinionStatus: t.status ?? 'pending',
      exceptionLevel,
    });
  }

  // Internal examiners — no invite/accept timeline exists (direct assignment),
  // shown with what's actually available: assignment + grading state.
  const engagements = await gatherEngagements(filters);
  const userIds = new Set<string>();
  engagements.forEach((r) => {
    r.milestones.forEach((m) => (m.examinerIds ?? []).forEach((id) => userIds.add(id)));
  });
  const userSnaps = await Promise.all([...userIds].map((id) => db.collection('users').doc(id).get()));
  const usersById: Record<string, string> = {};
  userSnaps.forEach((s) => { if (s.exists) usersById[s.id] = s.data()?.displayName ?? 'Unknown'; });

  for (const r of engagements) {
    const defenseMs = r.milestones.find((m) => m.type === 'defense');
    if (!defenseMs) continue;
    (defenseMs.examinerIds ?? []).forEach((eid, idx) => {
      if (filters.examinerId && eid !== filters.examinerId) return;
      const score = idx === 0 ? defenseMs.examiner1Score : defenseMs.examiner2Score;
      rows.push({
        examinerName: usersById[eid] ?? 'Unknown',
        examinerType: 'internal',
        studentName: r.studentName,
        projectTitle: r.projectTitleHe || r.projectTitleEn,
        invitedAt: null,
        acceptedAt: null,
        submittedAt: score != null ? (defenseMs.gradedAt ? String(defenseMs.gradedAt) : null) : null,
        daysElapsed: r.daysInStage,
        opinionStatus: score != null ? 'submitted' : 'pending',
        exceptionLevel: score == null && r.isOverdue ? 'overdue' : 'none',
      });
    });
  }

  return rows;
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Missing items for degree closure report
// ─────────────────────────────────────────────────────────────────────────────
export interface ClosureGapRow extends EngagementRecord {
  missing: string[];
}

export async function missingForClosureReport(filters: ReportFilters): Promise<ClosureGapRow[]> {
  const records = await gatherEngagements(filters);
  const rows: ClosureGapRow[] = [];

  for (const r of records) {
    if (r.isClosed) continue;
    const defenseMs = r.milestones.find((m) => m.type === 'defense');
    if (!defenseMs) continue;
    const graded = defenseMs.status === 'graded' || defenseMs.status === 'coordinator_approved';
    if (!graded) continue; // hasn't reached judging/defense completion yet — not this report's concern

    const missing: string[] = [];
    if ((defenseMs as any).finalGrade == null) missing.push('final_grade');
    if (!(defenseMs as any).gradeApproved) missing.push('grade_approval');
    if ((defenseMs as any).michlolTransferStatus !== 'transferred') missing.push('michlol_transfer');
    if (defenseMs.status !== 'coordinator_approved') missing.push('coordinator_closure');

    if (missing.length > 0) rows.push({ ...r, missing });
  }
  return rows;
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Stuck students report
// ─────────────────────────────────────────────────────────────────────────────
export interface StuckSummaryRow {
  milestoneType: string;
  total: number;
  exceededThreshold: number;
}

export async function stuckStudentsReport(filters: ReportFilters): Promise<{ threshold: number; byMilestone: StuckSummaryRow[]; students: EngagementRecord[] }> {
  const records = (await gatherEngagements(filters)).filter((r) => !r.isClosed);
  const byMilestoneMap: Record<string, StuckSummaryRow> = {};

  for (const r of records) {
    const type = r.currentMilestoneType ?? 'unknown';
    if (!byMilestoneMap[type]) byMilestoneMap[type] = { milestoneType: type, total: 0, exceededThreshold: 0 };
    byMilestoneMap[type].total++;
    if (r.isStuck) byMilestoneMap[type].exceededThreshold++;
  }

  return {
    threshold: STUCK_THRESHOLD_DAYS,
    byMilestone: Object.values(byMilestoneMap),
    students: records.filter((r) => r.isStuck),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. Statute-year exceedance report
// ─────────────────────────────────────────────────────────────────────────────
export interface StatuteRow extends EngagementRecord {
  programStartDate: string | null;
  expectedCompletionDate: string;
  yearsOverdue: number;
}

export async function statuteYearExceedanceReport(filters: ReportFilters): Promise<StatuteRow[]> {
  const records = (await gatherEngagements(filters)).filter((r) => !r.isClosed && r.studentId);
  const calendar = await getAcademicCalendar();
  const now = new Date();

  const studentSnaps = await Promise.all(
    [...new Set(records.map((r) => r.studentId))].map((id) => db.collection('users').doc(id).get())
  );
  const startDatesById: Record<string, Date | null> = {};
  studentSnaps.forEach((s) => {
    if (!s.exists) return;
    const d = s.data();
    startDatesById[s.id] = d?.programStartDate?.toDate?.() ?? d?.createdAt?.toDate?.() ?? null;
  });

  const rows: StatuteRow[] = [];
  for (const r of records) {
    const programStartDate = startDatesById[r.studentId];
    if (!programStartDate) continue;
    const years = programLengthYearsFor(r.degreeType || null, r.major || null);
    // Statute limit here is the plain expected duration — deliberately NOT the
    // conservative +1-year buffer accountDeletion.ts uses for auto-deletion
    // safety; this report should surface exceedance as soon as it's real.
    const expectedCompletion = new Date(programStartDate);
    expectedCompletion.setFullYear(expectedCompletion.getFullYear() + years);
    if (now <= expectedCompletion) continue;

    const yearsOverdue = (now.getTime() - expectedCompletion.getTime()) / (365.25 * 86_400_000);
    rows.push({
      ...r,
      programStartDate: programStartDate.toISOString(),
      expectedCompletionDate: expectedCompletion.toISOString(),
      yearsOverdue: Math.round(yearsOverdue * 10) / 10,
    });
  }
  return rows.sort((a, b) => b.yearsOverdue - a.yearsOverdue);
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. Advising / examining load report
// ─────────────────────────────────────────────────────────────────────────────
export interface LoadRow {
  personId: string;
  personName: string;
  role: 'advisor' | 'examiner';
  activeCount: number;
  pendingReviewCount: number;
}

export async function loadReport(filters: ReportFilters): Promise<LoadRow[]> {
  const records = (await gatherEngagements(filters)).filter((r) => !r.isClosed);
  const byAdvisor: Record<string, { name: string; count: number }> = {};
  const byExaminer: Record<string, { name: string; active: number; pending: number }> = {};

  const userIds = new Set<string>();
  records.forEach((r) => r.milestones.forEach((m) => (m.examinerIds ?? []).forEach((id) => userIds.add(id))));
  const userSnaps = await Promise.all([...userIds].map((id) => db.collection('users').doc(id).get()));
  const usersById: Record<string, string> = {};
  userSnaps.forEach((s) => { if (s.exists) usersById[s.id] = s.data()?.displayName ?? 'Unknown'; });

  for (const r of records) {
    if (r.advisorId) {
      if (!byAdvisor[r.advisorId]) byAdvisor[r.advisorId] = { name: r.advisorName, count: 0 };
      byAdvisor[r.advisorId]!.count++;
    }
    const defenseMs = r.milestones.find((m) => m.type === 'defense');
    if (defenseMs) {
      (defenseMs.examinerIds ?? []).forEach((eid, idx) => {
        const score = idx === 0 ? defenseMs.examiner1Score : defenseMs.examiner2Score;
        if (!byExaminer[eid]) byExaminer[eid] = { name: usersById[eid] ?? 'Unknown', active: 0, pending: 0 };
        if (score != null) byExaminer[eid]!.active++;
        else byExaminer[eid]!.pending++;
      });
    }
  }

  const rows: LoadRow[] = [];
  Object.entries(byAdvisor).forEach(([id, v]) => rows.push({ personId: id, personName: v.name, role: 'advisor', activeCount: v.count, pendingReviewCount: 0 }));
  Object.entries(byExaminer).forEach(([id, v]) => rows.push({ personId: id, personName: v.name, role: 'examiner', activeCount: v.active, pendingReviewCount: v.pending }));
  return rows;
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. Repository report — completed/graduated works
// ─────────────────────────────────────────────────────────────────────────────
export interface RepositoryRow {
  projectTitleHe: string;
  projectTitleEn: string;
  studentName: string;
  advisorName: string;
  facultyNameHe: string;
  facultyNameEn: string;
  finalGrade: number | null;
  completedAt: string | null;
}

export async function repositoryReport(filters: ReportFilters): Promise<RepositoryRow[]> {
  const records = await gatherEngagements(filters);
  return records
    .filter((r) => r.isClosed || r.milestones.some((m) => m.type === 'defense' && m.status === 'coordinator_approved'))
    .map((r) => {
      const defenseMs = r.milestones.find((m) => m.type === 'defense');
      return {
        projectTitleHe: r.projectTitleHe,
        projectTitleEn: r.projectTitleEn,
        studentName: r.studentName,
        advisorName: r.advisorName,
        facultyNameHe: r.facultyNameHe,
        facultyNameEn: r.facultyNameEn,
        finalGrade: (defenseMs as any)?.finalGrade ?? null,
        completedAt: defenseMs?.coordinatorApprovedAt ? String(defenseMs.coordinatorApprovedAt) : null,
      };
    });
}
