'use client';

// components/TeamSizeField.tsx
// Shared "how many students" control for every New/Edit Project modal
// (supervisor/faculty_admin/grad_school_head/administrative_coordinator/
// admin-panel NewProjectModal.tsx, coordinator's EditProjectModal.tsx).
// Every project defaults to a single student — a team-sized project (more
// common for bachelor's, uncommon for masters) is an explicit opt-in via the
// checkbox below, which reveals the group-size picker. Unchecking snaps the
// value back to 1. Derives `isTeam` from `value` itself rather than local
// state, so an Edit modal seeded with an existing maxStudents > 1 renders
// checked with no extra wiring, and a parent that resets its form state
// back to 1 after submit stays in sync automatically.

// Capped at 9 — realistically never reached, but the college wanted room
// above the old hard cap of 4 rather than a number tuned to "what's typical."
const TEAM_SIZE_OPTIONS = [2, 3, 4, 5, 6, 7, 8, 9];

interface TeamSizeFieldProps {
  value: number;
  onChange: (n: number) => void;
  lang: 'he' | 'en';
}

export function TeamSizeField({ value, onChange, lang }: TeamSizeFieldProps) {
  const isTeam = value > 1;

  return (
    <div className="block">
      <label className="flex items-center gap-1.5 text-sm font-medium text-ink">
        <input
          type="checkbox"
          checked={isTeam}
          onChange={(e) => onChange(e.target.checked ? TEAM_SIZE_OPTIONS[0] : 1)}
          className="h-4 w-4"
        />
        {lang === 'he' ? 'פרויקט זה מיועד לקבוצת סטודנטים' : 'This project is for a team of students'}
      </label>

      {isTeam ? (
        <div className="mt-2">
          <span className="mb-1.5 block text-sm font-medium text-ink">
            {lang === 'he' ? 'מספר הסטודנטים בקבוצה' : 'Students per group'}
          </span>
          <div className="flex flex-wrap gap-1.5">
            {TEAM_SIZE_OPTIONS.map((num) => (
              <button
                key={num}
                type="button"
                onClick={() => onChange(num)}
                className={`h-9 w-9 rounded-lg border text-sm font-medium ${
                  value === num ? 'border-primary bg-primary text-primary-ink' : 'border-line bg-paper text-ink'
                }`}
              >
                {num}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <p className="mt-1 text-xs text-muted">{lang === 'he' ? 'ברירת מחדל: סטודנט אחד בלבד.' : 'Default: a single student.'}</p>
      )}
    </div>
  );
}
