// hooks/useMaintenanceCheck.ts
// Ported from mobile/hooks/useMaintenanceCheck.ts — same public endpoint,
// same bypass rule (system_admin never blocked), same fail-open behavior.

import { useCallback } from 'react';
import { apiClient } from '@/lib/apiClient';

export interface MaintenanceStatus {
  isActive: boolean;
  title: string;
  endsAt: string | null;
}

export interface MaintenanceCheckResult {
  /** True when maintenance is active AND the caller is not a system_admin */
  blocked: boolean;
  title: string;
  endsAt: string | null;
}

// Roles that are never blocked by maintenance — add roles here as needed.
const BYPASS_ROLES: string[] = ['system_admin'];

/**
 * Returns a `checkMaintenance(role)` function. Call it right after the
 * user's role is known (post-login / post-2FA). Hits a public endpoint —
 * no auth token required, and failure to reach it fails open (doesn't block
 * users) rather than locking everyone out if the status check itself breaks.
 */
export function useMaintenanceCheck() {
  return useCallback(async (role: string): Promise<MaintenanceCheckResult> => {
    if (BYPASS_ROLES.includes(role)) {
      return { blocked: false, title: '', endsAt: null };
    }

    try {
      const res = await apiClient.get<MaintenanceStatus>('/api/system/maintenance-status');
      return {
        blocked: res.isActive,
        title: res.title ?? '',
        endsAt: res.endsAt ?? null,
      };
    } catch {
      return { blocked: false, title: '', endsAt: null };
    }
  }, []);
}
