'use client';

// components/MyProjectsWidget.tsx
// Same gap MyApplicationsWidget.tsx exists for, one step further still: once
// a student is actually approved and enrolled (not just applied), seeing
// their milestone/grade progress lives on ProjectCard + ProjectWorkflowSection
// — which a dual-role staff member (coordinator/faculty_admin/grad_school_head/
// administrative_secretary who's ALSO a supervisor) has no way to reach
// either, for the same "lands on the higher-ranked role's dashboard, manual
// switching removed" reason. program_head's own dashboard already solved
// this for itself with an inline "My Projects" tab reusing ProjectCard; this
// generalizes that into a drop-in widget for every other affected dashboard
// instead of duplicating that tab's fetch/state per page.
//
// Self-fetches (same getSupervisorDashboard data every sibling widget here
// uses) and self-gates like CreateOwnProjectButton/MyApplicationsWidget —
// renders nothing for anyone who isn't a supervisor/secondary_supervisor.

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/apiClient';
import { ProjectCard } from '@/app/supervisor/dashboard/ProjectCard';
import { EditProjectModal } from '@/app/supervisor/dashboard/EditProjectModal';
import { GradeMilestoneModal } from '@/app/supervisor/dashboard/GradeMilestoneModal';
import type { MyProject, SupervisorPendingMilestone } from '@/app/supervisor/dashboard/types';

export function MyProjectsWidget() {
  const { lang } = useLanguage();
  const { roles } = useAuth();
  const isSupervisor = roles.includes('supervisor') || roles.includes('secondary_supervisor');

  const [projects, setProjects] = useState<MyProject[]>([]);
  const [pendingGrades, setPendingGrades] = useState<SupervisorPendingMilestone[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState('');
  const [editingProject, setEditingProject] = useState<MyProject | null>(null);
  const [gradingTarget, setGradingTarget] = useState<SupervisorPendingMilestone | null>(null);

  const fetchProjects = useCallback(() => {
    setLoading(true);
    setError('');
    apiClient
      .getSupervisorDashboard()
      .then((res) => {
        setProjects((res.myProjects ?? []) as unknown as MyProject[]);
        setPendingGrades((res.pendingGrades ?? []) as unknown as SupervisorPendingMilestone[]);
      })
      .catch((err) => {
        setProjects([]);
        setError(err instanceof Error ? err.message : lang === 'he' ? 'הטעינה נכשלה' : 'Failed to load');
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- lang read once per call, not worth re-binding the callback over
  }, []);

  useEffect(() => {
    if (isSupervisor) fetchProjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetch-on-mount only
  }, [isSupervisor]);

  if (!isSupervisor) return null;

  return (
    <div className="rounded-[var(--radius)] border border-line bg-surface p-4">
      <button type="button" onClick={() => setExpanded((v) => !v)} className="flex w-full items-center justify-between gap-2 text-start">
        <span className="text-sm font-semibold text-ink">
          📁 {lang === 'he' ? 'הפרויקטים שלי (כמנחה) — סטודנטים וציונים' : 'My Projects (as Supervisor) — Students & Grades'}
          {projects.length > 0 && (
            <span className="ms-2 rounded-full bg-accent/20 px-2 py-0.5 text-xs font-bold text-accent">{projects.length}</span>
          )}
          {error && !loading && (
            <span className="ms-2 rounded-full bg-danger-bg px-2 py-0.5 text-xs font-bold text-danger">
              ⚠️ {lang === 'he' ? 'שגיאת טעינה' : 'Load error'}
            </span>
          )}
        </span>
        <span className="text-xs text-muted">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div className="mt-3 grid gap-3 border-t border-line pt-3 sm:grid-cols-2">
          {loading ? (
            <p className="text-sm text-muted">…</p>
          ) : error ? (
            <p className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger sm:col-span-2" role="alert">{error}</p>
          ) : projects.length === 0 ? (
            <p className="text-sm text-muted">{lang === 'he' ? 'טרם פרסמת פרויקטים' : 'No projects posted yet'}</p>
          ) : (
            projects.map((p) => (
              <ProjectCard
                key={p.id}
                project={p}
                onEdit={setEditingProject}
                onChanged={fetchProjects}
                pendingGrades={pendingGrades}
                onGrade={setGradingTarget}
              />
            ))
          )}
        </div>
      )}

      {editingProject && (
        <EditProjectModal project={editingProject} onClose={() => setEditingProject(null)} onSaved={fetchProjects} />
      )}

      {gradingTarget && (
        <GradeMilestoneModal
          key={gradingTarget.id}
          milestone={gradingTarget}
          onClose={() => setGradingTarget(null)}
          onGraded={fetchProjects}
        />
      )}
    </div>
  );
}
