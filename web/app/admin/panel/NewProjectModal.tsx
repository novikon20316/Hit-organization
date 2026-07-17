'use client';

// app/admin/panel/NewProjectModal.tsx
// Ported from mobile's NewProjectModal (admin mode) + panel.tsx's
// handleCreateProject — same validation, same POST /api/admin/projects
// payload shape. Program-picker and file-upload fields from the mobile
// version are left out: the file picker never actually gets sent to the
// server there either (handleCreateProject's payload has no file field), and
// the program picker only feeds `selectedProgram`, which likewise never
// makes it into the request body — neither is real functionality to port.

import { useEffect, useState, type FormEvent } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/apiClient';
import { VALID_FACULTY_IDS } from '@/lib/roles';
import { facultyLabel } from '@/lib/i18n';
import type { GradingCriterion } from './types';

const DEFAULT_CRITERIA: GradingCriterion[] = [
  { key: 'clarity', label: 'Research Clarity', maxScore: 20 },
  { key: 'methodology', label: 'Methodology', maxScore: 25 },
  { key: 'feasibility', label: 'Feasibility', maxScore: 20 },
  { key: 'innovation', label: 'Innovation', maxScore: 15 },
  { key: 'writing', label: 'Writing Quality', maxScore: 20 },
];

const SELECTABLE_FACULTIES = VALID_FACULTY_IDS.filter((id) => id !== 'all');

interface SupervisorOption {
  id: string;
  displayName: string;
}

interface NewProjectModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export function NewProjectModal({ open, onClose, onCreated }: NewProjectModalProps) {
  const { lang } = useLanguage();

  const [supervisors, setSupervisors] = useState<SupervisorOption[]>([]);
  // Starts true (rather than being set true from inside the effect below) so
  // the effect only ever flips it to false — matches the codebase's
  // set-state-in-effect convention (see AcademicCalendarModal.tsx).
  const [loadingSupervisors, setLoadingSupervisors] = useState(true);
  const [supervisorId, setSupervisorId] = useState('');
  const [facultyId, setFacultyId] = useState('');
  const [titleHe, setTitleHe] = useState('');
  const [titleEn, setTitleEn] = useState('');
  const [descHe, setDescHe] = useState('');
  const [descEn, setDescEn] = useState('');
  const [degreeType, setDegreeType] = useState<'bachelors' | 'masters'>('bachelors');
  const [projectType, setProjectType] = useState<'project' | 'thesis'>('project');
  const [maxStudents, setMaxStudents] = useState(1);
  const [skills, setSkills] = useState('');
  const [prerequisites, setPrerequisites] = useState('');
  const [criteria, setCriteria] = useState<GradingCriterion[]>(DEFAULT_CRITERIA);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    apiClient
      .getAdminSupervisors()
      .then((list) => {
        if (!cancelled) setSupervisors(list as unknown as SupervisorOption[]);
      })
      .catch(() => {
        if (!cancelled) setSupervisors([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingSupervisors(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const totalMax = criteria.reduce((sum, c) => sum + (Number(c.maxScore) || 0), 0);

  const updateCriterion = (index: number, field: keyof GradingCriterion, value: string) => {
    setCriteria((prev) => {
      const next = [...prev];
      const row = next[index];
      if (!row) return prev;
      next[index] = field === 'maxScore' ? { ...row, maxScore: Number(value) || 0 } : { ...row, [field]: value };
      return next;
    });
  };

  const addCriterion = () => setCriteria((prev) => [...prev, { key: `criterion_${Date.now()}`, label: '', maxScore: 10 }]);
  const removeCriterion = (index: number) => setCriteria((prev) => prev.filter((_, i) => i !== index));

  const reset = () => {
    setSupervisorId('');
    setFacultyId('');
    setTitleHe('');
    setTitleEn('');
    setDescHe('');
    setDescEn('');
    setDegreeType('bachelors');
    setProjectType('project');
    setMaxStudents(1);
    setSkills('');
    setPrerequisites('');
    setCriteria(DEFAULT_CRITERIA);
    setError('');
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!supervisorId || !titleHe.trim() || !titleEn.trim() || !facultyId) {
      setError(lang === 'he' ? 'יש למלא את כל השדות' : 'Missing required fields');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await apiClient.createAdminProject({
        supervisorId,
        facultyId,
        titleHe: titleHe.trim(),
        titleEn: titleEn.trim(),
        descriptionHe: descHe.trim(),
        descriptionEn: descEn.trim(),
        degreeType,
        projectType,
        maxStudents,
        requiredSkills: skills.split(',').map((s) => s.trim()).filter(Boolean),
        prerequisites: prerequisites.split(',').map((s) => s.trim()).filter(Boolean),
        gradingCriteria: criteria,
      });
      reset();
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : lang === 'he' ? 'פרסום הפרויקט נכשל' : 'Failed to publish the project');
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form onSubmit={handleSubmit} className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[var(--radius)] bg-surface p-6 shadow-lg">
        <h2 className="text-lg font-semibold text-ink">📁 {lang === 'he' ? 'פרסום פרויקט חדש' : 'Post New Project'}</h2>

        <div className="mt-4 grid gap-4">
          <Field label={lang === 'he' ? 'כותרת בעברית *' : 'Hebrew Title *'}>
            <input value={titleHe} onChange={(e) => setTitleHe(e.target.value)} dir="rtl" className={inputCls} required />
          </Field>
          <Field label={lang === 'he' ? 'כותרת באנגלית *' : 'English Title *'}>
            <input value={titleEn} onChange={(e) => setTitleEn(e.target.value)} dir="ltr" className={inputCls} required />
          </Field>
          <Field label={lang === 'he' ? 'תיאור בעברית' : 'Hebrew Description'}>
            <textarea rows={3} value={descHe} onChange={(e) => setDescHe(e.target.value)} dir="rtl" className={inputCls} />
          </Field>
          <Field label={lang === 'he' ? 'תיאור באנגלית' : 'English Description'}>
            <textarea rows={3} value={descEn} onChange={(e) => setDescEn(e.target.value)} dir="ltr" className={inputCls} />
          </Field>

          <Field label={lang === 'he' ? 'פקולטה *' : 'Faculty *'}>
            <select value={facultyId} onChange={(e) => setFacultyId(e.target.value)} className={inputCls} required>
              <option value="">{lang === 'he' ? 'בחר פקולטה' : 'Select faculty'}</option>
              {SELECTABLE_FACULTIES.map((id) => (
                <option key={id} value={id}>
                  {facultyLabel(id, lang)}
                </option>
              ))}
            </select>
          </Field>

          <Field label={lang === 'he' ? 'מנחה *' : 'Supervisor *'}>
            <select value={supervisorId} onChange={(e) => setSupervisorId(e.target.value)} className={inputCls} required disabled={loadingSupervisors}>
              <option value="">{loadingSupervisors ? '…' : lang === 'he' ? 'בחר מנחה' : 'Select supervisor'}</option>
              {supervisors.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.displayName}
                </option>
              ))}
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label={lang === 'he' ? 'סוג תואר' : 'Degree Type'}>
              <select value={degreeType} onChange={(e) => setDegreeType(e.target.value as 'bachelors' | 'masters')} className={inputCls}>
                <option value="bachelors">{lang === 'he' ? 'תואר ראשון' : "Bachelor's"}</option>
                <option value="masters">{lang === 'he' ? 'תואר שני' : "Master's"}</option>
              </select>
            </Field>
            <Field label={lang === 'he' ? 'סוג פרויקט' : 'Project Type'}>
              <select value={projectType} onChange={(e) => setProjectType(e.target.value as 'project' | 'thesis')} className={inputCls}>
                <option value="project">{lang === 'he' ? 'פרויקט' : 'Project'}</option>
                <option value="thesis">{lang === 'he' ? 'תזה' : 'Thesis'}</option>
              </select>
            </Field>
          </div>

          <Field label={lang === 'he' ? 'מספר סטודנטים מקסימלי' : 'Max Students'}>
            <div className="flex gap-2">
              {[1, 2, 3, 4].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setMaxStudents(n)}
                  className={`h-9 w-9 rounded-lg border text-sm font-medium ${
                    maxStudents === n ? 'border-primary bg-primary text-primary-ink' : 'border-line bg-paper text-ink'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </Field>

          <Field label={lang === 'he' ? 'כישורים נדרשים (מופרד בפסיקים)' : 'Required Skills (comma-separated)'}>
            <input value={skills} onChange={(e) => setSkills(e.target.value)} className={inputCls} placeholder={lang === 'he' ? 'לדוגמה: Python, React' : 'e.g. Python, React'} />
          </Field>

          <Field label={lang === 'he' ? 'דרישות קדם (מופרד בפסיקים)' : 'Prerequisites (comma-separated)'}>
            <input
              value={prerequisites}
              onChange={(e) => setPrerequisites(e.target.value)}
              className={inputCls}
              placeholder={lang === 'he' ? 'לדוגמה: מבני נתונים, אלגוריתמים' : 'e.g. Data Structures, Algorithms'}
            />
          </Field>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-sm font-medium text-ink">📊 {lang === 'he' ? 'קריטריוני הערכה' : 'Grading Criteria'}</span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${totalMax === 100 ? 'bg-success-bg text-success' : 'bg-danger-bg text-danger'}`}>
                {lang === 'he' ? `סה"כ: ${totalMax}/100` : `Total: ${totalMax}/100`}
              </span>
            </div>
            <div className="grid gap-2">
              {criteria.map((c, i) => (
                <div key={c.key} className="flex items-center gap-2">
                  <input
                    value={c.label}
                    onChange={(e) => updateCriterion(i, 'label', e.target.value)}
                    placeholder={lang === 'he' ? 'שם קריטריון' : 'Criterion name'}
                    className={`${inputCls} flex-1`}
                  />
                  <input
                    type="number"
                    value={c.maxScore}
                    onChange={(e) => updateCriterion(i, 'maxScore', e.target.value)}
                    className={`${inputCls} w-20 text-center`}
                  />
                  <button type="button" onClick={() => removeCriterion(i)} className="shrink-0 text-muted hover:text-danger">
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <button type="button" onClick={addCriterion} className="mt-2 text-xs text-primary hover:underline">
              + {lang === 'he' ? 'הוסף קריטריון' : 'Add Criterion'}
            </button>
          </div>
        </div>

        {error && <p className="mt-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>}

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              reset();
              onClose();
            }}
            className="rounded-lg border border-line px-3.5 py-2 text-sm font-medium text-ink hover:bg-paper"
          >
            {lang === 'he' ? 'ביטול' : 'Cancel'}
          </button>
          <button type="submit" disabled={submitting} className="rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-ink hover:bg-primary-hover disabled:opacity-60">
            {submitting ? '…' : lang === 'he' ? 'פרסם פרויקט' : 'Publish Project'}
          </button>
        </div>
      </form>
    </div>
  );
}

const inputCls = 'w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink focus:border-primary focus:bg-surface focus:outline-none disabled:opacity-60';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink">{label}</span>
      {children}
    </label>
  );
}
