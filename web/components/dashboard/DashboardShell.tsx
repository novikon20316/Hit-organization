'use client';

// components/dashboard/DashboardShell.tsx
// Shared chrome for every signed-in page, across all nine roles — not just
// admin. The colored top rail is the "which role context am I in" signature
// from globals.css/.role-rail, driven by the signed-in user's own role so it
// stays correct automatically as we build out the other role dashboards.

import { useState, type ReactNode } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { LanguageToggle } from '@/components/LanguageToggle';
import { NotificationBell } from '@/components/NotificationBell';
import { DeleteAccountModal } from '@/components/DeleteAccountModal';
import { getRoleAccent } from '@/lib/facultyColors';
import { roleLabel, type AppRole } from '@/lib/i18n';

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

export function DashboardShell({ title, subtitle, children, actions, onBeforeSignOut }: DashboardShellProps) {
  const router = useRouter();
  const { userData, logout } = useAuth();
  const { lang } = useLanguage();
  const railColor = getRoleAccent(userData?.role);
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);

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
          <div className="flex items-center gap-3">
            <Image src="/hit-logo.png" alt="HIT" width={32} height={19} className="h-6 w-auto object-contain" />
            <div>
              <h1 className="text-base font-semibold leading-tight text-ink">{title}</h1>
              {subtitle && <p className="text-xs text-muted">{subtitle}</p>}
            </div>
          </div>

          <div className="flex items-center gap-3">
            {actions}
            <NotificationBell />
            <LanguageToggle />
            {userData && (
              <div className="hidden items-center gap-2 sm:flex">
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
              className="hidden rounded-full border border-line px-3 py-1.5 text-sm text-muted transition-colors hover:border-danger hover:text-danger sm:inline-flex"
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
        </div>
      </header>

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
