'use client';

// app/account-deletion-pending/page.tsx
// Web port of mobile/app/account-deletion-pending.tsx — shown instead of the
// normal role home for the duration of the account-deletion grace period
// (server/src/services/accountDeletion.ts). Reachable regardless of role;
// useRequireRole redirects here for ANY role whenever the live user-doc
// subscription reports pendingDeletion: true. Deliberately NOT gated with
// useRequireRole itself (no role allowlist) — only a signed-in firebaseUser
// is required, since a user in the grace period must still be able to reach
// this page to cancel.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient, ApiError } from '@/lib/apiClient';
import { getHomeRoute, type AppRole } from '@/lib/roles';

// Same normalization DefenseTab.tsx's parseServerDate uses — the profile
// endpoint (GET /api/users/profile) returns the raw Firestore doc, so
// deletionScheduledFor arrives as a `{ _seconds, _nanoseconds }` object, not
// an ISO string or client Timestamp instance.
function parseServerDate(value: unknown): Date | null {
  if (!value) return null;
  if (typeof value === 'string') {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === 'object') {
    const obj = value as { toDate?: () => Date; _seconds?: number };
    if (typeof obj.toDate === 'function') return obj.toDate();
    if (typeof obj._seconds === 'number') return new Date(obj._seconds * 1000);
  }
  return null;
}

export default function AccountDeletionPendingPage() {
  const router = useRouter();
  const { firebaseUser, loading: authLoading, logout } = useAuth();
  const { lang } = useLanguage();
  const isRtl = lang === 'he';

  const [loadingProfile, setLoadingProfile] = useState(true);
  const [deletionReason, setDeletionReason] = useState<'self_requested' | 'graduated' | null>(null);
  const [scheduledFor, setScheduledFor] = useState<Date | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (authLoading) return;
    if (!firebaseUser) {
      router.replace('/login');
    }
  }, [authLoading, firebaseUser, router]);

  useEffect(() => {
    if (!firebaseUser) return;
    (async () => {
      try {
        const profile = await apiClient.getMyProfile();
        const reason = profile.deletionReason;
        setDeletionReason(reason === 'graduated' || reason === 'self_requested' ? reason : null);
        setScheduledFor(parseServerDate(profile.deletionScheduledFor));
      } catch (err) {
        console.error('Failed to load account deletion status:', err);
      } finally {
        setLoadingProfile(false);
      }
    })();
  }, [firebaseUser]);

  const handleCancel = async () => {
    setBusy(true);
    setError('');
    try {
      await apiClient.cancelAccountDeletion();
      const profile = await apiClient.getMyProfile();
      router.replace(getHomeRoute(profile.role as AppRole | undefined));
    } catch (err) {
      console.error('Failed to cancel account deletion:', err);
      setError(
        err instanceof ApiError
          ? err.message
          : lang === 'he'
            ? 'ביטול המחיקה נכשל. נסה שוב.'
            : 'Failed to cancel deletion. Please try again.'
      );
      setBusy(false);
    }
  };

  const handleSignOut = async () => {
    await logout();
    router.replace('/login');
  };

  if (authLoading || !firebaseUser || loadingProfile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper">
        <p className="text-sm text-muted">…</p>
      </div>
    );
  }

  const graduated = deletionReason === 'graduated';
  const formattedDate = scheduledFor ? scheduledFor.toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-US', { day: 'numeric', month: 'long', year: 'numeric' }) : null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper p-4">
      <div className="w-full max-w-md rounded-[var(--radius)] border border-line bg-surface p-6 text-center shadow-lg">
        <p className="text-4xl">🗑️</p>
        <h1 className={`mt-3 text-lg font-semibold text-ink ${isRtl ? 'text-right' : ''}`}>
          {lang === 'he' ? 'החשבון שלך מיועד למחיקה' : 'Your account is scheduled for deletion'}
        </h1>

        <p className={`mt-3 text-sm text-muted ${isRtl ? 'text-right' : ''}`}>
          {graduated
            ? lang === 'he'
              ? 'לפי הרישומים שלנו סיימת את משך הלימודים הצפוי של התוכנית שלך.'
              : "Our records show you've completed your program's expected duration."
            : lang === 'he'
              ? 'ביקשת למחוק את החשבון שלך.'
              : 'You requested to delete your account.'}
        </p>

        {formattedDate && (
          <p className={`mt-3 rounded-md bg-danger-bg px-3 py-2 text-sm font-medium text-danger ${isRtl ? 'text-right' : ''}`}>
            {lang === 'he'
              ? `החשבון יימחק לצמיתות בתאריך ${formattedDate}, אלא אם תבטל.`
              : `Your account will be permanently deleted on ${formattedDate} unless you cancel.`}
          </p>
        )}

        {error && <p className="mt-3 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">{error}</p>}

        <button
          type="button"
          onClick={handleCancel}
          disabled={busy}
          className="mt-5 w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-ink hover:bg-primary-hover disabled:opacity-60"
        >
          {busy ? '…' : lang === 'he' ? 'בטל את המחיקה' : 'Cancel Deletion'}
        </button>

        <button
          type="button"
          onClick={handleSignOut}
          disabled={busy}
          className="mt-2 w-full rounded-lg border border-line py-2.5 text-sm font-medium text-ink hover:bg-paper"
        >
          {lang === 'he' ? 'יציאה' : 'Sign Out'}
        </button>
      </div>
    </div>
  );
}
