'use client';

// app/faculty_admin/dashboard/EditUserModal.tsx
import { useEffect, useRef, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/apiClient';
import { VALID_ROLES, VALID_FACULTY_IDS, type AppRole } from '@/lib/roles';
import { roleLabel, facultyLabel } from '@/lib/i18n';
import { useModalA11y } from '@/hooks/useModalA11y';
import type { FacultyAdminUserRecord, StudentStatusConfig } from './types';

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

  // Student status — options come from the shared admin-manageable lists
  // (managed by system_admin only); fetched once when this modal opens.
  // faculty_admin can set status here, but only server-enforced within
  // their own faculty (a 403 comes back otherwise).
  const [statusConfig, setStatusConfig] = useState<StudentStatusConfig>({ primary: [], secondary: [] });
  const [primaryStatus, setPrimaryStatus] = useState<string>(user.primaryStatus ?? '');
  const [secondaryStatus, setSecondaryStatus] = useState<string>(user.secondaryStatus ?? '');
  const isStudent = role === 'student';
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalA11y(dialogRef, true, onClose);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .getStudentStatusOptions()
      .then((res) => {
        if (!cancelled) setStatusConfig(res);
      })
      .catch(() => {
        // Non-fatal — the dropdowns just stay empty aside from "— none —".
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      await apiClient.updateUserPermissionsFacultyAdmin(user.id, { role, facultyId });

      if (isStudent) {
        const primaryChanged = (user.primaryStatus ?? '') !== primaryStatus;
        const secondaryChanged = (user.secondaryStatus ?? '') !== secondaryStatus;
        if (primaryChanged || secondaryChanged) {
          await apiClient.setStudentStatus(user.id, {
            primaryStatus: primaryStatus || null,
            secondaryStatus: secondaryStatus || null,
          });
        }
      }

      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : lang === 'he' ? 'העדכון נכשל' : 'Update failed');
    } finally {
      setSaving(false);
    }
  };

  const inputCls = 'w-full rounded-lg border border-faculty-admin-outline-variant bg-faculty-admin-surface-container-low px-3 py-2 text-sm text-faculty-admin-on-surface focus:border-faculty-admin-primary focus:bg-faculty-admin-surface-container-lowest focus:outline-none';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        className="w-full max-w-sm rounded-faculty-admin bg-faculty-admin-surface-container-lowest p-6 shadow-lg outline-none"
      >
        <h2 className="text-lg font-semibold text-faculty-admin-on-surface">{lang === 'he' ? 'עריכת משתמש' : 'Edit User'}</h2>
        <p className="mt-1 text-sm text-faculty-admin-on-surface-variant">
          {user.displayName} — {user.email}
        </p>

        <div className="mt-4 grid gap-3">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-faculty-admin-on-surface">{lang === 'he' ? 'תפקיד' : 'Role'}</span>
            <select value={role} onChange={(e) => setRole(e.target.value as AppRole)} className={inputCls}>
              {VALID_ROLES.map((r) => (
                <option key={r} value={r}>
                  {roleLabel(r, lang)}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-faculty-admin-on-surface">{lang === 'he' ? 'פקולטה' : 'Faculty'}</span>
            <select value={facultyId} onChange={(e) => setFacultyId(e.target.value)} className={inputCls}>
              {VALID_FACULTY_IDS.map((id) => (
                <option key={id} value={id}>
                  {facultyLabel(id, lang)}
                </option>
              ))}
            </select>
          </label>

          {isStudent && (
            <>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-faculty-admin-on-surface">{lang === 'he' ? 'סטטוס ראשי' : 'Primary Status'}</span>
                <select value={primaryStatus} onChange={(e) => setPrimaryStatus(e.target.value)} className={inputCls}>
                  <option value="">{lang === 'he' ? '— ללא —' : '— none —'}</option>
                  {statusConfig.primary.map((o) => (
                    <option key={o.key} value={o.key}>
                      {lang === 'he' ? o.labelHe : o.labelEn}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-faculty-admin-on-surface">{lang === 'he' ? 'סטטוס משני' : 'Secondary Status'}</span>
                <select value={secondaryStatus} onChange={(e) => setSecondaryStatus(e.target.value)} className={inputCls}>
                  <option value="">{lang === 'he' ? '— ללא —' : '— none —'}</option>
                  {statusConfig.secondary.map((o) => (
                    <option key={o.key} value={o.key}>
                      {lang === 'he' ? o.labelHe : o.labelEn}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
        </div>

        {error && <p className="mt-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">{error}</p>}

        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-faculty-admin-outline-variant px-3.5 py-2 text-sm font-medium text-faculty-admin-on-surface hover:bg-faculty-admin-surface-container-low">
            {t('cancel')}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-faculty-admin-primary px-3.5 py-2 text-sm font-semibold text-faculty-admin-on-primary hover:opacity-90 disabled:opacity-60"
          >
            {saving ? '…' : t('save')}
          </button>
        </div>
      </div>
    </div>
  );
}
