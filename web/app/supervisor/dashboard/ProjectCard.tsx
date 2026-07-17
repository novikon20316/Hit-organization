'use client';

// app/supervisor/dashboard/ProjectCard.tsx
import { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/apiClient';
import { getFacultyColor } from '@/lib/facultyColors';
import { facultyLabel } from '@/lib/i18n';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import type { FacultyId } from '@/lib/i18n';
import type { MyProject } from './types';

interface ProjectCardProps {
  project: MyProject;
  onEdit: (project: MyProject) => void;
  onChanged: () => void;
}

export function ProjectCard({ project: p, onEdit, onChanged }: ProjectCardProps) {
  const { lang, t } = useLanguage();
  const facultyColor = getFacultyColor(p.facultyId);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await apiClient.deleteSupervisorProject(p.id);
      setConfirmDelete(false);
      onChanged();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="role-rail rounded-[var(--radius)] border border-line bg-surface p-4" style={{ '--rail-color': facultyColor } as React.CSSProperties}>
      <div className="flex items-center gap-1.5">
        <span className="rounded-full px-2 py-0.5 text-xs font-medium" style={{ backgroundColor: `${facultyColor}1F`, color: facultyColor }}>
          {facultyLabel(p.facultyId as FacultyId, lang)}
        </span>
        <span className="rounded-full bg-paper px-2 py-0.5 text-xs font-medium text-ink">{p.status}</span>
      </div>
      <p className="mt-2 text-sm font-semibold text-ink">{lang === 'he' ? p.titleHe : p.titleEn}</p>
      <p className="mt-1 text-xs text-muted">
        {p.degreeType === 'bachelors' ? t('bachelors') : t('masters')} ·{' '}
        {p.projectType === 'project' ? (lang === 'he' ? 'פרויקט' : 'Project') : lang === 'he' ? 'תזה' : 'Thesis'} ·{' '}
        {lang === 'he' ? 'סטודנטים' : 'Students'}: {p.enrolledStudentIds?.length ?? 0}/{p.NumberOfStudents ?? 1}
      </p>
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
          onClick={() => setConfirmDelete(true)}
          className="flex-1 rounded-lg border border-danger px-3 py-1.5 text-xs font-medium text-danger hover:bg-danger-bg"
        >
          {lang === 'he' ? 'מחיקה' : 'Delete'}
        </button>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title={lang === 'he' ? 'מחיקת פרויקט' : 'Delete Project'}
        message={lang === 'he' ? 'האם אתה בטוח שברצונך להעביר פרויקט זה לארכיון?' : 'Are you sure you want to archive this project?'}
        confirmLabel={lang === 'he' ? 'מחק' : 'Delete'}
        cancelLabel={t('cancel')}
        destructive
        busy={deleting}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}
