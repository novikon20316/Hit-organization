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

  const isMilestoneDone = (status: string) => status === 'coordinator_approved' || status === 'completed';
  const isMilestoneSubmitted = (status: string) => status === 'submitted' || status === 'supervisor_graded' || status === 'graded';

  const statusColor = (status: string) => {
    if (isMilestoneDone(status)) return '#10B981';
    if (isMilestoneSubmitted(status)) return '#F59E0B';
    return '#8899BB';
  };

  const statusBg = (status: string) => {
    if (isMilestoneDone(status)) return '#ECFDF5';
    if (isMilestoneSubmitted(status)) return '#FFFBEB';
    return '#F1F0EC';
  };

  const statusIcon = (status: string) => {
    if (isMilestoneDone(status)) return '✅';
    if (isMilestoneSubmitted(status)) return '📤';
    return '⏳';
  };

  const statusLabel = (m: InProgressProject['students'][number]['milestones'][number]) => {
    if (isMilestoneDone(m.status)) {
      return m.supervisorScore !== null
        ? lang === 'he'
          ? `אושר (${m.supervisorScore}/100)`
          : `Approved (${m.supervisorScore}/100)`
        : lang === 'he'
          ? 'אושר'
          : 'Approved';
    }
    if (isMilestoneSubmitted(m.status)) return lang === 'he' ? 'הוגש' : 'Submitted';
    return lang === 'he' ? 'טרם הוגש' : 'Not submitted yet';
  };

  const formatMilestoneDate = (iso: string | null | undefined) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return isNaN(d.getTime()) ? '—' : d.toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
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
                            <div className="grid gap-2">
                              {(() => {
                                const firstIncompleteIdx = student.milestones.findIndex((m) => !isMilestoneDone(m.status));
                                return student.milestones.map((m, mIdx) => {
                                  const done = isMilestoneDone(m.status);
                                  const isCurrent = !done && mIdx === firstIncompleteIdx;
                                  const isFuture = !done && !isCurrent;
                                  const color = statusColor(m.status);
                                  return (
                                    <div
                                      key={mIdx}
                                      className={`role-rail rounded-lg border bg-surface p-2.5 transition-opacity ${
                                        isCurrent ? 'border-2' : 'border-line'
                                      } ${isFuture ? 'opacity-75 hover:opacity-100' : ''}`}
                                      style={
                                        {
                                          '--rail-color': color,
                                          borderColor: isCurrent ? 'var(--primary)' : undefined,
                                        } as React.CSSProperties
                                      }
                                    >
                                      <div className="flex items-start justify-between gap-2">
                                        <div className="flex min-w-0 items-center gap-2">
                                          <span
                                            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                                              isFuture ? 'border-2 bg-surface' : 'text-white'
                                            }`}
                                            style={isFuture ? { borderColor: color, color } : { backgroundColor: done ? 'var(--success)' : color }}
                                          >
                                            {done ? '✓' : mIdx + 1}
                                          </span>
                                          <span className="truncate text-xs font-semibold text-ink">{MILESTONE_LABEL[m.type]?.[lang] ?? m.type}</span>
                                        </div>
                                        <span
                                          className="shrink-0 whitespace-nowrap rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                                          style={{ backgroundColor: statusBg(m.status), color }}
                                        >
                                          {statusIcon(m.status)} {statusLabel(m)}
                                        </span>
                                      </div>
                                      <div className="mt-2 grid grid-cols-3 gap-2 border-t border-line/60 pt-2">
                                        <div>
                                          <p className="text-[9px] font-semibold uppercase tracking-wide text-muted">{lang === 'he' ? 'תאריך יעד' : 'Due'}</p>
                                          <p className="mt-0.5 text-[11px] text-ink">📅 {formatMilestoneDate(m.dueDate)}</p>
                                        </div>
                                        {m.submittedAt && (
                                          <div>
                                            <p className="text-[9px] font-semibold uppercase tracking-wide text-muted">{lang === 'he' ? 'הוגש' : 'Submitted'}</p>
                                            <p className="mt-0.5 text-[11px] text-ink">📤 {formatMilestoneDate(m.submittedAt)}</p>
                                          </div>
                                        )}
                                        {m.supervisorScore !== null && (
                                          <div>
                                            <p className="text-[9px] font-semibold uppercase tracking-wide text-muted">{lang === 'he' ? 'ציון' : 'Score'}</p>
                                            <p className="mt-0.5 text-[11px] font-bold text-ink">🏆 {m.supervisorScore}</p>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  );
                                });
                              })()}
                            </div>
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
