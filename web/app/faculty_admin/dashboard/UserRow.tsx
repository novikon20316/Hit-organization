'use client';

// app/faculty_admin/dashboard/UserRow.tsx
import { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/apiClient';
import { getRoleAccent, withAlpha } from '@/lib/facultyColors';
import { roleLabel, facultyLabel, type AppRole, type FacultyId } from '@/lib/i18n';
import { staffFacultyMajorLabel } from '@/lib/permissions';
import type { FacultyAdminUserRecord, StudentStatusConfig } from './types';

interface UserRowProps {
  user: FacultyAdminUserRecord;
  statusConfig: StudentStatusConfig;
  onChanged: () => void;
  onEdit: (user: FacultyAdminUserRecord) => void;
}

export function UserRow({ user, statusConfig, onChanged, onEdit }: UserRowProps) {
  const { lang } = useLanguage();
  const roleColor = getRoleAccent(user.role);
  const [toggling, setToggling] = useState(false);
  const [error, setError] = useState('');

  // Status badges are student-only, and only shown once actually set —
  // omit entirely rather than showing an empty/placeholder badge.
  const isStudent = user.role === 'student' || (user.roles ?? []).includes('student');
  const primaryStatusOption = isStudent && user.primaryStatus ? statusConfig.primary.find((o) => o.key === user.primaryStatus) : undefined;
  const secondaryStatusOption = isStudent && user.secondaryStatus ? statusConfig.secondary.find((o) => o.key === user.secondaryStatus) : undefined;

  // Every staff role but system_admin has a real faculty, and a supervisor/
  // secondary_supervisor may additionally be restricted to specific majors
  // within it — surface both under the role badge (see permissions.ts's
  // staffFacultyMajorLabel).
  const isSystemAdmin = user.role === 'system_admin' || (user.roles ?? []).includes('system_admin');
  const facultyMajorLine = !isStudent && !isSystemAdmin
    ? staffFacultyMajorLabel(user.facultyId, user.assignedMajors, lang, (id) => facultyLabel(id as FacultyId, lang))
    : null;

  const handleToggle = async () => {
    setToggling(true);
    setError('');
    try {
      await apiClient.toggleUserActiveFacultyAdmin(user.id, !user.isActive);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update status');
    } finally {
      setToggling(false);
    }
  };

  return (
    <div className="rounded-faculty-admin border border-faculty-admin-outline-variant bg-faculty-admin-surface-container-lowest p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white" style={{ backgroundColor: roleColor }}>
          {user.displayName.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-faculty-admin-on-surface">{user.displayName}</p>
          <p className="truncate text-xs text-faculty-admin-on-surface-variant" dir="ltr">
            {user.email}
          </p>
        </div>
        <label className="inline-flex shrink-0 cursor-pointer items-center gap-2">
          <span className="text-xs text-faculty-admin-on-surface-variant">{user.isActive ? (lang === 'he' ? 'פעיל' : 'Active') : lang === 'he' ? 'מושבת' : 'Suspended'}</span>
          <span className="relative inline-block h-5 w-9">
            <input type="checkbox" checked={user.isActive} disabled={toggling} onChange={handleToggle} className="peer absolute h-0 w-0 opacity-0" />
            <span className="absolute inset-0 rounded-full bg-faculty-admin-outline-variant transition-colors peer-checked:bg-faculty-admin-primary peer-disabled:opacity-60" />
            <span className="absolute top-0.5 start-0.5 h-4 w-4 rounded-full bg-white transition-transform peer-checked:translate-x-4 rtl:peer-checked:-translate-x-4" />
          </span>
        </label>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <div className="flex flex-col items-start gap-0.5">
          <span className="rounded-full px-2.5 py-1 text-xs font-medium" style={{ backgroundColor: withAlpha(roleColor, 0.12), color: roleColor }}>
            {roleLabel(user.role as AppRole, lang)}
          </span>
          {facultyMajorLine && <span className="px-2.5 text-[11px] text-faculty-admin-on-surface-variant">{facultyMajorLine}</span>}
        </div>
        <button type="button" onClick={() => onEdit(user)} className="rounded-full border border-faculty-admin-outline-variant px-3 py-1.5 text-xs font-medium text-faculty-admin-on-surface hover:border-faculty-admin-primary hover:text-faculty-admin-primary">
          ✏️ {lang === 'he' ? 'ערוך' : 'Edit'}
        </button>
      </div>

      {(primaryStatusOption || secondaryStatusOption) && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {primaryStatusOption && (
            <span className="rounded-full bg-[#EEF2FF] px-2.5 py-1 text-xs font-medium text-[#4338CA]">
              🎯 {lang === 'he' ? primaryStatusOption.labelHe : primaryStatusOption.labelEn}
            </span>
          )}
          {secondaryStatusOption && (
            <span className="rounded-full bg-[#F0FDF4] px-2.5 py-1 text-xs font-medium text-[#15803D]">
              ▫️ {lang === 'he' ? secondaryStatusOption.labelHe : secondaryStatusOption.labelEn}
            </span>
          )}
        </div>
      )}

      {error && <p className="mt-2 rounded-md bg-danger-bg px-2.5 py-1.5 text-xs text-danger" role="alert">{error}</p>}
    </div>
  );
}
