'use client';

// components/FacultyCheckboxes.tsx
// Shared faculty multi-select for the Add Project flow — options are
// whichever faculties the logged-in staff member is actually authorized to
// add_projects in (GET /api/permissions/my-grants, see
// scopeAuthorization.ts's grantedFacultyIdsFor), not every faculty in the
// institution. Used by every Add Project modal that allows multi-faculty
// selection (admin/panel, faculty_admin, administrative_secretary,
// grad_school_head dashboards) — supervisor's own modal stays locked/single
// and doesn't use this.

import { useEffect, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/apiClient';
import { facultyLabel, type FacultyId } from '@/lib/i18n';

interface Props {
  selected: string[];
  onChange: (facultyIds: string[]) => void;
}

export function FacultyCheckboxes({ selected, onChange }: Props) {
  const { lang } = useLanguage();
  const [options, setOptions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .getMyGrants('add_projects')
      .then((r) => {
        if (!cancelled) setOptions(r.facultyIds);
      })
      .catch(() => {
        if (!cancelled) setOptions([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = (facultyId: string) => {
    onChange(selected.includes(facultyId) ? selected.filter((id) => id !== facultyId) : [...selected, facultyId]);
  };

  if (loading) return <p className="text-sm text-muted">…</p>;
  if (options.length === 0) {
    return <p className="text-sm text-danger">{lang === 'he' ? 'אין לך הרשאה ליצור פרויקטים באף פקולטה.' : "You aren't authorized to create projects in any faculty."}</p>;
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      {options.map((facultyId) => (
        <label key={facultyId} className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" checked={selected.includes(facultyId)} onChange={() => toggle(facultyId)} className="h-4 w-4" />
          {facultyLabel(facultyId as FacultyId, lang)}
        </label>
      ))}
    </div>
  );
}
