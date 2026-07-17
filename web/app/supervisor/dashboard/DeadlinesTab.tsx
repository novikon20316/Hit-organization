'use client';

// app/supervisor/dashboard/DeadlinesTab.tsx
// Ported from mobile/app/supervisor/dashboard.tsx's 'deadlines' tab — a flat
// list of upcoming milestone due dates across this supervisor's own
// projects. Data comes from the shared getStaffDeadlines(uid) apiClient
// method (same one coordinator's DeadlinesTab uses).

import { useLanguage } from '@/contexts/LanguageContext';
import type { SupervisorDeadline } from './types';

interface DeadlinesTabProps {
  deadlines: SupervisorDeadline[];
}

export function DeadlinesTab({ deadlines }: DeadlinesTabProps) {
  const { lang } = useLanguage();

  if (deadlines.length === 0) {
    return <p className="text-sm text-muted">📭 {lang === 'he' ? 'אין מועדי הגשה' : 'No deadlines found'}</p>;
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {deadlines.map((d) => (
        <div
          key={`${d.milestoneId ?? d.id}-${d.studentId ?? ''}`}
          className="rounded-[var(--radius)] border-s-4 border border-line bg-surface p-4"
          style={{ borderInlineStartColor: '#F59E0B' }}
        >
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
          </div>
        </div>
      ))}
    </div>
  );
}
