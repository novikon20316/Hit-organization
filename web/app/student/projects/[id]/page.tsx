'use client';

// app/student/projects/[id]/page.tsx
// Per prior research, mobile's student/projects/[id].tsx is dead code with a
// broken data contract (it expects an embedded `milestones` field on the
// project doc that no server code path ever writes) — this is a fresh build
// from the real, working endpoints instead:
//   - apiClient.getStudentProject(id) — GET /api/student/projects/:id,
//     access-checked server-side (own project or staff role only).
//   - apiClient.getMilestones({ projectId: id }) — GET /api/milestones;
//     for a student caller the server always forces studentId to the
//     requester's own uid regardless of what's passed, so this is safely
//     scoped to the signed-in student's own milestones on this project.

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { useRequireRole } from '@/hooks/useRequireRole';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/apiClient';
import type { AppRole } from '@/lib/roles';
import { MilestoneTimeline, type MilestoneData } from '@/components/MilestoneTimeline';
import { SubmitMilestoneModal } from '@/app/student/home/SubmitMilestoneModal';
import { MILESTONE_ORDER, type ActiveProject, type Milestone } from '@/app/student/home/types';

const STUDENT_ROLES: AppRole[] = ['student'];

export default function StudentProjectDetailPage() {
  const { loading: guardLoading, isAllowed } = useRequireRole(STUDENT_ROLES);
  const { lang } = useLanguage();
  const params = useParams<{ id: string }>();
  const projectId = params.id;

  const [project, setProject] = useState<ActiveProject | null>(null);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState('');
  const [submitTarget, setSubmitTarget] = useState<Milestone | null>(null);

  const fetchMilestones = useCallback(async () => {
    const res = await apiClient.getMilestones({ projectId });
    const list = (res.milestones ?? []) as unknown as Milestone[];
    list.sort((a, b) => MILESTONE_ORDER.indexOf(a.type) - MILESTONE_ORDER.indexOf(b.type));
    setMilestones(list);
  }, [projectId]);

  const fetchAll = useCallback(async () => {
    setLoadingData(true);
    setError('');
    try {
      const [projectRes] = await Promise.all([apiClient.getStudentProject(projectId), fetchMilestones()]);
      setProject(projectRes as unknown as ActiveProject);
    } catch (err) {
      console.error('Failed to load project detail:', err);
      setError(err instanceof Error ? err.message : lang === 'he' ? 'טעינת הפרויקט נכשלה' : 'Failed to load the project');
    } finally {
      setLoadingData(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchMilestones is re-created only when projectId changes, already covered below
  }, [projectId, lang]);

  useEffect(() => {
    if (!projectId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; fetchAll's setState calls happen after its awaited network calls resolve, not synchronously in this effect
    fetchAll();
  }, [projectId, fetchAll]);

  if (guardLoading || !isAllowed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper">
        <p className="text-sm text-muted">…</p>
      </div>
    );
  }

  const progress = milestones.length > 0 ? Math.round((milestones.filter((m) => m.status === 'coordinator_approved').length / milestones.length) * 100) : 0;

  return (
    <DashboardShell title={lang === 'he' ? 'הפרויקט שלי' : 'My Project'}>
      {loadingData && <p className="text-sm text-muted">{lang === 'he' ? 'טוען…' : 'Loading…'}</p>}
      {error && <p className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>}

      {!loadingData && !error && (
        <div className="grid gap-5">
          <div className="rounded-[var(--radius)] border border-line bg-surface p-5">
            <p className="text-base font-semibold text-ink">📁 {project ? (lang === 'he' ? project.titleHe : project.titleEn) : '—'}</p>
            {project && (
              <p className="mt-1 text-sm text-muted">
                👨‍🏫 {project.supervisorName || (lang === 'he' ? 'ללא מנחה' : 'No Supervisor')}
                {project.academicYear ? ` · ${project.academicYear}` : ''}
              </p>
            )}
            {project && (project.descriptionHe || project.descriptionEn) ? (
              <p className="mt-3 text-sm text-muted">{lang === 'he' ? project.descriptionHe : project.descriptionEn}</p>
            ) : null}

            <div className="mt-4">
              <div className="flex items-center justify-between text-xs text-muted">
                <span>{lang === 'he' ? 'התקדמות' : 'Progress'}</span>
                <span>{progress}%</span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-paper">
                <div className="h-full rounded-full bg-primary" style={{ width: `${progress}%` }} />
              </div>
            </div>
          </div>

          <MilestoneTimeline
            milestones={milestones as unknown as MilestoneData[]}
            viewerRole="student"
            projectId={projectId}
            onStudentSubmit={(milestone) => setSubmitTarget(milestone as unknown as Milestone)}
          />
        </div>
      )}

      {submitTarget && (
        <SubmitMilestoneModal
          key={submitTarget.id}
          milestone={submitTarget}
          projectId={projectId}
          onClose={() => setSubmitTarget(null)}
          onSubmitted={() => {
            fetchMilestones().catch((err) => console.error('Failed to refresh milestones after submit:', err));
          }}
        />
      )}
    </DashboardShell>
  );
}
