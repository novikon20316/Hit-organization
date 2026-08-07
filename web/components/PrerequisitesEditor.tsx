'use client';

// components/PrerequisitesEditor.tsx
// Repeatable subject + optional minimum-grade rows for a project's
// prerequisites — shared by every "Add New Project" modal (supervisor,
// faculty_admin, grad_school_head, administrative_coordinator, system_admin)
// so a project can require e.g. "Computer Science, minimum grade 80" instead
// of just a bare course name. minGrade is per-subject and optional — a
// subject with no grade set just means "must have taken this course," no
// threshold. See server/src/services/cvScreeningService.ts, which reads
// minGrade into its AI screening prompt.

export interface PrerequisiteSpec {
  subject: string;
  minGrade?: number;
}

interface PrerequisitesEditorProps {
  lang: 'he' | 'en';
  value: PrerequisiteSpec[];
  onChange: (next: PrerequisiteSpec[]) => void;
}

export function PrerequisitesEditor({ lang, value, onChange }: PrerequisitesEditorProps) {
  const updateRow = (idx: number, patch: Partial<PrerequisiteSpec>) => {
    onChange(value.map((row, i) => (i === idx ? { ...row, ...patch } : row)));
  };
  const removeRow = (idx: number) => onChange(value.filter((_, i) => i !== idx));
  const addRow = () => onChange([...value, { subject: '' }]);

  const inputCls = 'w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink focus:border-primary focus:bg-surface focus:outline-none';

  return (
    <div className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink">
        {lang === 'he' ? 'קורסי דרישת קדם' : 'Prerequisites'}
      </span>
      <p className="mb-1.5 text-xs text-muted">
        {lang === 'he'
          ? 'לכל קורס ניתן להוסיף ציון מינימלי נדרש (אופציונלי) — למשל "מדעי המחשב" עם ציון מינימלי 80.'
          : 'Each course can optionally have a minimum grade — e.g. "Computer Science" with a minimum grade of 80.'}
      </p>
      <div className="grid gap-2">
        {value.map((row, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <input
              value={row.subject}
              onChange={(e) => updateRow(idx, { subject: e.target.value })}
              placeholder={lang === 'he' ? 'שם הקורס' : 'Course name'}
              className={`flex-1 ${inputCls}`}
            />
            <input
              type="number"
              min={0}
              max={100}
              value={row.minGrade ?? ''}
              onChange={(e) => updateRow(idx, { minGrade: e.target.value === '' ? undefined : Number(e.target.value) })}
              placeholder={lang === 'he' ? 'ציון מינ׳' : 'Min grade'}
              className={`w-24 shrink-0 ${inputCls}`}
            />
            <button type="button" onClick={() => removeRow(idx)} className="shrink-0 px-1 text-sm" aria-label="remove">
              🗑️
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={addRow}
        className="mt-2 rounded-md bg-primary px-2.5 py-1 text-xs font-semibold text-primary-ink hover:bg-primary-hover"
      >
        ＋ {lang === 'he' ? 'הוסף קורס' : 'Add course'}
      </button>
    </div>
  );
}
