'use client';

// app/coordinator/home/InProgressTab.tsx
// Ported from mobile/app/coordinator/home.tsx's 'inProgress' tab — per-project
// expandable cards with per-student milestone progress. Data comes from
// getActiveProjects() (GET /api/projects/ActiveProjects), fetched once by
// page.tsx alongside everything else and passed down here.

import { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { getFacultyColor } from '@/lib/facultyColors';
import { facultyLabel } from '@/lib/i18n';
import { MILESTONE_LABEL, type InProgressProject } from './types';

interface InProgressTabProps {
  projects: InProgressProject[];
}

export function InProgressTab({ projects }: InProgressTabProps) {
  const { lang } = useLanguage();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [expandedStudents, setExpandedStudents] = useState<Record<string, boolean>>({});

  if (projects.length === 0) {
    return <p className="text-sm text-muted">📁 {lang === 'he' ? 'אין פרויקטים פעילים' : 'No projects in progress'}</p>;
  }

  const statusColor = (status: string) => {
    if (status === 'coordinator_approved' || status === 'completed') return '#10B981';
    if (status === 'submitted' || status === 'supervisor_graded' || status === 'graded') return '#F59E0B';
    return '#8899BB';
  };

  const statusLabel = (m: InProgressProject['students'][number]['milestones'][number]) => {
    if (m.status === 'coordinator_approved' || m.status === 'completed') {
      return m.supervisorScore !== null
        ? lang === 'he'
          ? `אושר (${m.supervisorScore}/100)`
          : `Approved (${m.supervisorScore}/100)`
        : lang === 'he'
          ? 'אושר'
          : 'Approved';
    }
    if (m.status === 'submitted' || m.status === 'supervisor_graded' || m.status === 'graded') return lang === 'he' ? 'הוגש' : 'Submitted';
    return lang === 'he' ? 'טרם הוגש' : 'Not submitted yet';
  };

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {projects.map((p) => {
        const facultyColor = getFacultyColor(p.facultyId);
        const isOpen = !!expanded[p.id];
        return (
          <div key={p.id} className="role-rail rounded-[var(--radius)] border border-line bg-surface p-4" style={{ '--rail-color': facultyColor } as React.CSSProperties}>
            <button type="button" onClick={() => setExpanded((prev) => ({ ...prev, [p.id]: !prev[p.id] }))} className="w-full text-start">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-ink">{lang === 'he' ? p.projectTitleHe : p.projectTitleEn}</p>
                <span className="rounded-full px-2 py-0.5 text-xs font-medium" style={{ backgroundColor: `${facultyColor}1F`, color: facultyColor }}>
                  {facultyLabel(p.facultyId, lang)}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted">
                👤 {p.students?.length > 0 ? (lang === 'he' ? `${p.students.length} סטודנטים` : `${p.students.length} students`) : lang === 'he' ? 'אין סטודנטים' : 'No students'}
              </p>
              <p className="mt-0.5 text-xs text-muted">
                👨‍🏫 {lang === 'he' ? 'מנחה:' : 'Supervisor:'} {p.supervisorName}
              </p>
            </button>

            {isOpen && (
              <div className="mt-3 grid gap-3 border-t border-line pt-3">
                {(p.students ?? []).map((student, sIdx) => {
                  const key = `${p.id}-${sIdx}`;
                  const studentOpen = !!expandedStudents[key];
                  return (
                    <div key={key}>
                      <button
                        type="button"
                        onClick={() => setExpandedStudents((prev) => ({ ...prev, [key]: !prev[key] }))}
                        className="flex w-full items-center justify-between gap-3 text-start"
                      >
                        <span className="w-20 shrink-0 text-sm font-semibold text-ink">{student.name}</span>
                        <span className="flex-1">
                          <span className="mb-1 flex items-center justify-between text-[10px] text-muted">
                            <span>{lang === 'he' ? 'התקדמות' : 'Progress'}</span>
                            <span className="font-bold text-accent">{student.progress}%</span>
                          </span>
                          <span className="block h-1.5 overflow-hidden rounded-full bg-paper">
                            <span
                              className="block h-full rounded-full"
                              style={{ width: `${student.progress}%`, backgroundColor: student.progress === 100 ? '#10B981' : 'var(--accent)' }}
                            />
                          </span>
                        </span>
                        <span className="text-xs text-muted">{studentOpen ? '▲' : '▼'}</span>
                      </button>

                      {studentOpen && (
                        <div className="mt-2 rounded-lg bg-paper p-2.5">
                          {(student.milestones ?? []).length === 0 ? (
                            <p className="text-xs text-muted">{lang === 'he' ? 'לא נוצרו אבני דרך לסטודנט זה' : 'No milestones created for this student'}</p>
                          ) : (
                            student.milestones.map((m, mIdx) => (
                              <div
                                key={mIdx}
                                className={`flex items-center justify-between py-1.5 text-xs ${mIdx < student.milestones.length - 1 ? 'border-b border-line' : ''}`}
                              >
                                <span className="font-medium text-ink">{MILESTONE_LABEL[m.type]?.[lang] ?? m.type}</span>
                                <span className="font-semibold" style={{ color: statusColor(m.status) }}>
                                  {statusLabel(m)}
                                </span>
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
