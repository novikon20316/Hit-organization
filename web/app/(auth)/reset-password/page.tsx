'use client';

// app/(auth)/reset-password/page.tsx
// Ported from mobile/app/(auth)/resetPass.tsx — same Firebase call, same
// security posture (auth/user-not-found is treated as success so the UI
// never reveals whether an email is registered).

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { sendPasswordResetEmail, type AuthError } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useLanguage } from '@/contexts/LanguageContext';
import { LanguageToggle } from '@/components/LanguageToggle';

export default function ResetPasswordPage() {
  const router = useRouter();
  const { lang } = useLanguage();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [countdown, setCountdown] = useState(5);
  const [error, setError] = useState('');

  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const showError = email.length > 0 && !isValidEmail;

  useEffect(() => {
    if (!sent) return;
    if (countdown <= 0) {
      router.replace('/login');
      return;
    }
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [sent, countdown, router]);

  const handleSend = async (e: FormEvent) => {
    e.preventDefault();
    if (!isValidEmail || loading) return;
    setLoading(true);
    setError('');
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setSent(true);
    } catch (err) {
      const code = (err as AuthError)?.code;
      if (code === 'auth/user-not-found') {
        // Same account-enumeration protection as mobile: show success
        // either way rather than confirming/denying the email exists.
        setSent(true);
      } else {
        setError(lang === 'he' ? 'משהו השתבש. אנא נסה שוב.' : 'Something went wrong. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <header className="flex justify-end p-4">
        <LanguageToggle />
      </header>

      <main className="flex flex-1 items-center justify-center px-4 pb-16">
        <div className="w-full max-w-sm">
          <div className="mb-6 flex flex-col items-center gap-2 text-center">
            <span className="text-3xl">🔐</span>
            <h1 className="text-2xl font-semibold tracking-tight text-ink">{lang === 'he' ? 'איפוס סיסמה' : 'Reset Password'}</h1>
            <p className="text-sm text-muted">
              {lang === 'he' ? 'הזן את כתובת האימייל שלך ונשלח לך קישור לאיפוס הסיסמה.' : "Enter your email address and we'll send you a link to reset your password."}
            </p>
          </div>

          <div className="role-rail rounded-[var(--radius)] border border-line bg-surface p-6 shadow-sm" style={{ '--rail-color': 'var(--primary)' } as React.CSSProperties}>
            {sent ? (
              <div className="text-center">
                <p className="text-2xl">✅</p>
                <p className="mt-2 text-base font-semibold text-ink">{lang === 'he' ? 'הקישור נשלח!' : 'Link Sent!'}</p>
                <p className="mt-1 text-sm text-muted">
                  {lang === 'he' ? `בדוק את תיבת הדואר שלך עבור ${email}.` : `Check your inbox for ${email}.`}
                  <br />
                  {lang === 'he' ? `תועבר חזרה תוך ${countdown} שניות...` : `Redirecting in ${countdown}s...`}
                </p>
              </div>
            ) : (
              <form onSubmit={handleSend}>
                <input
                  type="email"
                  dir="ltr"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                  placeholder={lang === 'he' ? 'כתובת אימייל' : 'Email Address'}
                  className="w-full rounded-lg border border-line bg-paper px-3.5 py-2.5 text-sm text-ink placeholder:text-muted focus:border-primary focus:bg-surface focus:outline-none"
                  required
                />
                {showError && <p className="mt-1.5 text-xs text-danger">{lang === 'he' ? 'כתובת אימייל אינה תקינה' : 'Please enter a valid email address'}</p>}
                {error && <p className="mt-3 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>}
                <button
                  type="submit"
                  disabled={!isValidEmail || loading}
                  className="mt-4 w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-ink hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? (lang === 'he' ? 'שולח...' : 'Sending...') : lang === 'he' ? 'שלח קישור לאיפוס' : 'Send Reset Link'}
                </button>
              </form>
            )}
          </div>

          <button type="button" onClick={() => router.replace('/login')} className="mt-4 w-full text-center text-sm text-primary hover:underline">
            {lang === 'he' ? '→ חזרה להתחברות' : '← Back to Login'}
          </button>
        </div>
      </main>
    </div>
  );
}
