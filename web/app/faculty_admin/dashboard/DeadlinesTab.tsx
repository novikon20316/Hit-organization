'use client';

// app/faculty_admin/dashboard/DeadlinesTab.tsx
// Near-identical to coordinator/home/DeadlinesTab.tsx and
// supervisor/dashboard/DeadlinesTab.tsx — a flat list of upcoming milestone
// due dates, here across the faculty_admin's whole faculty (getDeadLines in
// staffController.ts branches on the caller's role and returns
// faculty-wide, not just-their-own, milestones for faculty_admin/coordinator),
// plus the same bulk due-date override tool coordinator's tab exposes.
// Duplicated rather than imported from coordinator/home — that file's
// `DeadlinesTab` takes a `Project[]` typed to coordinator/home/types.ts's own
// `Project` interface, which carries coordinator-specific fields (examinerIds,
// milestones with defense-panel shape) this dashboard's project records
// don't have; matches this codebase's per-route colocated-files convention
// (see supervisor/dashboard/types.ts's near-identical comment on
// SupervisorDeadline vs CoordinatorDeadline).

import { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { BulkDueDateModal } from '@/components/BulkDueDateModal';
import { ExceptionalActionQueue } from '@/components/ExceptionalActionQueue';
import { ExaminerEscalationPanel } from '@/components/ExaminerEscalationPanel';
import type { FacultyAdminDeadline, FacultyAdminProjectRecord, FacultyAdminUserRecord } from './types';

// Same thresholds as the supervisor dashboard's per-project urgency color
// (green: more than a week left · orange: 1-7 days left · red: due today or
// already past due) — daysLeft is already negative once overdue, so red
// covers that range too without a separate "overdue" branch.
function urgencyColorFor(daysLeft: number | null | undefined): string {
  if (daysLeft === null || daysLeft === undefined) return '#8899BB';
  if (daysLeft > 7) return '#10B981';
  if (daysLeft >= 1) return '#F59E0B';
  return '#EF4444';
}

function formatDueDate(iso: string | null | undefined, lang: 'he' | 'en'): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

interface DeadlinesTabProps {
  deadlines: FacultyAdminDeadline[];
  projects: FacultyAdminProjectRecord[];
  users: FacultyAdminUserRecord[];
  onSaved: () => void;
}

export function DeadlinesTab({ deadlines, projects, users, onSaved }: DeadlinesTabProps) {
  const { lang } = useLanguage();
  const [showBulk, setShowBulk] = useState(false);

  const userNamesById: Record<string, string> = {};
  users.forEach((u) => { userNamesById[u.id] = u.displayName; });

  return (
    <div>
      <ExceptionalActionQueue />
      <ExaminerEscalationPanel />
      <button
        type="button"
        onClick={() => setShowBulk(true)}
        className="mb-4 rounded-lg bg-faculty-admin-primary px-3.5 py-2 text-sm font-semibold text-faculty-admin-on-primary hover:opacity-90"
      >
        📅 {lang === 'he' ? 'עדכון תאריכי יעד מרוכז' : 'Bulk Update Due Dates'}
      </button>

      {deadlines.length === 0 ? (
        <p className="text-sm text-faculty-admin-on-surface-variant">📭 {lang === 'he' ? 'אין מועדי הגשה' : 'No deadlines'}</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {deadlines.map((d) => (
            <div key={`${d.milestoneId ?? d.id}-${d.studentId ?? ''}`} className="rounded-faculty-admin border-s-4 border border-faculty-admin-outline-variant bg-faculty-admin-surface-container-lowest p-4" style={{ borderInlineStartColor: '#F59E0B' }}>
              <p className="mb-2 text-sm font-semibold text-faculty-admin-on-surface">👤 {d.studentName}</p>
              <div className="grid gap-1.5 text-xs">
                <p className="text-faculty-admin-on-surface-variant">
                  {lang === 'he' ? 'תואר:' : 'Degree:'} <span className="font-medium text-faculty-admin-on-surface">{d.degreeType || 'N/A'}</span>
                </p>
                <p className="text-faculty-admin-on-surface-variant">
                  {lang === 'he' ? 'שנה:' : 'Year:'} <span className="font-medium text-faculty-admin-on-surface">{d.yearOfStudy || '—'}</span>
                </p>
                <p className="text-faculty-admin-on-surface-variant">
                  {lang === 'he' ? 'פרויקט:' : 'Project:'} <span className="font-medium text-faculty-admin-on-surface">{d.projectTitle || 'N/A'}</span>
                </p>
                <p className="text-faculty-admin-on-surface-variant">
                  {lang === 'he' ? 'אבן דרך:' : 'Milestone:'} <span className="font-medium text-faculty-admin-on-surface">{d.milestoneName || 'N/A'}</span>
                </p>
                <div className="flex items-center justify-between border-t border-faculty-admin-outline-variant pt-1.5">
                  <span className="text-faculty-admin-on-surface-variant">{lang === 'he' ? 'ימים לסיום:' : 'Days Left:'}</span>
                  <span className="font-bold" style={{ color: urgencyColorFor(d.daysLeft) }}>
                    {d.daysLeft !== null && d.daysLeft !== undefined ? `${d.daysLeft} ${lang === 'he' ? 'ימים' : 'days'}` : 'N/A'}
                  </span>
                </div>
                {formatDueDate(d.dueDate, lang) && (
                  <p className="text-faculty-admin-on-surface-variant">
                    {lang === 'he' ? 'תאריך יעד:' : 'Due date:'} <span className="font-medium text-faculty-admin-on-surface">{formatDueDate(d.dueDate, lang)}</span>
                  </p>
                )}
                {d.class && (
                  <p className="border-t border-faculty-admin-outline-variant pt-1.5 text-faculty-admin-on-surface-variant">
                    {lang === 'he' ? 'קבוצה:' : 'Class:'} <span className="font-medium text-faculty-admin-on-surface">{d.class}</span>
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showBulk && (
        <BulkDueDateModal
          projects={projects.map((p) => ({
            id: p.id,
            label: lang === 'he' ? p.titleHe : p.titleEn,
            sublabel: p.enrolledStudentIds.map((sid) => userNamesById[sid] ?? sid).join(', ') || undefined,
          }))}
          onClose={() => setShowBulk(false)}
          onSaved={onSaved}
        />
      )}
    </div>
  );
}
