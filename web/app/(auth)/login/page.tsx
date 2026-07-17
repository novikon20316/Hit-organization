'use client';

// app/(auth)/login/page.tsx
// Ported from mobile/app/(auth)/login.tsx. Same Firebase sign-in flow, same
// gates in the same order (email verification → forced password change →
// 2FA → maintenance → role redirect), same failed-login lockout reporting.
// The only behavior intentionally left out for now is mobile's "you should
// enable 2FA" nudge dialog after a successful login with 2FA off — that
// wants a proper toast/banner component, which comes with the dashboard
// shell, not the bare login page.

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { doc, getDoc } from 'firebase/firestore';
import { signInWithEmailAndPassword, type AuthError } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { apiClient } from '@/lib/apiClient';
import { getHomeRoute, type UserDoc } from '@/lib/roles';
import { useMaintenanceCheck } from '@/hooks/useMaintenanceCheck';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { LanguageToggle } from '@/components/LanguageToggle';

export default function LoginPage() {
  const router = useRouter();
  const { t, lang } = useLanguage();
  const { firebaseUser, userData, loading: authLoading } = useAuth();
  const checkMaintenance = useMaintenanceCheck();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Already signed in (e.g. reopened tab with a live session) — skip
  // straight to their dashboard instead of showing the login form.
  useEffect(() => {
    if (!authLoading && firebaseUser && userData?.role) {
      router.replace(getHomeRoute(userData.role));
    }
  }, [authLoading, firebaseUser, userData, router]);

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    if (!email || !password || submitting) return;
    setSubmitting(true);
    setError('');

    try {
      const credential = await signInWithEmailAndPassword(auth, email, password);

      // Force a fresh fetch rather than trusting a stale emailVerified
      // snapshot — same reasoning as mobile: this can change outside the
      // current session (e.g. an admin flipping it via the Admin SDK).
      await credential.user.reload();

      const userSnap = await getDoc(doc(db, 'users', credential.user.uid));
      const data = userSnap.exists() ? (userSnap.data() as UserDoc) : null;

      // Only self-registered students go through email verification; every
      // other role is provisioned via admin import with emailVerified
      // already true. A student mid-verification has no Firestore profile
      // yet at all, so `!data` also means "still verifying" here.
      const isStudent = !data || data.role === 'student';
      if (isStudent && !credential.user.emailVerified) {
        await auth.signOut();
        setError(
          lang === 'he'
            ? 'יש לאמת את כתובת הדוא"ל לפני ההתחברות. בדוק את תיבת הדואר (וגם את הספאם).'
            : 'Please verify your email before logging in. Check your inbox (and spam folder).'
        );
        return;
      }

      if (!data) {
        await auth.signOut();
        setError(
          lang === 'he'
            ? 'הדוא"ל אומת, אך הגדרת הפרופיל לא הושלמה. הירשם שוב כדי להשלים אותה.'
            : "Your email is verified, but your profile setup didn't finish. Please sign up again to complete it."
        );
        return;
      }

      // Forced password change (accounts created via Excel import) takes
      // priority over 2FA — a temp password must be replaced first.
      if (data.mustChangePassword) {
        router.push('/change-password');
        return;
      }

      if ((data as UserDoc & { totp_enabled?: boolean }).totp_enabled) {
        router.push('/verify-2fa');
        return;
      }

      const maintenance = await checkMaintenance(data.role);
      if (maintenance.blocked) {
        const params = new URLSearchParams({ title: maintenance.title, endsAt: maintenance.endsAt ?? '' });
        router.replace(`/maintenance?${params.toString()}`);
        return;
      }

      router.replace(getHomeRoute(data.role));
    } catch (err) {
      const code = (err as AuthError)?.code;
      if (code === 'auth/invalid-credential' || code === 'auth/wrong-password') {
        // Server independently re-verifies against Firebase before counting
        // this — see server/src/services/loginSecurity.ts. Only after 3
        // confirmed-wrong attempts does it lock the account and email a
        // "was this you?" link, which `locked` reflects here.
        try {
          const { locked } = await apiClient.reportFailedLogin(email, password);
          setError(
            locked
              ? lang === 'he'
                ? 'יותר מדי ניסיונות שגויים. בדוק את הדוא"ל כדי לאמת שזה אתה.'
                : 'Too many incorrect attempts. Check your email to verify this was you.'
              : lang === 'he'
                ? 'דוא"ל או סיסמה שגויים.'
                : 'Incorrect email or password.'
          );
        } catch {
          setError(lang === 'he' ? 'דוא"ל או סיסמה שגויים.' : 'Incorrect email or password.');
        }
      } else if (code === 'auth/user-disabled') {
        setError(
          lang === 'he'
            ? 'חשבון זה נעול זמנית לבדיקת אבטחה. בדוק את הדוא"ל להמשך.'
            : 'This account is temporarily locked pending a security check. Check your email for next steps.'
        );
      } else if (code === 'auth/user-not-found') {
        setError(lang === 'he' ? 'לא נמצא חשבון עם דוא"ל זה.' : 'No account found with this email.');
      } else {
        setError(t('loginError'));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <header className="flex justify-end p-4">
        <LanguageToggle />
      </header>

      <main className="flex flex-1 items-center justify-center px-4 pb-16">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex flex-col items-center gap-3 text-center">
            <Image src="/hit-logo.png" alt="HIT" width={64} height={38} priority className="h-10 w-auto object-contain" />
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-ink">{t('loginTitle')}</h1>
              <p className="mt-1 text-sm text-muted">{t('loginSubtitle')}</p>
            </div>
          </div>

          <form
            onSubmit={handleLogin}
            className="role-rail rounded-[var(--radius)] border border-line bg-surface p-6 shadow-sm"
            style={{ '--rail-color': 'var(--primary)' } as React.CSSProperties}
          >
            <div className="mb-4">
              <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-ink">
                {t('emailLabel')}
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                dir="ltr"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError('');
                }}
                className="w-full rounded-lg border border-line bg-paper px-3.5 py-2.5 text-sm text-ink placeholder:text-muted focus:border-primary focus:bg-surface focus:outline-none"
                placeholder="you@hit.ac.il"
                required
              />
            </div>

            <div className="mb-2">
              <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-ink">
                {t('passwordLabel')}
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  dir="ltr"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError('');
                  }}
                  className="w-full rounded-lg border border-line bg-paper px-3.5 py-2.5 pe-11 text-sm text-ink placeholder:text-muted focus:border-primary focus:bg-surface focus:outline-none"
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute inset-y-0 end-2 flex items-center px-2 text-sm text-muted hover:text-ink"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? '🙈' : '👁️'}
                </button>
              </div>
            </div>

            {error && (
              <p className="mb-4 rounded-md bg-danger-bg px-3 py-2 text-center text-sm text-danger" role="alert">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="mt-2 w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-ink transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? '…' : t('login')}
            </button>

            <div className="mt-5 flex flex-col items-center gap-2 text-sm">
              <Link href="/signup" className="text-primary hover:underline">
                {lang === 'he' ? 'אין לך חשבון? הירשם' : "Don't have an account? Sign up"}
              </Link>
              <Link href="/reset-password" className="text-primary hover:underline">
                {t('forgotPassword')}
              </Link>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
