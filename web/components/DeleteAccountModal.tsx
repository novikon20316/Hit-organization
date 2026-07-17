'use client';

// components/DeleteAccountModal.tsx
// Web port of mobile/components/modals/DeleteAccountModal.tsx — same re-auth
// requirement (Firebase reauthenticateWithCredential) before the deletion
// request, since server/src/controllers/userController.ts's
// requestAccountDeletion rejects the call unless the ID token's auth_time
// claim is under 5 minutes old. This is the only self-service entry point
// into the grace-period flow (the other trigger, automatic graduation
// flagging, is a server cron with no UI).

import { useState } from 'react';
import { EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { apiClient, ApiError } from '@/lib/apiClient';
import { useLanguage } from '@/contexts/LanguageContext';

interface DeleteAccountModalProps {
  onClose: () => void;
  /** Called after a successful deletion request — parent handles
   *  navigation (the pendingDeletion flag on the live user-doc subscription
   *  will also pick this up and redirect via useRequireRole, but calling
   *  this immediately avoids waiting on that snapshot round-trip). */
  onRequested: () => void;
}

export function DeleteAccountModal({ onClose, onRequested }: DeleteAccountModalProps) {
  const { lang } = useLanguage();
  const isRtl = lang === 'he';
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const handleConfirm = async () => {
    const user = auth.currentUser;
    if (!user?.email) {
      setError(lang === 'he' ? 'לא ניתן לזהות את המשתמש הנוכחי.' : 'Could not identify the current user.');
      return;
    }
    if (!password) {
      setError(lang === 'he' ? 'יש להזין סיסמה.' : 'Please enter your password.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      // Refreshes the ID token's auth_time claim — the server rejects the
      // request below if auth_time is more than 5 minutes old, so this step
      // is required, not just a UX nicety.
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password));
      await user.getIdToken(true);

      await apiClient.requestAccountDeletion();
      onRequested();
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        setError(lang === 'he' ? 'סיסמה שגויה.' : 'Incorrect password.');
      } else if (err instanceof ApiError && err.status === 409) {
        setError(err.message || (lang === 'he' ? 'לא ניתן למחוק את החשבון כרגע.' : 'Your account cannot be deleted right now.'));
      } else {
        setError(lang === 'he' ? 'שגיאה. נסה שוב.' : 'Something went wrong. Please try again.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-[var(--radius)] bg-surface p-6 shadow-lg">
        <div className="flex items-start justify-between">
          <h2 className="text-lg font-semibold text-ink">{lang === 'he' ? '🗑️ מחיקת חשבון' : '🗑️ Delete Account'}</h2>
          <button type="button" onClick={onClose} disabled={busy} className="text-muted hover:text-ink">
            ✕
          </button>
        </div>

        <p className={`mt-4 text-sm text-muted ${isRtl ? 'text-right' : ''}`}>
          {lang === 'he'
            ? 'בקשת המחיקה תתחיל תקופת המתנה של 14 יום, בזמנה תוכל לבטל. לאחר מכן, החשבון והנתונים שלך יימחקו לצמיתות ולא ניתן יהיה לשחזר אותם.'
            : 'This starts a 14-day cancellable window. After that, your account and its data will be permanently deleted and cannot be recovered.'}
        </p>

        <label className="mt-4 block">
          <span className={`mb-1.5 block text-sm font-medium text-ink ${isRtl ? 'text-right' : ''}`}>
            {lang === 'he' ? 'הזן את הסיסמה הנוכחית לאישור' : 'Enter your current password to confirm'}
          </span>
          <input
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError('');
            }}
            dir={isRtl ? 'rtl' : 'ltr'}
            placeholder={lang === 'he' ? 'סיסמה' : 'Password'}
            autoFocus
            className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink focus:border-primary focus:bg-surface focus:outline-none"
          />
        </label>

        {error && <p className="mt-3 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>}

        <button
          type="button"
          onClick={handleConfirm}
          disabled={busy || !password}
          className="mt-4 w-full rounded-lg bg-danger py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
        >
          {busy ? '…' : lang === 'he' ? 'מחק את החשבון שלי' : 'Delete My Account'}
        </button>

        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          className="mt-2 w-full rounded-lg border border-line py-2.5 text-sm font-medium text-ink hover:bg-paper"
        >
          {lang === 'he' ? 'ביטול' : 'Cancel'}
        </button>
      </div>
    </div>
  );
}
