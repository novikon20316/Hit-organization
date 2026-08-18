'use client';

// app/faculty_admin/dashboard/ProjectCard.tsx
import { useLanguage } from '@/contexts/LanguageContext';
import { getFacultyColor } from '@/lib/facultyColors';
import type { FacultyAdminProjectRecord } from './types';

interface ProjectCardProps {
  project: FacultyAdminProjectRecord;
  onEnroll: (project: FacultyAdminProjectRecord) => void;
}

// Fresh Project Card Designs' status-pill convention (10%-opacity tint +
// full-opacity text) — same active/neutral split as supervisor's ProjectCard,
// generalized since this role's status strings aren't a fixed known enum.
function statusBadgeClass(status: string): string {
  return status.toLowerCase().includes('active') ? 'bg-success-bg text-success' : 'bg-paper text-ink';
}

export function ProjectCard({ project: p, onEnroll }: ProjectCardProps) {
  const { lang, t } = useLanguage();
  const facultyColor = getFacultyColor(p.facultyId);
  const max = p.maxStudents ?? p.NumberOfStudents ?? 1;

  return (
    <div className="role-rail rounded-[var(--radius)] border border-line bg-surface p-4" style={{ '--rail-color': facultyColor } as React.CSSProperties}>
      <span className={`rounded-[4px] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${statusBadgeClass(p.status)}`}>{p.status}</span>
      <p className="mt-2 text-sm font-semibold text-ink">{lang === 'he' ? p.titleHe : p.titleEn}</p>
      <div className="mt-2 grid gap-1">
        <p className="flex items-center gap-1.5 text-xs text-muted">
          👨‍🏫 {p.supervisorName || (lang === 'he' ? 'לא משויך' : 'Unassigned')}
        </p>
        <p className="flex items-center gap-1.5 text-xs text-muted">
          🎓 {p.degreeType === 'bachelors' ? t('bachelors') : t('masters')}
        </p>
        <p className="flex items-center gap-1.5 text-xs text-muted">
          👥 {lang === 'he' ? 'סטודנטים' : 'Students'}: {p.enrolledStudentIds?.length ?? 0}/{max}
        </p>
      </div>

      <div className="mt-3 border-t border-line pt-3">
        <button
          type="button"
          onClick={() => onEnroll(p)}
          disabled={(p.enrolledStudentIds?.length ?? 0) >= max}
          className="w-full rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink hover:border-primary hover:text-primary disabled:opacity-40"
        >
          {lang === 'he' ? '+ שייך סטודנט' : '+ Enroll Student'}
        </button>
      </div>
    </div>
  );
}
