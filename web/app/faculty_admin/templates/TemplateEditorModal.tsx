'use client';

// app/faculty_admin/templates/TemplateEditorModal.tsx
// Create/edit form for a faculty project template. The backend's `skills`
// field is a flat string (see facultyTemplateController.ts), not an array —
// this modal presents it as tag chips for a nicer editing experience, then
// joins them back to a comma-separated string on save.

import { useRef, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient, ApiError, SoftError } from '@/lib/apiClient';
import { useModalA11y } from '@/hooks/useModalA11y';
import { DEGREES, TYPES, type FacultyTemplate, type TemplateDegree, type TemplateType } from './types';

interface TemplateEditorModalProps {
  template: FacultyTemplate | null;
  onClose: () => void;
  onSaved: () => void;
}

function parseSkills(raw: string): string[] {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function TemplateEditorModal({ template, onClose, onSaved }: TemplateEditorModalProps) {
  const { lang, t } = useLanguage();

  const [titleHe, setTitleHe] = useState(template?.titleHe ?? '');
  const [titleEn, setTitleEn] = useState(template?.titleEn ?? '');
  const [descriptionHe, setDescriptionHe] = useState(template?.descriptionHe ?? '');
  const [descriptionEn, setDescriptionEn] = useState(template?.descriptionEn ?? '');
  const [skills, setSkills] = useState<string[]>(template ? parseSkills(template.skills ?? '') : []);
  const [skillInput, setSkillInput] = useState('');
  const [degree, setDegree] = useState<TemplateDegree>(template?.degree ?? 'bachelors');
  const [type, setType] = useState<TemplateType>(template?.type ?? 'project');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalA11y(dialogRef, true, onClose);

  const addSkillFromInput = () => {
    const value = skillInput.trim();
    if (!value) return;
    if (!skills.includes(value)) setSkills((prev) => [...prev, value]);
    setSkillInput('');
  };

  const removeSkill = (skill: string) => {
    setSkills((prev) => prev.filter((s) => s !== skill));
  };

  const handleSave = async () => {
    if (!titleHe.trim() || !titleEn.trim()) {
      setError(lang === 'he' ? 'יש להזין כותרת לתבנית (עברית ואנגלית)' : 'Please enter a template title (Hebrew and English)');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = {
        titleHe: titleHe.trim(),
        titleEn: titleEn.trim(),
        descriptionHe: descriptionHe.trim(),
        descriptionEn: descriptionEn.trim(),
        skills: skills.join(', '),
        degree,
        type,
      };
      if (template) {
        await apiClient.updateFacultyTemplate(template.id, payload);
      } else {
        await apiClient.createFacultyTemplate(payload);
      }
      onSaved();
      onClose();
    } catch (err) {
      const message = err instanceof ApiError || err instanceof SoftError ? err.message : lang === 'he' ? 'שמירת התבנית נכשלה' : 'Failed to save the template';
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  const inputCls = 'w-full rounded-lg border border-faculty-admin-outline-variant bg-faculty-admin-surface-container-low px-3 py-2 text-sm text-faculty-admin-on-surface focus:border-faculty-admin-primary focus:bg-faculty-admin-surface-container-lowest focus:outline-none';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 p-4">
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        className="w-full max-w-lg rounded-faculty-admin bg-faculty-admin-surface-container-lowest p-5 shadow-lg outline-none"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-faculty-admin-on-surface">
            {template ? `✏️ ${lang === 'he' ? 'עריכת תבנית' : 'Edit Template'}` : `➕ ${lang === 'he' ? 'תבנית חדשה' : 'New Template'}`}
          </h2>
          <button type="button" onClick={onClose} aria-label={lang === 'he' ? 'סגור' : 'Close'} className="text-lg text-faculty-admin-on-surface-variant hover:text-faculty-admin-on-surface">
            ✕
          </button>
        </div>

        <div className="mt-4 grid gap-3.5">
          {/* Degree chips */}
          <div>
            <span className="mb-1.5 block text-sm font-medium text-faculty-admin-on-surface">{t('degreeType')}</span>
            <div className="flex gap-2">
              {DEGREES.map((d) => (
                <button
                  key={d.key}
                  type="button"
                  onClick={() => setDegree(d.key)}
                  className={`rounded-full border px-3.5 py-1.5 text-sm font-medium ${
                    degree === d.key ? 'border-faculty-admin-primary bg-faculty-admin-primary text-faculty-admin-on-primary' : 'border-faculty-admin-outline-variant bg-faculty-admin-surface-container-low text-faculty-admin-on-surface'
                  }`}
                >
                  {lang === 'he' ? d.he : d.en}
                </button>
              ))}
            </div>
          </div>

          {/* Type chips */}
          <div>
            <span className="mb-1.5 block text-sm font-medium text-faculty-admin-on-surface">{lang === 'he' ? 'סוג עבודה' : 'Work Type'}</span>
            <div className="flex gap-2">
              {TYPES.map((tp) => (
                <button
                  key={tp.key}
                  type="button"
                  onClick={() => setType(tp.key)}
                  className={`rounded-full border px-3.5 py-1.5 text-sm font-medium ${
                    type === tp.key ? 'border-faculty-admin-primary bg-faculty-admin-primary text-faculty-admin-on-primary' : 'border-faculty-admin-outline-variant bg-faculty-admin-surface-container-low text-faculty-admin-on-surface'
                  }`}
                >
                  {lang === 'he' ? tp.he : tp.en}
                </button>
              ))}
            </div>
          </div>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-faculty-admin-on-surface">{lang === 'he' ? 'כותרת (עברית)' : 'Title (Hebrew)'}</span>
            <input dir="rtl" value={titleHe} onChange={(e) => setTitleHe(e.target.value)} placeholder="כותרת הפרויקט" className={inputCls} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-faculty-admin-on-surface">{lang === 'he' ? 'כותרת (אנגלית)' : 'Title (English)'}</span>
            <input dir="ltr" value={titleEn} onChange={(e) => setTitleEn(e.target.value)} placeholder="Project title" className={inputCls} />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-faculty-admin-on-surface">{lang === 'he' ? 'תיאור (עברית)' : 'Description (Hebrew)'}</span>
            <textarea dir="rtl" rows={3} value={descriptionHe} onChange={(e) => setDescriptionHe(e.target.value)} placeholder="תיאור הפרויקט" className={inputCls} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-faculty-admin-on-surface">{lang === 'he' ? 'תיאור (אנגלית)' : 'Description (English)'}</span>
            <textarea dir="ltr" rows={3} value={descriptionEn} onChange={(e) => setDescriptionEn(e.target.value)} placeholder="Project description" className={inputCls} />
          </label>

          {/* Skills tag input */}
          <div>
            <span className="mb-1.5 block text-sm font-medium text-faculty-admin-on-surface">{lang === 'he' ? 'כישורים נדרשים' : 'Required Skills'}</span>
            <div className="flex flex-wrap gap-1.5 rounded-lg border border-faculty-admin-outline-variant bg-faculty-admin-surface-container-low p-2">
              {skills.map((skill) => (
                <span key={skill} className="flex items-center gap-1 rounded-full bg-faculty-admin-primary/10 px-2.5 py-1 text-xs font-medium text-faculty-admin-primary">
                  {skill}
                  <button type="button" onClick={() => removeSkill(skill)} className="text-faculty-admin-primary hover:opacity-70" aria-label={`remove ${skill}`}>
                    ✕
                  </button>
                </span>
              ))}
              <input
                value={skillInput}
                onChange={(e) => setSkillInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ',') {
                    e.preventDefault();
                    addSkillFromInput();
                  } else if (e.key === 'Backspace' && !skillInput && skills.length > 0) {
                    setSkills((prev) => prev.slice(0, -1));
                  }
                }}
                onBlur={addSkillFromInput}
                placeholder={lang === 'he' ? 'הקלד ולחץ Enter...' : 'Type and press Enter...'}
                className="min-w-[120px] flex-1 bg-transparent px-1 py-1 text-sm text-faculty-admin-on-surface focus:outline-none"
              />
            </div>
          </div>

          {error && <p className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">{error}</p>}

          <div className="mt-1 flex justify-end gap-2">
            <button type="button" onClick={onClose} disabled={saving} className="rounded-lg border border-faculty-admin-outline-variant px-3.5 py-2 text-sm font-medium text-faculty-admin-on-surface hover:bg-faculty-admin-surface-container-low">
              {t('cancel')}
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="rounded-lg bg-faculty-admin-primary px-3.5 py-2 text-sm font-semibold text-faculty-admin-on-primary hover:opacity-90 disabled:opacity-60"
            >
              {saving ? t('saving') : t('save')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
