'use client';

// app/faculty_admin/dashboard/NewProjectModal.tsx
// Ported from app/admin/panel/NewProjectModal.tsx — same POST /api/admin/projects
// call (apiClient.createAdminProject) and the same "pick a supervisor" shape
// (unlike supervisor's own self-service NewProjectModal.tsx, which has no
// supervisor picker since it's always the caller).
//
// This was previously left unbuilt because createAdminProject
// (server/src/controllers/adminController.ts) gated the endpoint to
// system_admin only — a faculty_admin hitting it got a 403. That's now fixed:
// the handler accepts role/roles containing 'faculty_admin' or 'system_admin'.
// Grading criteria now lives solely in the workflow-templates screen, not
// per-project.
//
// Faculty is now a checkbox multi-select too (faculty_admin is one of the
// roles allowed to post across more than one faculty) — options come from
// FacultyCheckboxes, scoped to this faculty_admin's own faculty plus any
// additional faculties explicitly granted via bulk-permissions/
// PermissionsEditorModal (see scopeAuthorization.ts's grantedFacultyIdsFor).
// Degree type and project type are checkboxes for the same multi-select
// reason. `ownFacultyId` still seeds the initial selection and the
// supervisor list, matching this screen's original single-faculty default.

import { useEffect, useState, type FormEvent } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/apiClient';
import type { FacultyId } from '@/lib/i18n';
import { degreeLevelsForFaculty } from '@/lib/permissions';
import type { SupervisorOption } from './types';
import { FacultyCheckboxes } from '@/components/FacultyCheckboxes';
import { SupervisorCheckboxes } from '@/components/SupervisorCheckboxes';
import { WorkflowTemplatePreview } from '@/components/WorkflowTemplatePreview';
import { PrerequisitesEditor, type PrerequisiteSpec } from '@/components/PrerequisitesEditor';
import { TeamSizeField } from '@/components/TeamSizeField';

interface NewProjectModalProps {
  facultyId: FacultyId;
  onClose: () => void;
  onCreated: () => void;
}

export function NewProjectModal({ facultyId: ownFacultyId, onClose, onCreated }: NewProjectModalProps) {
  const { lang } = useLanguage();

  const [supervisors, setSupervisors] = useState<SupervisorOption[]>([]);
  // Starts true (rather than being set true from inside the effect below) so
  // the effect only ever flips it to false — matches the codebase's
  // set-state-in-effect convention (see admin/panel/NewProjectModal.tsx).
  const [loadingSupervisors, setLoadingSupervisors] = useState(true);
  const [supervisorIds, setSupervisorIds] = useState<string[]>([]);
  const [facultyIds, setFacultyIds] = useState<string[]>([ownFacultyId]);
  const [titleHe, setTitleHe] = useState('');
  const [titleEn, setTitleEn] = useState('');
  const [descHe, setDescHe] = useState('');
  const [descEn, setDescEn] = useState('');
  // Some faculties only offer one degree level (e.g. data_science is
  // masters-only) — seed with whatever ownFacultyId actually offers instead
  // of always defaulting to bachelors.
  const [degreeTypes, setDegreeTypes] = useState<('bachelors' | 'masters')[]>(() => degreeLevelsForFaculty(ownFacultyId).includes('bachelors') ? ['bachelors'] : degreeLevelsForFaculty(ownFacultyId));
  const [projectTypes, setProjectTypes] = useState<('project' | 'thesis')[]>(['project']);
  const [maxStudents, setMaxStudents] = useState(1);
  const [skills, setSkills] = useState('');
  const [prerequisites, setPrerequisites] = useState<PrerequisiteSpec[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (facultyIds.length === 0) {
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
  }, [facultyIds.join(',')]);

  const degreeOptionsFor = (ids: string[]): ('bachelors' | 'masters')[] => {
    if (ids.length === 0) return ['bachelors', 'masters'];
    return (['bachelors', 'masters'] as const).filter((lvl) => ids.every((id) => degreeLevelsForFaculty(id).includes(lvl)));
  };
  const degreeOptions = degreeOptionsFor(facultyIds);

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

          <Field label={lang === 'he' ? 'פקולטה/ות *' : 'Faculty/Faculties *'}>
            <FacultyCheckboxes
              selected={facultyIds}
              onChange={(ids) => {
                setFacultyIds(ids);
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
              {degreeOptions.length === 1 && (
                <p className="mt-1 text-xs text-muted">
                  {lang === 'he' ? 'הפקולטה/ות שנבחרו מציעות תואר אחד בלבד' : 'The selected faculty/ies only offer one degree level'}
                </p>
              )}
              {degreeOptions.length === 0 && (
                <p className="mt-1 text-xs text-danger">
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

          <WorkflowTemplatePreview facultyIds={facultyIds} degreeTypes={degreeTypes} projectTypes={projectTypes} />

          <TeamSizeField value={maxStudents} onChange={setMaxStudents} lang={lang} />

          <Field label={lang === 'he' ? 'כישורים נדרשים (מופרד בפסיקים)' : 'Required Skills (comma-separated)'}>
            <input value={skills} onChange={(e) => setSkills(e.target.value)} className={inputCls} placeholder={lang === 'he' ? 'לדוגמה: Python, React' : 'e.g. Python, React'} />
          </Field>

          <PrerequisitesEditor lang={lang} value={prerequisites} onChange={setPrerequisites} />
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
