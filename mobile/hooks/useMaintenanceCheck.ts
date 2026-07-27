import { useCallback } from 'react';
import { apiClient } from '@/src/api/apiClient';

// ─── Shape returned by GET /api/system/maintenance-status ────────────────────
export interface MaintenanceStatus {
  isActive: boolean;
  title: string;
  endsAt: string | null;   // ISO string or null
}

// ─── Shape returned by this hook ─────────────────────────────────────────────
export interface MaintenanceCheckResult {
  /** True when maintenance is active AND the caller is not a system_admin */
  blocked: boolean;
  title: string;
  endsAt: string | null;
}

// ─── Roles that are never blocked by maintenance ─────────────────────────────
// Add roles here as needed — no other change required.
const BYPASS_ROLES: string[] = ['system_admin'];

/**
 * Returns a `checkMaintenance(role)` function.
 * Call it after the user's role is known (post-login / post-2FA / in _layout).
 * It hits the public endpoint — no auth token required.
 *
 * Usage:
 *   const checkMaintenance = useMaintenanceCheck();
 *   const result = await checkMaintenance(role);
 *   if (result.blocked) router.replace('/maintenance');
 */
export function useMaintenanceCheck() {
  const checkMaintenance = useCallback(
    async (role: string): Promise<MaintenanceCheckResult> => {
      // Bypass roles skip the network call entirely
      if (BYPASS_ROLES.includes(role)) {
        return { blocked: false, title: '', endsAt: null };
      }

      try {
        // platform=mobile — reads mobile's own maintenance flag, separate
        // from web's (server/src/services/maintenanceStatus.ts). This is
        // only the one-time login-time check; the server's verifyToken
        // middleware is what actually enforces it for every request after.
        const res = await apiClient.get<MaintenanceStatus>(
          '/api/system/maintenance-status',
          { params: { platform: 'mobile' } },
        );
        const { isActive, title, endsAt } = res.data;

        return {
          blocked: isActive,
          title:   title ?? '',
          endsAt:  endsAt ?? null,
        };
      } catch {
        // If the status endpoint is unreachable, fail open — don't block users
        return { blocked: false, title: '', endsAt: null };
      }
    },
    []
  );

  return checkMaintenance;
}