'use client';

// app/examiner-access/OtpGate.tsx
// Second-factor gate: a one-time code emailed to the examiner, required
// before the examinerTokens/{token} document (and everything behind it)
// becomes readable — see firestore.rules' examinerTokens `allow get`
// condition, and lib/examinerTokens.ts's module comment on how the
// permission-denied error drives this phase.
//
// The 6-digit input pattern mirrors app/(auth)/verify-2fa/RecoveryModal.tsx.

import { useState } from 'react';
import { apiClient } from '@/lib/apiClient';
import { useLanguage } from '@/contexts/LanguageContext';

interface OtpGateProps {
  token: string;
  onVerified: () => void;
}

// examinerAccessController.ts / examinerAccess.ts return a small, fixed set
// of plain-English reason strings as the HTTP error `message` — never
// localized server-side, and apiClient.ts's request() always throws with
// that exact text as `Error.message` (an ApiError, which `instanceof
// Error`), so displaying err.message directly always showed English
// regardless of the page's language. Mapped here instead of changing the
// server's response shape, since the set of possible reasons is small and
// stable; anything unrecognized (network failure, an unexpected 500, etc.)
// falls through to a generic localized message rather than raw text.
function localizeOtpError(message: string, lang: 'he' | 'en'): string {
  const known: Record<string, { he: string; en: string }> = {
    'Incorrect code.': { he: 'קוד שגוי. נסה/י שוב.', en: 'Incorrect code. Please try again.' },
    'Too many attempts. Request a new code.': { he: 'יותר מדי ניסיונות — יש לבקש קוד חדש.', en: 'Too many attempts — request a new code.' },
    'Code expired. Request a new one.': { he: 'הקוד פג תוקף — יש לבקש קוד חדש.', en: 'Code expired — request a new one.' },
    'No code has been requested yet.': { he: 'טרם נשלח קוד — יש ללחוץ על "שלח קוד למייל".', en: 'No code has been requested yet — tap "Send code to email".' },
    'Invalid or unknown token.': { he: 'הקישור אינו תקין. פנה/י לרכז/ת הפקולטה לקבלת קישור חדש.', en: 'This link is invalid. Contact the faculty coordinator for a new link.' },
    'Failed to send the verification code. Please try again.': { he: 'שליחת קוד האימות נכשלה. נסה/י שוב.', en: 'Failed to send the verification code. Please try again.' },
    'Verification failed.': { he: 'האימות נכשל. נסה/י שוב.', en: 'Verification failed. Please try again.' },
  };
  return known[message]?.[lang] ?? (lang === 'he' ? 'משהו השתבש. נסה/י שוב.' : 'Something went wrong. Please try again.');
}

export function OtpGate({ token, onVerified }: OtpGateProps) {
  const { t, lang } = useLanguage();

  const [otpCode, setOtpCode] = useState('');
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [sent, setSent] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleRequestOtp = async () => {
    setErrorMsg('');
    setSending(true);
    try {
      await apiClient.requestExaminerOtp(token);
      setSent(true);
    } catch (err) {
      setErrorMsg(err instanceof Error ? localizeOtpError(err.message, lang) : t('examinerOtpSendError'));
    } finally {
      setSending(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!otpCode.trim()) return;
    setErrorMsg('');
    setVerifying(true);
    try {
      await apiClient.verifyExaminerOtp(token, otpCode.trim());
      setOtpCode('');
      onVerified();
    } catch (err) {
      setErrorMsg(err instanceof Error ? localizeOtpError(err.message, lang) : t('examinerOtpInvalidCode'));
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="w-full max-w-sm text-center">
      <span className="text-4xl">🔐</span>
      <h1 className="mt-2 text-xl font-semibold text-ink">{t('examinerOtpRequiredTitle')}</h1>
      <p className="mt-2 text-sm text-muted">{t('examinerOtpRequiredBody')}</p>

      {!sent ? (
        <button
          type="button"
          onClick={handleRequestOtp}
          disabled={sending}
          className="mt-5 w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-ink hover:bg-primary-hover disabled:opacity-60"
        >
          {sending ? t('examinerOtpSending') : `✉️ ${t('examinerOtpSendBtn')}`}
        </button>
      ) : (
        <div className="mt-5 text-start">
          <label className="mb-1.5 block text-sm font-medium text-ink">{t('examinerOtpEnterLabel')}</label>
          <input
            type="text"
            inputMode="numeric"
            maxLength={6}
            dir="ltr"
            autoFocus
            value={otpCode}
            onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
            placeholder="000000"
            className="w-full rounded-lg border border-line bg-paper px-3.5 py-2.5 text-center text-lg tracking-[0.3em] text-ink focus:border-primary focus:bg-surface focus:outline-none"
          />
          <button
            type="button"
            onClick={handleVerifyOtp}
            disabled={verifying || !otpCode.trim()}
            className="mt-3 w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-ink hover:bg-primary-hover disabled:opacity-60"
          >
            {verifying ? '…' : t('examinerOtpVerifyBtn')}
          </button>
          <button
            type="button"
            onClick={handleRequestOtp}
            disabled={sending}
            className="mt-2 w-full text-center text-sm text-primary hover:underline"
          >
            {sending ? t('examinerOtpSending') : t('examinerOtpResendBtn')}
          </button>
        </div>
      )}

      {!!errorMsg && <p className="mt-3 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">{errorMsg}</p>}
    </div>
  );
}
