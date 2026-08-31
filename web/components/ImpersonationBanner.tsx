'use client';

// components/ImpersonationBanner.tsx
//
// Temporary debug tool (see server/src/config/featureFlags.ts's
// IMPERSONATION_ENABLED). Mounted once at the root layout so it's visible on
// every route while a system_admin is signed in as another user (started
// from UserRow.tsx's Impersonate button) — with a one-click way back that
// needs no further server round-trip (see lib/impersonation.ts).

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { signInWithCustomToken } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { getActiveImpersonation, clearActiveImpersonation, type ImpersonationSession } from '@/lib/impersonation';

export function ImpersonationBanner() {
  const router = useRouter();
  const { lang } = useLanguage();
  const { firebaseUser } = useAuth();
  const [session, setSession] = useState<ImpersonationSession | null>(null);
  const [returning, setReturning] = useState(false);

  // sessionStorage changes don't trigger a re-render on their own — re-check
  // on mount and whenever the signed-in identity changes, which is what
  // actually happens right after UserRow signs in as the target user.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing from sessionStorage, an external (non-React) source, on identity change
    setSession(getActiveImpersonation());
  }, [firebaseUser?.uid]);

  // Only show once the switch has actually completed — otherwise there's a
  // brief window (between UserRow storing the session and the sign-in
  // finishing) where firebaseUser is still the admin.
  if (!session || firebaseUser?.uid !== session.targetUid) return null;

  const handleReturn = async () => {
    setReturning(true);
    try {
      await signInWithCustomToken(auth, session.adminReturnToken);
      clearActiveImpersonation();
      setSession(null);
      router.replace('/admin/panel?tab=users');
    } catch (err) {
      console.error('Failed to return to admin session:', err);
      setReturning(false);
    }
  };

  return (
    <div className="sticky top-0 z-50 flex flex-wrap items-center justify-center gap-3 bg-amber-400 px-4 py-2 text-sm font-medium text-amber-950">
      <span>
        🕵️{' '}
        {lang === 'he'
          ? `בהתחזות כ-${session.targetDisplayName || session.targetEmail} — לצורכי דיבוג בלבד`
          : `Viewing as ${session.targetDisplayName || session.targetEmail} — for debugging only`}
      </span>
      <button
        type="button"
        onClick={handleReturn}
        disabled={returning}
        className="rounded-full bg-amber-950 px-3 py-1 text-xs font-semibold text-amber-50 disabled:opacity-60"
      >
        {returning ? '…' : lang === 'he' ? 'חזרה למנהל' : 'Return to Admin'}
      </button>
    </div>
  );
}
