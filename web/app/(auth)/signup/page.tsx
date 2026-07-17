'use client';

// app/(auth)/signup/page.tsx
// Ported from mobile/app/(auth)/signup.tsx — same flow, same validation
// rules, same two-stage (form -> email verification) structure.

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, sendEmailVerification, type User, type AuthError } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { apiClient } from '@/lib/apiClient';
import { HIT_FACULTIES, PROGRAM_DEGREE_LENGTHS } from '@/lib/faculties';
import { VALID_FACULTY_IDS } from '@/lib/roles';
import { useLanguage } from '@/contexts/LanguageContext';
import { LanguageToggle } from '@/components/LanguageToggle';

const SELECTABLE_FACULTIES = VALID_FACULTY_IDS.filter((id) => id !== 'all');

function isValidStudentId(id: string): boolean {
  return /^\d{9}$/.test(id);
}

function getPasswordStrength(password: string, lang: 'he' | 'en'): { valid: boolean; errors: string[] } {
  const rules: Array<[boolean, string]> = [
    [password.length >= 8, lang === 'he' ? 'לפחות 8 תווים' : 'At least 8 characters'],
    [/[A-Z]/.test(password), lang === 'he' ? 'לפחות אות גדולה אחת' : 'At least 1 uppercase letter'],
    [/[a-z]/.test(password), lang === 'he' ? 'לפחות אות קטנה אחת' : 'At least 1 lowercase letter'],
    [/[0-9]/.test(password), lang === 'he' ? 'לפחות ספרה אחת' : 'At least 1 digit'],
    [/[^A-Za-z0-9]/.test(password), lang === 'he' ? 'לפחות סימן אחד (!@#$...)' : 'At least 1 symbol (!@#$...)'],
  ];
  const errors = rules.filter(([ok]) => !ok).map(([, msg]) => msg);
  return { valid: errors.length === 0, errors };
}

/** Creates the Firebase Auth account, or — if the email is already
 *  registered (e.g. the user closed the tab after creating the account but
 *  before verifying/syncing) — signs back into that same pending account
 *  instead of failing outright. */
async function getOrCreateAuthUser(email: string, password: string): Promise<{ user: User; alreadyVerified: boolean }> {
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    return { user: cred.user, alreadyVerified: false };
  } catch (err) {
    if ((err as AuthError).code !== 'auth/email-already-in-use') throw err;
    let cred;
    try {
      cred = await signInWithEmailAndPassword(auth, email, password);
    } catch {
      throw Object.assign(new Error('email-in-use-mismatched-password'), { code: 'auth/email-in-use-mismatched-password' });
    }
    return { user: cred.user, alreadyVerified: cred.user.emailVerified };
  }
}

export default function SignupPage() {
  const router = useRouter();
  const { lang } = useLanguage();

  const [displayName, setDisplayName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [studentId, setStudentId] = useState('');
  const [facultyId, setFacultyId] = useState('');
  const [programKey, setProgramKey] = useState('');
  const [yearOfStudy, setYearOfStudy] = useState<number | null>(null);

  const [stage, setStage] = useState<'form' | 'verify'>('form');
  const [saving, setSaving] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState('');
  const [pendingUser, setPendingUser] = useState<User | null>(null);

  const selectedFaculty = HIT_FACULTIES.find((f) => f.key === facultyId);
  const facultyPrograms = selectedFaculty?.programs ?? [];
  const selectedProgram = facultyPrograms.find((p) => p.key === programKey);
  const degreeType = selectedProgram?.level ?? null;

  const yearOptions: number[] = (() => {
    if (!selectedProgram) return [];
    if (selectedProgram.level === 'masters') return [1, 2];
    const years = PROGRAM_DEGREE_LENGTHS[selectedProgram.slug] ?? PROGRAM_DEGREE_LENGTHS.default;
    return Array.from({ length: years }, (_, i) => i + 1);
  })();

  const passwordCheck = getPasswordStrength(password, lang);

  const canSave = Boolean(
    displayName.trim().length > 1 &&
      phoneNumber.length >= 9 &&
      email.includes('@') &&
      isValidStudentId(studentId) &&
      passwordCheck.valid &&
      facultyId &&
      programKey &&
      yearOfStudy
  );

  const finishRegistration = async (user: User) => {
    await user.getIdToken(true); // force refresh so email_verified is current on the next request
    const res = await apiClient.syncUserProfile({
      newUid: user.uid,
      email,
      displayName,
      role: 'student',
      facultyId,
      degreeType: degreeType!,
      yearOfStudy: yearOfStudy!,
      major: selectedProgram!.slug,
      studentId,
    });
    if (!res.success) throw new Error(res.message ?? 'Sync failed');

    // Small buffer so Firestore propagation completes before onAuthStateChanged
    // fires on the login page, same as mobile.
    await new Promise((resolve) => setTimeout(resolve, 1000));
    router.replace('/login');
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSave || saving) return;
    setSaving(true);
    setError('');
    try {
      // Fail fast, before any Firebase Auth account is created — the entered
      // ID + chosen degree must be on the faculty's pre-uploaded roster.
      // POST /api/users/sync re-checks this authoritatively later; this is
      // purely so an ineligible registration doesn't leave a half-created
      // account behind.
      const eligibility = await apiClient.verifyStudentEligibility({
        studentId,
        facultyId,
        degreeType: degreeType!,
        major: selectedProgram?.slug ?? null,
      });
      if (!eligibility.eligible) {
        setError(
          eligibility.message ||
            (lang === 'he'
              ? 'תעודת הזהות שהוזנה אינה נמצאת ברשימת הסטודנטים המאושרים. פנה לרכז הפקולטה שלך.'
              : 'This ID number was not found on the approved students list. Please contact your faculty coordinator.')
        );
        return;
      }

      const { user, alreadyVerified } = await getOrCreateAuthUser(email.trim(), password);

      if (alreadyVerified) {
        // Resuming a signup where the email was already confirmed but the
        // Firestore sync never completed — finish it now instead of sending
        // another verification email.
        await finishRegistration(user);
        return;
      }

      setPendingUser(user);
      await sendEmailVerification(user);
      setStage('verify');
    } catch (err) {
      const code = (err as AuthError)?.code;
      if (code === 'auth/email-already-in-use' || code === 'auth/email-in-use-mismatched-password') {
        setError(
          lang === 'he'
            ? 'כתובת האימייל כבר רשומה. אם זה החשבון שלך, התחבר או אפס סיסמה.'
            : "This email is already registered. If it's yours, log in or reset your password."
        );
      } else if (code === 'auth/weak-password') {
        setError(lang === 'he' ? 'הסיסמה חלשה מדי.' : 'Password is too weak.');
      } else {
        setError(err instanceof Error ? err.message : 'Registration failed.');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleContinueAfterVerify = async () => {
    const user = pendingUser ?? auth.currentUser;
    if (!user) {
      setError(lang === 'he' ? 'אנא התחל מחדש את ההרשמה.' : 'Please restart signup.');
      setStage('form');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await user.reload();
      if (!user.emailVerified) {
        setError(
          lang === 'he'
            ? 'עדיין לא מאומת. בדוק את תיבת הדואר שלך (כולל ספאם) ולחץ על קישור האימות.'
            : 'Not verified yet. Check your inbox (including spam) and click the verification link.'
        );
        return;
      }
      await finishRegistration(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  };

  const handleResendEmail = async () => {
    const user = pendingUser ?? auth.currentUser;
    if (!user) return;
    setResending(true);
    setError('');
    try {
      await sendEmailVerification(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not resend email.');
    } finally {
      setResending(false);
    }
  };

  const inputCls = 'w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink focus:border-primary focus:bg-surface focus:outline-none disabled:opacity-60';

  if (stage === 'verify') {
    return (
      <div className="flex min-h-screen flex-col bg-paper">
        <header className="flex justify-end p-4">
          <LanguageToggle />
        </header>
        <main className="flex flex-1 items-center justify-center px-4 pb-16">
          <div className="w-full max-w-sm text-center">
            <p className="text-3xl">📧</p>
            <h1 className="mt-2 text-xl font-semibold text-ink">{lang === 'he' ? 'אמת את כתובת הדוא"ל שלך' : 'Verify your email'}</h1>
            <p className="mt-2 text-sm text-muted">
              {lang === 'he' ? `שלחנו קישור אימות אל ${email}. לחץ עליו ואז חזור לכאן.` : `We sent a verification link to ${email}. Click it, then come back here.`}
            </p>

            {error && <p className="mt-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>}

            <button
              type="button"
              onClick={handleContinueAfterVerify}
              disabled={saving}
              className="mt-5 w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-ink hover:bg-primary-hover disabled:opacity-60"
            >
              {saving ? '…' : lang === 'he' ? 'אימתתי — המשך' : "I've verified — Continue"}
            </button>
            <button type="button" onClick={handleResendEmail} disabled={resending} className="mt-3 w-full text-center text-sm text-primary hover:underline">
              {resending ? '…' : lang === 'he' ? 'שלח שוב את מייל האימות' : 'Resend verification email'}
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <header className="flex justify-end p-4">
        <LanguageToggle />
      </header>

      <main className="flex flex-1 items-center justify-center px-4 pb-16">
        <div className="w-full max-w-lg">
          <div className="mb-6 text-center">
            <h1 className="text-2xl font-semibold tracking-tight text-ink">{lang === 'he' ? 'הרשמת סטודנט' : 'Student Sign Up'}</h1>
            <p className="mt-1 text-sm text-muted">
              {lang === 'he' ? 'ליצירת חשבון יש להיות ברשימת הסטודנטים המאושרים של הפקולטה' : "You'll need to be on your faculty's approved students list"}
            </p>
          </div>

          <form onSubmit={handleSave} className="role-rail rounded-[var(--radius)] border border-line bg-surface p-6 shadow-sm" style={{ '--rail-color': 'var(--primary)' } as React.CSSProperties}>
            <div className="grid gap-3">
              <Field label={lang === 'he' ? 'שם מלא' : 'Full Name'}>
                <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className={inputCls} required />
              </Field>

              <Field label={lang === 'he' ? 'טלפון' : 'Phone'}>
                <input dir="ltr" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} className={inputCls} required />
              </Field>

              <Field label={lang === 'he' ? 'דוא"ל' : 'Email'}>
                <input type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} required />
              </Field>

              <Field label={lang === 'he' ? 'מספר תעודת זהות (9 ספרות)' : 'Student ID (9 digits)'}>
                <input dir="ltr" value={studentId} onChange={(e) => setStudentId(e.target.value.replace(/\D/g, '').slice(0, 9))} className={inputCls} required />
              </Field>

              <Field label={lang === 'he' ? 'סיסמה' : 'Password'}>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    dir="ltr"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={`${inputCls} pe-11`}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute inset-y-0 end-2 flex items-center px-2 text-sm text-muted hover:text-ink"
                  >
                    {showPassword ? '🙈' : '👁️'}
                  </button>
                </div>
                {password.length > 0 && !passwordCheck.valid && (
                  <ul className="mt-1.5 grid gap-0.5">
                    {passwordCheck.errors.map((msg) => (
                      <li key={msg} className="text-xs text-danger">
                        · {msg}
                      </li>
                    ))}
                  </ul>
                )}
              </Field>

              <Field label={lang === 'he' ? 'פקולטה' : 'Faculty'}>
                <select
                  value={facultyId}
                  onChange={(e) => {
                    setFacultyId(e.target.value);
                    setProgramKey('');
                    setYearOfStudy(null);
                  }}
                  className={inputCls}
                >
                  <option value="">{lang === 'he' ? 'בחר פקולטה' : 'Select faculty'}</option>
                  {SELECTABLE_FACULTIES.map((id) => {
                    const f = HIT_FACULTIES.find((hf) => hf.key === id);
                    return (
                      <option key={id} value={id}>
                        {f ? f.label[lang] : id}
                      </option>
                    );
                  })}
                </select>
              </Field>

              <Field label={lang === 'he' ? 'תוכנית לימודים' : 'Program'}>
                <select
                  value={programKey}
                  onChange={(e) => {
                    setProgramKey(e.target.value);
                    setYearOfStudy(null);
                  }}
                  className={inputCls}
                  disabled={!facultyId}
                >
                  <option value="">{lang === 'he' ? 'בחר תוכנית' : 'Select program'}</option>
                  {facultyPrograms.map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.label[lang]}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label={lang === 'he' ? 'שנת לימודים' : 'Year of Study'}>
                <select value={yearOfStudy ?? ''} onChange={(e) => setYearOfStudy(Number(e.target.value))} className={inputCls} disabled={!programKey}>
                  <option value="">{lang === 'he' ? 'בחר שנה' : 'Select year'}</option>
                  {yearOptions.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            {error && <p className="mt-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>}

            <p className="mt-4 text-center text-xs text-muted">
              {lang === 'he' ? 'בהרשמה הנך מאשר/ת שקראת את ' : 'By signing up you agree to our '}
              <Link href="/privacy-policy" className="text-primary hover:underline">
                {lang === 'he' ? 'מדיניות הפרטיות' : 'Privacy Policy'}
              </Link>
              {lang === 'he' ? '.' : '.'}
            </p>

            <button
              type="submit"
              disabled={!canSave || saving}
              className="mt-3 w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-ink hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? '…' : lang === 'he' ? 'הרשמה' : 'Sign Up'}
            </button>
          </form>

          <button type="button" onClick={() => router.replace('/login')} className="mt-4 w-full text-center text-sm text-primary hover:underline">
            {lang === 'he' ? 'כבר יש לך חשבון? התחבר' : 'Already have an account? Log in'}
          </button>
        </div>
      </main>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink">{label}</span>
      {children}
    </label>
  );
}
