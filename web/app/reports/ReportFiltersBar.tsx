'use client';

// app/reports/ReportFiltersBar.tsx
// The filter row (+ active-filter chips) shared by the everyone-else /reports
// page and system_admin's own SystemAdminReportsFlow, extracted so the two
// can't drift apart. `actions` is a slot for whatever action button(s) sit
// at the end of the row — just "Export to Excel" for the shared page,
// "Create Report" + "Export to Excel" for system_admin's flow.

import type { ReactNode } from 'react';
import { FACULTY_LABELS, type FacultyId } from '@/lib/i18n';
import {
  DEGREE_TYPES, PROJECT_TYPES, MILESTONE_TYPES, PROCESS_STATUSES,
  DEGREE_TYPE_LABEL, PROJECT_TYPE_LABEL, MILESTONE_TYPE_LABEL, PROCESS_STATUS_LABEL,
} from './reportFilterOptions';

interface ExaminerOption {
  id: string;
  displayName: string;
}

interface ReportFiltersBarProps {
  lang: 'he' | 'en';
  /** Shows the faculty filter — only system_admin has no single pinned
   *  faculty scope, everyone else is filtered server-side already. */
  isSystemAdmin: boolean;
  startYear: string;
  onStartYearChange: (v: string) => void;
  facultyId: string;
  onFacultyIdChange: (v: string) => void;
  degreeType: string;
  onDegreeTypeChange: (v: string) => void;
  projectType: string;
  onProjectTypeChange: (v: string) => void;
  milestoneType: string;
  onMilestoneTypeChange: (v: string) => void;
  processStatus: string;
  onProcessStatusChange: (v: string) => void;
  examinerId: string;
  onExaminerIdChange: (v: string) => void;
  examinerOptions: ExaminerOption[];
  advisorId: string;
  onAdvisorIdChange: (v: string) => void;
  overdueOnly: boolean;
  onOverdueOnlyChange: (v: boolean) => void;
  actions: ReactNode;
}

export function ReportFiltersBar({
  lang,
  isSystemAdmin,
  startYear, onStartYearChange,
  facultyId, onFacultyIdChange,
  degreeType, onDegreeTypeChange,
  projectType, onProjectTypeChange,
  milestoneType, onMilestoneTypeChange,
  processStatus, onProcessStatusChange,
  examinerId, onExaminerIdChange, examinerOptions,
  advisorId, onAdvisorIdChange,
  overdueOnly, onOverdueOnlyChange,
  actions,
}: ReportFiltersBarProps) {
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          value={startYear}
          onChange={(e) => onStartYearChange(e.target.value.replace(/\D/g, ''))}
          placeholder={lang === 'he' ? 'שנת התחלה' : 'Start year'}
          className="w-32 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none"
        />

        {isSystemAdmin && (
          <select
            value={facultyId}
            onChange={(e) => onFacultyIdChange(e.target.value)}
            className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none"
          >
            <option value="">{lang === 'he' ? 'כל הפקולטות' : 'All faculties'}</option>
            {(Object.keys(FACULTY_LABELS) as FacultyId[]).filter((id) => id !== 'all').map((id) => (
              <option key={id} value={id}>{FACULTY_LABELS[id][lang]}</option>
            ))}
          </select>
        )}

        <select
          value={degreeType}
          onChange={(e) => onDegreeTypeChange(e.target.value)}
          className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none"
        >
          <option value="">{lang === 'he' ? 'כל התארים' : 'All degrees'}</option>
          {DEGREE_TYPES.map((v) => (
            <option key={v} value={v}>{DEGREE_TYPE_LABEL[v][lang]}</option>
          ))}
        </select>

        <select
          value={projectType}
          onChange={(e) => onProjectTypeChange(e.target.value)}
          className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none"
        >
          <option value="">{lang === 'he' ? 'כל המסלולים' : 'All tracks'}</option>
          {PROJECT_TYPES.map((v) => (
            <option key={v} value={v}>{PROJECT_TYPE_LABEL[v][lang]}</option>
          ))}
        </select>

        <select
          value={milestoneType}
          onChange={(e) => onMilestoneTypeChange(e.target.value)}
          className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none"
        >
          <option value="">{lang === 'he' ? 'כל אבני הדרך' : 'All milestones'}</option>
          {MILESTONE_TYPES.map((v) => (
            <option key={v} value={v}>{MILESTONE_TYPE_LABEL[v][lang]}</option>
          ))}
        </select>

        <select
          value={processStatus}
          onChange={(e) => onProcessStatusChange(e.target.value)}
          className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none"
        >
          <option value="">{lang === 'he' ? 'כל הסטטוסים' : 'All statuses'}</option>
          {PROCESS_STATUSES.map((v) => (
            <option key={v} value={v}>{PROCESS_STATUS_LABEL[v][lang]}</option>
          ))}
        </select>

        <select
          value={examinerId}
          onChange={(e) => onExaminerIdChange(e.target.value)}
          className="max-w-[12rem] rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none"
        >
          <option value="">{lang === 'he' ? 'כל הבוחנים' : 'All examiners'}</option>
          {examinerOptions.map((ex) => (
            <option key={ex.id} value={ex.id}>{ex.displayName}</option>
          ))}
        </select>

        <input
          value={advisorId}
          onChange={(e) => onAdvisorIdChange(e.target.value)}
          placeholder={lang === 'he' ? 'מזהה מנחה' : 'Advisor ID'}
          className="w-36 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none"
        />

        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" checked={overdueOnly} onChange={(e) => onOverdueOnlyChange(e.target.checked)} className="h-4 w-4 accent-[var(--primary)]" />
          {lang === 'he' ? 'חריגה בלבד' : 'Overdue only'}
        </label>

        <div className="ms-auto flex items-center gap-2">{actions}</div>
      </div>

      {(degreeType || projectType || milestoneType || processStatus || facultyId || advisorId || examinerId) && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {[
            degreeType && { label: DEGREE_TYPE_LABEL[degreeType][lang], clear: () => onDegreeTypeChange('') },
            projectType && { label: PROJECT_TYPE_LABEL[projectType][lang], clear: () => onProjectTypeChange('') },
            milestoneType && { label: MILESTONE_TYPE_LABEL[milestoneType][lang], clear: () => onMilestoneTypeChange('') },
            processStatus && { label: PROCESS_STATUS_LABEL[processStatus][lang], clear: () => onProcessStatusChange('') },
            facultyId && { label: FACULTY_LABELS[facultyId as FacultyId]?.[lang] ?? facultyId, clear: () => onFacultyIdChange('') },
            examinerId && { label: examinerOptions.find((e) => e.id === examinerId)?.displayName ?? examinerId, clear: () => onExaminerIdChange('') },
            advisorId && { label: advisorId, clear: () => onAdvisorIdChange('') },
          ].filter(Boolean).map((chip: any, i) => (
            <button
              key={i}
              type="button"
              onClick={chip.clear}
              className="rounded-full border border-line bg-paper px-2.5 py-1 text-xs text-muted hover:border-danger hover:text-danger"
            >
              {chip.label} ✕
            </button>
          ))}
        </div>
      )}
    </>
  );
}
