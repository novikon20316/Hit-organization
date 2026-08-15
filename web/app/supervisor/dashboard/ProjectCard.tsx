'use client';

// app/supervisor/dashboard/ProjectCard.tsx
import { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/apiClient';
import { getFacultyColor } from '@/lib/facultyColors';
import { facultyLabel } from '@/lib/i18n';
import { ProjectWorkflowSection } from './ProjectWorkflowSection';
import { RequestErasureModal } from './RequestErasureModal';
import type { FacultyId } from '@/lib/i18n';
import type { MyProject } from './types';

// Due-date urgency border color — green: more than a week left, orange:
// 1-7 days left, red: due today or already past due. Matches the same
// thresholds the server used to compute currentMilestone.urgency.
const URGENCY_COLOR: Record<'green' | 'orange' | 'red', string> = {
  green: '#3F6B4C',
  orange: '#B8862E',
  red: '#A8433A',
};

const PROJECT_STATUS_LABEL: Record<string, { he: string; en: string }> = {
  active: { he: 'פעיל', en: 'Active' },
  in_progress: { he: 'בתהליך', en: 'In Progress' },
};

interface ProjectCardProps {
  project: MyProject;
  onEdit: (project: MyProject) => void;
  onChanged: () => void;
}

export function ProjectCard({ project: p, onEdit, onChanged }: ProjectCardProps) {
  const { lang, t } = useLanguage();
  const facultyColor = getFacultyColor(p.facultyId);
  const [showRequestErasure, setShowRequestErasure] = useState(false);

  const urgency = p.currentMilestone?.urgency ?? null;
  const urgencyColor = urgency ? URGENCY_COLOR[urgency] : 'transparent';

  return (
    <div className="rounded-[calc(var(--radius)+4px)] p-1" style={{ border: `2px solid ${urgencyColor}` }}>
    <div className="role-rail rounded-[var(--radius)] border border-line bg-surface p-4" style={{ '--rail-color': facultyColor } as React.CSSProperties}>
      <div className="flex items-center gap-1.5">
        <span className="rounded-full px-2 py-0.5 text-xs font-medium" style={{ backgroundColor: `${facultyColor}1F`, color: facultyColor }}>
          {facultyLabel(p.facultyId as FacultyId, lang)}
        </span>
        <span className="rounded-full bg-paper px-2 py-0.5 text-xs font-medium text-ink">
          {PROJECT_STATUS_LABEL[p.status]?.[lang] ?? p.status}
        </span>
      </div>
      <p className="mt-2 text-sm font-semibold text-ink">{lang === 'he' ? p.titleHe : p.titleEn}</p>
      <p className="mt-1 text-xs text-muted">
        {p.degreeType === 'bachelors' ? t('bachelors') : t('masters')} ·{' '}
        {p.projectType === 'project' ? (lang === 'he' ? 'פרויקט' : 'Project') : lang === 'he' ? 'תזה' : 'Thesis'} ·{' '}
        {lang === 'he' ? 'סטודנטים' : 'Students'}: {p.enrolledStudentIds?.length ?? 0}/{p.NumberOfStudents ?? 1}
      </p>

      {(p.enrolledStudents?.length ?? 0) > 0 && (
        <div className="mt-1.5 grid gap-0.5">
          {p.enrolledStudents!.map((s) => (
            <p key={s.id} className="text-xs text-muted">
              👤 {s.name || (lang === 'he' ? 'שם לא זמין' : 'Name unavailable')}
              {s.degreeType ? ` · ${s.degreeType === 'bachelors' ? t('bachelors') : t('masters')}` : ''}
              {s.yearOfStudy ? ` · ${lang === 'he' ? 'שנה' : 'Year'} ${s.yearOfStudy}` : ''}
            </p>
          ))}
        </div>
      )}

      {p.currentMilestone && (
        <p className="mt-1.5 text-xs font-medium" style={{ color: urgencyColor }}>
          🗓 {lang === 'he' ? p.currentMilestone.nameHe : p.currentMilestone.nameEn}
          {p.currentMilestone.daysLeft !== null &&
            ` — ${
              p.currentMilestone.daysLeft < 0
                ? lang === 'he'
                  ? `באיחור של ${Math.abs(p.currentMilestone.daysLeft)} ימים`
                  : `${Math.abs(p.currentMilestone.daysLeft)}d overdue`
                : lang === 'he'
                  ? `${p.currentMilestone.daysLeft} ימים נותרו`
                  : `${p.currentMilestone.daysLeft}d left`
            }`}
        </p>
      )}

      {(p.applicationIds?.length ?? 0) > 0 && (
        <p className="mt-1.5 text-xs font-medium text-accent">
          📨 {p.applicationIds.length} {lang === 'he' ? 'מועמדויות' : 'applications'}
        </p>
      )}

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => onEdit(p)}
          className="flex-1 rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink hover:border-primary hover:text-primary"
        >
          {lang === 'he' ? 'עריכה' : 'Edit'}
        </button>
        <button
          type="button"
          onClick={() => setShowRequestErasure(true)}
          className="flex-1 rounded-lg border border-danger px-3 py-1.5 text-xs font-medium text-danger hover:bg-danger-bg"
        >
          {t('requestErasure')}
        </button>
      </div>

      <ProjectWorkflowSection project={p} />

      {showRequestErasure && (
        <RequestErasureModal project={p} onClose={() => setShowRequestErasure(false)} onSubmitted={onChanged} />
      )}
    </div>
    </div>
  );
}
