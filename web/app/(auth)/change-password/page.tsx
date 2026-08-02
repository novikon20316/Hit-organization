'use client';

// app/(auth)/change-password/page.tsx
// Ported from mobile/app/(auth)/changePassword.tsx — forced first-login
// password change for accounts created via Excel import (see
// mustChangePassword in server/src/services/userImportExport.ts). Also
// reachable for a voluntary change later. Made bilingual here — mobile's
// own copy is hardcoded English only.

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { apiClient, ApiError } from '@/lib/apiClient';
import { getHomeRoute, type AppRole } from '@/lib/roles';
import { useMaintenanceCheck } from '@/hooks/useMaintenanceCheck';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { LanguageToggle } from '@/components/LanguageToggle';

export default function ChangePasswordPage() {
  const router = useRouter();
  const { logout } = useAuth();
  const { lang } = useLanguage();
  const checkMaintenance = useMaintenanceCheck();

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const sessionExpiredError = lang === 'he'
    ? 'החיבור שלך פג. אנא התחבר מחדש כדי לשנות את הסיסמה.'
    : 'Your session has expired. Please log in again to change your password.';

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    // Guards against the exact bug a tester hit on mobile's identical
    // screen: sitting here with no live Firebase session (e.g. after "Sign
    // out instead", or a session that expired while this page was open) and
    // submitting anyway. Without this check apiClient silently sends the
    // request with no Authorization header at all, and the server's generic
    // 401 ("Missing or malformed authorization token") surfaces below
    // looking like a password-validation failure instead of what it is.
    if (!auth.currentUser) {
      setError(sessionExpiredError);
      return;
    }

    // Baseline client-side check (8+ chars, upper/lower/digit/symbol) — the
    // server is authoritative and enforces the stricter 12-character
    // system_admin policy plus the "not the same as your temporary
    // password" check, surfaced via the catch block below.
    if (newPassword.length < 8) {
      setError(lang === 'he' ? 'הסיסמה חייבת להכיל לפחות 8 תווים.' : 'Password must be at least 8 characters.');
      return;
    }
    if (!/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/[0-9]/.test(newPassword) || !/[^A-Za-z0-9]/.test(newPassword)) {
      setError(
        lang === 'he'
          ? 'הסיסמה חייבת לכלול אות גדולה, אות קטנה, ספרה וסימן.'
          : 'Password must include an uppercase letter, a lowercase letter, a digit, and a symbol.'
      );
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(lang === 'he' ? 'הסיסמאות אינן תואמות.' : 'Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      await apiClient.post('/api/users/change-password', { newPassword });

      const uid = auth.currentUser?.uid;
      const userSnap = uid ? await getDoc(doc(db, 'users', uid)) : null;
      const role = (userSnap?.data()?.role as string) ?? '';

      const maintenance = await checkMaintenance(role);
      if (maintenance.blocked) {
        const params = new URLSearchParams({ title: maintenance.title, endsAt: maintenance.endsAt ?? '' });
        router.replace(`/maintenance?${params.toString()}`);
        return;
      }

      router.replace(getHomeRoute(role as AppRole));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setError(sessionExpiredError);
      } else {
        setError(err instanceof Error ? err.message : lang === 'he' ? 'שינוי הסיסמה נכשל. אנא נסה שוב.' : 'Failed to change password. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSignOutInstead = async () => {
    // Previously this awaited logout() with no try/catch — if it ever
    // rejected (logout() itself calls the unguarded signOut(auth); see
    // AuthContext), the router.replace below never ran and the user was
    // left stuck on this exact screen looking like the button did nothing.
    // The navigation now always runs (same fix as mobile's identical bug).
    setSigningOut(true);
    try {
      await logout();
    } catch (err) {
      console.warn('Sign out failed, navigating to login anyway:', err);
    } finally {
      setSigningOut(false);
      router.replace('/login');
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <header className="flex justify-end p-4">
        <LanguageToggle />
      </header>

      <main className="flex flex-1 items-center justify-center px-4 pb-16">
        <div className="w-full max-w-sm">
          <div className="mb-6 text-center">
            <h1 className="text-2xl font-semibold tracking-tight text-ink">{lang === 'he' ? 'קביעת סיסמה חדשה' : 'Set a New Password'}</h1>
            <p className="mt-1 text-sm text-muted">
              {lang === 'he'
                ? 'החשבון שלך נוצר עם סיסמה זמנית. יש לבחור סיסמה חדשה כדי להמשיך.'
                : 'Your account was created with a temporary password. Choose a new password to continue.'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="role-rail rounded-[var(--radius)] border border-line bg-surface p-6 shadow-sm" style={{ '--rail-color': 'var(--primary)' } as React.CSSProperties}>
            <label className="mb-3 block">
              <span className="mb-1.5 block text-sm font-medium text-ink">{lang === 'he' ? 'סיסמה חדשה' : 'New password'}</span>
              <input
                type="password"
                dir="ltr"
                autoFocus
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full rounded-lg border border-line bg-paper px-3.5 py-2.5 text-sm text-ink focus:border-primary focus:bg-surface focus:outline-none"
                required
              />
              <span className="mt-1 block text-xs text-muted">
                {lang === 'he'
                  ? '8+ תווים, כולל אות גדולה, אות קטנה, ספרה וסימן (12+ למנהלי מערכת). לא ניתן להשתמש בסיסמה הזמנית שקיבלת.'
                  : "8+ characters with an uppercase letter, lowercase letter, digit, and symbol (12+ for system admins). Can't be the same as your temporary password."}
              </span>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink">{lang === 'he' ? 'אימות סיסמה חדשה' : 'Confirm new password'}</span>
              <input
                type="password"
                dir="ltr"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full rounded-lg border border-line bg-paper px-3.5 py-2.5 text-sm text-ink focus:border-primary focus:bg-surface focus:outline-none"
                required
              />
            </label>

            {error && <p className="mt-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="mt-5 w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-ink hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? '…' : lang === 'he' ? 'שמור והמשך' : 'Save & Continue'}
            </button>
          </form>

          <button type="button" onClick={handleSignOutInstead} disabled={signingOut} className="mt-4 w-full text-center text-sm text-muted hover:text-ink disabled:cursor-not-allowed disabled:opacity-60">
            {signingOut ? '…' : lang === 'he' ? 'התנתק במקום' : 'Sign out instead'}
          </button>
        </div>
      </main>
    </div>
  );
}
