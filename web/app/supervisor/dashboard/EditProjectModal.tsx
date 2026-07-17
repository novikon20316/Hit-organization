'use client';

// app/supervisor/dashboard/EditProjectModal.tsx
import { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/apiClient';
import type { MyProject } from './types';

interface EditProjectModalProps {
  project: MyProject;
  onClose: () => void;
  onSaved: () => void;
}

// Rendered by the parent only when a project is selected, keyed by
// project.id — a fresh mount per project, so plain useState from props is
// enough (no reset-on-prop-change effect needed).
export function EditProjectModal({ project, onClose, onSaved }: EditProjectModalProps) {
  const { lang, t } = useLanguage();
  const [titleHe, setTitleHe] = useState(project.titleHe);
  const [titleEn, setTitleEn] = useState(project.titleEn);
  const [descHe, setDescHe] = useState(project.descriptionHe);
  const [descEn, setDescEn] = useState(project.descriptionEn);
  const [degreeType, setDegreeType] = useState(project.degreeType);
  const [projectType, setProjectType] = useState(project.projectType);
  const [skills, setSkills] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
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
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : lang === 'he' ? 'העדכון נכשל' : 'Update failed');
    } finally {
      setSaving(false);
    }
  };

  const inputCls = 'w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink focus:border-primary focus:bg-surface focus:outline-none';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[var(--radius)] bg-surface p-6 shadow-lg">
        <div className="flex items-start justify-between">
          <h2 className="text-lg font-semibold text-ink">{lang === 'he' ? 'עריכת פרויקט' : 'Edit Project'}</h2>
          <button type="button" onClick={onClose} className="text-muted hover:text-ink">
            ✕
          </button>
        </div>

        <div className="mt-4 grid gap-3">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink">{lang === 'he' ? 'כותרת בעברית *' : 'Hebrew Title *'}</span>
            <input dir="rtl" value={titleHe} onChange={(e) => setTitleHe(e.target.value)} className={inputCls} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink">{lang === 'he' ? 'כותרת באנגלית *' : 'English Title *'}</span>
            <input dir="ltr" value={titleEn} onChange={(e) => setTitleEn(e.target.value)} className={inputCls} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink">{lang === 'he' ? 'תיאור בעברית' : 'Hebrew Description'}</span>
            <textarea dir="rtl" rows={3} value={descHe} onChange={(e) => setDescHe(e.target.value)} className={inputCls} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink">{lang === 'he' ? 'תיאור באנגלית' : 'English Description'}</span>
            <textarea dir="ltr" rows={3} value={descEn} onChange={(e) => setDescEn(e.target.value)} className={inputCls} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink">{lang === 'he' ? 'תואר' : 'Degree'}</span>
              <select value={degreeType} onChange={(e) => setDegreeType(e.target.value)} className={inputCls}>
                <option value="bachelors">{t('bachelors')}</option>
                <option value="masters">{t('masters')}</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink">{lang === 'he' ? 'סוג' : 'Type'}</span>
              <select value={projectType} onChange={(e) => setProjectType(e.target.value)} className={inputCls}>
                <option value="project">{lang === 'he' ? 'פרויקט' : 'Project'}</option>
                <option value="thesis">{lang === 'he' ? 'תזה' : 'Thesis'}</option>
              </select>
            </label>
          </div>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink">{lang === 'he' ? 'כישורים נדרשים (מופרדים בפסיק)' : 'Required Skills (comma-separated)'}</span>
            <input value={skills} onChange={(e) => setSkills(e.target.value)} className={inputCls} placeholder="React, Python, ..." />
          </label>
        </div>

        {error && <p className="mt-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>}

        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-line px-3.5 py-2 text-sm font-medium text-ink hover:bg-paper">
            {t('cancel')}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-ink hover:bg-primary-hover disabled:opacity-60"
          >
            {saving ? '…' : t('save')}
          </button>
        </div>
      </div>
    </div>
  );
}
