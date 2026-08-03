'use client';

// app/supervisor/dashboard/ProjectWorkflowModal.tsx
// Shows a supervisor which workflow template their project is running on
// (the ordered milestone list — name, due-date mode, requires-examiners) and,
// per enrolled student, a submitted/not-submitted breakdown per milestone.
// Data comes from GET /api/supervisor/projects/:id/detail — see
// server/src/controllers/supervisorController.ts's getSupervisorProjectDetail.

import { useEffect, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/apiClient';
import type { MyProject } from './types';

interface ProjectWorkflowModalProps {
  project: MyProject;
  onClose: () => void;
}

interface TemplateMilestone {
  type: string;
  nameHe: string;
  nameEn: string;
  order: number;
  dateMode?: 'offset' | 'fixed';
  dueDaysFromStart: number;
  fixedDate?: string;
  requiresExaminers: boolean;
}

interface StudentRow {
  studentId: string;
  studentName: string;
  milestones: Array<{ type: string; status: string; dueDate: string | null; submittedAt: string | null }>;
}

// Same status colors/labels as coordinator/home/InProgressTab.tsx, plus a
// 'not_created' case that view doesn't need (a coordinator's InProgress list
// only ever includes milestones that already exist).
function statusColor(status: string): string {
  if (status === 'coordinator_approved' || status === 'completed') return '#10B981';
  if (status === 'submitted' || status === 'supervisor_graded' || status === 'graded') return '#F59E0B';
  return '#8899BB';
}

function statusLabel(status: string, lang: 'he' | 'en'): string {
  if (status === 'coordinator_approved' || status === 'completed') return lang === 'he' ? 'אושר' : 'Approved';
  if (status === 'submitted' || status === 'supervisor_graded' || status === 'graded') return lang === 'he' ? 'הוגש' : 'Submitted';
  if (status === 'not_created') return lang === 'he' ? 'טרם נפתח' : 'Not started yet';
  return lang === 'he' ? 'טרם הוגש' : 'Not submitted yet';
}

export function ProjectWorkflowModal({ project, onClose }: ProjectWorkflowModalProps) {
  const { lang } = useLanguage();
  const [templateMilestones, setTemplateMilestones] = useState<TemplateMilestone[]>([]);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiClient
      .getSupervisorProjectDetail(project.id)
      .then((res) => {
        if (cancelled) return;
        setTemplateMilestones([...res.templateMilestones].sort((a, b) => a.order - b.order));
        setStudents(res.students);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : (lang === 'he' ? 'טעינת הנתונים נכשלה' : 'Failed to load'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [project.id, lang]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-[var(--radius)] bg-surface p-6 shadow-lg">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-ink">🧬 {lang === 'he' ? 'תהליך העבודה' : 'Workflow'}</h2>
            <p className="text-xs text-muted">{lang === 'he' ? project.titleHe : project.titleEn}</p>
          </div>
          <button type="button" onClick={onClose} className="text-muted hover:text-ink">
            ✕
          </button>
        </div>

        {loading ? (
          <p className="mt-4 text-sm text-muted">…</p>
        ) : error ? (
          <p className="mt-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>
        ) : (
          <>
            <div className="mt-4 rounded-lg border border-line bg-paper p-3">
              <p className="mb-2 text-sm font-semibold text-ink">{lang === 'he' ? 'אבני הדרך של תבנית זו' : 'This template\'s milestones'}</p>
              <div className="grid gap-1.5">
                {templateMilestones.map((m, idx) => (
                  <div key={m.type} className="flex items-center gap-2.5 text-xs">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#EDE9FE] font-bold text-primary">{idx + 1}</span>
                    <span className="min-w-0 flex-1 truncate font-medium text-ink">{lang === 'he' ? m.nameHe : m.nameEn}</span>
                    <span className="shrink-0 text-muted">
                      📅 {m.dateMode === 'fixed'
                        ? (lang === 'he' ? `תאריך קבוע: ${m.fixedDate ?? '—'}` : `Fixed: ${m.fixedDate ?? '—'}`)
                        : (lang === 'he' ? `יום ${m.dueDaysFromStart}` : `Day ${m.dueDaysFromStart}`)}
                      {m.requiresExaminers ? ` · 👥` : ''}
                    </span>
                  </div>
                ))}
                {templateMilestones.length === 0 && (
                  <p className="text-xs text-muted">{lang === 'he' ? 'לא נמצאה תבנית עבור פרויקט זה' : 'No template found for this project'}</p>
                )}
              </div>
            </div>

            <div className="mt-4">
              <p className="mb-2 text-sm font-semibold text-ink">{lang === 'he' ? 'סטטוס הגשה לפי סטודנט' : 'Submission status per student'}</p>
              {students.length === 0 && (
                <p className="text-sm text-muted">{lang === 'he' ? 'אין סטודנטים רשומים' : 'No enrolled students'}</p>
              )}
              <div className="grid gap-3">
                {students.map((s) => (
                  <div key={s.studentId} className="rounded-lg border border-line bg-surface p-3">
                    <p className="mb-2 text-sm font-semibold text-ink">👤 {s.studentName}</p>
                    <div className="grid gap-1">
                      {s.milestones.map((m) => {
                        const spec = templateMilestones.find((t) => t.type === m.type);
                        return (
                          <div key={m.type} className="flex items-center justify-between border-t border-line py-1.5 text-xs first:border-t-0">
                            <span className="font-medium text-ink">{spec ? (lang === 'he' ? spec.nameHe : spec.nameEn) : m.type}</span>
                            <span className="font-semibold" style={{ color: statusColor(m.status) }}>
                              {statusLabel(m.status, lang)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
