'use client';

// app/workflow-templates/MilestoneRowModal.tsx
// Add/edit a single milestone row within the propose-version editor —
// nameHe/En, due date, requires-examiners, grading rubric, approval chain,
// plus two department-specific extensions (see workflowTemplates.ts):
// - research_proposal/progress_report: an optional staff-side upload-or-form
//   record alongside the student's own submission.
// - defense: an optional three-independent-rubric final-grade workflow
//   (supervisor / examiner-on-the-project / examiner-on-the-defense) instead
//   of the single shared gradingComponents rubric below.

import { useRef, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import type { CommitteeRecord } from '@/lib/apiClient';
import { useModalA11y } from '@/hooks/useModalA11y';
import { ChainEditor, emptyStage } from './ChainEditor';
import { SUBMISSION_REQUIREMENTS, MILESTONE_FILE_TYPES, DEFAULT_ALLOWED_FILE_TYPES } from './types';
import type { FormFieldSpec, GradingComponentSpec, MilestoneFileType, MilestoneRoutingSpec, MilestoneSpec, SubmissionRequirement } from './types';

function emptyComponent(): GradingComponentSpec {
  return { key: `c_${Math.random().toString(36).slice(2, 8)}`, labelHe: '', labelEn: '', maxScore: 20, weight: 20, hasComment: true, visibleToStudent: true };
}

function emptyFormField(): FormFieldSpec {
  return { key: `f_${Math.random().toString(36).slice(2, 8)}`, labelHe: '', labelEn: '', type: 'text', required: false };
}

const FORM_FIELD_TYPES: Array<{ value: FormFieldSpec['type']; he: string; en: string }> = [
  { value: 'text', he: 'טקסט קצר', en: 'Short text' },
  { value: 'textarea', he: 'טקסט ארוך', en: 'Long text' },
  { value: 'date', he: 'תאריך', en: 'Date' },
  { value: 'number', he: 'מספר', en: 'Number' },
];

interface RubricEditorProps {
  title: string;
  components: GradingComponentSpec[];
  setComponents: (updater: (prev: GradingComponentSpec[]) => GradingComponentSpec[]) => void;
  weight: string;
  setWeight: (v: string) => void;
}

// The per-rubric editor (component rows + this rubric's own share of the
// final grade) — used three times below, once per grader. Component-level
// weights inside one rubric still sum to 100 on their own (same rule as the
// standalone gradingComponents editor); the three RUBRICS' own `weight`
// fields are a separate, higher-level split validated by the caller.
function RubricEditor({ title, components, setComponents, weight, setWeight }: RubricEditorProps) {
  const { lang, t } = useLanguage();
  const weightSum = components.reduce((sum, c) => sum + (Number(c.weight) || 0), 0);
  const updateComponent = (idx: number, patch: Partial<GradingComponentSpec>) => {
    setComponents((prev) => prev.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  };
  const removeComponent = (idx: number) => setComponents((prev) => prev.filter((_, i) => i !== idx));

  return (
    <div className="rounded-lg border border-line bg-surface p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-ink">
          {title}
          {components.length > 0 && <span className="ms-1 text-xs font-normal text-muted">({weightSum}/100)</span>}
        </span>
        <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted">
          {lang === 'he' ? 'משקל כללי %' : 'Overall weight %'}
          <input
            type="number"
            min={0}
            max={100}
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            className="w-14 rounded-md border border-line bg-paper px-1.5 py-0.5 text-xs text-ink"
          />
        </label>
      </div>

      <div className="mt-2 grid gap-2">
        {components.map((c, idx) => (
          <div key={c.key} className="rounded-md border border-line bg-paper p-2.5">
            <div className="flex items-center gap-2">
              <input
                dir="rtl"
                value={c.labelHe}
                onChange={(e) => updateComponent(idx, { labelHe: e.target.value })}
                placeholder={lang === 'he' ? 'שם (עברית)' : 'Name (Hebrew)'}
                className="w-full rounded-md border border-line bg-surface px-2 py-1 text-xs text-ink"
              />
              <input
                dir="ltr"
                value={c.labelEn}
                onChange={(e) => updateComponent(idx, { labelEn: e.target.value })}
                placeholder={lang === 'he' ? 'שם (אנגלית)' : 'Name (English)'}
                className="w-full rounded-md border border-line bg-surface px-2 py-1 text-xs text-ink"
              />
              <button type="button" onClick={() => removeComponent(idx)} className="shrink-0 px-1 text-sm" aria-label="remove">
                🗑️
              </button>
            </div>
            <div className="mt-1.5 flex items-center gap-3">
              <label className="flex items-center gap-1 text-xs text-muted">
                {lang === 'he' ? 'ניקוד מקסימלי' : 'Max score'}
                <input
                  type="number"
                  min={0}
                  value={c.maxScore}
                  onChange={(e) => updateComponent(idx, { maxScore: Number(e.target.value) })}
                  className="w-16 rounded-md border border-line bg-surface px-1.5 py-0.5 text-xs text-ink"
                />
              </label>
              <label className="flex items-center gap-1 text-xs text-muted">
                {lang === 'he' ? 'משקל %' : 'Weight %'}
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={c.weight}
                  onChange={(e) => updateComponent(idx, { weight: Number(e.target.value) })}
                  className="w-16 rounded-md border border-line bg-surface px-1.5 py-0.5 text-xs text-ink"
                />
              </label>
            </div>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => setComponents((prev) => [...prev, emptyComponent()])}
        className="mt-2 rounded-md bg-primary px-2.5 py-1 text-xs font-semibold text-primary-ink hover:bg-primary-hover"
      >
        ＋ {t('add')}
      </button>
    </div>
  );
}

interface MilestoneRowModalProps {
  open: boolean;
  editing: MilestoneSpec | null;
  /** Every OTHER milestone already in this template (including the one
   *  currently open for edit — this component filters that one out itself)
   *  — populates the "sync due date with" picker. */
  otherMilestones: MilestoneSpec[];
  /** Committees eligible for this template's own faculty/major — forwarded
   *  to this row's own chain-override editor. See ChainEditor's committees prop. */
  committees: CommitteeRecord[];
  onCancel: () => void;
  onSave: (values: {
    nameHe: string;
    nameEn: string;
    dateMode: 'offset' | 'fixed';
    dueDaysFromStart: number;
    fixedDate?: string;
    syncDueDateWith?: string;
    percentOfFinalGrade: number;
    requiresExaminers: boolean;
    examinerCount?: number;
    gradingComponents: GradingComponentSpec[];
    routing?: MilestoneRoutingSpec;
    staffRecordMode?: 'none' | 'upload_or_form';
    staffFormFields?: FormFieldSpec[];
    finalGradeComponents?: MilestoneSpec['finalGradeComponents'];
    submissionRequirement: SubmissionRequirement;
    allowedFileTypes?: MilestoneFileType[];
  }) => void;
}

export function MilestoneRowModal({ open, editing, otherMilestones, committees, onCancel, onSave }: MilestoneRowModalProps) {
  const { lang, t } = useLanguage();
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalA11y(dialogRef, open, onCancel);
  const [nameHe, setNameHe] = useState(editing?.nameHe ?? '');
  const [nameEn, setNameEn] = useState(editing?.nameEn ?? '');
  const [dateMode, setDateMode] = useState<'offset' | 'fixed'>(editing?.dateMode === 'fixed' ? 'fixed' : 'offset');
  const [days, setDays] = useState(String(editing?.dueDaysFromStart ?? 90));
  const [fixedDate, setFixedDate] = useState(editing?.fixedDate ?? '');
  // Every other milestone this one could sync its due date to — excludes
  // itself (relevant only while editing; a brand-new row isn't in the list
  // yet at all).
  const syncOptions = otherMilestones.filter((m) => m.type !== editing?.type);
  const [syncDueDateWith, setSyncDueDateWith] = useState(editing?.syncDueDateWith ?? '');
  const [percentOfFinalGrade, setPercentOfFinalGrade] = useState(String(editing?.percentOfFinalGrade ?? 0));
  const [requiresExaminers, setRequiresExaminers] = useState(editing?.requiresExaminers ?? false);
  const [examinerCount, setExaminerCount] = useState(String(editing?.examinerCount ?? 2));
  const [components, setComponents] = useState<GradingComponentSpec[]>(editing?.gradingComponents ?? []);
  const [submissionRequirement, setSubmissionRequirement] = useState<SubmissionRequirement>(editing?.submissionRequirement ?? 'both');
  // Only meaningful when submissionRequirement is 'file'/'both' — see the
  // multi-select below. Defaults to PDF-only, the strictest safe choice,
  // for both a brand-new milestone and one saved before this feature existed.
  const [allowedFileTypes, setAllowedFileTypes] = useState<MilestoneFileType[]>(
    editing?.allowedFileTypes && editing.allowedFileTypes.length > 0 ? editing.allowedFileTypes : DEFAULT_ALLOWED_FILE_TYPES
  );
  const requiresFile = submissionRequirement === 'file' || submissionRequirement === 'both';
  const toggleFileType = (key: MilestoneFileType) => {
    setAllowedFileTypes((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };
  const [overrideChain, setOverrideChain] = useState(!!(editing?.routing && editing.routing.length > 0));
  const [routing, setRouting] = useState<MilestoneRoutingSpec>(editing?.routing && editing.routing.length > 0 ? editing.routing.map((s) => ({ ...s })) : [emptyStage()]);
  const [error, setError] = useState('');

  // research_proposal/progress_report only — an official staff (supervisor)
  // record alongside the student's own submission.
  const isProposalOrMidterm = editing?.type === 'research_proposal' || editing?.type === 'progress_report';
  const [staffRecordMode, setStaffRecordMode] = useState<'none' | 'upload_or_form'>(editing?.staffRecordMode ?? 'none');
  const [staffFormFields, setStaffFormFields] = useState<FormFieldSpec[]>(editing?.staffFormFields ?? []);

  // defense only — the three-independent-rubric final-grade workflow,
  // replacing the single shared gradingComponents rubric above when enabled.
  const isDefense = editing?.type === 'defense';
  const [useFinalGradeComponents, setUseFinalGradeComponents] = useState(!!editing?.finalGradeComponents);
  const [supervisorEvalComponents, setSupervisorEvalComponents] = useState<GradingComponentSpec[]>(editing?.finalGradeComponents?.supervisorEvaluation.components ?? []);
  const [supervisorEvalWeight, setSupervisorEvalWeight] = useState(String(editing?.finalGradeComponents?.supervisorEvaluation.weight ?? 40));
  const [examinerProjectComponents, setExaminerProjectComponents] = useState<GradingComponentSpec[]>(editing?.finalGradeComponents?.examinerProjectEvaluation.components ?? []);
  const [examinerProjectWeight, setExaminerProjectWeight] = useState(String(editing?.finalGradeComponents?.examinerProjectEvaluation.weight ?? 30));
  const [examinerDefenseComponents, setExaminerDefenseComponents] = useState<GradingComponentSpec[]>(editing?.finalGradeComponents?.examinerDefenseEvaluation.components ?? []);
  const [examinerDefenseWeight, setExaminerDefenseWeight] = useState(String(editing?.finalGradeComponents?.examinerDefenseEvaluation.weight ?? 30));

  if (!open) return null;

  const updateComponent = (idx: number, patch: Partial<GradingComponentSpec>) => {
    setComponents((prev) => prev.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  };
  const removeComponent = (idx: number) => setComponents((prev) => prev.filter((_, i) => i !== idx));

  const updateFormField = (idx: number, patch: Partial<FormFieldSpec>) => {
    setStaffFormFields((prev) => prev.map((f, i) => (i === idx ? { ...f, ...patch } : f)));
  };
  const removeFormField = (idx: number) => setStaffFormFields((prev) => prev.filter((_, i) => i !== idx));

  const weightSum = components.reduce((sum, c) => sum + (Number(c.weight) || 0), 0);

  const handleSave = () => {
    if (!nameHe.trim() || !nameEn.trim()) {
      setError(lang === 'he' ? 'יש להזין שם לאבן הדרך (עברית ואנגלית)' : 'Enter a milestone name (Hebrew and English)');
      return;
    }
    let parsedDays = 0;
    let parsedFixedDate: string | undefined;
    if (dateMode === 'fixed') {
      if (!fixedDate.trim() || isNaN(new Date(fixedDate).getTime())) {
        setError(lang === 'he' ? 'יש להזין תאריך יעד תקין' : 'Enter a valid due date');
        return;
      }
      parsedFixedDate = fixedDate;
    } else {
      parsedDays = parseInt(days, 10);
      if (!Number.isFinite(parsedDays) || parsedDays < 0) {
        setError(lang === 'he' ? 'מספר ימים לא תקין' : 'Invalid number of days');
        return;
      }
    }
    const parsedExaminerCount = parseInt(examinerCount, 10);
    if (requiresExaminers && (!Number.isFinite(parsedExaminerCount) || parsedExaminerCount < 1)) {
      setError(lang === 'he' ? 'מספר בוחנים לא תקין' : 'Invalid examiner count');
      return;
    }
    const parsedPercent = Number(percentOfFinalGrade);
    if (!Number.isFinite(parsedPercent) || parsedPercent < 0 || parsedPercent > 100) {
      setError(lang === 'he' ? 'אחוז מהציון הסופי חייב להיות בין 0 ל-100' : 'Percentage of final grade must be between 0 and 100');
      return;
    }
    if (!isDefense || !useFinalGradeComponents) {
      if (components.length > 0) {
        if (components.some((c) => !c.labelHe.trim() || !c.labelEn.trim())) {
          setError(lang === 'he' ? 'יש להזין שם לכל מרכיב ציון (עברית ואנגלית)' : 'Enter a name for every grading component (Hebrew and English)');
          return;
        }
        // Most rubrics are a 0-100 percentage split, but a rubric doesn't
        // HAVE to sum to 100 — e.g. a department's real paper form scoring
        // 15 criteria 1-7 each (max 105). A milestone's own score is
        // whatever its rubric produces; only the PROJECT's overall final
        // grade (combining every milestone) is ever capped at 100 — see
        // gradeEngine.ts's computeProjectFinalGrade. Only reject a rubric
        // with no real points at all.
        if (weightSum <= 0) {
          setError(lang === 'he' ? 'סכום המשקלים חייב להיות גדול מ-0' : 'Component weights must sum to more than 0');
          return;
        }
      }
    }
    if (requiresFile && allowedFileTypes.length === 0) {
      setError(lang === 'he' ? 'יש לבחור לפחות סוג קובץ אחד' : 'Choose at least one file type');
      return;
    }
    if (overrideChain && routing.length === 0) {
      setError(lang === 'he' ? 'שרשרת מותאמת אישית חייבת לכלול לפחות שלב אחד' : 'A custom chain needs at least one stage');
      return;
    }
    if (overrideChain && committees.length > 1 && routing.some((s) => s.role === 'committee' && !s.committeeId)) {
      setError(lang === 'he' ? 'יש לבחור ועדה עבור שלב הוועדה בשרשרת' : 'Choose a committee for the committee stage in the chain');
      return;
    }
    if (isProposalOrMidterm && staffRecordMode === 'upload_or_form') {
      if (staffFormFields.some((f) => !f.labelHe.trim() || !f.labelEn.trim())) {
        setError(lang === 'he' ? 'יש להזין שם לכל שדה בטופס (עברית ואנגלית)' : 'Enter a name for every form field (Hebrew and English)');
        return;
      }
    }

    let finalGradeComponents: MilestoneSpec['finalGradeComponents'] | undefined;
    if (isDefense && useFinalGradeComponents) {
      const rubrics = [
        { label: lang === 'he' ? 'הערכת מנחה' : 'Supervisor evaluation', components: supervisorEvalComponents, weight: supervisorEvalWeight },
        { label: lang === 'he' ? 'הערכת בוחן — עבודת הגמר' : 'Examiner evaluation — the project', components: examinerProjectComponents, weight: examinerProjectWeight },
        { label: lang === 'he' ? 'הערכת בוחן — בחינת ההגנה' : 'Examiner evaluation — the defense exam', components: examinerDefenseComponents, weight: examinerDefenseWeight },
      ];
      for (const r of rubrics) {
        if (r.components.length === 0 || r.components.some((c) => !c.labelHe.trim() || !c.labelEn.trim())) {
          setError(lang === 'he' ? `יש להגדיר לפחות מרכיב ציון אחד עם שם עבור: ${r.label}` : `Define at least one named grading component for: ${r.label}`);
          return;
        }
        const sum = r.components.reduce((s, c) => s + (Number(c.weight) || 0), 0);
        if (sum !== 100) {
          setError(lang === 'he' ? `סכום המשקלים ב"${r.label}" חייב להיות 100 (כרגע ${sum})` : `Component weights in "${r.label}" must sum to 100 (currently ${sum})`);
          return;
        }
      }
      const w1 = Number(supervisorEvalWeight) || 0;
      const w2 = Number(examinerProjectWeight) || 0;
      const w3 = Number(examinerDefenseWeight) || 0;
      if (w1 + w2 + w3 !== 100) {
        setError(lang === 'he' ? `סכום המשקלים הכלליים של שלושת המרכיבים חייב להיות 100 (כרגע ${w1 + w2 + w3})` : `The three rubrics' overall weights must sum to 100 (currently ${w1 + w2 + w3})`);
        return;
      }
      finalGradeComponents = {
        supervisorEvaluation: { components: supervisorEvalComponents, weight: w1 },
        examinerProjectEvaluation: { components: examinerProjectComponents, weight: w2 },
        examinerDefenseEvaluation: { components: examinerDefenseComponents, weight: w3 },
      };
    }

    onSave({
      nameHe: nameHe.trim(),
      nameEn: nameEn.trim(),
      dateMode,
      dueDaysFromStart: parsedDays,
      ...(dateMode === 'fixed' ? { fixedDate: parsedFixedDate } : {}),
      ...(syncDueDateWith ? { syncDueDateWith } : {}),
      percentOfFinalGrade: parsedPercent,
      requiresExaminers,
      ...(requiresExaminers ? { examinerCount: parsedExaminerCount } : {}),
      gradingComponents: components,
      ...(overrideChain ? { routing } : {}),
      ...(isProposalOrMidterm ? { staffRecordMode, staffFormFields: staffRecordMode === 'upload_or_form' ? staffFormFields : [] } : {}),
      ...(finalGradeComponents ? { finalGradeComponents } : {}),
      submissionRequirement,
      ...(requiresFile ? { allowedFileTypes } : {}),
    });
  };

  const inputCls = 'w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink focus:border-primary focus:bg-surface focus:outline-none';

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[60] overflow-y-auto bg-paper outline-none"
    >
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-surface px-4 py-3 sm:px-6">
        <h2 className="text-base font-semibold text-ink">
          {editing ? `✏️ ${lang === 'he' ? 'עריכת אבן דרך' : 'Edit Milestone'}` : `➕ ${lang === 'he' ? 'אבן דרך חדשה' : 'New Milestone'}`}
        </h2>
        <div className="flex items-center gap-2">
          <button type="button" onClick={onCancel} className="rounded-lg border border-line px-3.5 py-2 text-sm font-medium text-ink hover:bg-paper">
            {t('cancel')}
          </button>
          <button type="button" onClick={handleSave} className="rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-ink hover:bg-primary-hover">
            {t('save')}
          </button>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-4 py-5 sm:px-6">
        <div className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink">{lang === 'he' ? 'שם (עברית)' : 'Name (Hebrew)'}</span>
              <input dir="rtl" value={nameHe} onChange={(e) => setNameHe(e.target.value)} placeholder="שם אבן הדרך" className={inputCls} />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink">{lang === 'he' ? 'שם (אנגלית)' : 'Name (English)'}</span>
              <input dir="ltr" value={nameEn} onChange={(e) => setNameEn(e.target.value)} placeholder="Milestone name" className={inputCls} />
            </label>
          </div>
          <div className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink">{lang === 'he' ? 'מועד יעד' : 'Due date'}</span>
            <div className="mb-2 flex gap-1.5">
              <button
                type="button"
                onClick={() => setDateMode('offset')}
                className={`flex-1 rounded-lg border px-3 py-1.5 text-xs font-medium ${dateMode === 'offset' ? 'border-primary bg-primary text-primary-ink' : 'border-line bg-paper text-ink'}`}
              >
                {lang === 'he' ? 'ימים מתחילת התהליך' : 'Days from start'}
              </button>
              <button
                type="button"
                onClick={() => setDateMode('fixed')}
                className={`flex-1 rounded-lg border px-3 py-1.5 text-xs font-medium ${dateMode === 'fixed' ? 'border-primary bg-primary text-primary-ink' : 'border-line bg-paper text-ink'}`}
              >
                {lang === 'he' ? 'תאריך קבוע' : 'Fixed date'}
              </button>
            </div>
            {dateMode === 'offset' ? (
              <input type="number" min={0} value={days} onChange={(e) => setDays(e.target.value)} placeholder="90" className={inputCls} />
            ) : (
              <>
                <input type="date" value={fixedDate} onChange={(e) => setFixedDate(e.target.value)} className={inputCls} />
                <p className="mt-1 text-xs text-muted">
                  {lang === 'he'
                    ? 'תאריך אחד לכל הסטודנטים בתבנית זו, ללא קשר למועד ההרשמה שלהם.'
                    : 'One date for every student under this template, regardless of when they enrolled.'}
                </p>
              </>
            )}

            {syncOptions.length > 0 && (
              <div className="mt-3">
                <span className="mb-1.5 block text-sm font-medium text-ink">
                  {lang === 'he' ? 'סנכרון מועד עם אבן דרך אחרת (אופציונלי)' : 'Sync due date with another milestone (optional)'}
                </span>
                <select
                  value={syncDueDateWith}
                  onChange={(e) => setSyncDueDateWith(e.target.value)}
                  className={inputCls}
                >
                  <option value="">{lang === 'he' ? 'ללא — מועד עצמאי (ברירת מחדל)' : 'None — independent due date (default)'}</option>
                  {syncOptions.map((m) => (
                    <option key={m.type} value={m.type}>{lang === 'he' ? m.nameHe || m.type : m.nameEn || m.type}</option>
                  ))}
                </select>
                {syncDueDateWith && (
                  <p className="mt-1.5 text-xs text-muted">
                    {lang === 'he'
                      ? 'המועד לעיל ישמש רק כגיבוי — כל עוד אבן הדרך שנבחרה קיימת בתבנית, המועד הזה תמיד יתאים לה בדיוק.'
                      : "The date above is used only as a fallback — as long as the chosen milestone still exists in this template, this one's due date will always match it exactly."}
                  </p>
                )}
              </div>
            )}
          </div>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink">{lang === 'he' ? 'אחוז מהציון הסופי' : '% of final grade'}</span>
            <p className="mb-1.5 text-xs text-muted">
              {lang === 'he'
                ? 'כמה אבן דרך זו תורמת לציון הסופי הכולל של הפרויקט. סכום האחוזים של כל אבני הדרך בתבנית חייב להיות 100.'
                : "How much this milestone counts toward the project's overall final grade. Every milestone's percentage in the template must sum to 100."}
            </p>
            <input type="number" min={0} max={100} value={percentOfFinalGrade} onChange={(e) => setPercentOfFinalGrade(e.target.value)} placeholder="0" className={inputCls} />
          </label>
          <label className="flex items-center justify-between rounded-lg border border-line bg-paper px-3 py-2.5">
            <span className="text-sm font-medium text-ink">{lang === 'he' ? 'דורש בוחנים' : 'Requires examiners'}</span>
            <input
              type="checkbox"
              checked={requiresExaminers}
              onChange={(e) => setRequiresExaminers(e.target.checked)}
              className="h-4 w-4 accent-[var(--primary)]"
            />
          </label>

          {requiresExaminers && (
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink">
                {lang === 'he' ? 'מספר בוחנים נדרש' : 'Required number of examiners'}
              </span>
              <input
                type="number"
                min={1}
                value={examinerCount}
                onChange={(e) => setExaminerCount(e.target.value)}
                className={inputCls}
              />
            </label>
          )}

          <div className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink">
              {lang === 'he' ? 'מה נדרש בהגשת הסטודנט/ית' : "What the student's submission requires"}
            </span>
            <div className="grid grid-cols-2 gap-1.5">
              {SUBMISSION_REQUIREMENTS.map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setSubmissionRequirement(opt.key)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
                    submissionRequirement === opt.key ? 'border-primary bg-primary text-primary-ink' : 'border-line bg-paper text-ink'
                  }`}
                >
                  {lang === 'he' ? opt.he : opt.en}
                </button>
              ))}
            </div>
            {submissionRequirement === 'none' && (
              <p className="mt-1.5 text-xs text-danger">
                {lang === 'he'
                  ? '⚠️ לא מומלץ — הסטודנט/ית יוכל/תוכל להגיש ללא כל קובץ או הערה.'
                  : "⚠️ Not recommended — the student will be able to submit with no file or comment at all."}
              </p>
            )}
          </div>

          {requiresFile && (
            <div className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink">
                {lang === 'he' ? 'סוגי קובץ מותרים להגשה' : 'Allowed file types'}
              </span>
              <p className="mb-1.5 text-xs text-muted">
                {lang === 'he'
                  ? 'ניתן לבחור כמה סוגים. הסטודנט/ית לא יוכל/תוכל להעלות סוג קובץ שלא נבחר כאן.'
                  : "Multiple types may be selected. The student won't be able to upload a file type not chosen here."}
              </p>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                {MILESTONE_FILE_TYPES.map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => toggleFileType(opt.key)}
                    aria-pressed={allowedFileTypes.includes(opt.key)}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
                      allowedFileTypes.includes(opt.key) ? 'border-primary bg-primary text-primary-ink' : 'border-line bg-paper text-ink'
                    }`}
                  >
                    {lang === 'he' ? opt.he : opt.en}
                  </button>
                ))}
              </div>
            </div>
          )}

          {isProposalOrMidterm && (
            <div className="rounded-lg border border-line bg-paper p-3">
              <span className="mb-1.5 block text-sm font-medium text-ink">
                {lang === 'he' ? 'רשומת מנחה (אופציונלי)' : 'Staff record (optional)'}
              </span>
              <p className="mb-1.5 text-xs text-muted">
                {lang === 'he'
                  ? 'בנוסף להגשת הסטודנט/ית, ניתן לאפשר למנחה לצרף רשומה רשמית — קובץ מלא או טופס מקוון.'
                  : "On top of the student's own submission, let the supervisor attach an official record — either a completed file or an online form."}
              </p>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setStaffRecordMode('none')}
                  className={`flex-1 rounded-lg border px-3 py-1.5 text-xs font-medium ${staffRecordMode === 'none' ? 'border-primary bg-primary text-primary-ink' : 'border-line bg-surface text-ink'}`}
                >
                  {lang === 'he' ? 'ללא' : 'None'}
                </button>
                <button
                  type="button"
                  onClick={() => setStaffRecordMode('upload_or_form')}
                  className={`flex-1 rounded-lg border px-3 py-1.5 text-xs font-medium ${staffRecordMode === 'upload_or_form' ? 'border-primary bg-primary text-primary-ink' : 'border-line bg-surface text-ink'}`}
                >
                  {lang === 'he' ? 'קובץ או טופס' : 'File or form'}
                </button>
              </div>

              {staffRecordMode === 'upload_or_form' && (
                <div className="mt-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-ink">{lang === 'he' ? 'שדות הטופס המקוון' : 'Online form fields'}</span>
                    <button
                      type="button"
                      onClick={() => setStaffFormFields((prev) => [...prev, emptyFormField()])}
                      className="rounded-md bg-primary px-2 py-0.5 text-xs font-semibold text-primary-ink hover:bg-primary-hover"
                    >
                      ＋ {t('add')}
                    </button>
                  </div>
                  {staffFormFields.length === 0 && (
                    <p className="mt-1 text-xs text-muted">{lang === 'he' ? 'ניתן להשאיר ריק — יאפשר רק העלאת קובץ.' : 'Can be left empty — that just leaves file upload as the only option.'}</p>
                  )}
                  <div className="mt-1.5 grid gap-1.5">
                    {staffFormFields.map((f, idx) => (
                      <div key={f.key} className="rounded-md border border-line bg-surface p-2">
                        <div className="flex items-center gap-1.5">
                          <input
                            dir="rtl"
                            value={f.labelHe}
                            onChange={(e) => updateFormField(idx, { labelHe: e.target.value })}
                            placeholder={lang === 'he' ? 'תווית (עברית)' : 'Label (Hebrew)'}
                            className="w-full rounded-md border border-line bg-paper px-2 py-1 text-xs text-ink"
                          />
                          <input
                            dir="ltr"
                            value={f.labelEn}
                            onChange={(e) => updateFormField(idx, { labelEn: e.target.value })}
                            placeholder={lang === 'he' ? 'תווית (אנגלית)' : 'Label (English)'}
                            className="w-full rounded-md border border-line bg-paper px-2 py-1 text-xs text-ink"
                          />
                          <button type="button" onClick={() => removeFormField(idx)} className="shrink-0 px-1 text-sm" aria-label="remove">
                            🗑️
                          </button>
                        </div>
                        <div className="mt-1.5 flex items-center gap-2">
                          <select
                            value={f.type}
                            onChange={(e) => updateFormField(idx, { type: e.target.value as FormFieldSpec['type'] })}
                            className="rounded-md border border-line bg-paper px-1.5 py-0.5 text-xs text-ink"
                          >
                            {FORM_FIELD_TYPES.map((opt) => (
                              <option key={opt.value} value={opt.value}>{opt[lang]}</option>
                            ))}
                          </select>
                          <label className="flex items-center gap-1 text-xs text-muted">
                            <input
                              type="checkbox"
                              checked={f.required}
                              onChange={(e) => updateFormField(idx, { required: e.target.checked })}
                              className="h-3.5 w-3.5 accent-[var(--primary)]"
                            />
                            {lang === 'he' ? 'שדה חובה' : 'Required'}
                          </label>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {isDefense && (
            <label className="flex items-center justify-between rounded-lg border border-line bg-paper px-3 py-2.5">
              <span className="text-sm font-medium text-ink">
                {lang === 'he' ? 'שימוש בתהליך ציון סופי משולש (מנחה + 2 בוחנים)' : 'Use three-rubric final grade (supervisor + 2 examiner rubrics)'}
              </span>
              <input
                type="checkbox"
                checked={useFinalGradeComponents}
                onChange={(e) => setUseFinalGradeComponents(e.target.checked)}
                className="h-4 w-4 accent-[var(--primary)]"
              />
            </label>
          )}

          {isDefense && useFinalGradeComponents && (
            <div className="grid gap-2.5">
              <p className="text-xs text-muted">
                {lang === 'he'
                  ? 'הציון הסופי יחושב אוטומטית משלושת המרכיבים לפי המשקל הכללי של כל אחד (חייבים לסכם ל-100). המנחה יוכל לאשר את הציון המחושב או לשנותו בנימוק, בכפוף לאישור הרכז.'
                  : "The final grade is computed automatically from the three rubrics, weighted by each one's overall share (must sum to 100). The supervisor can approve the computed grade or change it with a reason, subject to the coordinator's approval."}
              </p>
              <RubricEditor
                title={lang === 'he' ? 'הערכת מנחה' : 'Supervisor evaluation'}
                components={supervisorEvalComponents}
                setComponents={setSupervisorEvalComponents}
                weight={supervisorEvalWeight}
                setWeight={setSupervisorEvalWeight}
              />
              <RubricEditor
                title={lang === 'he' ? 'הערכת בוחן — עבודת הגמר' : 'Examiner evaluation — the project'}
                components={examinerProjectComponents}
                setComponents={setExaminerProjectComponents}
                weight={examinerProjectWeight}
                setWeight={setExaminerProjectWeight}
              />
              <RubricEditor
                title={lang === 'he' ? 'הערכת בוחן — בחינת ההגנה' : 'Examiner evaluation — the defense exam'}
                components={examinerDefenseComponents}
                setComponents={setExaminerDefenseComponents}
                weight={examinerDefenseWeight}
                setWeight={setExaminerDefenseWeight}
              />
            </div>
          )}

          {(!isDefense || !useFinalGradeComponents) && (
            <div className="rounded-lg border border-line bg-paper p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-ink">
                  {lang === 'he' ? 'מרכיבי ציון' : 'Grading components'}
                  {components.length > 0 && <span className="ms-1 text-xs text-muted">({weightSum} {lang === 'he' ? 'נק\'' : 'pts'})</span>}
                </span>
                <button
                  type="button"
                  onClick={() => setComponents((prev) => [...prev, emptyComponent()])}
                  className="rounded-md bg-primary px-2.5 py-1 text-xs font-semibold text-primary-ink hover:bg-primary-hover"
                >
                  ＋ {t('add')}
                </button>
              </div>

              {components.length > 0 && weightSum !== 100 && (
                <p className="mt-2 rounded-md bg-accent/10 px-2 py-1.5 text-xs text-ink">
                  {lang === 'he'
                    ? `ℹ️ המרכיבים מסתכמים ל-${weightSum} נקודות, לא 100 — ${weightSum} יהיה הציון המרבי של אבן דרך זו, והוא ייכלל כפי שהוא (בונוס/גירעון) בציון הפרויקט הכולל, שתמיד מוגבל ל-100.`
                    : `ℹ️ These components sum to ${weightSum} points, not 100 — ${weightSum} will be this milestone's own maximum score, and it counts as-is (a genuine bonus/shortfall) toward the project's overall grade, which is always capped at 100.`}
                </p>
              )}

              {components.length === 0 ? (
                <p className="mt-2 text-xs text-muted">
                  {lang === 'he' ? 'ללא מרכיבים מוגדרים — ישמש מד ברירת המחדל.' : 'No components defined — falls back to the default rubric.'}
                </p>
              ) : (
                <div className="mt-2 grid gap-2">
                  {components.map((c, idx) => (
                    <div key={c.key} className="rounded-md border border-line bg-surface p-2.5">
                      <div className="flex items-center gap-2">
                        <input
                          dir="rtl"
                          value={c.labelHe}
                          onChange={(e) => updateComponent(idx, { labelHe: e.target.value })}
                          placeholder={lang === 'he' ? 'שם (עברית)' : 'Name (Hebrew)'}
                          className="w-full rounded-md border border-line bg-paper px-2 py-1 text-xs text-ink"
                        />
                        <input
                          dir="ltr"
                          value={c.labelEn}
                          onChange={(e) => updateComponent(idx, { labelEn: e.target.value })}
                          placeholder={lang === 'he' ? 'שם (אנגלית)' : 'Name (English)'}
                          className="w-full rounded-md border border-line bg-paper px-2 py-1 text-xs text-ink"
                        />
                        <button type="button" onClick={() => removeComponent(idx)} className="shrink-0 px-1 text-sm" aria-label="remove">
                          🗑️
                        </button>
                      </div>
                      <div className="mt-1.5 flex items-center gap-3">
                        <label className="flex items-center gap-1 text-xs text-muted">
                          {lang === 'he' ? 'ניקוד מקסימלי' : 'Max score'}
                          <input
                            type="number"
                            min={0}
                            value={c.maxScore}
                            onChange={(e) => updateComponent(idx, { maxScore: Number(e.target.value) })}
                            className="w-16 rounded-md border border-line bg-paper px-1.5 py-0.5 text-xs text-ink"
                          />
                        </label>
                        <label className="flex items-center gap-1 text-xs text-muted">
                          {lang === 'he' ? 'משקל %' : 'Weight %'}
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={c.weight}
                            onChange={(e) => updateComponent(idx, { weight: Number(e.target.value) })}
                            className="w-16 rounded-md border border-line bg-paper px-1.5 py-0.5 text-xs text-ink"
                          />
                        </label>
                        <label className="flex items-center gap-1 text-xs text-muted">
                          <input
                            type="checkbox"
                            checked={c.hasComment}
                            onChange={(e) => updateComponent(idx, { hasComment: e.target.checked })}
                            className="h-3.5 w-3.5 accent-[var(--primary)]"
                          />
                          {lang === 'he' ? 'שדה הערה' : 'Comment field'}
                        </label>
                        <label className="flex items-center gap-1 text-xs text-muted">
                          <input
                            type="checkbox"
                            checked={c.visibleToStudent}
                            onChange={(e) => updateComponent(idx, { visibleToStudent: e.target.checked })}
                            className="h-3.5 w-3.5 accent-[var(--primary)]"
                          />
                          {lang === 'he' ? 'גלוי לסטודנט' : 'Visible to student'}
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="rounded-lg border border-line bg-paper p-3">
            <label className="flex items-center justify-between">
              <span className="text-sm font-medium text-ink">
                {lang === 'he' ? 'שרשרת אישור מותאמת לאבן דרך זו' : 'Override chain for this milestone'}
              </span>
              <input
                type="checkbox"
                checked={overrideChain}
                onChange={(e) => setOverrideChain(e.target.checked)}
                className="h-4 w-4 accent-[var(--primary)]"
              />
            </label>
            {overrideChain ? (
              <div className="mt-2">
                <ChainEditor stages={routing} onChange={setRouting} committees={committees} />
              </div>
            ) : (
              <p className="mt-1.5 text-xs text-muted">
                {lang === 'he' ? 'ללא שינוי — ישתמש בשרשרת ברירת המחדל של התבנית.' : 'Unchanged — inherits the template\'s default chain.'}
              </p>
            )}
          </div>

          {error && <p className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">{error}</p>}

          <div className="mt-1 flex justify-end gap-2">
            <button type="button" onClick={onCancel} className="rounded-lg border border-line px-3.5 py-2 text-sm font-medium text-ink hover:bg-paper">
              {t('cancel')}
            </button>
            <button type="button" onClick={handleSave} className="rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-ink hover:bg-primary-hover">
              {t('save')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
