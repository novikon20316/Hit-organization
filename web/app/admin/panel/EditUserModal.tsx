'use client';

// app/admin/panel/EditUserModal.tsx
// Ported from mobile's EditUserModal + panel.tsx's handleSaveUser. Same
// endpoint, same payload: { role, roles, facultyId } via role-update.

import { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/apiClient';
import { VALID_ROLES, VALID_FACULTY_IDS, type AppRole } from '@/lib/roles';
import { roleLabel, facultyLabel } from '@/lib/i18n';
import type { AdminUserRecord } from './types';

interface EditUserModalProps {
  user: AdminUserRecord;
  onClose: () => void;
  onSaved: () => void;
}

// Rendered by the parent with `key={user.id}` (only when a user is actually
// being edited) so a different user means a fresh mount of this component —
// that's what lets the form fields below initialize straight from props
// with plain useState, no reset-on-prop-change effect required.
export function EditUserModal({ user, onClose, onSaved }: EditUserModalProps) {
  const { lang } = useLanguage();
  const [role, setRole] = useState<AppRole>(user.role);
  const [additionalRoles, setAdditionalRoles] = useState<AppRole[]>(
    user.roles?.length ? user.roles.filter((r) => r !== user.role) : []
  );
  const [facultyId, setFacultyId] = useState<string>(user.facultyId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const toggleAdditionalRole = (r: AppRole) => {
    setAdditionalRoles((prev) => (prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]));
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      await apiClient.updateUserRoleAdmin(user.id, {
        role,
        roles: [role, ...additionalRoles.filter((r) => r !== role)],
        facultyId,
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : lang === 'he' ? 'עדכון המשתמש נכשל' : 'Failed to update user');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[var(--radius)] bg-surface p-6 shadow-lg">
        <h2 className="text-lg font-semibold text-ink">{lang === 'he' ? 'עריכת משתמש' : 'Edit User'}</h2>
        <p className="mt-1 text-sm text-muted">{user.displayName} — {user.email}</p>

        <div className="mt-4 grid gap-4">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink">{lang === 'he' ? 'תפקיד ראשי' : 'Primary Role'}</span>
            <select value={role} onChange={(e) => setRole(e.target.value as AppRole)} className={inputCls}>
              {VALID_ROLES.map((r) => (
                <option key={r} value={r}>
                  {roleLabel(r, lang)}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink">{lang === 'he' ? 'פקולטה' : 'Faculty'}</span>
            <select value={facultyId} onChange={(e) => setFacultyId(e.target.value)} className={inputCls}>
              {VALID_FACULTY_IDS.map((id) => (
                <option key={id} value={id}>
                  {facultyLabel(id, lang)}
                </option>
              ))}
            </select>
          </label>

          <div>
            <span className="mb-1.5 block text-sm font-medium text-ink">
              {lang === 'he' ? 'תפקידים נוספים (אופציונלי)' : 'Additional Roles (optional)'}
            </span>
            <div className="flex flex-wrap gap-2">
              {VALID_ROLES.filter((r) => r !== role).map((r) => {
                const checked = additionalRoles.includes(r);
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => toggleAdditionalRole(r)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                      checked ? 'border-primary bg-primary text-primary-ink' : 'border-line bg-paper text-ink hover:border-primary'
                    }`}
                  >
                    {roleLabel(r, lang)}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {error && <p className="mt-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>}

        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-line px-3.5 py-2 text-sm font-medium text-ink hover:bg-paper">
            {lang === 'he' ? 'ביטול' : 'Cancel'}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-ink hover:bg-primary-hover disabled:opacity-60"
          >
            {saving ? '…' : lang === 'he' ? 'שמור' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

const inputCls = 'w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink focus:border-primary focus:bg-surface focus:outline-none';
