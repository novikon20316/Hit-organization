'use client';

// app/choose-track/page.tsx
// Mandatory thesis-vs-project decision for a coordinator_gated masters
// computer_science student whose grade average qualified them for the
// thesis track (see config/studentTrack.ts, THESIS_ELIGIBILITY_THRESHOLD).
// Reached only via useRequireRole's pendingTrackChoice redirect — same
// "cannot escape" shape as (auth)/change-password/page.tsx, deliberately
// with no close button, no backdrop, and nothing else to navigate to. The
// redirect re-fires on every navigation and app reopen until trackLocked
// flips true, so there's no way to dismiss this without deciding.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient, ApiError } from '@/lib/apiClient';
import { useLanguage } from '@/contexts/LanguageContext';
import { LanguageToggle } from '@/components/LanguageToggle';
import { getHomeRoute } from '@/lib/roles';

export default function ChooseTrackPage() {
  const router = useRouter();
  const { lang } = useLanguage();

  const [choosing, setChoosing] = useState<'thesis' | 'project' | null>(null);
  const [error, setError] = useState('');

  const handleChoose = async (track: 'thesis' | 'project') => {
    setChoosing(track);
    setError('');
    try {
      await apiClient.post('/api/student/track/choose', { track });
      // AuthContext's userData is a live onSnapshot listener — it'll pick up
      // trackLocked:true on its own shortly; no manual refetch needed, same
      // as (auth)/change-password/page.tsx's identical navigate-immediately
      // pattern after its own server-side state change.
      router.replace(getHomeRoute('student'));
    } catch (err) {
      setError(
        err instanceof ApiError
          ? (lang === 'he' ? (err.body as { messageHe?: string })?.messageHe : undefined) || err.message
          : lang === 'he' ? 'משהו השתבש. אנא נסה/י שוב.' : 'Something went wrong. Please try again.'
      );
      setChoosing(null);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <header className="flex justify-end p-4">
        <LanguageToggle />
      </header>

      <main className="flex flex-1 items-center justify-center px-4 pb-16">
        <div className="w-full max-w-sm role-rail rounded-[var(--radius)] border border-line bg-surface p-6 shadow-sm" style={{ '--rail-color': 'var(--primary)' } as React.CSSProperties}>
          <div className="mb-5 text-center">
            <p className="mb-2 text-2xl">🎉</p>
            <h1 className="text-xl font-semibold tracking-tight text-ink">
              {lang === 'he' ? 'הממוצע שלך גבוה מאוד! 🎉' : 'Your average is exceptionally high! 🎉'}
            </h1>
            <p className="mt-2 text-sm text-muted">
              {lang === 'he'
                ? 'עליך לבחור באיזה מסלול להמשיך – תזה או פרויקט גמר. לא ניתן לדחות את הבחירה.'
                : "You must choose which track to continue on — thesis or final project. This choice can't be postponed."}
            </p>
          </div>

          {error && <p className="mb-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>}

          <div className="flex gap-3">
            <button
              type="button"
              disabled={choosing !== null}
              onClick={() => handleChoose('thesis')}
              className="flex-1 rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-ink hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
            >
              {choosing === 'thesis' ? '…' : lang === 'he' ? 'תזה' : 'Thesis'}
            </button>
            <button
              type="button"
              disabled={choosing !== null}
              onClick={() => handleChoose('project')}
              className="flex-1 rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-ink hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
            >
              {choosing === 'project' ? '…' : lang === 'he' ? 'פרויקט גמר' : 'Final Project'}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
