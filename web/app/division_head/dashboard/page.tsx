'use client';

// app/division_head/dashboard/page.tsx
// Deliberately minimal — division_head's only job today is signing off on
// the "Head of Division" stage of the Electrical Engineering
// research-proposal chain (see server/src/scripts's workflow-template seed
// script). Rather than a bespoke dashboard, this page is just the generic
// PendingSignoffsWidget (server/src/services/pendingSignoffs.ts's
// 'chain_stage' item type) inside the shared DashboardShell chrome — see
// app/program_head/dashboard/page.tsx for the precedent this reuses instead
// of duplicating.

import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { useRequireRole } from '@/hooks/useRequireRole';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { PendingSignoffsWidget } from '@/components/dashboard/PendingSignoffsWidget';
import type { AppRole } from '@/lib/roles';

const DIVISION_HEAD_ROLES: AppRole[] = ['division_head', 'system_admin'];

export default function DivisionHeadDashboardPage() {
  const { loading: guardLoading } = useRequireRole(DIVISION_HEAD_ROLES);
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
            ? (lang === 'he' ? 'ראש תחום — תצוגת מנהל מערכת' : 'Head of Division View (System Admin)')
            : (lang === 'he' ? 'ראש תחום' : 'Head of Division')
      }
      subtitle={lang === 'he' ? 'הצעות מחקר הממתינות לאישורך' : 'Research proposals awaiting your sign-off'}
      showBackButton={false}
    >
      <PendingSignoffsWidget showEmptyState />
    </DashboardShell>
  );
}
