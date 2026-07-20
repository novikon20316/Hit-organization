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
import { useLanguage } from '@/contexts/LanguageContext';
import { LanguageToggle } from '@/components/LanguageToggle';
import { NotificationBell } from '@/components/NotificationBell';
import { DeleteAccountModal } from '@/components/DeleteAccountModal';
import { getRoleAccent } from '@/lib/facultyColors';
import { roleLabel, type AppRole } from '@/lib/i18n';
import { getHomeRoute } from '@/lib/roles';

interface DashboardShellProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  /** Extra controls rendered next to the language toggle (e.g. a primary
   *  "New X" action for the current page). */
  actions?: ReactNode;
  /** Runs before the actual sign-out (Firebase signOut + redirect to
   *  /login) — e.g. calling a backend logout endpoint or unsubscribing live
   *  Firestore listeners first. Failures here don't block sign-out. */
  onBeforeSignOut?: () => void | Promise<void>;
}

const TOTP_NUDGE_DISMISS_KEY = 'totpNudgeDismissedAt';

export function DashboardShell({ title, subtitle, children, actions, onBeforeSignOut }: DashboardShellProps) {
  const router = useRouter();
  const { userData, logout } = useAuth();
  const { lang } = useLanguage();
  const railColor = getRoleAccent(userData?.role);
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);
  // Every per-page nav link (Reports, Workflow Templates, Academic Year, Bulk
  // Permissions, ...) gets injected here via `actions` — on a narrow viewport
  // that row has nowhere to go but overflow. Below `sm`, it (plus language/
  // role/delete/sign-out) collapses into this hamburger dropdown instead.
  const [menuOpen, setMenuOpen] = useState(false);
  const [totpNudgeDismissed, setTotpNudgeDismissed] = useState(
    () => typeof window !== 'undefined' && sessionStorage.getItem(TOTP_NUDGE_DISMISS_KEY) === '1'
  );

  const dismissTotpNudge = () => {
    setTotpNudgeDismissed(true);
    sessionStorage.setItem(TOTP_NUDGE_DISMISS_KEY, '1');
  };

  const showTotpNudge = !!userData && !userData.totp_enabled && !totpNudgeDismissed;

  const handleLogout = async () => {
    try {
      await onBeforeSignOut?.();
    } catch (err) {
      console.error('onBeforeSignOut failed — continuing with sign-out anyway:', err);
    }
    await logout();
    router.replace('/login');
  };

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <header
        className="role-rail border-b border-line bg-surface"
        style={{ '--rail-color': railColor } as React.CSSProperties}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link
            href={getHomeRoute(userData?.role)}
            title={lang === 'he' ? 'חזרה לדף הבית' : 'Back to home'}
            className="flex min-w-0 flex-1 items-center gap-3 rounded-lg transition-opacity hover:opacity-80 sm:flex-initial"
          >
            <Image src="/hit-logo.png" alt="HIT" width={32} height={19} className="h-6 w-auto shrink-0 object-contain" />
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold leading-tight text-ink">{title}</h1>
              {subtitle && <p className="truncate text-xs text-muted">{subtitle}</p>}
            </div>
          </Link>

          <div className="flex shrink-0 items-center gap-3">
            <NotificationBell />

            {/* Desktop: everything inline, unchanged. */}
            <div className="hidden items-center gap-3 sm:flex">
              {actions}
              <LanguageToggle />
              {userData && (
                <div className="flex items-center gap-2">
                  <span
                    className="rounded-full px-2.5 py-1 text-xs font-medium"
                    style={{ backgroundColor: `${railColor}1F`, color: railColor }}
                  >
                    {roleLabel(userData.role as AppRole, lang)}
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
              <button
                type="button"
                onClick={handleLogout}
                className="rounded-full border border-line px-3.5 py-1.5 text-sm font-medium text-ink transition-colors hover:border-danger hover:text-danger"
              >
                {lang === 'he' ? 'יציאה' : 'Sign Out'}
              </button>
            </div>

            {/* Mobile: everything above folds into this hamburger toggle. */}
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label={lang === 'he' ? 'תפריט' : 'Menu'}
              aria-expanded={menuOpen}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-line text-ink sm:hidden"
            >
              <span className="text-lg leading-none">{menuOpen ? '✕' : '☰'}</span>
            </button>
          </div>
        </div>

        {menuOpen && (
          <div className="border-t border-line bg-surface px-4 py-3 sm:hidden">
            {userData && (
              <div className="mb-3 flex items-center gap-2">
                <span
                  className="rounded-full px-2.5 py-1 text-xs font-medium"
                  style={{ backgroundColor: `${railColor}1F`, color: railColor }}
                >
                  {roleLabel(userData.role as AppRole, lang)}
                </span>
                <span className="text-sm text-ink">{lang === 'he' ? userData.displayNameHe : userData.displayNameEn}</span>
              </div>
            )}
            {actions && (
              // `actions` is arbitrary page-provided markup (often its own
              // `flex items-center gap-2` row of link pills) — this can't
              // force it into a column, but flex-wrap keeps it from
              // overflowing horizontally in the narrow dropdown instead.
              <div className="mb-3 flex flex-wrap items-center gap-2 [&>div]:flex-wrap [&>div]:gap-2 [&_a]:text-center [&_button]:text-center">
                {actions}
              </div>
            )}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between rounded-lg border border-line px-3 py-2">
                <span className="text-sm text-ink">{lang === 'he' ? 'שפה' : 'Language'}</span>
                <LanguageToggle />
              </div>
              <button
                type="button"
                onClick={() => { setMenuOpen(false); setShowDeleteAccount(true); }}
                className="rounded-lg border border-line px-3 py-2 text-start text-sm text-muted hover:border-danger hover:text-danger"
              >
                🗑️ {lang === 'he' ? 'מחיקת חשבון' : 'Delete Account'}
              </button>
              <button
                type="button"
                onClick={handleLogout}
                className="rounded-lg border border-line px-3 py-2 text-start text-sm font-medium text-ink hover:border-danger hover:text-danger"
              >
                {lang === 'he' ? '🚪 יציאה' : '🚪 Sign Out'}
              </button>
            </div>
          </div>
        )}
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
    </div>
  );
}
