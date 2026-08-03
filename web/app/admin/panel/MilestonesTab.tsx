'use client';

// app/admin/panel/MilestonesTab.tsx
// Ported from the `activeTab === 'milestones'` section of mobile's
// panel.tsx — milestones grouped by project (joining in the project title
// and student names, since raw milestone docs don't carry those), plus the
// bulk due-date override entry point.

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useLanguage } from '@/contexts/LanguageContext';
import { getFacultyColor } from '@/lib/facultyColors';
import { facultyLabel, type FacultyId } from '@/lib/i18n';
import { BulkDueDateModal } from '@/components/BulkDueDateModal';
import type { AdminMilestoneRecord, AdminProjectRecord, AdminUserRecord } from './types';

interface MilestonesTabProps {
  projects: AdminProjectRecord[];
  milestones: AdminMilestoneRecord[];
  users: AdminUserRecord[];
  onChanged: () => void;
}

interface MilestoneGroup {
  projectId: string;
  projectTitleHe: string;
  projectTitleEn: string;
  facultyId: FacultyId;
  studentNames: string[];
  milestones: AdminMilestoneRecord[];
}

export function MilestonesTab({ projects, milestones, users, onChanged }: MilestonesTabProps) {
  const { lang } = useLanguage();
  const [showBulkDueDate, setShowBulkDueDate] = useState(false);

  const activeProjectIds = useMemo(() => new Set(projects.map((p) => p.id)), [projects]);

  const projectsById = useMemo(() => {
    const map: Record<string, AdminProjectRecord> = {};
    projects.forEach((p) => {
      map[p.id] = p;
    });
    return map;
  }, [projects]);

  const userNamesById = useMemo(() => {
    const map: Record<string, string> = {};
    users.forEach((u) => {
      map[u.id] = u.displayName;
    });
    return map;
  }, [users]);

  const groupedMilestones = useMemo(() => {
    const groups: Record<string, MilestoneGroup> = {};
    milestones.forEach((milestone) => {
      const key = milestone.projectId;
      if (!groups[key]) {
        const project = projectsById[key];
        const studentNames = (project?.enrolledStudentIds ?? []).map((sid) => userNamesById[sid] ?? sid);
        groups[key] = {
          projectId: key,
          projectTitleHe: project?.titleHe ?? milestone.projectTitleHe ?? '',
          projectTitleEn: project?.titleEn ?? milestone.projectTitleEn ?? '',
          facultyId: (project?.facultyId ?? milestone.facultyId ?? 'all') as FacultyId,
          studentNames,
          milestones: [],
        };
      }
      groups[key]!.milestones.push(milestone);
    });
    return Object.values(groups).filter((g) => activeProjectIds.has(g.projectId));
  }, [milestones, projectsById, userNamesById, activeProjectIds]);

  const projectOptions = useMemo(
    () => projects.map((p) => ({
      id: p.id,
      label: (lang === 'he' ? p.titleHe : p.titleEn) || p.id,
      sublabel: (p.enrolledStudentIds ?? []).map((sid) => userNamesById[sid] ?? sid).join(', ') || undefined,
    })),
    [projects, lang, userNamesById]
  );

  return (
    <div>
      <button
        type="button"
        onClick={() => setShowBulkDueDate(true)}
        className="mb-4 rounded-full bg-primary px-4 py-1.5 text-sm font-semibold text-primary-ink hover:bg-primary-hover"
      >
        📅 {lang === 'he' ? 'עדכון תאריכי יעד מרוכז' : 'Bulk Update Due Dates'}
      </button>

      <div className="grid gap-3 sm:grid-cols-2">
        {groupedMilestones.map((group) => {
          const color = getFacultyColor(group.facultyId);
          const pendingCount = group.milestones.filter((m) => m.status === 'pending').length;
          const submittedCount = group.milestones.filter((m) => m.status === 'submitted').length;
          const approvedCount = group.milestones.filter((m) => m.status === 'approved').length;

          return (
            <Link
              key={group.projectId}
              href={`/admin/projects/${group.projectId}/milestones`}
              className="role-rail block rounded-[var(--radius)] border border-line bg-surface p-4 hover:border-primary"
              style={{ '--rail-color': color } as React.CSSProperties}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="rounded-full px-2 py-0.5 text-xs font-medium" style={{ backgroundColor: `${color}1F`, color }}>
                  {facultyLabel(group.facultyId, lang)}
                </span>
                <span className="rounded-full bg-paper px-2 py-0.5 text-xs font-medium text-ink">📋 {group.milestones.length}</span>
              </div>

              <p className="mt-2 text-sm font-semibold text-ink">{(lang === 'he' ? group.projectTitleHe : group.projectTitleEn) || '—'}</p>

              <p className="mt-1 text-xs text-muted">
                👤 {group.studentNames.length} {lang === 'he' ? 'סטודנטים' : 'students'}
                {group.studentNames.length > 0 ? ` — ${group.studentNames.join(', ')}` : ''}
              </p>

              <div className="mt-3 flex gap-2">
                <StatBox emoji="⏳" value={pendingCount} />
                <StatBox emoji="📨" value={submittedCount} />
                <StatBox emoji="✅" value={approvedCount} />
              </div>

              <p className="mt-3 text-xs font-medium text-primary">👉 {lang === 'he' ? 'לחץ לצפייה בכל אבני הדרך' : 'Tap to view all milestones'}</p>
            </Link>
          );
        })}
        {groupedMilestones.length === 0 && <p className="text-sm text-muted">{lang === 'he' ? 'אין אבני דרך להצגה' : 'No milestones to display'}</p>}
      </div>

      {showBulkDueDate && <BulkDueDateModal projects={projectOptions} onClose={() => setShowBulkDueDate(false)} onSaved={onChanged} />}
    </div>
  );
}

function StatBox({ emoji, value }: { emoji: string; value: number }) {
  return (
    <div className="flex flex-1 flex-col items-center rounded-lg bg-paper py-1.5">
      <span className="text-sm">{emoji}</span>
      <span className="text-sm font-semibold text-ink">{value}</span>
    </div>
  );
}
