'use client';

// app/student/home/GenderPrompt.tsx
// One-time prompt for students whose profile has no gender yet (everyone
// who signed up before signup asked for it) — used for gendered wording on
// official forms, e.g. "מר"/"גברת" on the thesis examiner's form. Disappears
// once answered; staff can also set or correct it from the student's page.

import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/apiClient';

export function GenderPrompt() {
  const { userData } = useAuth();
  const { lang } = useLanguage();
  const he = lang === 'he';
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const current = (userData as { gender?: string | null } | null)?.gender;
  if (!userData || current === 'male' || current === 'female' || saved) return null;

  const save = async (gender: 'male' | 'female') => {
    setBusy(true);
    setError('');
    try {
      await apiClient.setMyGender(gender);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : he ? 'השמירה נכשלה' : 'Failed to save');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mb-4 rounded-xl border border-student-outline-variant bg-student-surface-container-lowest p-4" role="region" aria-label={he ? 'השלמת פרטים' : 'Complete your details'}>
      <p className="text-sm font-semibold text-student-on-surface">{he ? 'השלמת פרטים: מגדר' : 'Complete your details: gender'}</p>
      <p className="mt-1 text-xs text-student-on-surface-variant">{he ? 'משמש לפנייה נכונה בטפסים רשמיים (למשל "מר" / "גברת").' : 'Used for correct wording on official forms (e.g. "Mr." / "Ms.").'}</p>
      <div className="mt-3 flex gap-2">
        <button type="button" disabled={busy} onClick={() => save('male')} className="rounded-lg border border-student-outline-variant px-4 py-1.5 text-sm font-medium text-student-on-surface hover:border-student-primary disabled:opacity-60">{he ? 'זכר' : 'Male'}</button>
        <button type="button" disabled={busy} onClick={() => save('female')} className="rounded-lg border border-student-outline-variant px-4 py-1.5 text-sm font-medium text-student-on-surface hover:border-student-primary disabled:opacity-60">{he ? 'נקבה' : 'Female'}</button>
      </div>
      {error && <p className="mt-2 text-xs text-danger" role="alert">{error}</p>}
    </div>
  );
}
