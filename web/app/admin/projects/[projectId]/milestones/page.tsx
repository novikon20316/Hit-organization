'use client';

// app/admin/projects/[projectId]/milestones/page.tsx
// Linked from both app/admin/panel/ProjectsTab.tsx and MilestonesTab.tsx.
// mobile/app/admin/projectMilestones.tsx (the reference UI this is ported
// from — progress ring + milestone list) calls a broken route
// (GET /api/projects/:projectId/milestones expecting a `.data.milestones`
// shape that endpoint never returns) — this uses the real, working,
// system_admin-gated endpoint instead: GET /api/admin/milestones?projectId=
// (adminController.ts's getAdminProjectMilestones), which returns a bare
// array of full raw Firestore milestone docs (Timestamps un-normalized,
// unlike GET /api/milestones's `{ milestones }` shape).
//
// No dedicated "get one admin project" endpoint exists, so project
// title/faculty/supervisor info comes from the same getAdminDashboardSummary
// call the admin panel itself already uses (see app/admin/panel/page.tsx) —
// filtered down to this one project client-side.

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { useRequireRole } from '@/hooks/useRequireRole';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/apiClient';
import { getFacultyColor } from '@/lib/facultyColors';
import { facultyLabel, type FacultyId } from '@/lib/i18n';
import type { AppRole } from '@/lib/roles';
import { MilestoneTimeline, type MilestoneData } from '@/components/MilestoneTimeline';
import { MILESTONE_ORDER, type MilestoneType, type MilestoneStatus } from '@/app/student/home/types';
import type { AdminProjectRecord } from '@/app/admin/panel/types';

const ADMIN_ROLES: AppRole[] = ['system_admin'];

// Same `{ _seconds, _nanoseconds }` vs ISO-string vs client-Timestamp
// normalization DefenseTab.tsx's parseServerDate uses — required here
// because, unlike GET /api/milestones, this admin endpoint doesn't convert
// Timestamps to ISO strings server-side.
function toISO(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === 'string') {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  if (typeof value === 'object') {
    const obj = value as { toDate?: () => Date; _seconds?: number };
    if (typeof obj.toDate === 'function') return obj.toDate().toISOString();
    if (typeof obj._seconds === 'number') return new Date(obj._seconds * 1000).toISOString();
  }
  return null;
}

function toMilestoneData(raw: Record<string, unknown> & { id: string }): MilestoneData {
  return {
    id: raw.id,
    type: (raw.type as MilestoneType) ?? 'research_proposal',
    status: (raw.status as MilestoneStatus) ?? 'pending',
    dueDate: toISO(raw.dueDate),
    submittedAt: toISO(raw.submittedAt),
    fileUrls: Array.isArray(raw.fileUrls) ? (raw.fileUrls as string[]) : [],
    finalGrade: typeof raw.finalGrade === 'number' ? raw.finalGrade : null,
    supervisorScore: typeof raw.supervisorScore === 'number' ? raw.supervisorScore : null,
    defenseDate: toISO(raw.defenseDate),
    defenseRoom: typeof raw.defenseRoom === 'string' ? raw.defenseRoom : null,
    defenseBuilding: typeof raw.defenseBuilding === 'string' ? raw.defenseBuilding : null,
    defenseTime: typeof raw.defenseTime === 'string' ? raw.defenseTime : null,
    examinerNames: Array.isArray(raw.examinerNames) ? (raw.examinerNames as string[]) : [],
    examinerIds: Array.isArray(raw.examinerIds) ? (raw.examinerIds as string[]) : [],
  };
}

export default function AdminProjectMilestonesPage() {
  const { loading: guardLoading, isAllowed } = useRequireRole(ADMIN_ROLES);
  const { lang } = useLanguage();
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;

  const [project, setProject] = useState<AdminProjectRecord | null>(null);
  const [milestones, setMilestones] = useState<MilestoneData[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState('');

  const fetchMilestones = useCallback(async () => {
    if (!projectId) return;
    const raw = await apiClient.getAdminProjectMilestones(projectId);
    const mapped = (raw ?? []).map((m) => toMilestoneData(m));
    mapped.sort((a, b) => MILESTONE_ORDER.indexOf(a.type as MilestoneType) - MILESTONE_ORDER.indexOf(b.type as MilestoneType));
    setMilestones(mapped);
  }, [projectId]);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;

    (async () => {
      setLoadingData(true);
      setError('');
      try {
        const [summary] = await Promise.all([apiClient.getAdminDashboardSummary(), fetchMilestones()]);
        if (cancelled) return;
        const found = (summary.projects ?? []).find((p) => p.id === projectId) as AdminProjectRecord | undefined;
        setProject(found ?? null);
      } catch (err) {
        if (cancelled) return;
        console.error('Failed to load project milestones:', err);
        setError(err instanceof Error ? err.message : lang === 'he' ? 'טעינת הנתונים נכשלה' : 'Failed to load data');
      } finally {
        if (!cancelled) setLoadingData(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchMilestones is stable per projectId; re-running per its identity is intentional and covered by the projectId dep already listed
  }, [projectId]);

  if (guardLoading || !isAllowed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper">
        <p className="text-sm text-muted">…</p>
      </div>
    );
  }

  const color = getFacultyColor(project?.facultyId);
  const title = project ? (lang === 'he' ? project.titleHe : project.titleEn) : null;

  return (
    <DashboardShell title={lang === 'he' ? 'אבני דרך של הפרויקט' : 'Project Milestones'}>
      <Link href="/admin/panel" className="text-sm font-medium text-primary hover:underline">
        {lang === 'he' ? '← חזרה לפאנל הניהול' : '← Back to admin panel'}
      </Link>

      {loadingData && <p className="mt-4 text-sm text-muted">{lang === 'he' ? 'טוען…' : 'Loading…'}</p>}
      {error && <p className="mt-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>}

      {!loadingData && !error && (
        <>
          <div className="role-rail mt-4 rounded-[var(--radius)] border border-line bg-surface p-5" style={{ '--rail-color': color } as React.CSSProperties}>
            {project ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full px-2 py-0.5 text-xs font-medium" style={{ backgroundColor: `${color}1F`, color }}>
                    {facultyLabel(project.facultyId as FacultyId, lang)}
                  </span>
                  <span className="rounded-full bg-paper px-2 py-0.5 text-xs font-medium text-ink">{project.status}</span>
                </div>
                <p className="mt-2 text-lg font-semibold text-ink">{title || '—'}</p>
                <p className="mt-1 text-sm text-muted">
                  👨‍🏫 {project.supervisorName || (lang === 'he' ? 'ללא מנחה' : 'No Supervisor')}
                  {' · '}
                  👥 {project.enrolledStudentIds?.length ?? 0} {lang === 'he' ? 'סטודנטים' : 'students'}
                </p>
                {(project.descriptionHe || project.descriptionEn) && (
                  <p className="mt-2 text-sm text-muted">{lang === 'he' ? project.descriptionHe : project.descriptionEn}</p>
                )}
              </>
            ) : (
              <p className="text-sm text-muted">{lang === 'he' ? 'הפרויקט לא נמצא' : 'Project not found'}</p>
            )}
          </div>

          <div className="mt-5">
            <MilestoneTimeline
              milestones={milestones}
              viewerRole="system_admin"
              projectId={projectId}
              onAdjustDate={() => {
                fetchMilestones().catch((err) => console.error('Failed to refresh milestones after date adjust:', err));
              }}
            />
          </div>
        </>
      )}
    </DashboardShell>
  );
}
