'use client';

// app/faculty_admin/dashboard/NewProjectModal.tsx
// Ported from app/admin/panel/NewProjectModal.tsx — same POST /api/admin/projects
// call (apiClient.createAdminProject) and the same "pick a supervisor" shape
// (unlike supervisor's own self-service NewProjectModal.tsx, which has no
// supervisor picker since it's always the caller). Two differences from the
// admin panel version: facultyId is locked to the faculty_admin's own faculty
// (no faculty picker — matches supervisor/dashboard/NewProjectModal.tsx's
// locked faculty badge), and the supervisor list is scoped to that faculty
// via getAdminSupervisors(facultyId).
//
// This was previously left unbuilt because createAdminProject
// (server/src/controllers/adminController.ts) gated the endpoint to
// system_admin only — a faculty_admin hitting it got a 403. That's now fixed:
// the handler accepts role/roles containing 'faculty_admin' or 'system_admin'.
// Grading criteria now lives solely in the workflow-templates screen, not
// per-project.

import { useEffect, useState, type FormEvent } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { getFacultyColor } from '@/lib/facultyColors';
import { facultyLabel } from '@/lib/i18n';
import { apiClient } from '@/lib/apiClient';
import type { FacultyId } from '@/lib/i18n';
import type { SupervisorOption } from './types';

interface NewProjectModalProps {
  facultyId: FacultyId;
  onClose: () => void;
  onCreated: () => void;
}

export function NewProjectModal({ facultyId, onClose, onCreated }: NewProjectModalProps) {
  const { lang } = useLanguage();

  const [supervisors, setSupervisors] = useState<SupervisorOption[]>([]);
  // Starts true (rather than being set true from inside the effect below) so
  // the effect only ever flips it to false — matches the codebase's
  // set-state-in-effect convention (see admin/panel/NewProjectModal.tsx).
  const [loadingSupervisors, setLoadingSupervisors] = useState(true);
  const [supervisorId, setSupervisorId] = useState('');
  const [titleHe, setTitleHe] = useState('');
  const [titleEn, setTitleEn] = useState('');
  const [descHe, setDescHe] = useState('');
  const [descEn, setDescEn] = useState('');
  const [degreeType, setDegreeType] = useState<'bachelors' | 'masters'>('bachelors');
  const [projectType, setProjectType] = useState<'project' | 'thesis'>('project');
  const [maxStudents, setMaxStudents] = useState(1);
  const [skills, setSkills] = useState('');
  const [prerequisites, setPrerequisites] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    apiClient
      .getAdminSupervisors(facultyId)
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
  }, [facultyId]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!supervisorId || !titleHe.trim() || !titleEn.trim()) {
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
      });
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : lang === 'he' ? 'פרסום הפרויקט נכשל' : 'Failed to publish the project');
    } finally {
      setSubmitting(false);
    }
  };

  const inputCls = 'w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink focus:border-primary focus:bg-surface focus:outline-none disabled:opacity-60';
  const facultyColor = getFacultyColor(facultyId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form onSubmit={handleSubmit} className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[var(--radius)] bg-surface p-6 shadow-lg">
        <div className="flex items-start justify-between">
          <h2 className="text-lg font-semibold text-ink">📁 {lang === 'he' ? 'פרסום פרויקט חדש' : 'Post New Project'}</h2>
          <button type="button" onClick={onClose} className="text-muted hover:text-ink">
            ✕
          </button>
        </div>

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

          <div>
            <span className="mb-1.5 block text-sm font-medium text-ink">{lang === 'he' ? 'פקולטה' : 'Faculty'}</span>
            <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium" style={{ backgroundColor: `${facultyColor}1F`, color: facultyColor }}>
              🔒 {facultyLabel(facultyId, lang)}
            </span>
          </div>

          <Field label={lang === 'he' ? 'מנחה *' : 'Supervisor *'}>
            <select value={supervisorId} onChange={(e) => setSupervisorId(e.target.value)} className={inputCls} required disabled={loadingSupervisors}>
              <option value="">{loadingSupervisors ? '…' : lang === 'he' ? 'בחר מנחה' : 'Select supervisor'}</option>
              {supervisors.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.displayName}
                </option>
              ))}
            </select>
            {!loadingSupervisors && supervisors.length === 0 && (
              <p className="mt-1 text-xs text-muted">{lang === 'he' ? 'אין מנחים זמינים בפקולטה' : 'No supervisors available in this faculty'}</p>
            )}
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
        </div>

        {error && <p className="mt-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>}

        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-line px-3.5 py-2 text-sm font-medium text-ink hover:bg-paper">
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink">{label}</span>
      {children}
    </label>
  );
}
