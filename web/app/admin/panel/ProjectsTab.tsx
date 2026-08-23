'use client';

// app/admin/panel/ProjectsTab.tsx
// Ported from the `activeTab === 'projects'` section of mobile's panel.tsx.

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/apiClient';
import { getFacultyColor } from '@/lib/facultyColors';
import { facultyLabel, type FacultyId } from '@/lib/i18n';
import { VALID_FACULTY_IDS } from '@/lib/roles';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { CreateOwnProjectButton } from '@/components/CreateOwnProjectButton';
import { NewProjectModal } from './NewProjectModal';
import { AddStudentToProjectModal } from './AddStudentToProjectModal';
import { ScheduleDefenseModal } from './ScheduleDefenseModal';
import type { AdminProjectRecord, AdminUserRecord } from './types';

const DISPLAYED_FACULTIES = VALID_FACULTY_IDS.filter((id) => id !== 'all');

interface ProjectsTabProps {
  projects: AdminProjectRecord[];
  users: AdminUserRecord[];
  onChanged: () => void;
}

export function ProjectsTab({ projects, users, onChanged }: ProjectsTabProps) {
  const { lang } = useLanguage();
  const [statusFilter, setStatusFilter] = useState('all');
  const [facultyFilter, setFacultyFilter] = useState('all');
  const [showNewProject, setShowNewProject] = useState(false);
  const [addStudentProject, setAddStudentProject] = useState<AdminProjectRecord | null>(null);
  const [defenseProject, setDefenseProject] = useState<AdminProjectRecord | null>(null);
  const [deletingProject, setDeletingProject] = useState<AdminProjectRecord | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  const filteredProjects = useMemo(() => {
    return projects.filter((p) => {
      const statusOk = statusFilter === 'all' || p.status === statusFilter;
      const facultyOk = facultyFilter === 'all' || p.facultyId === facultyFilter;
      return statusOk && facultyOk;
    });
  }, [projects, statusFilter, facultyFilter]);

  const statusOptions = useMemo(() => {
    const set = new Set(projects.map((p) => p.status).filter(Boolean));
    return Array.from(set);
  }, [projects]);

  const handleDelete = async () => {
    if (!deletingProject) return;
    setDeleting(true);
    setError('');
    try {
      await apiClient.deleteAdminProject(deletingProject.id);
      setDeletingProject(null);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : lang === 'he' ? 'מחיקת הפרויקט נכשלה' : 'Failed to delete project');
      setDeletingProject(null);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div>
      <div className="mb-4">
        <CreateOwnProjectButton onCreated={onChanged} />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={selectCls}>
          <option value="all">{lang === 'he' ? 'כל הסטטוסים' : 'All statuses'}</option>
          {statusOptions.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select value={facultyFilter} onChange={(e) => setFacultyFilter(e.target.value)} className={selectCls}>
          <option value="all">{lang === 'he' ? 'כל הפקולטות' : 'All faculties'}</option>
          {DISPLAYED_FACULTIES.map((id) => (
            <option key={id} value={id}>
              {facultyLabel(id, lang)}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="mb-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>}

      <div className="grid gap-3 pb-20 sm:grid-cols-2">
        {filteredProjects.map((p) => {
          const color = getFacultyColor(p.facultyId);
          const title = lang === 'he' ? p.titleHe : p.titleEn;
          const isActive = p.status.toLowerCase().includes('active');
          return (
            <div
              key={p.id}
              className="role-rail rounded-admin-lg border border-admin-outline-variant bg-admin-surface-container-lowest p-4"
              style={{ '--rail-color': color } as React.CSSProperties}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="rounded-full px-2 py-0.5 text-xs font-medium" style={{ backgroundColor: `${color}1F`, color }}>
                  {facultyLabel(p.facultyId as FacultyId, lang)}
                </span>
                <span
                  className={`rounded-admin px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                    isActive ? 'bg-[#10b981]/10 text-[#10b981]' : 'bg-admin-surface-container-high text-admin-on-surface-variant'
                  }`}
                >
                  {p.status}
                </span>
              </div>

              <Link
                href={`/admin/projects/${p.id}/milestones`}
                className="mt-2 block text-sm font-semibold text-admin-on-surface hover:text-admin-primary hover:underline"
              >
                {title || '—'}
              </Link>

              <div className="mt-2 grid gap-1">
                <p className="text-xs text-admin-on-surface-variant">
                  👨‍🏫 {p.supervisorName || (lang === 'he' ? 'ללא מנחה' : 'No Supervisor')}
                </p>
                <p className="text-xs text-admin-on-surface-variant">
                  👥 {p.enrolledStudentIds?.length ?? 0} {lang === 'he' ? 'סטודנטים' : 'students'}
                </p>
              </div>

              <div className="mt-3 grid gap-1.5 border-t border-admin-outline-variant pt-3">
                <button
                  type="button"
                  onClick={() => setAddStudentProject(p)}
                  className="rounded-admin border border-admin-outline-variant px-3 py-1.5 text-xs font-medium text-admin-on-surface hover:border-admin-primary hover:text-admin-primary"
                >
                  👤➕ {lang === 'he' ? 'הוסף סטודנט' : 'Add Student'}
                </button>
                <button
                  type="button"
                  onClick={() => setDefenseProject(p)}
                  className="rounded-admin border border-admin-outline-variant px-3 py-1.5 text-xs font-medium text-admin-on-surface hover:border-admin-primary hover:text-admin-primary"
                >
                  🛡 {lang === 'he' ? 'תאם הגנה' : 'Schedule Defense'}
                </button>
                <button
                  type="button"
                  onClick={() => setDeletingProject(p)}
                  className="rounded-admin border border-danger px-3 py-1.5 text-xs font-medium text-danger hover:bg-danger-bg"
                >
                  🗑️ {lang === 'he' ? 'מחק' : 'Erase'}
                </button>
              </div>
            </div>
          );
        })}
        {filteredProjects.length === 0 && (
          <p className="text-sm text-admin-on-surface-variant">{lang === 'he' ? 'אין פרויקטים להצגה' : 'No projects to display'}</p>
        )}
      </div>

      <NewProjectModal open={showNewProject} onClose={() => setShowNewProject(false)} onCreated={onChanged} />
      {addStudentProject && (
        <AddStudentToProjectModal
          key={addStudentProject.id}
          project={addStudentProject}
          users={users}
          onClose={() => setAddStudentProject(null)}
          onEnrolled={onChanged}
        />
      )}
      {defenseProject && (
        <ScheduleDefenseModal key={defenseProject.id} project={defenseProject} onClose={() => setDefenseProject(null)} onSaved={onChanged} />
      )}

      <ConfirmDialog
        open={!!deletingProject}
        title={lang === 'he' ? 'מחיקת פרויקט' : 'Erase Project'}
        message={lang === 'he' ? 'הפרויקט יועבר לארכיון וניתן יהיה לשחזרו בכל עת.' : 'The project will be moved to the archive and can be restored at any time.'}
        confirmLabel={lang === 'he' ? 'מחק' : 'Erase'}
        cancelLabel={lang === 'he' ? 'ביטול' : 'Cancel'}
        destructive
        busy={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeletingProject(null)}
      />

      <div className="fixed start-0 end-0 bottom-0 z-30 border-t border-line bg-surface px-4 py-3 lg:start-64">
        <div className="mx-auto max-w-6xl">
          <button
            type="button"
            onClick={() => setShowNewProject(true)}
            className="w-full rounded-lg bg-primary py-3 text-sm font-semibold text-primary-ink hover:bg-primary-hover"
          >
            + {lang === 'he' ? 'הוסף פרויקט' : 'Add Project'}
          </button>
        </div>
      </div>
    </div>
  );
}

const selectCls = 'rounded-lg border border-line bg-surface px-3 py-1.5 text-sm text-ink focus:border-primary focus:outline-none';
