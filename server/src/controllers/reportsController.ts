// src/controllers/reportsController.ts
//
// The reports suite (requirements doc section 12). One dispatch endpoint per
// report type, plus an Excel-export variant of each — see services/reports.ts
// for the actual data-gathering logic, this file is dispatch + access control
// + the Excel column mapping.

import { Response } from 'express';
import * as XLSX from 'xlsx';
import { AuthenticatedRequest } from '../middleware/auth.js';
import {
  ReportFilters,
  fullStatusReport,
  noAdvisorReport,
  proposalDelayReport,
  examinerTrackingReport,
  missingForClosureReport,
  stuckStudentsReport,
  statuteYearExceedanceReport,
  loadReport,
  repositoryReport,
} from '../services/reports.js';
import { effectiveFacultyIds, type RoleFacultyField } from '../services/scopeAuthorization.js';

const REPORT_ROLES = ['coordinator', 'faculty_admin', 'program_head', 'administrative_secretary', 'grad_school_head', 'system_admin'];

// Which *FacultyIds field each report-viewing role's own scope reads from —
// faculty_admin/program_head/grad_school_head can each view reports for
// their own faculty or any extra one granted for that role (see
// resolveFacultyScope below). coordinator/administrative_secretary have no
// entry here and keep their pre-existing "must match own facultyId exactly"
// behavior — administrative_secretary's real scope lives in
// coordinatorScopes, not this mechanism (out of scope for this change).
const REPORT_ROLE_FACULTY_FIELD: Record<string, RoleFacultyField> = {
  faculty_admin: 'facultyAdminFacultyIds',
  program_head: 'programHeadFacultyIds',
  grad_school_head: 'gradSchoolHeadFacultyIds',
};

export const REPORT_TYPES = [
  'full-status', 'no-advisor', 'proposal-delay', 'examiner-tracking',
  'missing-closure', 'stuck-students', 'statute-exceedance', 'load', 'repository',
] as const;
type ReportType = typeof REPORT_TYPES[number];

function parseFilters(req: AuthenticatedRequest, resolvedFacultyId: string | undefined): ReportFilters {
  const q = req.query as Record<string, string | undefined>;
  return {
    facultyId: resolvedFacultyId,
    startYear: q.startYear ? Number(q.startYear) : undefined,
    degreeType: q.degreeType || undefined,
    projectType: q.projectType || undefined,
    processStatus: q.processStatus || undefined,
    advisorId: q.advisorId || undefined,
    examinerId: q.examinerId || undefined,
    milestoneType: q.milestoneType || undefined,
    overdueOnly: q.overdueOnly === 'true',
  };
}

async function runReport(type: ReportType, filters: ReportFilters) {
  switch (type) {
    case 'full-status':        return fullStatusReport(filters);
    case 'no-advisor':         return noAdvisorReport(filters);
    case 'proposal-delay':     return proposalDelayReport(filters);
    case 'examiner-tracking':  return examinerTrackingReport(filters);
    case 'missing-closure':    return missingForClosureReport(filters);
    case 'stuck-students':     return stuckStudentsReport(filters);
    case 'statute-exceedance': return statuteYearExceedanceReport(filters);
    case 'load':               return loadReport(filters);
    case 'repository':         return repositoryReport(filters);
  }
}

/** Resolves the effective facultyId scope, or a 403/400 if the request is out of bounds. */
function resolveFacultyScope(req: AuthenticatedRequest): { facultyId?: string | undefined; error?: { status: number; message: string } | undefined } {
  const role = req.user?.role;
  if (!role || !REPORT_ROLES.includes(role)) {
    return { error: { status: 403, message: 'You do not have permission to view reports.' } };
  }
  const requested = (req.query.facultyId as string | undefined) ?? undefined;

  // system_admin: always fully unrestricted, unchanged.
  if (role === 'system_admin') {
    return { facultyId: requested }; // omitted = all faculties
  }

  // faculty_admin/program_head/grad_school_head: may request their own
  // faculty OR any extra faculty granted for that role (see
  // effectiveFacultyIds) — grad_school_head used to be blanket cross-faculty
  // by role alone; it's now scoped the same way as the other two, just
  // against its own field. 'all' (explicit, or a grandfathered legacy
  // account) still means fully unrestricted.
  const field = REPORT_ROLE_FACULTY_FIELD[role];
  if (field) {
    const eff = effectiveFacultyIds(req.user!, field);
    if (eff === 'all') return { facultyId: requested };
    if (requested && !eff.includes(requested)) {
      return { error: { status: 403, message: 'You may only view reports for your own assigned faculties.' } };
    }
    return { facultyId: requested ?? req.user?.facultyId };
  }

  // coordinator/administrative_secretary: unchanged — must match own
  // facultyId exactly (administrative_secretary's real scope lives in
  // coordinatorScopes, a separate mechanism not touched here).
  if (requested && requested !== req.user?.facultyId) {
    return { error: { status: 403, message: 'You may only view reports for your own faculty.' } };
  }
  return { facultyId: req.user?.facultyId };
}

// ─── GET /api/reports/:reportType ──────────────────────────────────────────────
export const getReport = async (req: AuthenticatedRequest, res: Response) => {
  const { reportType } = req.params;
  if (!reportType || typeof reportType !== 'string' || !REPORT_TYPES.includes(reportType as ReportType)) {
    return res.status(400).json({ message: `Unknown report type: ${reportType}` });
  }

  const scope = resolveFacultyScope(req);
  if (scope.error) return res.status(scope.error.status).json({ message: scope.error.message });

  try {
    const filters = parseFilters(req, scope.facultyId);
    const data = await runReport(reportType as ReportType, filters);
    return res.status(200).json({ reportType, filters, data });
  } catch (error: any) {
    console.error(`getReport(${reportType}) error:`, error);
    return res.status(500).json({ message: 'Failed to generate report.' });
  }
};

// ─── GET /api/reports/:reportType/export ───────────────────────────────────────
export const exportReport = async (req: AuthenticatedRequest, res: Response) => {
  const { reportType } = req.params;
  if (!reportType || typeof reportType !== 'string' || !REPORT_TYPES.includes(reportType as ReportType)) {
    return res.status(400).json({ message: `Unknown report type: ${reportType}` });
  }

  const scope = resolveFacultyScope(req);
  if (scope.error) return res.status(scope.error.status).json({ message: scope.error.message });

  try {
    const filters = parseFilters(req, scope.facultyId);
    const data = await runReport(reportType as ReportType, filters);
    const rows = flattenForExport(reportType as ReportType, data);

    const worksheet = XLSX.utils.json_to_sheet(rows);
    if (rows.length > 0) {
      const headers = Object.keys(rows[0]!);
      worksheet['!cols'] = headers.map((h) => ({ wch: Math.max(h.length + 2, 14) }));
    }
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, reportType.slice(0, 31));
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${reportType}.xlsx"`);
    return res.status(200).send(buffer);
  } catch (error: any) {
    console.error(`exportReport(${reportType}) error:`, error);
    return res.status(500).json({ message: 'Failed to export report.' });
  }
};

/** Per-report-type flattening — each report's shape differs, Excel needs flat rows. */
function flattenForExport(type: ReportType, data: any): Record<string, any>[] {
  switch (type) {
    case 'full-status':
    case 'no-advisor':
    case 'proposal-delay':
      return (data as any[]).map((r) => ({
        Student: r.studentName, Faculty: r.facultyNameEn, Degree: r.degreeType, Track: r.projectType,
        Major: r.major, Year: r.yearOfStudy, Advisor: r.advisorName, SecondaryAdvisor: r.secondaryAdvisorName ?? '',
        Topic: r.projectTitleEn || r.projectTitleHe, Status: r.projectStatus,
        CurrentMilestone: r.currentMilestoneNameEn || r.currentMilestoneType, DaysInStage: r.daysInStage,
        Overdue: r.isOverdue ? 'Yes' : 'No', StartYear: r.startYear ?? '',
      }));
    case 'examiner-tracking':
      return (data as any[]).map((r) => ({
        Examiner: r.examinerName, Type: r.examinerType, Student: r.studentName, Project: r.projectTitle,
        InvitedAt: r.invitedAt ?? '', AcceptedAt: r.acceptedAt ?? '', SubmittedAt: r.submittedAt ?? '',
        DaysElapsed: r.daysElapsed ?? '', Status: r.opinionStatus, Exception: r.exceptionLevel,
      }));
    case 'missing-closure':
      return (data as any[]).map((r) => ({
        Student: r.studentName, Faculty: r.facultyNameEn, Advisor: r.advisorName,
        Topic: r.projectTitleEn || r.projectTitleHe, Missing: (r.missing as string[]).join(', '),
      }));
    case 'stuck-students': {
      const d = data as { threshold: number; byMilestone: any[]; students: any[] };
      return d.students.map((r) => ({
        Student: r.studentName, Faculty: r.facultyNameEn, CurrentMilestone: r.currentMilestoneNameEn || r.currentMilestoneType,
        DaysInStage: r.daysInStage, ThresholdDays: d.threshold,
      }));
    }
    case 'statute-exceedance':
      return (data as any[]).map((r) => ({
        Student: r.studentName, Faculty: r.facultyNameEn, Degree: r.degreeType,
        ProgramStart: r.programStartDate ?? '', ExpectedCompletion: r.expectedCompletionDate,
        YearsOverdue: r.yearsOverdue, Advisor: r.advisorName,
      }));
    case 'load':
      return (data as any[]).map((r) => ({
        Name: r.personName, Role: r.role, Active: r.activeCount, Pending: r.pendingReviewCount,
      }));
    case 'repository':
      return (data as any[]).map((r) => ({
        TitleHe: r.projectTitleHe, TitleEn: r.projectTitleEn, Student: r.studentName, Advisor: r.advisorName,
        Faculty: r.facultyNameEn, FinalGrade: r.finalGrade ?? '', CompletedAt: r.completedAt ?? '',
      }));
  }
}
