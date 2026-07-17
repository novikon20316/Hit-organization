'use client';

// app/(auth)/verify-2fa/page.tsx
// Ported from mobile/app/(auth)/verify2fa.tsx.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/lib/apiClient';
import { getHomeRoute, type AppRole } from '@/lib/roles';
import { useMaintenanceCheck } from '@/hooks/useMaintenanceCheck';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { LanguageToggle } from '@/components/LanguageToggle';
import { RecoveryModal } from './RecoveryModal';

export default function Verify2FAPage() {
  const router = useRouter();
  const { logout } = useAuth();
  const { lang } = useLanguage();
  const checkMaintenance = useMaintenanceCheck();

  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showRecovery, setShowRecovery] = useState(false);

  // Shared "2FA is now confirmed" continuation — used by both the normal
  // code-entry path and the recovery flow's final activation step.
  const completeLoginAfter2FA = async () => {
    const me = await apiClient.get<{ role: string }>('/api/users/me');
    const maintenance = await checkMaintenance(me.role);
    if (maintenance.blocked) {
      const params = new URLSearchParams({ title: maintenance.title, endsAt: maintenance.endsAt ?? '' });
      router.replace(`/maintenance?${params.toString()}`);
      return;
    }
    router.replace(getHomeRoute(me.role as AppRole));
  };

  const handleVerify = async () => {
    if (token.length !== 6) {
      setError(lang === 'he' ? 'יש להזין קוד בן 6 ספרות.' : 'Please enter the full 6-digit code.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await apiClient.post('/api/auth/2fa/validate', { token });
      await completeLoginAfter2FA();
    } catch (err) {
      setError(err instanceof Error ? err.message : lang === 'he' ? 'קוד שגוי. אנא נסה שוב.' : 'Invalid code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleBackToLogin = async () => {
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
            <h1 className="text-2xl font-semibold tracking-tight text-ink">{lang === 'he' ? 'אימות דו-שלבי' : 'Two-Factor Authentication'}</h1>
            <p className="mt-1 text-sm text-muted">
              {lang === 'he' ? 'פתח את אפליקציית האימות והזן את הקוד בן 6 הספרות' : 'Open your authenticator app and enter the 6-digit code'}
            </p>
          </div>

          <div className="role-rail rounded-[var(--radius)] border border-line bg-surface p-6 shadow-sm" style={{ '--rail-color': 'var(--primary)' } as React.CSSProperties}>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              dir="ltr"
              autoFocus
              value={token}
              onChange={(e) => setToken(e.target.value.replace(/\D/g, ''))}
              placeholder="000000"
              className="w-full rounded-lg border border-line bg-paper px-3.5 py-2.5 text-center text-lg tracking-[0.3em] text-ink focus:border-primary focus:bg-surface focus:outline-none"
            />

            {error && <p className="mt-3 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>}

            <button
              type="button"
              onClick={handleVerify}
              disabled={loading}
              className="mt-4 w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-ink hover:bg-primary-hover disabled:opacity-60"
            >
              {loading ? '…' : lang === 'he' ? 'אמת' : 'Verify'}
            </button>
          </div>

          <button type="button" onClick={() => setShowRecovery(true)} className="mt-4 block w-full text-center text-sm text-primary hover:underline">
            {lang === 'he' ? 'איבדת את אפליקציית האימות?' : 'Lost your authenticator app?'}
          </button>
          <button type="button" onClick={handleBackToLogin} className="mt-2 block w-full text-center text-sm text-muted hover:text-ink">
            {lang === 'he' ? '→ חזרה להתחברות' : '← Back to login'}
          </button>
        </div>
      </main>

      {showRecovery && (
        <RecoveryModal
          onClose={() => setShowRecovery(false)}
          onActivated={() => {
            setShowRecovery(false);
            completeLoginAfter2FA();
          }}
        />
      )}
    </div>
  );
}
