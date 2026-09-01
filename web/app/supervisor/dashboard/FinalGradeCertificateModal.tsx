'use client';

// app/supervisor/dashboard/FinalGradeCertificateModal.tsx
// Read-only digital version of Project_final_grade.docx — the data_science
// department's paper "final grade certificate" for a masters final project
// (that faculty has no thesis track — see server's studentTrack.ts). Every
// field here is system-derived from data entered elsewhere in the app:
//   - שנה"ל / תאריך תחילת פרויקט / שם הפרויקט / student details: project +
//     user docs (see supervisorController.ts's getSupervisorDashboard).
//   - תאריך ההגנה: the resolved defense date (defenseScheduling.ts).
//   - ציון (per student): the defense milestone's own finalGrade, once the
//     supervisor's rubric + examiners' rubrics + coordinator approval have
//     all gone through (SupervisorEvaluationModal → FinalGradeDecisionModal).
//   - ציון סופי לפרויקט גמר: computeProjectFinalGrade's weighted rollup
//     across every milestone (gradeEngine.ts), already computed server-side
//     as each student's overallFinalGrade.
// Nothing is entered here — there's no new grading mechanism, just a
// consolidated view. The paper form's signature/date-signed row is dropped;
// this is a live system record, not a document to be manually signed.

import { useRef } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useModalA11y } from '@/hooks/useModalA11y';
import { academicYearToHebrew } from '@/lib/hebrewYear';
import type { MyProject } from './types';
import type { StudentRow } from './ProjectWorkflowSection';

interface FinalGradeCertificateModalProps {
  project: MyProject;
  students: StudentRow[];
  onClose: () => void;
}

function formatDate(iso: string | null, lang: 'he' | 'en'): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function FinalGradeCertificateModal({ project, students, onClose }: FinalGradeCertificateModalProps) {
  const { lang } = useLanguage();
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalA11y(dialogRef, true, onClose);

  const hebrewYear = academicYearToHebrew(project.academicYear);
  // The defense date is resolved once for the whole project (every enrolled
  // student's 'defense' milestone shares the same scheduled date) — reading
  // it off the first student is exact, not an approximation.
  const defenseDate = students[0]?.milestones.find((m) => m.type === 'defense')?.defenseDate ?? null;

  const overallGrades = students.map((s) => s.overallFinalGrade);
  const allSameOverallGrade = overallGrades.every((g) => g === overallGrades[0]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        className="w-full max-w-lg rounded-[var(--radius)] bg-surface p-6 shadow-lg outline-none"
      >
        <div className="flex items-start justify-between">
          <h2 className="text-lg font-semibold text-ink">
            {lang === 'he' ? '📜 תעודת ציון סופי — פרויקט גמר' : '📜 Final Grade Certificate — Final Project'}
          </h2>
          <button type="button" onClick={onClose} aria-label={lang === 'he' ? 'סגור' : 'Close'} className="text-muted hover:text-ink">✕</button>
        </div>
        <p className="mt-1 text-xs text-muted">
          {lang === 'he' ? 'תואר שני במדעי הנתונים, M.Sc.' : "Master's in Data Science, M.Sc."}
        </p>

        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs text-muted">{lang === 'he' ? 'שנה״ל' : 'Academic year'}</p>
            <p className="font-medium text-ink">{hebrewYear ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs text-muted">{lang === 'he' ? 'תאריך תחילת פרויקט' : 'Project start date'}</p>
            <p className="font-medium text-ink">{formatDate(project.projectStartDate, lang)}</p>
          </div>
          <div>
            <p className="text-xs text-muted">{lang === 'he' ? 'תאריך ההגנה' : 'Defense date'}</p>
            <p className="font-medium text-ink">{formatDate(defenseDate, lang)}</p>
          </div>
          <div className="col-span-2">
            <p className="text-xs text-muted">{lang === 'he' ? 'שם הפרויקט' : 'Project name'}</p>
            <p className="font-medium text-ink">{(lang === 'he' ? project.titleHe : project.titleEn) || '—'}</p>
          </div>
        </div>

        <div className="mt-4">
          <p className="mb-1.5 text-xs font-semibold text-muted">{lang === 'he' ? 'פרטי הסטודנט/ית/ים' : 'Student details'}</p>
          <div className="overflow-hidden rounded-lg border border-line">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-paper text-xs text-muted">
                  <th className="px-3 py-2 text-start font-medium">{lang === 'he' ? 'שם ומשפחה' : 'Full name'}</th>
                  <th className="px-3 py-2 text-start font-medium">{lang === 'he' ? 'ת.ז.' : 'ID'}</th>
                  <th className="px-3 py-2 text-start font-medium">{lang === 'he' ? 'ציון' : 'Grade'}</th>
                </tr>
              </thead>
              <tbody>
                {students.map((s) => {
                  const defenseGrade = s.milestones.find((m) => m.type === 'defense')?.finalGrade ?? null;
                  const idNumber = project.enrolledStudents?.find((e) => e.id === s.studentId)?.studentIdNumber;
                  return (
                    <tr key={s.studentId} className="border-t border-line">
                      <td className="px-3 py-2 text-ink">{s.studentName}</td>
                      <td className="px-3 py-2 text-ink" dir="ltr">{idNumber ?? '—'}</td>
                      <td className="px-3 py-2 font-semibold text-ink">{defenseGrade ?? '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-4 rounded-lg bg-paper p-4 text-center">
          <p className="text-xs text-muted">{lang === 'he' ? 'ציון סופי לפרויקט גמר' : 'Final grade for the final project'}</p>
          {allSameOverallGrade ? (
            <p className="mt-1 text-3xl font-bold text-ink">{overallGrades[0] ?? '—'}</p>
          ) : (
            <div className="mt-1 grid gap-1">
              {students.map((s) => (
                <p key={s.studentId} className="text-sm font-semibold text-ink">
                  {s.studentName}: {s.overallFinalGrade ?? '—'}
                </p>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
