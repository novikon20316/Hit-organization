'use client';

// app/coordinator/home/EditProjectModal.tsx
// Lets a coordinator (or faculty_admin/administrative_secretary/system_admin
// within scope — see updateSupervisorProject's withinCoordinatorScope check)
// fix a human-error typo — wrong title, wrong student count, etc. — on ANY
// project in their faculty from the Active Projects tab, not just their own.
// Same PUT /api/supervisor/projects/:id endpoint the supervisor's own
// EditProjectModal.tsx uses; this one is typed against InProgressProject
// (coordinator/home/types.ts) rather than MyProject (supervisor dashboard's
// own type), and additionally exposes maxStudents.

import { useMemo, useRef, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/apiClient';
import { degreeLevelsForFaculty } from '@/lib/permissions';
import { TeamSizeField } from '@/components/TeamSizeField';
import { useModalA11y } from '@/hooks/useModalA11y';
import type { InProgressProject } from './types';
import { InfoTooltip } from '@/components/InfoTooltip';
import { FieldGuideOverlay } from '@/components/guidance/FieldGuideOverlay';
import { newProjectFieldInfo, pickNewProjectSteps } from '@/components/newProjectFieldGuide';

const EDIT_PROJECT_GUIDE_KEY = 'coordinator-edit-project';
const EDIT_PROJECT_STEPS = pickNewProjectSteps(['title', 'description', 'degreeType', 'projectType', 'teamSize', 'skills']);

interface EditProjectModalProps {
  project: InProgressProject;
  onClose: () => void;
  onSaved: () => void;
}

export function EditProjectModal({ project, onClose, onSaved }: EditProjectModalProps) {
  const { lang, t } = useLanguage();
  const [titleHe, setTitleHe] = useState(project.projectTitleHe);
  const [titleEn, setTitleEn] = useState(project.projectTitleEn);
  const [descHe, setDescHe] = useState(project.descriptionHe ?? '');
  const [descEn, setDescEn] = useState(project.descriptionEn ?? '');
  const [degreeType, setDegreeType] = useState(project.degreeType ?? 'bachelors');
  const [projectType, setProjectType] = useState(project.projectType ?? 'project');
  const [maxStudents, setMaxStudents] = useState(project.maxStudents ?? 1);
  const [skills, setSkills] = useState((project.requiredSkills ?? []).join(', '));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalA11y(dialogRef, true, onClose);

  const degreeOptions = useMemo(() => degreeLevelsForFaculty(project.facultyId), [project.facultyId]);

  const handleSave = async () => {
    if (!titleHe.trim() || !titleEn.trim()) {
      setError(lang === 'he' ? 'כותרת הפרויקט (עברית ואנגלית) לא יכולה להיות ריקה' : 'Project title (Hebrew and English) cannot be empty');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await apiClient.updateSupervisorProject(project.id, {
        titleHe,
        titleEn,
        descriptionHe: descHe,
        descriptionEn: descEn,
        degreeType,
        projectType,
        requiredSkills: skills
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        maxStudents,
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : lang === 'he' ? 'העדכון נכשל' : 'Update failed');
    } finally {
      setSaving(false);
    }
  };

  const inputCls = 'w-full rounded-lg border border-coordinator-outline-variant bg-coordinator-surface-container-low px-3 py-2 text-sm text-coordinator-on-surface focus:border-coordinator-primary focus:bg-coordinator-surface-container-lowest focus:outline-none';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-coordinator-lg bg-coordinator-surface-container-lowest p-6 shadow-lg outline-none"
      >
        <FieldGuideOverlay guideKey={EDIT_PROJECT_GUIDE_KEY} steps={EDIT_PROJECT_STEPS} />
        <div className="flex items-start justify-between">
          <h2 className="text-lg font-semibold text-coordinator-on-surface">{lang === 'he' ? 'עריכת פרויקט' : 'Edit Project'}</h2>
          <button type="button" onClick={onClose} aria-label={lang === 'he' ? 'סגור' : 'Close'} className="text-coordinator-on-surface-variant hover:text-coordinator-on-surface">
            ✕
          </button>
        </div>

        <div className="mt-4 grid gap-3">
          <div data-field-guide-id="title" className="grid gap-3">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-coordinator-on-surface">
                {lang === 'he' ? 'כותרת בעברית *' : 'Hebrew Title *'}
                <InfoTooltip text={newProjectFieldInfo('title')} />
              </span>
              <input dir="rtl" value={titleHe} onChange={(e) => setTitleHe(e.target.value)} className={inputCls} />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-coordinator-on-surface">{lang === 'he' ? 'כותרת באנגלית *' : 'English Title *'}</span>
              <input dir="ltr" value={titleEn} onChange={(e) => setTitleEn(e.target.value)} className={inputCls} />
            </label>
          </div>
          <div data-field-guide-id="description" className="grid gap-3">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-coordinator-on-surface">
                {lang === 'he' ? 'תיאור בעברית' : 'Hebrew Description'}
                <InfoTooltip text={newProjectFieldInfo('description')} />
              </span>
              <textarea dir="rtl" rows={3} value={descHe} onChange={(e) => setDescHe(e.target.value)} className={inputCls} />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-coordinator-on-surface">{lang === 'he' ? 'תיאור באנגלית' : 'English Description'}</span>
              <textarea dir="ltr" rows={3} value={descEn} onChange={(e) => setDescEn(e.target.value)} className={inputCls} />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label data-field-guide-id="degreeType" className="block">
              <span className="mb-1.5 block text-sm font-medium text-coordinator-on-surface">
                {lang === 'he' ? 'תואר' : 'Degree'}
                <InfoTooltip text={newProjectFieldInfo('degreeType')} />
              </span>
              <select value={degreeType} onChange={(e) => setDegreeType(e.target.value)} className={inputCls} disabled={degreeOptions.length === 1}>
                {degreeOptions.includes('bachelors') && <option value="bachelors">{t('bachelors')}</option>}
                {degreeOptions.includes('masters') && <option value="masters">{t('masters')}</option>}
              </select>
            </label>
            <label data-field-guide-id="projectType" className="block">
              <span className="mb-1.5 block text-sm font-medium text-coordinator-on-surface">
                {lang === 'he' ? 'סוג' : 'Type'}
                <InfoTooltip text={newProjectFieldInfo('projectType')} />
              </span>
              <select value={projectType} onChange={(e) => setProjectType(e.target.value)} className={inputCls}>
                <option value="project">{lang === 'he' ? 'פרויקט' : 'Project'}</option>
                <option value="thesis">{lang === 'he' ? 'תזה' : 'Thesis'}</option>
              </select>
            </label>
          </div>

          <div data-field-guide-id="teamSize">
            <TeamSizeField value={maxStudents} onChange={setMaxStudents} lang={lang} />
          </div>
          <label data-field-guide-id="skills" className="block">
            <span className="mb-1.5 block text-sm font-medium text-coordinator-on-surface">
              {lang === 'he' ? 'כישורים נדרשים (מופרדים בפסיק)' : 'Required Skills (comma-separated)'}
              <InfoTooltip text={newProjectFieldInfo('skills')} />
            </span>
            <input value={skills} onChange={(e) => setSkills(e.target.value)} className={inputCls} placeholder="React, Python, ..." />
          </label>
        </div>

        {error && <p className="mt-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">{error}</p>}

        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-coordinator-outline-variant px-3.5 py-2 text-sm font-medium text-coordinator-on-surface hover:bg-coordinator-surface-container-low">
            {t('cancel')}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !titleHe.trim() || !titleEn.trim()}
            className="rounded-lg bg-coordinator-primary px-3.5 py-2 text-sm font-semibold text-coordinator-on-primary hover:bg-coordinator-primary-container disabled:opacity-60"
          >
            {saving ? '…' : t('save')}
          </button>
        </div>
      </div>
    </div>
  );
}
