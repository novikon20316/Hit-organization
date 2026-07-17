'use client';

// app/faculty_admin/dashboard/EditUserModal.tsx
import { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/apiClient';
import { VALID_ROLES, VALID_FACULTY_IDS, type AppRole } from '@/lib/roles';
import { roleLabel, facultyLabel } from '@/lib/i18n';
import type { FacultyAdminUserRecord } from './types';

interface EditUserModalProps {
  user: FacultyAdminUserRecord;
  onClose: () => void;
  onSaved: () => void;
}

// Parent only mounts this when a user is selected, keyed by user.id — a
// fresh instance per user, so plain useState from props needs no
// reset-on-prop-change effect.
export function EditUserModal({ user, onClose, onSaved }: EditUserModalProps) {
  const { lang, t } = useLanguage();
  const [role, setRole] = useState<AppRole>(user.role);
  const [facultyId, setFacultyId] = useState<string>(user.facultyId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      await apiClient.updateUserPermissionsFacultyAdmin(user.id, { role, facultyId });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : lang === 'he' ? 'העדכון נכשל' : 'Update failed');
    } finally {
      setSaving(false);
    }
  };

  const inputCls = 'w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink focus:border-primary focus:bg-surface focus:outline-none';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-[var(--radius)] bg-surface p-6 shadow-lg">
        <h2 className="text-lg font-semibold text-ink">{lang === 'he' ? 'עריכת משתמש' : 'Edit User'}</h2>
        <p className="mt-1 text-sm text-muted">
          {user.displayName} — {user.email}
        </p>

        <div className="mt-4 grid gap-3">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink">{lang === 'he' ? 'תפקיד' : 'Role'}</span>
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
        </div>

        {error && <p className="mt-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>}

        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-line px-3.5 py-2 text-sm font-medium text-ink hover:bg-paper">
            {t('cancel')}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-ink hover:bg-primary-hover disabled:opacity-60"
          >
            {saving ? '…' : t('save')}
          </button>
        </div>
      </div>
    </div>
  );
}
