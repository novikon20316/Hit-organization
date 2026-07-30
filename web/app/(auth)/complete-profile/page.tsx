'use client';

// app/(auth)/complete-profile/page.tsx
// Reached only from login/page.tsx's "Continue with Google" flow, for a
// Google identity with no matching Firestore users/{uid} doc — i.e. a
// genuinely new account, not an existing one (existing accounts either log
// straight in, or go through the linking-password prompt on the login page
// itself). Google already gives us a verified email + display name; this
// collects the same academic-info fields self-signup's second half does
// (studentId/faculty/program/year/phone), then calls the exact same,
// unmodified POST /api/users/sync self-signup uses — no server changes were
// needed for this feature (see the plan for why: syncData already gates on
// the ID token's own email_verified claim, which Google-issued tokens always
// satisfy, validates newUid against the caller's own uid, and hard-locks
// role to 'student').

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { auth } from '@/lib/firebase';
import { apiClient } from '@/lib/apiClient';
import { HIT_FACULTIES, PROGRAM_DEGREE_LENGTHS } from '@/lib/faculties';
import { VALID_FACULTY_IDS, getHomeRoute, type UserDoc } from '@/lib/roles';
import { useMaintenanceCheck } from '@/hooks/useMaintenanceCheck';
import { useLanguage } from '@/contexts/LanguageContext';
import { LanguageToggle } from '@/components/LanguageToggle';

const SELECTABLE_FACULTIES = VALID_FACULTY_IDS.filter((id) => id !== 'all');

function isValidStudentId(id: string): boolean {
  return /^\d{9}$/.test(id);
}

export default function CompleteProfilePage() {
  const router = useRouter();
  const { lang } = useLanguage();
  const checkMaintenance = useMaintenanceCheck();

  const [checkingAuth, setCheckingAuth] = useState(true);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [studentId, setStudentId] = useState('');
  const [facultyId, setFacultyId] = useState('');
  const [programKey, setProgramKey] = useState('');
  const [yearOfStudy, setYearOfStudy] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // This screen only makes sense for an already-Google-authenticated,
  // Firestore-doc-less session — reached by navigation from login/page.tsx,
  // never by a direct URL visit with no session at all.
  useEffect(() => {
    const user = auth.currentUser;
    if (!user) {
      router.replace('/login');
      return;
    }
    setDisplayName(user.displayName ?? '');
    setEmail(user.email ?? '');
    setCheckingAuth(false);
  }, [router]);

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

  const canSave = Boolean(
    phoneNumber.length >= 9 && isValidStudentId(studentId) && facultyId && programKey && yearOfStudy
  );

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    const user = auth.currentUser;
    if (!canSave || saving || !user) return;
    setSaving(true);
    setError('');
    try {
      // Same fail-fast pre-check self-signup does — POST /api/users/sync
      // re-checks this authoritatively regardless.
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

      await user.getIdToken(true);
      const res = await apiClient.syncUserProfile({
        newUid: user.uid,
        email,
        displayName: displayName || email,
        role: 'student',
        facultyId,
        degreeType: degreeType!,
        yearOfStudy: yearOfStudy!,
        major: selectedProgram!.slug,
        studentId,
      });
      if (!res.success) throw new Error(res.message ?? 'Sync failed');

      // Already in a live, Google-verified session — no need for the
      // email-verification-flow's "go back to /login" hop.
      const maintenance = await checkMaintenance('student');
      if (maintenance.blocked) {
        const params = new URLSearchParams({ title: maintenance.title, endsAt: maintenance.endsAt ?? '' });
        router.replace(`/maintenance?${params.toString()}`);
        return;
      }
      router.replace(getHomeRoute('student' as UserDoc['role']));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed.');
    } finally {
      setSaving(false);
    }
  };

  const inputCls =
    'w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink focus:border-primary focus:bg-surface focus:outline-none disabled:opacity-60';

  if (checkingAuth) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper">
        <p className="text-sm text-muted">…</p>
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
            <h1 className="text-2xl font-semibold tracking-tight text-ink">
              {lang === 'he' ? 'השלמת פרטי לימודים' : 'Complete Your Academic Info'}
            </h1>
            <p className="mt-1 text-sm text-muted">
              {lang === 'he'
                ? `מחובר/ת כ-${email} · יש להיות ברשימת הסטודנטים המאושרים של הפקולטה`
                : `Signed in as ${email} · you'll need to be on your faculty's approved students list`}
            </p>
          </div>

          <form
            onSubmit={handleSave}
            className="role-rail rounded-[var(--radius)] border border-line bg-surface p-6 shadow-sm"
            style={{ '--rail-color': 'var(--primary)' } as React.CSSProperties}
          >
            <div className="grid gap-3">
              <Field label={lang === 'he' ? 'שם מלא' : 'Full Name'}>
                <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className={inputCls} required />
              </Field>

              <Field label={lang === 'he' ? 'טלפון' : 'Phone'}>
                <input dir="ltr" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} className={inputCls} required />
              </Field>

              <Field label={lang === 'he' ? 'מספר תעודת זהות (9 ספרות)' : 'Student ID (9 digits)'}>
                <input
                  dir="ltr"
                  value={studentId}
                  onChange={(e) => setStudentId(e.target.value.replace(/\D/g, '').slice(0, 9))}
                  className={inputCls}
                  required
                />
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
                <select
                  value={yearOfStudy ?? ''}
                  onChange={(e) => setYearOfStudy(Number(e.target.value))}
                  className={inputCls}
                  disabled={!programKey}
                >
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

            <button
              type="submit"
              disabled={!canSave || saving}
              className="mt-4 w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-ink hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? '…' : lang === 'he' ? 'סיום הרשמה' : 'Finish Sign Up'}
            </button>
          </form>
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
