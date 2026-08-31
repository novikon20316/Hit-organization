'use client';

// components/dashboard/DashboardShell.tsx
// Shared chrome for every signed-in page, across all nine roles — not just
// admin. The colored top rail is the "which role context am I in" signature
// from globals.css/.role-rail, driven by the signed-in user's own role so it
// stays correct automatically as we build out the other role dashboards.

import { useState, type ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { usePresenceHeartbeat } from '@/hooks/usePresenceHeartbeat';
import { useLanguage } from '@/contexts/LanguageContext';
import { DeleteAccountModal } from '@/components/DeleteAccountModal';
import { ChatbotFab } from '@/components/ChatbotFab';
import { getRoleAccent } from '@/lib/facultyColors';
import { roleLabel, type AppRole } from '@/lib/i18n';
import { getHomeRoute } from '@/lib/roles';

interface DashboardShellProps {
  title: string;
  subtitle?: string;
  /** Hide the "go back" arrow — for each role's own home/overview page,
   *  where there's nowhere further back to go within the app. */
  showBackButton?: boolean;
  children: ReactNode;
}

const TOTP_NUDGE_DISMISS_KEY = 'totpNudgeDismissedAt';

export function DashboardShell({ title, subtitle, showBackButton = true, children }: DashboardShellProps) {
  const router = useRouter();
  const { firebaseUser, userData, activeRole } = useAuth();
  const { lang } = useLanguage();
  usePresenceHeartbeat(!!firebaseUser);
  const railColor = getRoleAccent(activeRole);
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);
  const [totpNudgeDismissed, setTotpNudgeDismissed] = useState(
    () => typeof window !== 'undefined' && sessionStorage.getItem(TOTP_NUDGE_DISMISS_KEY) === '1'
  );

  const dismissTotpNudge = () => {
    setTotpNudgeDismissed(true);
    sessionStorage.setItem(TOTP_NUDGE_DISMISS_KEY, '1');
  };

  const showTotpNudge = !!userData && !userData.totp_enabled && !totpNudgeDismissed;

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <header
        className="role-rail border-b border-line bg-surface"
        style={{ '--rail-color': railColor } as React.CSSProperties}
      >
        <div className="mx-auto max-w-6xl px-4 py-3 sm:px-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex min-w-0 flex-1 items-center gap-2 sm:flex-initial">
              {showBackButton && (
                <button
                  type="button"
                  onClick={() => router.back()}
                  title={lang === 'he' ? 'חזרה' : 'Go back'}
                  aria-label={lang === 'he' ? 'חזרה' : 'Go back'}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line text-ink transition-colors hover:border-primary hover:text-primary"
                >
                  <span className="text-lg leading-none">{lang === 'he' ? '→' : '←'}</span>
                </button>
              )}
              <Link
                href={getHomeRoute(activeRole)}
                title={lang === 'he' ? 'חזרה לדף הבית' : 'Back to home'}
                className="flex min-w-0 flex-1 items-center gap-3 rounded-lg transition-opacity hover:opacity-80 sm:flex-initial"
              >
                <Image src="/hit-logo.png" alt="HIT" width={32} height={19} className="h-6 w-auto shrink-0 object-contain" />
                <div className="min-w-0">
                  <h1 className="truncate text-base font-semibold leading-tight text-ink">{title}</h1>
                  {subtitle && <p className="truncate text-xs text-muted">{subtitle}</p>}
                </div>
              </Link>
            </div>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-3">
            {userData && (
              <div className="flex items-center gap-2">
                <span
                  className="rounded-full px-2.5 py-1 text-xs font-medium"
                  style={{ backgroundColor: `${railColor}1F`, color: railColor }}
                >
                  {roleLabel(activeRole as AppRole, lang)}
                </span>
                <span className="text-sm text-ink">{lang === 'he' ? userData.displayNameHe : userData.displayNameEn}</span>
              </div>
            )}
            <button
              type="button"
              onClick={() => setShowDeleteAccount(true)}
              title={lang === 'he' ? 'מחיקת חשבון' : 'Delete Account'}
              className="rounded-full border border-line px-3 py-1.5 text-sm text-muted transition-colors hover:border-danger hover:text-danger"
            >
              🗑️
            </button>
          </div>
        </div>
      </header>

      {showTotpNudge && (
        <div className="border-b border-line bg-primary/10">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-2 sm:px-6">
            <p className="text-sm text-ink">
              {lang === 'he'
                ? '🔐 לאבטחת החשבון שלך, מומלץ להפעיל אימות דו-שלבי (2FA) בהקדם האפשרי.'
                : "🔐 For your account's security, it's recommended to enable two-factor authentication (2FA) as soon as possible."}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => router.push('/setup-2fa')}
                className="rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-ink hover:bg-primary-hover"
              >
                {lang === 'he' ? 'הפעל עכשיו' : 'Enable Now'}
              </button>
              <button
                type="button"
                onClick={dismissTotpNudge}
                className="rounded-full border border-line px-3 py-1 text-xs font-medium text-muted hover:text-ink"
              >
                {lang === 'he' ? 'מאוחר יותר' : 'Later'}
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">{children}</main>

      {showDeleteAccount && (
        <DeleteAccountModal
          onClose={() => setShowDeleteAccount(false)}
          onRequested={() => {
            setShowDeleteAccount(false);
            router.replace('/account-deletion-pending');
          }}
        />
      )}

      {activeRole !== 'system_admin' && <ChatbotFab />}
    </div>
  );
}
