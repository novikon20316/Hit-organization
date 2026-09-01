'use client';

// app/admin/panel/UserRow.tsx
// Ported from the `activeTab === 'users'` card in mobile's panel.tsx.

import { useState } from 'react';
import { signInWithCustomToken } from 'firebase/auth';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { apiClient } from '@/lib/apiClient';
import { auth } from '@/lib/firebase';
import { getFacultyColor, getRoleAccent, withAlpha } from '@/lib/facultyColors';
import { roleLabel, facultyLabel, type AppRole, type FacultyId } from '@/lib/i18n';
import { staffFacultyMajorLabel } from '@/lib/permissions';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { setActiveImpersonation, clearActiveImpersonation } from '@/lib/impersonation';
import type { AdminUserRecord, StudentStatusConfig } from './types';

interface UserRowProps {
  user: AdminUserRecord;
  statusConfig: StudentStatusConfig;
  onChanged: () => void;
  onEdit: (user: AdminUserRecord) => void;
  /** Temporary debug tool — see server/src/config/featureFlags.ts's
   *  IMPERSONATION_ENABLED. Hides the Impersonate button entirely when off. */
  impersonationEnabled?: boolean;
}

export function UserRow({ user, statusConfig, onChanged, onEdit, impersonationEnabled }: UserRowProps) {
  const { lang } = useLanguage();
  const { firebaseUser } = useAuth();
  const facultyColor = getFacultyColor(user.facultyId);
  const roleColor = getRoleAccent(user.role);
  const isSelf = user.id === firebaseUser?.uid;
  const isOtherAdmin = user.role === 'system_admin' || (user.roles ?? []).includes('system_admin');
  const canImpersonate = !!impersonationEnabled && !isSelf && !isOtherAdmin;

  // Status badges are student-only, and only shown once actually set —
  // omit entirely rather than showing an empty/placeholder badge.
  const isStudent = user.role === 'student' || (user.roles ?? []).includes('student');
  // Every staff role but system_admin (cross-faculty by nature) has a real
  // faculty, and a supervisor/secondary_supervisor may additionally be
  // restricted to specific majors within it — surface both under the role
  // badge so an admin managing many supervisors across majors can tell them
  // apart at a glance.
  const isSystemAdmin = user.role === 'system_admin' || (user.roles ?? []).includes('system_admin');
  const facultyMajorLine = !isStudent && !isSystemAdmin
    ? staffFacultyMajorLabel(user.facultyId, user.assignedMajors, lang, (id) => facultyLabel(id as FacultyId, lang))
    : null;
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
  const [impersonating, setImpersonating] = useState(false);

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

  const handleImpersonate = async () => {
    if (!firebaseUser) return;
    setImpersonating(true);
    setRowError('');
    try {
      const result = await apiClient.impersonateUser(user.id);
      setActiveImpersonation({
        adminReturnToken: result.adminReturnToken,
        adminUid: firebaseUser.uid,
        adminDisplayName: firebaseUser.displayName ?? '',
        targetUid: user.id,
        targetDisplayName: result.targetDisplayName || user.displayName,
        targetEmail: result.targetEmail || user.email,
        startedAt: new Date().toISOString(),
      });
      await signInWithCustomToken(auth, result.targetToken);
      // From here the app re-renders as the target user — AuthContext's own
      // onAuthStateChanged/onSnapshot listeners pick up the new identity, so
      // there's nothing further to do in this component.
    } catch (err) {
      clearActiveImpersonation();
      setRowError(err instanceof Error ? err.message : 'Failed to impersonate user');
      setImpersonating(false);
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
    <div className="role-rail rounded-admin-lg border border-admin-outline-variant bg-admin-surface p-4" style={{ '--rail-color': facultyColor } as React.CSSProperties}>
      <div className="flex items-center gap-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-admin text-sm font-semibold text-white"
          style={{ backgroundColor: facultyColor }}
        >
          {(user.displayName || '?').charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-admin-on-surface">{user.displayName}</p>
          <p className="truncate text-xs text-admin-on-surface-variant" dir="ltr">
            {user.email}
          </p>
        </div>
        <label className="inline-flex shrink-0 cursor-pointer items-center gap-2">
          <span className="text-xs text-admin-on-surface-variant">{user.isActive ? (lang === 'he' ? 'פעיל' : 'Active') : lang === 'he' ? 'לא פעיל' : 'Inactive'}</span>
          <span className="relative inline-block h-5 w-9">
            <input
              type="checkbox"
              checked={user.isActive}
              disabled={togglingActive}
              onChange={handleToggleActive}
              className="peer absolute h-0 w-0 opacity-0"
            />
            <span className="absolute inset-0 rounded-full bg-admin-outline-variant transition-colors peer-checked:bg-admin-primary peer-disabled:opacity-60" />
            <span className="absolute top-0.5 start-0.5 h-4 w-4 rounded-full bg-white transition-transform peer-checked:translate-x-4 rtl:peer-checked:-translate-x-4" />
          </span>
        </label>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <div className="flex flex-col items-start gap-0.5">
          <span
            className="rounded-full px-2.5 py-1 text-xs font-medium"
            style={{ backgroundColor: withAlpha(roleColor, 0.12), color: roleColor }}
          >
            {roleLabel(user.role as AppRole, lang)}
          </span>
          {facultyMajorLine && (
            <span className="px-2.5 text-[11px] text-admin-on-surface-variant">{facultyMajorLine}</span>
          )}
        </div>
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
          {canImpersonate && (
            <button
              type="button"
              onClick={handleImpersonate}
              disabled={impersonating}
              className="rounded-full border border-admin-outline-variant px-3 py-1.5 text-xs font-medium text-admin-on-surface hover:border-accent hover:text-accent disabled:opacity-60"
            >
              🕵️ {impersonating ? (lang === 'he' ? 'מתחבר...' : 'Switching...') : lang === 'he' ? 'התחזה' : 'Impersonate'}
            </button>
          )}
          {user.totp_enabled && (
            <button
              type="button"
              onClick={() => setConfirmDisable2fa(true)}
              className="rounded-full border border-admin-outline-variant px-3 py-1.5 text-xs font-medium text-admin-on-surface hover:border-accent hover:text-accent"
            >
              🔓 {lang === 'he' ? 'בטל 2FA' : 'Disable 2FA'}
            </button>
          )}
          <button
            type="button"
            onClick={() => setConfirmResetPassword(true)}
            className="rounded-full border border-admin-outline-variant px-3 py-1.5 text-xs font-medium text-admin-on-surface hover:border-accent hover:text-accent"
          >
            🔑 {lang === 'he' ? 'איפוס סיסמה' : 'Reset password'}
          </button>
          <button
            type="button"
            onClick={() => onEdit(user)}
            className="rounded-full border border-admin-outline-variant px-3 py-1.5 text-xs font-medium text-admin-on-surface hover:border-admin-primary hover:text-admin-primary"
          >
            ✏️ {lang === 'he' ? 'ערוך' : 'Edit'}
          </button>
          <button
            type="button"
            onClick={() => setConfirmErase(true)}
            className="rounded-full border border-admin-outline-variant px-3 py-1.5 text-xs font-medium text-admin-on-surface hover:border-danger hover:text-danger"
          >
            🗑️ {lang === 'he' ? 'מחק' : 'Erase'}
          </button>
        </div>
      </div>

      {resetTempPassword && (
        <div className="mt-3 grid gap-2 rounded-lg border border-admin-outline-variant bg-admin-surface-container-low p-3">
          <span className="text-xs font-medium text-admin-on-surface-variant">
            {lang === 'he' ? 'סיסמה זמנית חדשה — מסרו אותה למשתמש:' : 'New temporary password — hand this to the user:'}
          </span>
          <div className="flex items-center gap-2">
            <code dir="ltr" className="flex-1 rounded-md border border-admin-outline-variant bg-admin-surface-container-lowest px-3 py-2 text-sm text-admin-on-surface">
              {resetTempPassword}
            </code>
            <button
              type="button"
              onClick={handleCopyResetPassword}
              className="rounded-lg border border-admin-outline-variant px-3 py-2 text-xs font-medium text-admin-on-surface hover:bg-admin-surface-container-low"
            >
              {copiedResetPassword ? (lang === 'he' ? 'הועתק!' : 'Copied!') : (lang === 'he' ? 'העתק' : 'Copy')}
            </button>
            <button
              type="button"
              onClick={() => setResetTempPassword(null)}
              className="rounded-lg border border-admin-outline-variant px-3 py-2 text-xs font-medium text-admin-on-surface-variant hover:text-admin-on-surface"
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

      {rowError && <p className="mt-2 rounded-md bg-danger-bg px-2.5 py-1.5 text-xs text-danger" role="alert">{rowError}</p>}

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
            ? `הפעולה תמחק לצמיתות את החשבון, הכניסה למערכת והפרופיל האישי של ${user.displayName}, וכן את ההתראות והבקשות שלו. רשומות שבהן הוא מוזכר במקומות אחרים (הודעות, אבני דרך, פרויקטים, יומן ביקורת) יישארו במקומן אך יוצגו כ"לא ידוע" במקום שמו. לא ניתן לבטל פעולה זו.`
            : `This will permanently delete ${user.displayName}'s account, login, and personal profile, along with their notifications and applications. Records they're referenced in elsewhere (messages, milestones, projects, audit history) stay in place but will show as "Unknown" instead of their name. This cannot be undone.`
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
