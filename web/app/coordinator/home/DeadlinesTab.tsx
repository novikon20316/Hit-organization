'use client';

// app/coordinator/home/DeadlinesTab.tsx
// Ported from mobile/app/coordinator/home.tsx's 'deadlines' tab — a flat list
// of upcoming milestone due dates across the coordinator's faculty, plus a
// bulk due-date override tool for general delays (holidays, war, etc.).
// Data comes from getStaffDeadlines(uid), fetched once by page.tsx.

import { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { BulkDueDateModal } from '@/components/BulkDueDateModal';
import { ExaminerEscalationPanel } from '@/components/ExaminerEscalationPanel';
import type { CoordinatorDeadline, Project } from './types';

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
  deadlines: CoordinatorDeadline[];
  projects: Project[];
  onSaved: () => void;
}

export function DeadlinesTab({ deadlines, projects, onSaved }: DeadlinesTabProps) {
  const { lang } = useLanguage();
  const [showBulk, setShowBulk] = useState(false);

  return (
    <div>
      <ExaminerEscalationPanel />
      <button
        type="button"
        onClick={() => setShowBulk(true)}
        className="mb-4 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-ink hover:bg-primary-hover"
      >
        📅 {lang === 'he' ? 'עדכון תאריכי יעד מרוכז' : 'Bulk Update Due Dates'}
      </button>

      {deadlines.length === 0 ? (
        <p className="text-sm text-muted">{lang === 'he' ? 'אין מועדי הגשה' : 'No deadlines'}</p>
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
                  <span className="font-bold" style={{ color: urgencyColorFor(d.daysLeft) }}>
                    {d.daysLeft !== null && d.daysLeft !== undefined ? `${d.daysLeft} ${lang === 'he' ? 'ימים' : 'days'}` : 'N/A'}
                  </span>
                </div>
                {formatDueDate(d.dueDate, lang) && (
                  <p className="text-muted">
                    {lang === 'he' ? 'תאריך יעד:' : 'Due date:'} <span className="font-medium text-ink">{formatDueDate(d.dueDate, lang)}</span>
                  </p>
                )}
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
          projects={projects.map((p) => ({
            id: p.id,
            label: lang === 'he' ? p.titleHe : p.titleEn,
            sublabel: Array.from(new Set((p.milestones ?? []).flatMap((m) => m.studentNames))).join(', ') || undefined,
          }))}
          onClose={() => setShowBulk(false)}
          onSaved={onSaved}
        />
      )}
    </div>
  );
}
