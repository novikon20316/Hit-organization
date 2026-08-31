'use client';

// components/staff/ManagedStaffTab.tsx
// Shared "Staff" tab body for faculty_admin/program_head/grad_school_head's
// own dashboards — list + search/filter, "+ New Staff", per-row Edit
// (role/faculty/permissions) and active-toggle. Reuses the exact same
// modals system_admin's panel already has (NewUserModal/EditUserModal,
// which now accept an optional `scope` to narrow themselves for a
// delegate) rather than forking a parallel set — see
// server/src/config/permissionScopes.ts's DELEGATE_ADMIN_ROLES for the
// three roles this powers, and adminController.ts's createAdminUser/
// updateUserRoleAdmin for the matching server-side scope enforcement.

import { useMemo, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/apiClient';
import { roleLabel, facultyLabel } from '@/lib/i18n';
import type { AppRole, FacultyId } from '@/lib/roles';
import type { ActionType } from '@/lib/permissions';
import { NewUserModal } from '@/app/admin/panel/NewUserModal';
import { EditUserModal } from '@/app/admin/panel/EditUserModal';
import type { AdminUserRecord } from '@/app/admin/panel/types';

export interface ManagedStaffScope {
  selectableRoles: AppRole[];
  /** Omit for grad_school_head — cross-faculty, so staff can be created in
   *  (and edited into) any faculty. Set for faculty_admin/program_head. */
  lockedFacultyId?: string;
  restrictedActions?: ActionType[];
}

interface ManagedStaffTabProps {
  staff: AdminUserRecord[];
  onRefresh: () => void;
  scope: ManagedStaffScope;
}

const selectCls = 'rounded-lg border border-line bg-surface px-3 py-1.5 text-sm text-ink focus:border-primary focus:outline-none';
const inputCls = 'rounded-lg border border-line bg-surface px-3.5 py-2 text-sm text-ink focus:border-primary focus:outline-none';

export function ManagedStaffTab({ staff, onRefresh, scope }: ManagedStaffTabProps) {
  const { lang, t } = useLanguage();
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | AppRole>('all');
  const [showNew, setShowNew] = useState(false);
  const [editingUser, setEditingUser] = useState<AdminUserRecord | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return staff.filter((u) => {
      const searchOk = !q || u.displayName?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q);
      const roleOk = roleFilter === 'all' || u.role === roleFilter || (u.roles ?? []).includes(roleFilter);
      return searchOk && roleOk;
    });
  }, [staff, search, roleFilter]);

  const handleToggleActive = async (user: AdminUserRecord) => {
    setTogglingId(user.id);
    setError('');
    try {
      await apiClient.toggleUserActiveFacultyAdmin(user.id, !user.isActive);
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : lang === 'he' ? 'הפעולה נכשלה' : 'Action failed');
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={lang === 'he' ? 'חפש איש סגל...' : 'Search staff...'}
          className={`${inputCls} w-full max-w-sm`}
        />
        <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as typeof roleFilter)} className={selectCls}>
          <option value="all">{lang === 'he' ? 'כל התפקידים' : 'All roles'}</option>
          {scope.selectableRoles.map((r) => (
            <option key={r} value={r}>
              {roleLabel(r, lang)}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setShowNew(true)}
          className="ms-auto rounded-full bg-primary px-4 py-1.5 text-sm font-semibold text-primary-ink hover:bg-primary-hover"
        >
          + {lang === 'he' ? 'איש סגל חדש' : 'New Staff'}
        </button>
      </div>

      {error && <p className="mb-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">{error}</p>}

      <div className="grid gap-3 sm:grid-cols-2">
        {filtered.map((u) => (
          <div key={u.id} className="rounded-[var(--radius)] border border-line bg-surface p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink">{u.displayName}</p>
                <p className="truncate text-xs text-muted" dir="ltr">
                  {u.email}
                </p>
              </div>
              <span
                className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  u.isActive === false ? 'bg-danger-bg text-danger' : 'bg-primary/10 text-primary'
                }`}
              >
                {u.isActive === false ? (lang === 'he' ? 'מושבת' : 'Inactive') : lang === 'he' ? 'פעיל' : 'Active'}
              </span>
            </div>

            <div className="mt-2 flex flex-wrap gap-1.5 text-xs text-muted">
              <span className="rounded-full bg-paper px-2 py-0.5">{roleLabel(u.role, lang)}</span>
              {!scope.lockedFacultyId && (
                <span className="rounded-full bg-paper px-2 py-0.5">{facultyLabel(u.facultyId as FacultyId, lang)}</span>
              )}
              {!!u.permissionRules?.length && (
                <span className="rounded-full bg-paper px-2 py-0.5">
                  🔐 {u.permissionRules.length} {lang === 'he' ? 'הרשאות' : 'grants'}
                </span>
              )}
            </div>

            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => setEditingUser(u)}
                className="flex-1 rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink hover:border-primary hover:text-primary"
              >
                ✏️ {lang === 'he' ? 'ערוך' : 'Edit'}
              </button>
              <button
                type="button"
                onClick={() => handleToggleActive(u)}
                disabled={togglingId === u.id}
                className="flex-1 rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink hover:border-primary hover:text-primary disabled:opacity-60"
              >
                {togglingId === u.id
                  ? '…'
                  : u.isActive === false
                    ? `🔓 ${lang === 'he' ? 'הפעל' : 'Activate'}`
                    : `🔒 ${lang === 'he' ? 'השבת' : 'Deactivate'}`}
              </button>
            </div>
          </div>
        ))}
        {filtered.length === 0 && <p className="text-sm text-muted">{t('noData')}</p>}
      </div>

      {showNew && (
        <NewUserModal
          open={showNew}
          onClose={() => setShowNew(false)}
          onCreated={() => {
            setShowNew(false);
            onRefresh();
          }}
          scope={{ selectableRoles: scope.selectableRoles, lockedFacultyId: scope.lockedFacultyId }}
        />
      )}
      {editingUser && (
        <EditUserModal
          key={editingUser.id}
          user={editingUser}
          onClose={() => setEditingUser(null)}
          onSaved={onRefresh}
          scope={scope}
        />
      )}
    </div>
  );
}
