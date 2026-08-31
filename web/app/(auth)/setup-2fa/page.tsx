'use client';

// app/(auth)/setup-2fa/page.tsx
// Ported from mobile/app/(auth)/setup2fa.tsx. Reachable via the "Enable Now"
// button on DashboardShell's totp_enabled nudge banner (shown on every
// dashboard page until 2FA is turned on or the user dismisses it for the
// session) — mobile instead reaches it from a one-shot post-login Alert.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/lib/apiClient';
import { getHomeRoute, type AppRole } from '@/lib/roles';
import { useLanguage } from '@/contexts/LanguageContext';
import { LanguageToggle } from '@/components/LanguageToggle';

export default function Setup2FAPage() {
  const router = useRouter();
  const { lang } = useLanguage();
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [token, setToken] = useState('');
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadQrCode = async () => {
    setError('');
    try {
      const res = await apiClient.post<{ qrCode: string }>('/api/auth/2fa/setup');
      setQrCode(res.qrCode);
    } catch {
      setError(lang === 'he' ? 'טעינת קוד ה-QR נכשלה. אנא נסה שוב.' : 'Failed to load the QR code. Please try again.');
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; loadQrCode's setState calls happen after its awaited network call resolves, not synchronously in this effect
    loadQrCode();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleVerify = async () => {
    if (token.length !== 6) {
      setError(lang === 'he' ? 'יש להזין קוד בן 6 ספרות.' : 'Please enter the full 6-digit code.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await apiClient.post('/api/auth/2fa/verify', { token });
      setDone(true);
      const me = await apiClient.get<{ role: string }>('/api/users/me');
      setTimeout(() => router.replace(getHomeRoute(me.role as AppRole)), 1500);
    } catch {
      setError(lang === 'he' ? 'קוד שגוי. אנא נסה שוב.' : 'Invalid code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper px-4">
        <p className="rounded-lg bg-success-bg px-4 py-3 text-sm font-semibold text-success" role="status">
          ✅ {lang === 'he' ? 'אימות דו-שלבי הופעל! מעביר אותך...' : '2FA activated! Redirecting...'}
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <header className="flex justify-end p-4">
        <LanguageToggle />
      </header>

      <main className="flex flex-1 items-center justify-center px-4 pb-16">
        <div className="w-full max-w-sm">
          <div className="mb-6 text-center">
            <h1 className="text-2xl font-semibold tracking-tight text-ink">{lang === 'he' ? 'הגדרת אימות דו-שלבי' : 'Set Up 2FA'}</h1>
            <p className="mt-1 text-sm text-muted">
              {lang === 'he' ? 'סרוק את קוד ה-QR באמצעות Google Authenticator או Authy' : 'Scan this QR code with Google Authenticator or Authy'}
            </p>
          </div>

          <div className="role-rail rounded-[var(--radius)] border border-line bg-surface p-6 shadow-sm" style={{ '--rail-color': 'var(--primary)' } as React.CSSProperties}>
            <div className="flex justify-center">
              {qrCode ? (
                // eslint-disable-next-line @next/next/no-img-element -- server returns a data: URI, not a static asset next/image can optimize
                <img src={qrCode} alt="2FA QR code" className="h-44 w-44 rounded-lg border border-line" />
              ) : (
                <div className="flex h-44 w-44 items-center justify-center rounded-lg border border-dashed border-line text-xs text-muted">
                  {error ? '—' : '…'}
                </div>
              )}
            </div>

            {!qrCode && error && (
              <button type="button" onClick={loadQrCode} className="mt-3 w-full rounded-lg border border-line px-3.5 py-2 text-sm font-medium text-ink hover:bg-paper">
                {lang === 'he' ? 'נסה שוב' : 'Retry'}
              </button>
            )}

            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              dir="ltr"
              value={token}
              onChange={(e) => setToken(e.target.value.replace(/\D/g, ''))}
              placeholder={lang === 'he' ? 'קוד בן 6 ספרות' : 'Enter 6-digit code'}
              className="mt-4 w-full rounded-lg border border-line bg-paper px-3.5 py-2.5 text-center text-lg tracking-[0.3em] text-ink placeholder:tracking-normal focus:border-primary focus:bg-surface focus:outline-none"
            />

            {error && <p className="mt-3 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">{error}</p>}

            <button
              type="button"
              onClick={handleVerify}
              disabled={loading}
              className="mt-4 w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-ink hover:bg-primary-hover disabled:opacity-60"
            >
              {loading ? '…' : lang === 'he' ? 'הפעל אימות דו-שלבי' : 'Activate 2FA'}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
