'use client';

// app/dean/dashboard/page.tsx — mirrors app/division_head/dashboard/page.tsx.
// dean is the terminal sign-off on the Electrical Engineering
// research-proposal chain; this page is just the generic
// PendingSignoffsWidget inside the shared DashboardShell chrome.

import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { useRequireRole } from '@/hooks/useRequireRole';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { PendingSignoffsWidget } from '@/components/dashboard/PendingSignoffsWidget';
import type { AppRole } from '@/lib/roles';

const DEAN_ROLES: AppRole[] = ['dean', 'system_admin'];

export default function DeanDashboardPage() {
  const { loading: guardLoading } = useRequireRole(DEAN_ROLES);
  const { userData, activeRole } = useAuth();
  const { lang } = useLanguage();

  if (guardLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface">
        <p className="text-sm text-muted">…</p>
      </div>
    );
  }

  return (
    <DashboardShell
      title={
        userData?.displayName
          ? `${lang === 'he' ? 'שלום' : 'Hello'}, ${userData.displayName}`
          : activeRole === 'system_admin'
            ? (lang === 'he' ? 'דיקן הפקולטה — תצוגת מנהל מערכת' : 'Dean View (System Admin)')
            : (lang === 'he' ? 'דיקן הפקולטה' : 'Dean of the Faculty')
      }
      subtitle={lang === 'he' ? 'הצעות מחקר הממתינות לאישורך' : 'Research proposals awaiting your sign-off'}
      showBackButton={false}
    >
      <PendingSignoffsWidget showEmptyState />
    </DashboardShell>
  );
}
