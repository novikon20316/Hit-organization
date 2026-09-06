// src/controllers/reportsController.ts
//
// The reports suite (requirements doc section 12). One dispatch endpoint per
// report type, plus an Excel-export variant of each — see services/reports.ts
// for the actual data-gathering logic, this file is dispatch + access control
// + the Excel column mapping.

import { Response } from 'express';
import * as XLSX from 'xlsx';
import { AuthenticatedRequest, matchedRole } from '../middleware/auth.js';
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
  gradeExportReport,
  projectListReport,
} from '../services/reports.js';
import { effectiveFacultyIds, type RoleFacultyField } from '../services/scopeAuthorization.js';

const REPORT_ROLES = ['coordinator', 'faculty_admin', 'program_head', 'administrative_secretary', 'grad_school_head', 'system_admin'];

// Which *FacultyIds field each report-viewing role's own scope reads from —
// faculty_admin/program_head/grad_school_head can each view reports for
// their own faculty or any extra one granted for that role (see
// resolveFacultyScope below). coordinator/administrative_secretary have no
// entry here — resolveFacultyScope resolves them directly instead: a real
// single facultyId for 'coordinator', or coordinatorScopes for
// administrative_secretary (whose own facultyId is always the 'all'
// sentinel, never a real faculty — see that function).
const REPORT_ROLE_FACULTY_FIELD: Record<string, RoleFacultyField> = {
  faculty_admin: 'facultyAdminFacultyIds',
  program_head: 'programHeadFacultyIds',
  grad_school_head: 'gradSchoolHeadFacultyIds',
};

export const REPORT_TYPES = [
  'full-status', 'no-advisor', 'proposal-delay', 'examiner-tracking',
  'missing-closure', 'stuck-students', 'statute-exceedance', 'load', 'repository',
  'grade-export',
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
    projectId: q.projectId || undefined,
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
    case 'grade-export':       return gradeExportReport(filters);
  }
}

/** Resolves the effective facultyId scope, or a 403/400 if the request is out of bounds. */
function resolveFacultyScope(req: AuthenticatedRequest): { facultyId?: string | undefined; error?: { status: number; message: string } | undefined } {
  const role = matchedRole(req.user, REPORT_ROLES);
  if (!role) {
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

  // coordinator/administrative_secretary: administrative_secretary is
  // provisioned with facultyId 'all' (see CROSS_FACULTY_ROLES in
  // userController.ts) — her real scope lives in req.user.coordinatorScopes
  // (same {facultyId, major?} tuples getProjectCoordinatorDashboard already
  // resolves from). Matching on req.user.facultyId directly (the old
  // behavior here) meant querying projects for the literal string 'all',
  // which no real project ever has — so every report silently came back
  // empty for her regardless of which degree she's actually responsible
  // for. 'coordinator' has a real single facultyId already, so this only
  // ever changes behavior for administrative_secretary.
  const scopeFacultyIds = [...new Set(
    (req.user?.coordinatorScopes ?? []).length > 0
      ? req.user!.coordinatorScopes.map((s) => s.facultyId)
      : req.user?.facultyId && req.user.facultyId !== 'all' ? [req.user.facultyId] : []
  )];

  if (scopeFacultyIds.length === 0) {
    // No scope assigned yet — nothing to see, not "everything" (same
    // fail-closed contract as getProjectCoordinatorDashboard's
    // noScopeAssigned and withinCoordinatorScope's 'all'-with-no-scopes
    // fallback).
    return { error: { status: 403, message: 'No faculty/degree scope is assigned to your account yet.' } };
  }
  if (requested) {
    if (!scopeFacultyIds.includes(requested)) {
      return { error: { status: 403, message: 'You may only view reports for your own assigned faculties.' } };
    }
    return { facultyId: requested };
  }
  if (scopeFacultyIds.length === 1) {
    return { facultyId: scopeFacultyIds[0] };
  }
  // More than one distinct faculty scope with nothing requested — the
  // Reports UI has no faculty picker for this role, and Firestore's project
  // query below only takes one facultyId at a time. Rather than silently
  // pick one (hiding the other scope's data) or fall back to unrestricted
  // (leaking outside her scope), surface it as a limitation.
  return { error: { status: 400, message: 'Your account has more than one assigned faculty/degree scope — pass ?facultyId= to pick which one to report on.' } };
}

// ─── GET /api/reports/projects ─────────────────────────────────────────────────
// Feeds the administrative coordinator's project-first Reports flow (see
// web/app/reports/AdminCoordinatorReportsFlow.tsx): she picks one of her own
// projects before picking which of the 10 report types to run for it. Scoped
// identically to every other report endpoint (same resolveFacultyScope), so
// this can't list a project outside her assigned coordinatorScopes.
export const getReportProjects = async (req: AuthenticatedRequest, res: Response) => {
  const scope = resolveFacultyScope(req);
  if (scope.error) return res.status(scope.error.status).json({ message: scope.error.message });

  try {
    const filters = parseFilters(req, scope.facultyId);
    const projects = await projectListReport(filters);
    return res.status(200).json({ projects });
  } catch (error) {
    console.error('getReportProjects error:', error);
    return res.status(500).json({ message: 'Failed to load projects.' });
  }
};

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
    // Excel export defaults to English (the original behavior for every
    // role); the administrative coordinator's project-first flow
    // (AdminCoordinatorReportsFlow.tsx) sends ?lang=he alongside its Hebrew
    // on-page preview so the downloaded file matches what she already sees.
    const lang: 'he' | 'en' = req.query.lang === 'he' ? 'he' : 'en';
    const rows = flattenForExport(reportType as ReportType, data, lang);

    const worksheet = XLSX.utils.json_to_sheet(rows);
    if (rows.length > 0) {
      const headers = Object.keys(rows[0]!);
      worksheet['!cols'] = headers.map((h) => ({ wch: Math.max(h.length + 2, 14) }));
    }
    const workbook = XLSX.utils.book_new();
    if (lang === 'he') workbook.Workbook = { Views: [{ RTL: true }] };
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

// Hebrew labels for the handful of raw enum-ish values these reports carry
// (degreeType/projectType/projectStatus/examinerType/opinionStatus/
// exceptionLevel) — mirrors the label maps already defined client-side in
// web/app/reports/page.tsx (DEGREE_TYPE_LABEL etc.), duplicated here since
// the server can't import from web/. Falls back to the raw value for
// anything unmapped rather than dropping it.
const HE_LABELS: Record<string, string> = {
  bachelors: 'תואר ראשון', masters: 'תואר שני',
  project: 'פרויקט', thesis: 'תזה',
  active: 'פעיל', in_progress: 'בתהליך', completed: 'הושלם', withdrawn: 'פרש/ה', admin_closed: 'נסגר מנהלתית',
  internal: 'פנימי', external: 'חיצוני',
  pending: 'ממתין', accepted: 'התקבל', declined: 'נדחה', submitted: 'הוגש',
  none: 'ללא', warning: 'אזהרה', overdue: 'חריגה',
  advisor: 'מנחה', examiner: 'בוחן',
};
const he = (v: unknown): unknown => (typeof v === 'string' ? HE_LABELS[v] ?? v : v);

/** Per-report-type flattening — each report's shape differs, Excel needs flat
 *  rows. `lang` picks which language's column headers AND values to use;
 *  'en' (the default, everyone else's export) keeps the original English-only
 *  behavior byte-for-byte. */
function flattenForExport(type: ReportType, data: any, lang: 'he' | 'en' = 'en'): Record<string, any>[] {
  if (lang === 'en') {
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
      case 'grade-export':
        return (data as any[]).map((r) => ({
          FullName: r.studentName, ID: r.studentIdNumber ?? '', ProjectTitle: r.projectTitleEn || r.projectTitleHe,
          Supervisor: r.advisorName, Year: r.startYearHebrew ?? '', Status: r.projectStatus, Grade: r.finalGrade ?? '',
        }));
    }
  }

  switch (type) {
    case 'full-status':
    case 'no-advisor':
    case 'proposal-delay':
      return (data as any[]).map((r) => ({
        'סטודנט': r.studentName, 'פקולטה': r.facultyNameHe, 'תואר': he(r.degreeType), 'מסלול': he(r.projectType),
        'חוג': r.major, 'שנת לימודים': r.yearOfStudy, 'מנחה': r.advisorName, 'מנחה משנה': r.secondaryAdvisorName ?? '',
        'נושא/פרויקט': r.projectTitleHe || r.projectTitleEn, 'סטטוס': he(r.projectStatus),
        'אבן דרך נוכחית': r.currentMilestoneNameHe || r.currentMilestoneType, 'ימים בשלב': r.daysInStage,
        'חריגה': r.isOverdue ? 'כן' : 'לא', 'שנת התחלה': r.startYear ?? '',
      }));
    case 'examiner-tracking':
      return (data as any[]).map((r) => ({
        'בוחן': r.examinerName, 'סוג': he(r.examinerType), 'סטודנט': r.studentName, 'פרויקט/תזה': r.projectTitle,
        'תאריך הזמנה': r.invitedAt ?? '', 'תאריך אישור': r.acceptedAt ?? '', 'תאריך הגשה': r.submittedAt ?? '',
        'ימים שחלפו': r.daysElapsed ?? '', 'סטטוס חוו"ד': he(r.opinionStatus), 'רמת חריגה': he(r.exceptionLevel),
      }));
    case 'missing-closure':
      return (data as any[]).map((r) => ({
        'סטודנט': r.studentName, 'פקולטה': r.facultyNameHe, 'מנחה': r.advisorName,
        'נושא/פרויקט': r.projectTitleHe || r.projectTitleEn, 'חסר': (r.missing as string[]).join(', '),
      }));
    case 'stuck-students': {
      const d = data as { threshold: number; byMilestone: any[]; students: any[] };
      return d.students.map((r) => ({
        'סטודנט': r.studentName, 'פקולטה': r.facultyNameHe, 'אבן דרך': r.currentMilestoneNameHe || r.currentMilestoneType,
        'ימים בשלב': r.daysInStage, 'סף ימים': d.threshold,
      }));
    }
    case 'statute-exceedance':
      return (data as any[]).map((r) => ({
        'סטודנט': r.studentName, 'פקולטה': r.facultyNameHe, 'תואר': he(r.degreeType),
        'תחילת לימודים': r.programStartDate ?? '', 'תאריך סיום צפוי': r.expectedCompletionDate,
        'שנות חריגה': r.yearsOverdue, 'מנחה': r.advisorName,
      }));
    case 'load':
      return (data as any[]).map((r) => ({
        'שם': r.personName, 'תפקיד': he(r.role), 'פעילים': r.activeCount, 'ממתינים': r.pendingReviewCount,
      }));
    case 'repository':
      return (data as any[]).map((r) => ({
        'כותרת': r.projectTitleHe || r.projectTitleEn, 'סטודנט': r.studentName, 'מנחה': r.advisorName,
        'פקולטה': r.facultyNameHe, 'ציון סופי': r.finalGrade ?? '', 'תאריך סיום': r.completedAt ?? '',
      }));
    case 'grade-export':
      return (data as any[]).map((r) => ({
        'שם מלא': r.studentName, 'ת.ז.': r.studentIdNumber ?? '', 'שם פרויקט/תזה': r.projectTitleHe || r.projectTitleEn,
        'שם המנחה': r.advisorName, 'שנה': r.startYearHebrew ?? '', 'סטטוס': he(r.projectStatus), 'ציון': r.finalGrade ?? '',
      }));
  }
}
