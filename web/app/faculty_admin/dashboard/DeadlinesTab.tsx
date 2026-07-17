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
import type { FacultyAdminDeadline, FacultyAdminProjectRecord } from './types';

interface DeadlinesTabProps {
  deadlines: FacultyAdminDeadline[];
  projects: FacultyAdminProjectRecord[];
  onSaved: () => void;
}

export function DeadlinesTab({ deadlines, projects, onSaved }: DeadlinesTabProps) {
  const { lang } = useLanguage();
  const [showBulk, setShowBulk] = useState(false);

  return (
    <div>
      <button
        type="button"
        onClick={() => setShowBulk(true)}
        className="mb-4 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-ink hover:bg-primary-hover"
      >
        📅 {lang === 'he' ? 'עדכון תאריכי יעד מרוכז' : 'Bulk Update Due Dates'}
      </button>

      {deadlines.length === 0 ? (
        <p className="text-sm text-muted">📭 {lang === 'he' ? 'אין מועדי הגשה' : 'No deadlines'}</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {deadlines.map((d) => (
            <div key={`${d.milestoneId ?? d.id}-${d.studentId ?? ''}`} className="rounded-[var(--radius)] border-s-4 border border-line bg-surface p-4" style={{ borderInlineStartColor: '#F59E0B' }}>
              <p className="mb-2 text-sm font-semibold text-ink">👤 {d.studentName}</p>
              <div className="grid gap-1.5 text-xs">
                <p className="text-muted">
                  {lang === 'he' ? 'תואר:' : 'Degree:'} <span className="font-medium text-ink">{d.degreeType || 'N/A'}</span>
                </p>
                <p className="text-muted">
                  {lang === 'he' ? 'שנה:' : 'Year:'} <span className="font-medium text-ink">{d.yearOfStudy || '—'}</span>
                </p>
                <p className="text-muted">
                  {lang === 'he' ? 'פרויקט:' : 'Project:'} <span className="font-medium text-ink">{d.projectTitle || 'N/A'}</span>
                </p>
                <p className="text-muted">
                  {lang === 'he' ? 'אבן דרך:' : 'Milestone:'} <span className="font-medium text-ink">{d.milestoneName || 'N/A'}</span>
                </p>
                <div className="flex items-center justify-between border-t border-line pt-1.5">
                  <span className="text-muted">{lang === 'he' ? 'ימים לסיום:' : 'Days Left:'}</span>
                  <span className="font-bold" style={{ color: d.daysLeft !== null && d.daysLeft !== undefined && d.daysLeft < 0 ? '#EF4444' : '#10B981' }}>
                    {d.daysLeft !== null && d.daysLeft !== undefined ? `${d.daysLeft} ${lang === 'he' ? 'ימים' : 'days'}` : 'N/A'}
                  </span>
                </div>
                {d.class && (
                  <p className="border-t border-line pt-1.5 text-muted">
                    {lang === 'he' ? 'קבוצה:' : 'Class:'} <span className="font-medium text-ink">{d.class}</span>
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showBulk && (
        <BulkDueDateModal
          projects={projects.map((p) => ({ id: p.id, label: lang === 'he' ? p.titleHe : p.titleEn }))}
          onClose={() => setShowBulk(false)}
          onSaved={onSaved}
        />
      )}
    </div>
  );
}
