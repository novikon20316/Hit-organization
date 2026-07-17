'use client';

// app/faculty_admin/dashboard/ProjectCard.tsx
import { useLanguage } from '@/contexts/LanguageContext';
import { getFacultyColor } from '@/lib/facultyColors';
import type { FacultyAdminProjectRecord } from './types';

interface ProjectCardProps {
  project: FacultyAdminProjectRecord;
  onEnroll: (project: FacultyAdminProjectRecord) => void;
}

export function ProjectCard({ project: p, onEnroll }: ProjectCardProps) {
  const { lang, t } = useLanguage();
  const facultyColor = getFacultyColor(p.facultyId);
  const max = p.maxStudents ?? p.NumberOfStudents ?? 1;

  return (
    <div className="role-rail rounded-[var(--radius)] border border-line bg-surface p-4" style={{ '--rail-color': facultyColor } as React.CSSProperties}>
      <span className="rounded-full bg-paper px-2 py-0.5 text-xs font-medium text-ink">{p.status}</span>
      <p className="mt-2 text-sm font-semibold text-ink">{lang === 'he' ? p.titleHe : p.titleEn}</p>
      <p className="mt-1 text-xs text-muted">👨‍🏫 {p.supervisorName || (lang === 'he' ? 'לא משויך' : 'Unassigned')}</p>
      <p className="mt-1 text-xs text-muted">
        {p.degreeType === 'bachelors' ? t('bachelors') : t('masters')} · {lang === 'he' ? 'סטודנטים' : 'Students'}: {p.enrolledStudentIds?.length ?? 0}/{max}
      </p>

      <button
        type="button"
        onClick={() => onEnroll(p)}
        disabled={(p.enrolledStudentIds?.length ?? 0) >= max}
        className="mt-3 w-full rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink hover:border-primary hover:text-primary disabled:opacity-40"
      >
        {lang === 'he' ? '+ שייך סטודנט' : '+ Enroll Student'}
      </button>
    </div>
  );
}
