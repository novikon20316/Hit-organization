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
import { ClockPauseControl } from '@/components/ClockPauseControl';
import { TrackChangeControl } from '@/components/TrackChangeControl';
import { ProjectStageChain } from '@/components/ProjectStageChain';
import { EditProjectModal } from './EditProjectModal';

interface InProgressTabProps {
  projects: InProgressProject[];
  currentUserId?: string;
  onChanged?: () => void;
}

export function InProgressTab({ projects, currentUserId, onChanged }: InProgressTabProps) {
  const { lang } = useLanguage();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [expandedStudents, setExpandedStudents] = useState<Record<string, boolean>>({});
  const [scope, setScope] = useState<'all' | 'mine'>('all');
  const [editingProject, setEditingProject] = useState<InProgressProject | null>(null);

  const visibleProjects = scope === 'mine' ? projects.filter((p) => p.supervisorId === currentUserId) : projects;

  const scopeToggle = (
    <div className="mb-3 flex gap-1 rounded-full bg-paper p-0.5" style={{ width: 'fit-content' }}>
      {(['all', 'mine'] as const).map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => setScope(s)}
          className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
            scope === s ? 'bg-primary text-primary-ink' : 'text-muted'
          }`}
        >
          {s === 'all' ? (lang === 'he' ? 'כל הפרויקטים' : 'All Projects') : lang === 'he' ? 'הפרויקטים שלי' : 'My Projects'}
        </button>
      ))}
    </div>
  );

  if (projects.length === 0) {
    return <p className="text-sm text-muted">📁 {lang === 'he' ? 'אין פרויקטים פעילים' : 'No projects in progress'}</p>;
  }

  if (visibleProjects.length === 0) {
    return (
      <div>
        {scopeToggle}
        <p className="text-sm text-muted">📁 {lang === 'he' ? 'אין פרויקטים משלך' : 'No projects of your own'}</p>
      </div>
    );
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
    <div>
      {scopeToggle}
      <div className="grid gap-3 sm:grid-cols-2">
      {visibleProjects.map((p) => {
        const facultyColor = getFacultyColor(p.facultyId);
        const isOpen = !!expanded[p.id];
        return (
          <div
            key={p.id}
            className="role-rail rounded-coordinator-lg border border-coordinator-outline-variant bg-coordinator-surface-container-lowest p-4"
            style={{ '--rail-color': facultyColor } as React.CSSProperties}
          >
            <button type="button" onClick={() => setExpanded((prev) => ({ ...prev, [p.id]: !prev[p.id] }))} className="w-full text-start">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-coordinator-on-surface">{lang === 'he' ? p.projectTitleHe : p.projectTitleEn}</p>
                <span className="rounded-full px-2 py-0.5 text-xs font-medium" style={{ backgroundColor: `${facultyColor}1F`, color: facultyColor }}>
                  {facultyLabel(p.facultyId, lang)}
                </span>
              </div>
              <div className="mt-1.5 grid gap-1">
                <p className="text-xs text-coordinator-on-surface-variant">
                  👤 {p.students?.length > 0 ? (lang === 'he' ? `${p.students.length} סטודנטים` : `${p.students.length} students`) : lang === 'he' ? 'אין סטודנטים' : 'No students'}
                </p>
                <p className="text-xs text-coordinator-on-surface-variant">
                  👨‍🏫 {lang === 'he' ? 'מנחה:' : 'Supervisor:'} {p.supervisorName}
                </p>
              </div>
            </button>

            <ClockPauseControl projectId={p.id} />
            <TrackChangeControl projectId={p.id} />
            <button
              type="button"
              onClick={() => setEditingProject(p)}
              className="mt-2 flex items-center gap-1 text-xs font-medium text-coordinator-primary hover:underline"
            >
              ✏️ {lang === 'he' ? 'עריכת פרויקט (שם, מספר סטודנטים ועוד)' : 'Edit Project (name, student count, etc.)'}
            </button>

            {isOpen && (
              <div className="mt-3 grid gap-3 border-t border-coordinator-outline-variant pt-3">
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
                          <ProjectStageChain
                            createdAt={p.createdAt}
                            milestones={student.milestones.map((m) => ({
                              type: m.type,
                              status: m.status,
                              grade: m.supervisorScore,
                              percentOfFinalGrade: m.percentOfFinalGrade,
                              dueDate: m.dueDate,
                              submittedAt: m.submittedAt,
                            }))}
                          />
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

      {editingProject && (
        <EditProjectModal
          key={editingProject.id}
          project={editingProject}
          onClose={() => setEditingProject(null)}
          onSaved={() => onChanged?.()}
        />
      )}
    </div>
  );
}
