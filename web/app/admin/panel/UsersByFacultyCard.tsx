'use client';

// app/admin/panel/UsersByFacultyCard.tsx
// Overview-tab companion to the "Projects by Faculty" bars — same visual
// language, but over all users, and each faculty row expands into a
// per-department (major) breakdown. Only students carry a `major`, so staff
// and anyone else without one land in that faculty's "no department" row
// rather than being silently dropped from the breakdown.

import { useMemo, useState } from 'react';
import { facultyLabel, type FacultyId } from '@/lib/i18n';
import { getFacultyColor } from '@/lib/facultyColors';
import { majorsForFaculty } from '@/lib/permissions';
import { VALID_FACULTY_IDS } from '@/lib/roles';
import type { AdminUserRecord } from './types';

const DISPLAYED_FACULTIES = VALID_FACULTY_IDS.filter((id) => id !== 'all');

interface DepartmentRow {
  key: string;
  label: string;
  count: number;
}

export function UsersByFacultyCard({ users, lang }: { users: AdminUserRecord[]; lang: 'he' | 'en' }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const { rows, noFacultyCount } = useMemo(() => {
    const byFaculty = new Map<string, AdminUserRecord[]>();
    let noFaculty = 0;
    for (const u of users) {
      if (u.facultyId && (DISPLAYED_FACULTIES as string[]).includes(u.facultyId)) {
        const list = byFaculty.get(u.facultyId) ?? [];
        list.push(u);
        byFaculty.set(u.facultyId, list);
      } else {
        noFaculty += 1;
      }
    }

    const facultyRows = DISPLAYED_FACULTIES.map((id) => {
      const members = byFaculty.get(id) ?? [];
      const labelBySlug = new Map(majorsForFaculty(id).map((m) => [m.slug, m.label[lang]]));
      const counts = new Map<string, number>();
      let withoutMajor = 0;
      for (const u of members) {
        if (u.major) counts.set(u.major, (counts.get(u.major) ?? 0) + 1);
        else withoutMajor += 1;
      }
      const departments: DepartmentRow[] = [...counts.entries()]
        .map(([slug, count]) => ({ key: slug, label: labelBySlug.get(slug) ?? slug, count }))
        .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
      if (withoutMajor > 0) {
        departments.push({
          key: '__none__',
          label: lang === 'he' ? 'ללא מחלקה (סגל וכו׳)' : 'No department (staff, etc.)',
          count: withoutMajor,
        });
      }
      return { id, count: members.length, departments };
    }).filter((r) => r.count > 0);

    return { rows: facultyRows, noFacultyCount: noFaculty };
  }, [users, lang]);

  const total = Math.max(users.length, 1);

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="rounded-admin-lg border border-admin-outline-variant bg-admin-surface p-5">
      <h2 className="mb-1 text-sm font-semibold text-admin-on-surface">👥 {lang === 'he' ? 'משתמשים לפי פקולטה' : 'Users by Faculty'}</h2>
      <p className="mb-4 text-xs text-admin-on-surface-variant">
        {lang === 'he' ? 'לחצו על פקולטה כדי לראות פילוח לפי מחלקה' : 'Click a faculty to see its breakdown by department'}
      </p>
      <div className="grid gap-3">
        {rows.map(({ id, count, departments }) => {
          const color = getFacultyColor(id);
          const isOpen = expanded.has(id);
          return (
            <div key={id} className="grid gap-2">
              <button
                type="button"
                onClick={() => toggle(id)}
                aria-expanded={isOpen}
                className="flex items-center gap-3 rounded text-start hover:bg-admin-surface-container/50"
              >
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                <span className="w-40 shrink-0 truncate text-sm text-admin-on-surface">{facultyLabel(id as FacultyId, lang)}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-admin-surface-container">
                  <div className="h-full rounded-full" style={{ width: `${(count / total) * 100}%`, backgroundColor: color }} />
                </div>
                <span className="w-6 shrink-0 text-end text-sm text-admin-on-surface-variant">{count}</span>
                <span className={`w-3 shrink-0 text-xs text-admin-on-surface-variant transition-transform ${isOpen ? 'rotate-90' : 'rtl:rotate-180'}`}>▸</span>
              </button>
              {isOpen && (
                <div className="grid gap-2 ps-5">
                  {departments.map((d) => (
                    <div key={d.key} className="flex items-center gap-3">
                      <span className="w-[9.5rem] shrink-0 truncate text-xs text-admin-on-surface-variant" title={d.label}>{d.label}</span>
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-admin-surface-container">
                        <div
                          className="h-full rounded-full opacity-70"
                          style={{ width: `${(d.count / Math.max(count, 1)) * 100}%`, backgroundColor: color }}
                        />
                      </div>
                      <span className="w-6 shrink-0 text-end text-xs text-admin-on-surface-variant">{d.count}</span>
                      <span className="w-3 shrink-0" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {noFacultyCount > 0 && (
          <div className="flex items-center gap-3">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: getFacultyColor(undefined) }} />
            <span className="w-40 shrink-0 truncate text-sm text-admin-on-surface">
              {lang === 'he' ? 'ללא פקולטה (כלל-מערכתי)' : 'No faculty (system-wide)'}
            </span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-admin-surface-container">
              <div className="h-full rounded-full" style={{ width: `${(noFacultyCount / total) * 100}%`, backgroundColor: getFacultyColor(undefined) }} />
            </div>
            <span className="w-6 shrink-0 text-end text-sm text-admin-on-surface-variant">{noFacultyCount}</span>
            <span className="w-3 shrink-0" />
          </div>
        )}
        {users.length === 0 && <p className="text-sm text-admin-on-surface-variant">{lang === 'he' ? 'אין משתמשים עדיין' : 'No users yet'}</p>}
      </div>
    </div>
  );
}
