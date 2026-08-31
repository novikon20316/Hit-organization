'use client';

// app/grad_school_head/dashboard/NewProjectModal.tsx
// Net-new — grad_school_head previously had no "Add Project" capability at
// all (POST /api/admin/projects hard-403'd every role except
// faculty_admin/system_admin; that's now widened — see
// adminController.ts's createAdminProject). Modeled on
// admin/panel/NewProjectModal.tsx: grad_school_head is a cross-faculty role
// (facultyId === 'all' by convention, no single "own" faculty to lock to),
// so faculty is a full checkbox multi-select scoped to whatever
// add_projects grants this head actually holds (see FacultyCheckboxes /
// scopeAuthorization.ts's grantedFacultyIdsFor) rather than every faculty in
// the institution.

import { useEffect, useState, type FormEvent } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/apiClient';
import { majorsForFaculty, degreeLevelsForFaculty } from '@/lib/permissions';
import { FacultyCheckboxes } from '@/components/FacultyCheckboxes';
import { SupervisorCheckboxes, type SupervisorOption } from '@/components/SupervisorCheckboxes';
import { WorkflowTemplatePreview } from '@/components/WorkflowTemplatePreview';
import { PrerequisitesEditor, type PrerequisiteSpec } from '@/components/PrerequisitesEditor';
import { TeamSizeField } from '@/components/TeamSizeField';

interface NewProjectModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export function NewProjectModal({ open, onClose, onCreated }: NewProjectModalProps) {
  const { lang } = useLanguage();

  const [supervisors, setSupervisors] = useState<SupervisorOption[]>([]);
  const [loadingSupervisors, setLoadingSupervisors] = useState(true);
  const [supervisorIds, setSupervisorIds] = useState<string[]>([]);
  const [facultyIds, setFacultyIds] = useState<string[]>([]);
  const [titleHe, setTitleHe] = useState('');
  const [titleEn, setTitleEn] = useState('');
  const [descHe, setDescHe] = useState('');
  const [descEn, setDescEn] = useState('');
  const [degreeTypes, setDegreeTypes] = useState<('bachelors' | 'masters')[]>(['bachelors']);
  const [projectTypes, setProjectTypes] = useState<('project' | 'thesis')[]>(['project']);
  const [maxStudents, setMaxStudents] = useState(1);
  const [skills, setSkills] = useState('');
  const [prerequisites, setPrerequisites] = useState<PrerequisiteSpec[]>([]);
  const [major, setMajor] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || facultyIds.length === 0) {
      setSupervisors([]);
      setLoadingSupervisors(false);
      return;
    }
    let cancelled = false;
    setLoadingSupervisors(true);
    apiClient
      .getAdminSupervisors(facultyIds)
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
  }, [open, facultyIds.join(',')]);

  const majorOptions = () => {
    if (facultyIds.length === 0) return [];
    const perFaculty = facultyIds.map((id) => majorsForFaculty(id));
    return perFaculty.reduce((acc, list) => acc.filter((m) => list.some((l) => l.slug === m.slug)));
  };

  // Some faculties only offer one degree level (e.g. data_science is
  // masters-only) — a project posted across faculties must stick to
  // whichever level(s) every selected faculty actually offers.
  const degreeOptionsFor = (ids: string[]): ('bachelors' | 'masters')[] => {
    if (ids.length === 0) return ['bachelors', 'masters'];
    return (['bachelors', 'masters'] as const).filter((lvl) => ids.every((id) => degreeLevelsForFaculty(id).includes(lvl)));
  };
  const degreeOptions = degreeOptionsFor(facultyIds);

  const reset = () => {
    setSupervisorIds([]);
    setFacultyIds([]);
    setTitleHe('');
    setTitleEn('');
    setDescHe('');
    setDescEn('');
    setDegreeTypes(['bachelors']);
    setProjectTypes(['project']);
    setMaxStudents(1);
    setSkills('');
    setPrerequisites([]);
    setMajor('');
    setError('');
  };

  const toggleDegreeType = (d: 'bachelors' | 'masters') => {
    setDegreeTypes((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  };
  const toggleProjectType = (t: 'project' | 'thesis') => {
    setProjectTypes((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (supervisorIds.length === 0 || !titleHe.trim() || !titleEn.trim() || facultyIds.length === 0) {
      setError(lang === 'he' ? 'יש למלא את כל השדות' : 'Missing required fields');
      return;
    }
    if (degreeTypes.length === 0 || projectTypes.length === 0) {
      setError(lang === 'he' ? 'יש לבחור לפחות סוג תואר אחד וסוג פרויקט אחד' : 'Select at least one degree type and one project type');
      return;
    }
    // At least one selected supervisor must be primary-eligible for the
    // selected faculty/ies — a project can't have only secondary/co-supervisors.
    // Reorder so a primary-eligible one always lands first (supervisorIds[0]
    // becomes the project's primary supervisor server-side, see
    // adminController.ts's createAdminProject), regardless of click order.
    const supervisorById = new Map(supervisors.map((s) => [s.id, s]));
    const primaryEligible = supervisorIds.filter((id) => supervisorById.get(id)?.eligibleAsSupervisor);
    const secondaryOnly = supervisorIds.filter((id) => !supervisorById.get(id)?.eligibleAsSupervisor);
    if (primaryEligible.length === 0) {
      setError(lang === 'he' ? 'יש לבחור לפחות מנחה ראשי אחד עבור הפקולטה/ות שנבחרו' : 'Select at least one primary-eligible supervisor for the chosen faculty/ies');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await apiClient.createAdminProject({
        supervisorIds: [...primaryEligible, ...secondaryOnly],
        facultyIds,
        titleHe: titleHe.trim(),
        titleEn: titleEn.trim(),
        descriptionHe: descHe.trim(),
        descriptionEn: descEn.trim(),
        degreeTypes,
        projectTypes,
        maxStudents,
        requiredSkills: skills.split(',').map((s) => s.trim()).filter(Boolean),
        prerequisites: prerequisites
          .filter((p) => p.subject.trim())
          .map((p) => ({ subject: p.subject.trim(), ...(p.minGrade != null ? { minGrade: p.minGrade } : {}) })),
        ...(major ? { major } : {}),
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

          <Field label={lang === 'he' ? 'פקולטה/ות *' : 'Faculty/Faculties *'}>
            <FacultyCheckboxes
              selected={facultyIds}
              onChange={(ids) => {
                setFacultyIds(ids);
                setMajor('');
                setSupervisorIds([]);
                const opts = degreeOptionsFor(ids);
                setDegreeTypes((prev) => {
                  const kept = prev.filter((d) => opts.includes(d));
                  return kept.length > 0 ? kept : opts;
                });
              }}
            />
          </Field>

          <Field label={lang === 'he' ? 'מנחה/ים *' : 'Supervisor(s) *'}>
            <SupervisorCheckboxes
              facultyIds={facultyIds}
              options={supervisors}
              loading={loadingSupervisors}
              selected={supervisorIds}
              onChange={setSupervisorIds}
            />
          </Field>

          <Field label={lang === 'he' ? 'מגמה / תוכנית (אופציונלי)' : 'Major/Program (optional)'}>
            <select value={major} onChange={(e) => setMajor(e.target.value)} className={inputCls} disabled={facultyIds.length === 0}>
              <option value="">{lang === 'he' ? 'ללא הגבלה — כל המגמות' : 'No restriction — all majors'}</option>
              {majorOptions().map((m) => (
                <option key={m.slug} value={m.slug}>
                  {m.label[lang]}
                </option>
              ))}
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label={lang === 'he' ? 'סוג תואר' : 'Degree Type'}>
              <div className="flex gap-3">
                {degreeOptions.includes('bachelors') && (
                  <label className="flex items-center gap-1.5 text-sm text-ink">
                    <input type="checkbox" checked={degreeTypes.includes('bachelors')} onChange={() => toggleDegreeType('bachelors')} className="h-4 w-4" />
                    {lang === 'he' ? 'תואר ראשון' : "Bachelor's"}
                  </label>
                )}
                {degreeOptions.includes('masters') && (
                  <label className="flex items-center gap-1.5 text-sm text-ink">
                    <input type="checkbox" checked={degreeTypes.includes('masters')} onChange={() => toggleDegreeType('masters')} className="h-4 w-4" />
                    {lang === 'he' ? 'תואר שני' : "Master's"}
                  </label>
                )}
              </div>
              {facultyIds.length > 0 && degreeOptions.length === 1 && (
                <p className="mt-1 text-xs text-muted">
                  {lang === 'he' ? 'הפקולטה/ות שנבחרו מציעות תואר אחד בלבד' : 'The selected faculty/ies only offer one degree level'}
                </p>
              )}
              {facultyIds.length > 0 && degreeOptions.length === 0 && (
                <p className="mt-1 text-xs text-danger" role="alert">
                  {lang === 'he' ? 'לפקולטות שנבחרו אין תואר משותף' : 'The selected faculties share no common degree level'}
                </p>
              )}
            </Field>
            <Field label={lang === 'he' ? 'סוג פרויקט' : 'Project Type'}>
              <div className="flex gap-3">
                <label className="flex items-center gap-1.5 text-sm text-ink">
                  <input type="checkbox" checked={projectTypes.includes('project')} onChange={() => toggleProjectType('project')} className="h-4 w-4" />
                  {lang === 'he' ? 'פרויקט' : 'Project'}
                </label>
                <label className="flex items-center gap-1.5 text-sm text-ink">
                  <input type="checkbox" checked={projectTypes.includes('thesis')} onChange={() => toggleProjectType('thesis')} className="h-4 w-4" />
                  {lang === 'he' ? 'תזה' : 'Thesis'}
                </label>
              </div>
            </Field>
          </div>

          <WorkflowTemplatePreview facultyIds={facultyIds} degreeTypes={degreeTypes} projectTypes={projectTypes} major={major || undefined} />

          <TeamSizeField value={maxStudents} onChange={setMaxStudents} lang={lang} />

          <Field label={lang === 'he' ? 'כישורים נדרשים (מופרד בפסיקים)' : 'Required Skills (comma-separated)'}>
            <input value={skills} onChange={(e) => setSkills(e.target.value)} className={inputCls} placeholder={lang === 'he' ? 'לדוגמה: Python, React' : 'e.g. Python, React'} />
          </Field>

          <PrerequisitesEditor lang={lang} value={prerequisites} onChange={setPrerequisites} />
        </div>

        {error && <p className="mt-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">{error}</p>}

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
