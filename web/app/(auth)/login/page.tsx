'use client';

// app/(auth)/login/page.tsx
// Ported from mobile/app/(auth)/login.tsx. Same Firebase sign-in flow, same
// gates in the same order (email verification → forced password change →
// 2FA → maintenance → role redirect), same failed-login lockout reporting.
// Mobile's "you should enable 2FA" nudge (a one-shot post-login Alert) is
// reimplemented as a persistent dismissible banner in DashboardShell instead
// — it fires on every dashboard page for as long as totp_enabled is false,
// rather than only once right after this page redirects away.

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { doc, getDoc } from 'firebase/firestore';
import {
  signInWithEmailAndPassword,
  signInWithPopup,
  linkWithCredential,
  GoogleAuthProvider,
  OAuthProvider,
  type AuthError,
  type AuthCredential,
} from 'firebase/auth';
import { auth, db, googleProvider, appleProvider } from '@/lib/firebase';
import { apiClient } from '@/lib/apiClient';
import { getHomeRoute, type UserDoc } from '@/lib/roles';
import { resolveActiveRole } from '@/lib/activeRole';
import { useMaintenanceCheck } from '@/hooks/useMaintenanceCheck';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { LanguageToggle } from '@/components/LanguageToggle';

// Deliberately excludes `'` and `"` too (on top of the usual whitespace/@
// exclusion) — a real email address never contains either, so rejecting
// them client-side blocks quote-based injection-probing payloads before
// they ever leave the browser. `-` and `@` stay allowed since both are
// legitimate/required in real addresses (e.g. "my-university.edu").
const EMAIL_FORMAT_REGEX = /^[^\s@'"]+@[^\s@'"]+\.[^\s@'"]+$/;
const MAX_EMAIL_LENGTH = 254; // RFC 5321 §4.5.3.1.3
const MAX_PASSWORD_LENGTH = 128; // generous cap — just blocks absurd/DoS-y payloads, not real passwords

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

  // "Sign in with Google" — a Google account whose email already has an
  // existing password-based account throws auth/account-exists-with-
  // -different-credential instead of silently creating a second, orphaned
  // uid. This prompts for that account's password so we can link the Google
  // credential onto it (Firebase's own documented recipe), rather than ever
  // ending up with two identities for the same person.
  const [googleSubmitting, setGoogleSubmitting] = useState(false);
  const [appleSubmitting, setAppleSubmitting] = useState(false);
  const [linkingPrompt, setLinkingPrompt] = useState<{ email: string; pendingCredential: AuthCredential } | null>(null);
  const [linkingPassword, setLinkingPassword] = useState('');
  const [linkingSubmitting, setLinkingSubmitting] = useState(false);
  const [linkingError, setLinkingError] = useState('');

  // Apple only requires "Sign in with Apple" parity on iOS (App Store
  // Guideline 4.8, triggered by offering Google sign-in) — Play has no such
  // rule, so keep the button off Android entirely rather than showing a
  // feature that exists purely to satisfy Apple's review. Defaults to
  // hidden so there's no flash of a button that then disappears once the
  // client-side check resolves.
  const [showAppleButton, setShowAppleButton] = useState(false);
  useEffect(() => {
    setShowAppleButton(!/Android/i.test(navigator.userAgent));
  }, []);

  // Shared by both redirect paths below so they can never disagree on
  // where a signed-in user should land — see the useEffect just below this
  // for why that used to matter: it used to jump straight to
  // getHomeRoute(role) without checking mustChangePassword/totp_enabled/
  // maintenance first, and since AuthContext's live Firestore listener
  // often resolves faster than handleLogin's own re-fetch below, that
  // effect would win the race and silently skip the forced password change
  // for a brand-new temp-password account.
  const redirectAfterAuth = async (data: UserDoc) => {
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
    router.replace(getHomeRoute(resolveActiveRole(data)));
  };

  // Already signed in (e.g. reopened tab with a live session) — skip
  // straight past the login form using the same gated decision as a fresh
  // login, not just a blind role-based redirect.
  useEffect(() => {
    if (!authLoading && firebaseUser && userData?.role) {
      redirectAfterAuth(userData);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- redirectAfterAuth closes over router/checkMaintenance, which are stable for this component's lifetime; re-running only on the actual auth-state deps below is intentional
  }, [authLoading, firebaseUser, userData]);

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    if (!email || !password || submitting) return;

    const trimmedEmail = email.trim();
    if (
      !EMAIL_FORMAT_REGEX.test(trimmedEmail) ||
      trimmedEmail.length > MAX_EMAIL_LENGTH ||
      password.length > MAX_PASSWORD_LENGTH
    ) {
      setError(lang === 'he' ? 'כתובת דוא"ל לא תקינה.' : 'Invalid email address.');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const credential = await signInWithEmailAndPassword(auth, trimmedEmail, password);

      // Fire-and-forget — feeds the system_admin "Live Transportation" audit
      // table. Only here (an actual credential submission), never in the
      // "already signed in" effect below, so reopening a tab doesn't log a
      // fresh "login" every time.
      apiClient.post('/api/users/log-login').catch(() => {});

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
      // priority over 2FA — a temp password must be replaced first. Same
      // decision tree the "already signed in" effect above uses.
      await redirectAfterAuth(data);
    } catch (err) {
      const code = (err as AuthError)?.code;
      if (code === 'auth/invalid-credential' || code === 'auth/wrong-password') {
        // Server independently re-verifies against Firebase before counting
        // this — see server/src/services/loginSecurity.ts. Only after 3
        // confirmed-wrong attempts does it lock the account and email a
        // "was this you?" link, which `locked` reflects here.
        try {
          const { locked } = await apiClient.reportFailedLogin(trimmedEmail, password);
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

  const handleGoogleSignIn = async () => {
    if (googleSubmitting) return;
    setGoogleSubmitting(true);
    setError('');
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      apiClient.post('/api/users/log-login').catch(() => {});

      const userSnap = await getDoc(doc(db, 'users', cred.user.uid));
      const data = userSnap.exists() ? (userSnap.data() as UserDoc) : null;

      if (!data) {
        // Brand-new Google identity, no matching Firestore doc — this is a
        // genuinely new account, not an existing one. Route to the same
        // academic-info completion form self-signup would otherwise collect,
        // rather than silently creating a bare account.
        router.push('/complete-profile');
        return;
      }
      await redirectAfterAuth(data);
    } catch (err) {
      const e = err as AuthError;
      if (e.code === 'auth/account-exists-with-different-credential') {
        // This email already has a password-based account under a different
        // uid — link the Google credential onto THAT account instead of
        // ending up with two identities for the same person (every project/
        // milestone/grade in this app references a person by uid).
        const pendingCredential = GoogleAuthProvider.credentialFromError(e);
        const email = (e.customData as { email?: string } | undefined)?.email;
        if (pendingCredential && email) {
          setLinkingPrompt({ email, pendingCredential });
        } else {
          setError(t('loginError'));
        }
      } else if (e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request') {
        // User closed the popup — not an error worth surfacing.
      } else {
        // Logged so the actual Firebase error code (e.g. auth/unauthorized-
        // -domain, auth/operation-not-allowed, auth/popup-blocked) is visible
        // in the console instead of only ever showing the generic message.
        console.error('Google sign-in failed:', e.code, e.message);
        setError(t('loginError'));
      }
    } finally {
      setGoogleSubmitting(false);
    }
  };

  const handleAppleSignIn = async () => {
    if (appleSubmitting) return;
    setAppleSubmitting(true);
    setError('');
    try {
      const cred = await signInWithPopup(auth, appleProvider);
      apiClient.post('/api/users/log-login').catch(() => {});

      const userSnap = await getDoc(doc(db, 'users', cred.user.uid));
      const data = userSnap.exists() ? (userSnap.data() as UserDoc) : null;

      if (!data) {
        // Brand-new Apple identity, no matching Firestore doc — same
        // "genuinely new account" path Google sign-in uses.
        router.push('/complete-profile');
        return;
      }
      await redirectAfterAuth(data);
    } catch (err) {
      const e = err as AuthError;
      if (e.code === 'auth/account-exists-with-different-credential') {
        // Same account-linking recipe as Google — link onto the existing
        // password-based account instead of creating a second uid.
        const pendingCredential = OAuthProvider.credentialFromError(e);
        const email = (e.customData as { email?: string } | undefined)?.email;
        if (pendingCredential && email) {
          setLinkingPrompt({ email, pendingCredential });
        } else {
          setError(t('loginError'));
        }
      } else if (e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request') {
        // User closed the popup — not an error worth surfacing.
      } else {
        console.error('Apple sign-in failed:', e.code, e.message);
        setError(t('loginError'));
      }
    } finally {
      setAppleSubmitting(false);
    }
  };

  const handleLinkSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!linkingPrompt || linkingSubmitting) return;
    setLinkingSubmitting(true);
    setLinkingError('');
    try {
      const cred = await signInWithEmailAndPassword(auth, linkingPrompt.email, linkingPassword);
      await linkWithCredential(cred.user, linkingPrompt.pendingCredential);
      apiClient.post('/api/users/log-login').catch(() => {});

      const userSnap = await getDoc(doc(db, 'users', cred.user.uid));
      const data = userSnap.exists() ? (userSnap.data() as UserDoc) : null;
      if (!data) {
        // Shouldn't happen (this uid already had a password-based account by
        // definition), but fail safely rather than assume.
        setLinkingError(t('loginError'));
        return;
      }
      setLinkingPrompt(null);
      await redirectAfterAuth(data);
    } catch (err) {
      const code = (err as AuthError)?.code;
      if (code === 'auth/invalid-credential' || code === 'auth/wrong-password') {
        setLinkingError(lang === 'he' ? 'דוא"ל או סיסמה שגויים.' : 'Incorrect email or password.');
      } else {
        setLinkingError(t('loginError'));
      }
    } finally {
      setLinkingSubmitting(false);
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
                  className="w-full rounded-lg border border-line bg-paper px-3.5 py-2.5 pr-11 text-sm text-ink placeholder:text-muted focus:border-primary focus:bg-surface focus:outline-none"
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  // Fixed to the right regardless of page language direction
                  // — the input above is forced dir="ltr" (passwords always
                  // display left-to-right), so a logical `end-*` position
                  // would flip to the left in Hebrew/RTL mode and sit right
                  // on top of the password text instead of clear of it.
                  className="absolute inset-y-0 right-2 flex items-center px-2 text-sm text-muted hover:text-ink"
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

            <div className="my-4 flex items-center gap-3 text-xs text-muted">
              <span className="h-px flex-1 bg-line" />
              {lang === 'he' ? 'או' : 'or'}
              <span className="h-px flex-1 bg-line" />
            </div>

            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={googleSubmitting}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-line bg-surface py-2.5 text-sm font-medium text-ink transition-colors hover:bg-paper disabled:cursor-not-allowed disabled:opacity-60"
            >
              <GoogleIcon />
              {googleSubmitting ? '…' : lang === 'he' ? 'המשך עם Google' : 'Continue with Google'}
            </button>

            {showAppleButton && (
              <button
                type="button"
                onClick={handleAppleSignIn}
                disabled={appleSubmitting}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-line bg-surface py-2.5 text-sm font-medium text-ink transition-colors hover:bg-paper disabled:cursor-not-allowed disabled:opacity-60"
              >
                <AppleIcon />
                {appleSubmitting ? '…' : lang === 'he' ? 'המשך עם Apple' : 'Continue with Apple'}
              </button>
            )}

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

      {linkingPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-[var(--radius)] border border-line bg-surface p-6 shadow-lg">
            <h2 className="text-base font-semibold text-ink">
              {lang === 'he' ? 'חשבון עם דוא"ל זה כבר קיים' : 'An account with this email already exists'}
            </h2>
            <p className="mt-1.5 text-sm text-muted">
              {lang === 'he'
                ? `הזן/י את הסיסמה של ${linkingPrompt.email} כדי לחבר את ההתחברות הזו לחשבון הקיים שלך.`
                : `Enter the password for ${linkingPrompt.email} to link this sign-in to your existing account.`}
            </p>
            <form onSubmit={handleLinkSubmit} className="mt-4">
              <input
                type="password"
                dir="ltr"
                autoFocus
                value={linkingPassword}
                onChange={(e) => {
                  setLinkingPassword(e.target.value);
                  setLinkingError('');
                }}
                className="w-full rounded-lg border border-line bg-paper px-3.5 py-2.5 text-sm text-ink focus:border-primary focus:bg-surface focus:outline-none"
                placeholder={lang === 'he' ? 'סיסמה' : 'Password'}
                required
              />
              {linkingError && <p className="mt-2 text-sm text-danger">{linkingError}</p>}
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setLinkingPrompt(null);
                    setLinkingPassword('');
                    setLinkingError('');
                  }}
                  className="flex-1 rounded-lg border border-line py-2.5 text-sm font-medium text-ink hover:bg-paper"
                >
                  {lang === 'he' ? 'ביטול' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={linkingSubmitting}
                  className="flex-1 rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-ink hover:bg-primary-hover disabled:opacity-60"
                >
                  {linkingSubmitting ? '…' : lang === 'he' ? 'חבר חשבון' : 'Link account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <footer className="pb-6 text-center text-xs text-muted">
        {lang === 'he'
          ? `כל הזכויות שמורות ל-HIT ${new Date().getFullYear()}`
          : `All rights reserved to HIT ${new Date().getFullYear()}`}
      </footer>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.56 2.7-3.87 2.7-6.62z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.9v2.33A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.95 10.7A5.4 5.4 0 0 1 3.66 9c0-.59.1-1.17.29-1.7V4.97H.9A9 9 0 0 0 0 9c0 1.45.35 2.83.9 4.03l3.05-2.33z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.46 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .9 4.97l3.05 2.33C4.66 5.17 6.65 3.58 9 3.58z" />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="currentColor"
        d="M13.5 9.6c-.02-1.85 1.5-2.74 1.57-2.78-.86-1.25-2.19-1.42-2.66-1.44-1.13-.11-2.2.66-2.78.66-.58 0-1.47-.65-2.42-.63-1.24.02-2.4.72-3.04 1.83-1.3 2.25-.33 5.58.93 7.4.62.9 1.35 1.9 2.32 1.86.93-.04 1.28-.6 2.4-.6s1.44.6 2.42.58c1-.02 1.63-.9 2.24-1.8.71-1.03 1-2.03 1.01-2.08-.02-.01-1.94-.75-1.96-2.99zM11.7 3.8c.51-.63.86-1.5.76-2.37-.74.03-1.64.49-2.17 1.11-.47.55-.89 1.45-.78 2.3.83.06 1.68-.42 2.19-1.04z"
      />
    </svg>
  );
}
