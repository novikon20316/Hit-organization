'use client';

// app/(auth)/verify-2fa/RecoveryModal.tsx
// Ported from the RecoveryModal in mobile/app/(auth)/verify2fa.tsx.

import { useState } from 'react';
import { apiClient } from '@/lib/apiClient';

type RecoveryStep = 'request' | 'emailCode' | 'qr';

interface RecoveryModalProps {
  onClose: () => void;
  onActivated: () => void;
}

export function RecoveryModal({ onClose, onActivated }: RecoveryModalProps) {
  const [lang, setLang] = useState<'he' | 'en'>('he');
  const [step, setStep] = useState<RecoveryStep>('request');
  const [emailCode, setEmailCode] = useState('');
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [newToken, setNewToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const handleSendCode = async () => {
    setBusy(true);
    setError('');
    try {
      await apiClient.post('/api/auth/2fa/recovery/request');
      setStep('emailCode');
    } catch (err) {
      setError(err instanceof Error ? err.message : lang === 'he' ? 'שליחת קוד השחזור נכשלה.' : 'Failed to send recovery code.');
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmEmailCode = async () => {
    if (emailCode.length !== 6) {
      setError(lang === 'he' ? 'יש להזין את הקוד בן 6 הספרות מהמייל.' : 'Please enter the full 6-digit code from your email.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await apiClient.post<{ qrCode: string }>('/api/auth/2fa/recovery/verify', { code: emailCode });
      setQrCode(res.qrCode);
      setStep('qr');
    } catch (err) {
      setError(err instanceof Error ? err.message : lang === 'he' ? 'קוד שגוי או שפג תוקפו.' : 'Invalid or expired code.');
    } finally {
      setBusy(false);
    }
  };

  const handleActivateNewAuthenticator = async () => {
    if (newToken.length !== 6) {
      setError(lang === 'he' ? 'יש להזין את הקוד בן 6 הספרות מאפליקציית האימות החדשה.' : 'Please enter the full 6-digit code from your new authenticator.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await apiClient.post('/api/auth/2fa/verify', { token: newToken });
      onActivated();
    } catch (err) {
      setError(err instanceof Error ? err.message : lang === 'he' ? 'קוד שגוי. נסה שנית.' : 'Invalid code. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-[var(--radius)] bg-surface p-6 shadow-lg">
        <div className="mb-3 flex justify-end">
          <button
            type="button"
            onClick={() => setLang((l) => (l === 'he' ? 'en' : 'he'))}
            className="rounded-full border border-line px-3 py-1 text-xs font-medium text-ink"
          >
            {lang === 'he' ? 'EN' : 'עב'}
          </button>
        </div>

        <h2 className="text-base font-semibold text-ink">🔑 {lang === 'he' ? 'שחזור חשבון' : 'Account Recovery'}</h2>

        {step === 'request' && (
          <>
            <p className="mt-3 text-sm text-muted">
              {lang === 'he'
                ? 'איבדת גישה לאפליקציית האימות שלך? נשלח קוד שחזור לכתובת המייל הרשומה בחשבון שלך. הזן אותו כאן כדי להגדיר אפליקציית אימות חדשה.'
                : "Lost access to your authenticator app? We'll email a recovery code to the address on your account. Enter it here to set up a new authenticator."}
            </p>
            {error && <p className="mt-3 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>}
            <button
              type="button"
              onClick={handleSendCode}
              disabled={busy}
              className="mt-4 w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-ink hover:bg-primary-hover disabled:opacity-60"
            >
              {busy ? '…' : lang === 'he' ? 'שלח קוד שחזור' : 'Send Recovery Code'}
            </button>
          </>
        )}

        {step === 'emailCode' && (
          <>
            <p className="mt-3 text-sm text-muted">{lang === 'he' ? 'הזן את הקוד בן 6 הספרות שנשלח למייל שלך.' : 'Enter the 6-digit code we emailed you.'}</p>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              dir="ltr"
              autoFocus
              value={emailCode}
              onChange={(e) => setEmailCode(e.target.value.replace(/\D/g, ''))}
              placeholder="000000"
              className="mt-3 w-full rounded-lg border border-line bg-paper px-3.5 py-2.5 text-center text-lg tracking-[0.3em] text-ink focus:border-primary focus:bg-surface focus:outline-none"
            />
            {error && <p className="mt-3 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>}
            <button
              type="button"
              onClick={handleConfirmEmailCode}
              disabled={busy}
              className="mt-4 w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-ink hover:bg-primary-hover disabled:opacity-60"
            >
              {busy ? '…' : lang === 'he' ? 'אשר קוד' : 'Confirm Code'}
            </button>
            <button type="button" onClick={handleSendCode} disabled={busy} className="mt-2 w-full text-center text-sm text-primary hover:underline">
              {lang === 'he' ? 'שלח קוד מחדש' : 'Resend code'}
            </button>
          </>
        )}

        {step === 'qr' && (
          <>
            <p className="mt-3 text-sm text-muted">
              {lang === 'he' ? 'סרוק את קוד ה-QR עם Google Authenticator או Authy, ולאחר מכן הזן את הקוד החדש למטה.' : 'Scan this QR code with Google Authenticator or Authy, then enter the new code below.'}
            </p>
            {qrCode && (
              // eslint-disable-next-line @next/next/no-img-element -- data: URI from the server, not a static asset
              <img src={qrCode} alt="2FA QR code" className="mx-auto mt-3 h-40 w-40 rounded-lg border border-line" />
            )}
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              dir="ltr"
              autoFocus
              value={newToken}
              onChange={(e) => setNewToken(e.target.value.replace(/\D/g, ''))}
              placeholder="000000"
              className="mt-3 w-full rounded-lg border border-line bg-paper px-3.5 py-2.5 text-center text-lg tracking-[0.3em] text-ink focus:border-primary focus:bg-surface focus:outline-none"
            />
            {error && <p className="mt-3 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>}
            <button
              type="button"
              onClick={handleActivateNewAuthenticator}
              disabled={busy}
              className="mt-4 w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-ink hover:bg-primary-hover disabled:opacity-60"
            >
              {busy ? '…' : lang === 'he' ? 'הפעל והמשך' : 'Activate & Continue'}
            </button>
          </>
        )}

        <button type="button" onClick={onClose} disabled={busy} className="mt-3 w-full text-center text-sm text-muted hover:text-ink">
          {lang === 'he' ? 'ביטול' : 'Cancel'}
        </button>
      </div>
    </div>
  );
}
