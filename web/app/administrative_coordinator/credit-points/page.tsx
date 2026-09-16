'use client';

// app/administrative_coordinator/credit-points/page.tsx
// "נקודות זכות למנחים" as its own menu item for administrative_secretary and
// system_admin, moved out of the Statistics tab (see
// CoordinatorStatisticsTab.tsx's showCreditPoints prop and
// SupervisorCreditPointsPanel.tsx, which this page just renders).

import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { useRequireRole } from '@/hooks/useRequireRole';
import { useLanguage } from '@/contexts/LanguageContext';
import { SupervisorCreditPointsPanel } from '@/components/dashboard/SupervisorCreditPointsPanel';
import type { AppRole } from '@/lib/roles';

const ALLOWED_ROLES: AppRole[] = ['administrative_secretary', 'system_admin'];

export default function SupervisorCreditPointsPage() {
  const { isAllowed } = useRequireRole(ALLOWED_ROLES);
  const { lang } = useLanguage();

  if (!isAllowed) return null;

  return (
    <DashboardShell title={lang === 'he' ? 'נקודות זכות למנחים' : 'Supervisor Credit Points'} showBackButton={false}>
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <SupervisorCreditPointsPanel />
      </div>
    </DashboardShell>
  );
}
