'use client';

// app/(auth)/reset-password/confirm/page.tsx
//
// Without this, clicking the link from a Firebase password-reset email lands
// on FIREBASE'S OWN default hosted page, which only enforces Firebase Auth's
// built-in 6-character minimum — none of this app's complexity rules (8+
// chars, upper/lower/digit/symbol — see change-password/page.tsx and
// signup/page.tsx's identical rule) apply there. This is our own
// action-handler page instead: reset-password/page.tsx now points
// sendPasswordResetEmail's actionCodeSettings.url here, so the email link
// brings the user back into the app to actually set the new password
// through the same validated form as everywhere else.

import { Suspense, useEffect, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { verifyPasswordResetCode, confirmPasswordReset } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useLanguage } from '@/contexts/LanguageContext';
import { LanguageToggle } from '@/components/LanguageToggle';

function passwordPolicyError(password: string, lang: 'he' | 'en'): string | null {
  if (password.length < 8) return lang === 'he' ? 'הסיסמה חייבת להכיל לפחות 8 תווים.' : 'Password must be at least 8 characters.';
  if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
    return lang === 'he'
      ? 'הסיסמה חייבת לכלול אות גדולה, אות קטנה, ספרה וסימן.'
      : 'Password must include an uppercase letter, a lowercase letter, a digit, and a symbol.';
  }
  return null;
}

function ResetPasswordConfirmContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { lang } = useLanguage();
  const oobCode = searchParams.get('oobCode') ?? '';

  const [status, setStatus] = useState<'checking' | 'valid' | 'invalid' | 'done'>('checking');
  const [email, setEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!oobCode) {
      setStatus('invalid');
      return;
    }
    verifyPasswordResetCode(auth, oobCode)
      .then((resolvedEmail) => {
        setEmail(resolvedEmail);
        setStatus('valid');
      })
      .catch(() => setStatus('invalid'));
  }, [oobCode]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    const policyError = passwordPolicyError(newPassword, lang);
    if (policyError) {
      setError(policyError);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(lang === 'he' ? 'הסיסמאות אינן תואמות.' : 'Passwords do not match.');
      return;
    }

    setSaving(true);
    try {
      await confirmPasswordReset(auth, oobCode, newPassword);
      setStatus('done');
      setTimeout(() => router.replace('/login'), 3000);
    } catch (err) {
      setError(lang === 'he' ? 'הקישור פג תוקף או שכבר נעשה בו שימוש. בקש קישור חדש.' : 'This link has expired or was already used. Request a new one.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="w-full max-w-sm">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{lang === 'he' ? 'קביעת סיסמה חדשה' : 'Set a New Password'}</h1>
        {status === 'valid' && (
          <p className="mt-1 text-sm text-muted">
            {lang === 'he' ? `עבור ${email}` : `For ${email}`}
          </p>
        )}
      </div>

      <div className="role-rail rounded-[var(--radius)] border border-line bg-surface p-6 shadow-sm" style={{ '--rail-color': 'var(--primary)' } as React.CSSProperties}>
        {status === 'checking' && <p className="text-center text-sm text-muted">…</p>}

        {status === 'invalid' && (
          <div className="text-center">
            <p className="text-2xl">⚠️</p>
            <p className="mt-2 text-sm text-ink">
              {lang === 'he' ? 'הקישור אינו תקין, פג תוקפו, או כבר נעשה בו שימוש.' : 'This link is invalid, expired, or was already used.'}
            </p>
            <button
              type="button"
              onClick={() => router.replace('/reset-password')}
              className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-ink hover:bg-primary-hover"
            >
              {lang === 'he' ? 'בקש קישור חדש' : 'Request a new link'}
            </button>
          </div>
        )}

        {status === 'done' && (
          <div className="text-center">
            <p className="text-2xl">✅</p>
            <p className="mt-2 text-sm font-semibold text-ink">{lang === 'he' ? 'הסיסמה עודכנה!' : 'Password updated!'}</p>
            <p className="mt-1 text-sm text-muted">{lang === 'he' ? 'מעביר אותך להתחברות...' : 'Redirecting to login...'}</p>
          </div>
        )}

        {status === 'valid' && (
          <form onSubmit={handleSubmit}>
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
                  ? '8+ תווים, כולל אות גדולה, אות קטנה, ספרה וסימן.'
                  : '8+ characters with an uppercase letter, lowercase letter, digit, and symbol.'}
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

            {error && <p className="mt-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">{error}</p>}

            <button
              type="submit"
              disabled={saving}
              className="mt-5 w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-ink hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? '…' : lang === 'he' ? 'שמור סיסמה חדשה' : 'Save New Password'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function ResetPasswordConfirmPage() {
  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <header className="flex justify-end p-4">
        <LanguageToggle />
      </header>
      <main className="flex flex-1 items-center justify-center px-4 pb-16">
        <Suspense fallback={<p className="text-sm text-muted">…</p>}>
          <ResetPasswordConfirmContent />
        </Suspense>
      </main>
    </div>
  );
}
