'use client';

// app/admin/panel/UserRow.tsx
// Ported from the `activeTab === 'users'` card in mobile's panel.tsx.

import { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/apiClient';
import { getFacultyColor, getRoleAccent, withAlpha } from '@/lib/facultyColors';
import { roleLabel, type AppRole } from '@/lib/i18n';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import type { AdminUserRecord, StudentStatusConfig } from './types';

interface UserRowProps {
  user: AdminUserRecord;
  statusConfig: StudentStatusConfig;
  onChanged: () => void;
  onEdit: (user: AdminUserRecord) => void;
}

export function UserRow({ user, statusConfig, onChanged, onEdit }: UserRowProps) {
  const { lang } = useLanguage();
  const facultyColor = getFacultyColor(user.facultyId);
  const roleColor = getRoleAccent(user.role);

  // Status badges are student-only, and only shown once actually set —
  // omit entirely rather than showing an empty/placeholder badge.
  const isStudent = user.role === 'student' || (user.roles ?? []).includes('student');
  const primaryStatusOption = isStudent && user.primaryStatus ? statusConfig.primary.find((o) => o.key === user.primaryStatus) : undefined;
  const secondaryStatusOption = isStudent && user.secondaryStatus ? statusConfig.secondary.find((o) => o.key === user.secondaryStatus) : undefined;

  const [togglingActive, setTogglingActive] = useState(false);
  const [confirmDisable2fa, setConfirmDisable2fa] = useState(false);
  const [disabling2fa, setDisabling2fa] = useState(false);
  const [confirmErase, setConfirmErase] = useState(false);
  const [erasing, setErasing] = useState(false);
  const [rowError, setRowError] = useState('');
  const [confirmResetPassword, setConfirmResetPassword] = useState(false);
  const [resettingPassword, setResettingPassword] = useState(false);
  const [resetTempPassword, setResetTempPassword] = useState<string | null>(null);
  const [copiedResetPassword, setCopiedResetPassword] = useState(false);

  const handleToggleActive = async () => {
    setTogglingActive(true);
    setRowError('');
    try {
      await apiClient.toggleUserStatusAdmin(user.id, !user.isActive);
      onChanged();
    } catch (err) {
      setRowError(err instanceof Error ? err.message : 'Failed to update status');
    } finally {
      setTogglingActive(false);
    }
  };

  const handleDisable2fa = async () => {
    setDisabling2fa(true);
    try {
      await apiClient.disableUser2FA(user.id);
      setConfirmDisable2fa(false);
      onChanged();
    } catch (err) {
      setRowError(err instanceof Error ? err.message : 'Failed to disable 2FA');
    } finally {
      setDisabling2fa(false);
    }
  };

  const handleErase = async () => {
    setErasing(true);
    try {
      await apiClient.eraseUserBySystemAdmin(user.id);
      setConfirmErase(false);
      onChanged();
    } catch (err) {
      setRowError(err instanceof Error ? err.message : 'Failed to erase user');
      setConfirmErase(false);
    } finally {
      setErasing(false);
    }
  };

  const handleResetPassword = async () => {
    setResettingPassword(true);
    setRowError('');
    try {
      const result = await apiClient.resetUserPasswordAdmin(user.id);
      setResetTempPassword(result.tempPassword);
      setConfirmResetPassword(false);
    } catch (err) {
      setRowError(err instanceof Error ? err.message : 'Failed to reset password');
      setConfirmResetPassword(false);
    } finally {
      setResettingPassword(false);
    }
  };

  const handleCopyResetPassword = async () => {
    if (!resetTempPassword) return;
    try {
      await navigator.clipboard.writeText(resetTempPassword);
      setCopiedResetPassword(true);
      setTimeout(() => setCopiedResetPassword(false), 2000);
    } catch {
      // Clipboard API unavailable/denied — the value is still visible on
      // screen for the admin to select and copy manually.
    }
  };

  return (
    <div className="role-rail rounded-[var(--radius)] border border-line bg-surface p-4" style={{ '--rail-color': facultyColor } as React.CSSProperties}>
      <div className="flex items-center gap-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
          style={{ backgroundColor: facultyColor }}
        >
          {(user.displayName || '?').charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink">{user.displayName}</p>
          <p className="truncate text-xs text-muted" dir="ltr">
            {user.email}
          </p>
        </div>
        <label className="inline-flex shrink-0 cursor-pointer items-center gap-2">
          <span className="text-xs text-muted">{user.isActive ? (lang === 'he' ? 'פעיל' : 'Active') : lang === 'he' ? 'מושבת' : 'Suspended'}</span>
          <span className="relative inline-block h-5 w-9">
            <input
              type="checkbox"
              checked={user.isActive}
              disabled={togglingActive}
              onChange={handleToggleActive}
              className="peer absolute h-0 w-0 opacity-0"
            />
            <span className="absolute inset-0 rounded-full bg-line transition-colors peer-checked:bg-primary peer-disabled:opacity-60" />
            <span className="absolute top-0.5 start-0.5 h-4 w-4 rounded-full bg-white transition-transform peer-checked:translate-x-4 rtl:peer-checked:-translate-x-4" />
          </span>
        </label>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <span
          className="rounded-full px-2.5 py-1 text-xs font-medium"
          style={{ backgroundColor: withAlpha(roleColor, 0.12), color: roleColor }}
        >
          {roleLabel(user.role as AppRole, lang)}
        </span>
        <span
          className="rounded-full px-2.5 py-1 text-xs font-medium"
          style={
            user.totp_enabled
              ? { backgroundColor: 'var(--success-bg)', color: 'var(--success)' }
              : { backgroundColor: '#F1F5F9', color: '#94A3B8' }
          }
        >
          {user.totp_enabled ? (lang === 'he' ? '🔐 2FA פעיל' : '🔐 2FA On') : lang === 'he' ? '🔓 2FA כבוי' : '🔓 2FA Off'}
        </span>

        <div className="ms-auto flex gap-1.5">
          {user.totp_enabled && (
            <button
              type="button"
              onClick={() => setConfirmDisable2fa(true)}
              className="rounded-full border border-line px-3 py-1.5 text-xs font-medium text-ink hover:border-accent hover:text-accent"
            >
              🔓 {lang === 'he' ? 'בטל 2FA' : 'Disable 2FA'}
            </button>
          )}
          <button
            type="button"
            onClick={() => setConfirmResetPassword(true)}
            className="rounded-full border border-line px-3 py-1.5 text-xs font-medium text-ink hover:border-accent hover:text-accent"
          >
            🔑 {lang === 'he' ? 'איפוס סיסמה' : 'Reset password'}
          </button>
          <button
            type="button"
            onClick={() => onEdit(user)}
            className="rounded-full border border-line px-3 py-1.5 text-xs font-medium text-ink hover:border-primary hover:text-primary"
          >
            ✏️ {lang === 'he' ? 'ערוך' : 'Edit'}
          </button>
          <button
            type="button"
            onClick={() => setConfirmErase(true)}
            className="rounded-full border border-line px-3 py-1.5 text-xs font-medium text-ink hover:border-danger hover:text-danger"
          >
            🗑️ {lang === 'he' ? 'מחק' : 'Erase'}
          </button>
        </div>
      </div>

      {resetTempPassword && (
        <div className="mt-3 grid gap-2 rounded-lg border border-line bg-paper p-3">
          <span className="text-xs font-medium text-muted">
            {lang === 'he' ? 'סיסמה זמנית חדשה — מסרו אותה למשתמש:' : 'New temporary password — hand this to the user:'}
          </span>
          <div className="flex items-center gap-2">
            <code dir="ltr" className="flex-1 rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink">
              {resetTempPassword}
            </code>
            <button
              type="button"
              onClick={handleCopyResetPassword}
              className="rounded-lg border border-line px-3 py-2 text-xs font-medium text-ink hover:bg-surface"
            >
              {copiedResetPassword ? (lang === 'he' ? 'הועתק!' : 'Copied!') : (lang === 'he' ? 'העתק' : 'Copy')}
            </button>
            <button
              type="button"
              onClick={() => setResetTempPassword(null)}
              className="rounded-lg border border-line px-3 py-2 text-xs font-medium text-muted hover:text-ink"
            >
              {lang === 'he' ? 'סגור' : 'Dismiss'}
            </button>
          </div>
        </div>
      )}

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

      {rowError && <p className="mt-2 rounded-md bg-danger-bg px-2.5 py-1.5 text-xs text-danger">{rowError}</p>}

      <ConfirmDialog
        open={confirmDisable2fa}
        title={lang === 'he' ? 'ביטול אימות דו-שלבי' : 'Disable Two-Factor Auth'}
        message={
          lang === 'he'
            ? `האם לבטל את האימות הדו-שלבי עבור ${user.displayName}?`
            : `Disable two-factor authentication for ${user.displayName}?`
        }
        confirmLabel={lang === 'he' ? 'כן, בטל' : 'Yes, disable'}
        cancelLabel={lang === 'he' ? 'ביטול' : 'Cancel'}
        busy={disabling2fa}
        onConfirm={handleDisable2fa}
        onCancel={() => setConfirmDisable2fa(false)}
      />

      <ConfirmDialog
        open={confirmResetPassword}
        title={lang === 'he' ? 'איפוס סיסמה' : 'Reset Password'}
        message={
          lang === 'he'
            ? `תיווצר סיסמה זמנית חדשה עבור ${user.displayName}, והמשתמש יידרש להחליף אותה בכניסה הבאה. להמשיך?`
            : `A new temporary password will be generated for ${user.displayName}, and they'll be required to change it on next login. Continue?`
        }
        confirmLabel={lang === 'he' ? 'כן, אפס' : 'Yes, reset'}
        cancelLabel={lang === 'he' ? 'ביטול' : 'Cancel'}
        busy={resettingPassword}
        onConfirm={handleResetPassword}
        onCancel={() => setConfirmResetPassword(false)}
      />

      <ConfirmDialog
        open={confirmErase}
        title={lang === 'he' ? 'מחיקת משתמש לצמיתות' : 'Permanently Erase User'}
        message={
          lang === 'he'
            ? `פעולה זו תמחק את ${user.displayName} ואת כל הנתונים שלו לצמיתות. לא ניתן לבטל.`
            : `This will permanently delete ${user.displayName} and all their data. This cannot be undone.`
        }
        confirmLabel={lang === 'he' ? 'מחק לצמיתות' : 'Erase permanently'}
        cancelLabel={lang === 'he' ? 'ביטול' : 'Cancel'}
        destructive
        busy={erasing}
        onConfirm={handleErase}
        onCancel={() => setConfirmErase(false)}
      />
    </div>
  );
}
