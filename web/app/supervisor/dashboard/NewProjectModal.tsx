'use client';

// app/supervisor/dashboard/NewProjectModal.tsx
// Ported from mobile's NewProjectModal (components/modals/NewProjectModal.tsx)
// as used from supervisor/dashboard.tsx — same field set as EditProjectModal
// (title HE/EN, description HE/EN, degree, type, skills) plus creation-only
// fields: NumberOfStudents, prerequisites, and gradingCriteria (must sum to
// 100). facultyId is the supervisor's own — read-only here, exactly like
// mobile's "locked" faculty badge for supervisors (no faculty/program picker,
// since that's an admin-only concern this project's web port doesn't need
// yet). Calls the already-existing apiClient.createSupervisorProject.

import { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { getFacultyColor } from '@/lib/facultyColors';
import { facultyLabel } from '@/lib/i18n';
import { apiClient } from '@/lib/apiClient';
import type { FacultyId } from '@/lib/i18n';
import { GRADING_CRITERIA } from './types';

interface GradingCriterionInput {
  key: string;
  label: string;
  maxScore: number;
}

interface NewProjectModalProps {
  facultyId: FacultyId;
  onClose: () => void;
  onCreated: () => void;
}

const DEFAULT_CRITERIA: GradingCriterionInput[] = GRADING_CRITERIA.map((c) => ({ key: c.key, label: c.en, maxScore: c.max }));

export function NewProjectModal({ facultyId, onClose, onCreated }: NewProjectModalProps) {
  const { lang, t } = useLanguage();
  const [titleHe, setTitleHe] = useState('');
  const [titleEn, setTitleEn] = useState('');
  const [descHe, setDescHe] = useState('');
  const [descEn, setDescEn] = useState('');
  const [degreeType, setDegreeType] = useState<'bachelors' | 'masters'>('bachelors');
  const [projectType, setProjectType] = useState<'project' | 'thesis'>('project');
  const [skills, setSkills] = useState('');
  const [prerequisites, setPrerequisites] = useState('');
  const [numberOfStudents, setNumberOfStudents] = useState(1);
  const [criteria, setCriteria] = useState<GradingCriterionInput[]>(DEFAULT_CRITERIA);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const totalMax = criteria.reduce((sum, c) => sum + (Number(c.maxScore) || 0), 0);

  const updateCriterion = (index: number, field: 'label' | 'maxScore', value: string) => {
    setCriteria((prev) =>
      prev.map((c, i) => (i === index ? { ...c, [field]: field === 'maxScore' ? Number(value) || 0 : value } : c))
    );
  };

  const addCriterion = () => setCriteria((prev) => [...prev, { key: `criterion_${Date.now()}`, label: '', maxScore: 10 }]);
  const removeCriterion = (index: number) => setCriteria((prev) => prev.filter((_, i) => i !== index));

  const handleCreate = async () => {
    setError('');
    if (!titleHe.trim() || !titleEn.trim()) {
      setError(lang === 'he' ? 'כותרת בשתי השפות היא שדה חובה' : 'Title in both languages is required');
      return;
    }
    if (totalMax !== 100) {
      setError(lang === 'he' ? `סכום קריטריוני ההערכה חייב להיות 100 (כרגע: ${totalMax})` : `Grading criteria must sum to 100 (currently: ${totalMax})`);
      return;
    }
    if (criteria.some((c) => !c.label.trim())) {
      setError(lang === 'he' ? 'לכל קריטריון חייב להיות שם' : 'Every criterion needs a name');
      return;
    }
    setSaving(true);
    try {
      await apiClient.createSupervisorProject({
        titleHe,
        titleEn,
        descriptionHe: descHe,
        descriptionEn: descEn,
        degreeType,
        projectType,
        requiredSkills: skills.split(',').map((s) => s.trim()).filter(Boolean),
        prerequisites: prerequisites.split(',').map((s) => s.trim()).filter(Boolean),
        NumberOfStudents: numberOfStudents,
        facultyId,
        gradingCriteria: criteria,
      });
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : lang === 'he' ? 'פרסום הפרויקט נכשל' : 'Failed to create the project');
    } finally {
      setSaving(false);
    }
  };

  const inputCls = 'w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink focus:border-primary focus:bg-surface focus:outline-none';
  const facultyColor = getFacultyColor(facultyId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[var(--radius)] bg-surface p-6 shadow-lg">
        <div className="flex items-start justify-between">
          <h2 className="text-lg font-semibold text-ink">{lang === 'he' ? 'פרסום פרויקט חדש' : 'Post New Project'}</h2>
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

          <div>
            <span className="mb-1.5 block text-sm font-medium text-ink">{lang === 'he' ? 'פקולטה' : 'Faculty'}</span>
            <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium" style={{ backgroundColor: `${facultyColor}1F`, color: facultyColor }}>
              🔒 {facultyLabel(facultyId, lang)}
            </span>
          </div>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink">{lang === 'he' ? 'מספר סטודנטים' : 'Number of Students'}</span>
            <div className="flex gap-1.5">
              {[1, 2, 3, 4].map((num) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => setNumberOfStudents(num)}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${
                    numberOfStudents === num ? 'border-primary bg-primary text-primary-ink' : 'border-line bg-paper text-ink'
                  }`}
                >
                  {num}
                </button>
              ))}
            </div>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink">{lang === 'he' ? 'תואר' : 'Degree'}</span>
              <select value={degreeType} onChange={(e) => setDegreeType(e.target.value as 'bachelors' | 'masters')} className={inputCls}>
                <option value="bachelors">{t('bachelors')}</option>
                <option value="masters">{t('masters')}</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink">{lang === 'he' ? 'סוג' : 'Type'}</span>
              <select value={projectType} onChange={(e) => setProjectType(e.target.value as 'project' | 'thesis')} className={inputCls}>
                <option value="project">{lang === 'he' ? 'פרויקט' : 'Project'}</option>
                <option value="thesis">{lang === 'he' ? 'תזה' : 'Thesis'}</option>
              </select>
            </label>
          </div>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink">{lang === 'he' ? 'כישורים נדרשים (מופרדים בפסיק)' : 'Required Skills (comma-separated)'}</span>
            <input value={skills} onChange={(e) => setSkills(e.target.value)} className={inputCls} placeholder="React, Python, ..." />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink">{lang === 'he' ? 'קורסי דרישת קדם (מופרדים בפסיק)' : 'Prerequisites (comma-separated)'}</span>
            <input
              value={prerequisites}
              onChange={(e) => setPrerequisites(e.target.value)}
              className={inputCls}
              placeholder={lang === 'he' ? 'לדוגמה: מבני נתונים, אלגוריתמים' : 'e.g. Data Structures, Algorithms'}
            />
          </label>

          <div className="rounded-lg border border-line p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-ink">📊 {lang === 'he' ? 'קריטריוני הערכה' : 'Grading Criteria'}</span>
              <span
                className="rounded-full px-2 py-0.5 text-xs font-semibold"
                style={{ backgroundColor: totalMax === 100 ? 'var(--success-bg)' : 'var(--danger-bg)', color: totalMax === 100 ? 'var(--success)' : 'var(--danger)' }}
              >
                {lang === 'he' ? `סה"כ: ${totalMax}/100` : `Total: ${totalMax}/100`}
              </span>
            </div>

            {criteria.map((c, i) => (
              <div key={c.key} className="mt-2 flex items-end gap-2">
                <label className="flex-1 block">
                  <span className="mb-1 block text-xs text-muted">{lang === 'he' ? 'שם קריטריון' : 'Criterion Name'}</span>
                  <input value={c.label} onChange={(e) => updateCriterion(i, 'label', e.target.value)} className={inputCls} placeholder={lang === 'he' ? 'למשל: בהירות' : 'e.g. Clarity'} />
                </label>
                <label className="block w-20">
                  <span className="mb-1 block text-xs text-muted">{lang === 'he' ? "מקס'" : 'Max'}</span>
                  <input type="number" value={c.maxScore} onChange={(e) => updateCriterion(i, 'maxScore', e.target.value)} className={`${inputCls} text-center`} />
                </label>
                <button type="button" onClick={() => removeCriterion(i)} className="rounded-lg border border-danger px-2.5 py-2 text-xs text-danger hover:bg-danger-bg">
                  ✕
                </button>
              </div>
            ))}

            <button type="button" onClick={addCriterion} className="mt-2 w-full rounded-lg border border-dashed border-line px-3 py-1.5 text-xs font-medium text-ink hover:border-primary">
              + {lang === 'he' ? 'הוסף קריטריון' : 'Add Criterion'}
            </button>
          </div>
        </div>

        {error && <p className="mt-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>}

        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-line px-3.5 py-2 text-sm font-medium text-ink hover:bg-paper">
            {t('cancel')}
          </button>
          <button
            type="button"
            onClick={handleCreate}
            disabled={saving}
            className="rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-ink hover:bg-primary-hover disabled:opacity-60"
          >
            {saving ? '…' : lang === 'he' ? 'פרסם פרויקט' : 'Publish Project'}
          </button>
        </div>
      </div>
    </div>
  );
}
