'use client';

// components/SupervisorCheckboxes.tsx
// Faculty-gated supervisor multi-select for the Add Project flow — a project
// can now have more than one supervisor (e.g. a primary + secondary), so
// this is a checkbox list rather than a single <select>, mirroring
// FacultyCheckboxes' look. Unlike FacultyCheckboxes, this doesn't own its own
// fetch: the parent modal already needs the raw SupervisorOption objects
// (assignedMajors) to narrow its major picker, so the fetch stays there and
// this component just renders whatever options it's given. No faculty
// selected yet -> no options rendered at all (a supervisor is only ever
// scoped to a faculty, so there's nothing valid to offer before then).

import { useLanguage } from '@/contexts/LanguageContext';

export interface SupervisorOption {
  id: string;
  displayName: string;
  /** Present when that supervisor is restricted to specific majors within
   *  their own faculty — see server/src/controllers/adminController.ts. */
  assignedMajors?: string[];
}

interface Props {
  facultyIds: string[];
  options: SupervisorOption[];
  loading: boolean;
  selected: string[];
  onChange: (supervisorIds: string[]) => void;
}

export function SupervisorCheckboxes({ facultyIds, options, loading, selected, onChange }: Props) {
  const { lang } = useLanguage();

  const toggle = (id: string) => {
    onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);
  };

  if (facultyIds.length === 0) {
    return <p className="text-sm text-muted">{lang === 'he' ? 'יש לבחור פקולטה תחילה' : 'Select a faculty first'}</p>;
  }
  if (loading) return <p className="text-sm text-muted">…</p>;
  if (options.length === 0) {
    return <p className="text-sm text-muted">{lang === 'he' ? 'אין מנחים זמינים בפקולטות שנבחרו' : 'No supervisors available in the selected faculty/ies'}</p>;
  }

  return (
    <div className="grid gap-2">
      {options.map((s) => (
        <label key={s.id} className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" checked={selected.includes(s.id)} onChange={() => toggle(s.id)} className="h-4 w-4" />
          {s.displayName}
        </label>
      ))}
    </div>
  );
}
