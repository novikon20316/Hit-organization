'use client';

// app/supervisor/dashboard/NewProjectModal.tsx
// Ported from mobile's NewProjectModal (components/modals/NewProjectModal.tsx)
// as used from supervisor/dashboard.tsx — same field set as EditProjectModal
// (title HE/EN, description HE/EN, degree, type, skills) plus creation-only
// fields: NumberOfStudents and prerequisites. facultyId is the supervisor's
// own — read-only here, exactly like mobile's "locked" faculty badge for
// supervisors (no faculty/program picker, since that's an admin-only concern
// this project's web port doesn't need yet). Calls the already-existing
// apiClient.createSupervisorProject. Grading criteria now lives solely in
// the workflow-templates screen, not per-project.

import { useMemo, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { getFacultyColor } from '@/lib/facultyColors';
import { facultyLabel } from '@/lib/i18n';
import { apiClient } from '@/lib/apiClient';
import { majorsForFaculty } from '@/lib/permissions';
import type { FacultyId } from '@/lib/i18n';

interface NewProjectModalProps {
  facultyId: FacultyId;
  onClose: () => void;
  onCreated: () => void;
}

export function NewProjectModal({ facultyId, onClose, onCreated }: NewProjectModalProps) {
  const { lang, t } = useLanguage();
  const { userData } = useAuth();
  const [titleHe, setTitleHe] = useState('');
  const [titleEn, setTitleEn] = useState('');
  const [descHe, setDescHe] = useState('');
  const [descEn, setDescEn] = useState('');
  const [degreeType, setDegreeType] = useState<'bachelors' | 'masters'>('bachelors');
  const [projectType, setProjectType] = useState<'project' | 'thesis'>('project');
  const [skills, setSkills] = useState('');
  const [prerequisites, setPrerequisites] = useState('');
  const [numberOfStudents, setNumberOfStudents] = useState(1);
  const [major, setMajor] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // The signed-in supervisor's own restriction (see lib/roles.ts's UserDoc)
  // — empty/unset means unrestricted, matching the backend's default.
  const ownAssignedMajors = useMemo(() => userData?.assignedMajors ?? [], [userData?.assignedMajors]);
  const isMajorRestricted = ownAssignedMajors.length > 0;
  const majorOptions = useMemo(() => {
    const all = majorsForFaculty(facultyId);
    return isMajorRestricted ? all.filter((m) => ownAssignedMajors.includes(m.slug)) : all;
  }, [facultyId, isMajorRestricted, ownAssignedMajors]);

  const handleCreate = async () => {
    setError('');
    if (!titleHe.trim() || !titleEn.trim()) {
      setError(lang === 'he' ? 'כותרת בשתי השפות היא שדה חובה' : 'Title in both languages is required');
      return;
    }
    if (isMajorRestricted && !major) {
      setError(lang === 'he' ? 'יש לבחור מגמה' : 'Please select a major');
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
        ...(major ? { major } : {}),
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
            <span className="mb-1.5 block text-sm font-medium text-ink">
              {lang === 'he' ? `מגמה / תוכנית${isMajorRestricted ? ' *' : ' (אופציונלי)'}` : `Major/Program${isMajorRestricted ? ' *' : ' (optional)'}`}
            </span>
            <select value={major} onChange={(e) => setMajor(e.target.value)} className={inputCls} required={isMajorRestricted}>
              {!isMajorRestricted && (
                <option value="">{lang === 'he' ? 'ללא הגבלה — כל המגמות' : 'No restriction — all majors'}</option>
              )}
              {isMajorRestricted && !major && <option value="">{lang === 'he' ? 'בחר מגמה' : 'Select major'}</option>}
              {majorOptions.map((m) => (
                <option key={m.slug} value={m.slug}>
                  {m.label[lang]}
                </option>
              ))}
            </select>
            {isMajorRestricted && (
              <p className="mt-1 text-xs text-muted">
                {lang === 'he' ? 'אתה מוגבל למגמות מסוימות בפקולטה שלך.' : "You're restricted to specific majors in your faculty."}
              </p>
            )}
          </label>

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
