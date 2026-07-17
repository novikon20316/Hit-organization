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
import { apiClient } from '@/lib/apiClient';
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

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (newPassword.length < 6) {
      setError(lang === 'he' ? 'הסיסמה חייבת להכיל לפחות 6 תווים.' : 'Password must be at least 6 characters.');
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
      setError(err instanceof Error ? err.message : lang === 'he' ? 'שינוי הסיסמה נכשל. אנא נסה שוב.' : 'Failed to change password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSignOutInstead = async () => {
    await logout();
    router.replace('/login');
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

          <button type="button" onClick={handleSignOutInstead} className="mt-4 w-full text-center text-sm text-muted hover:text-ink">
            {lang === 'he' ? 'התנתק במקום' : 'Sign out instead'}
          </button>
        </div>
      </main>
    </div>
  );
}
