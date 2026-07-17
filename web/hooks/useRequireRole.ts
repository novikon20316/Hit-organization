'use client';

// hooks/useRequireRole.ts
// Page-level guard: redirect to /login while signed out, or to the user's
// own dashboard if they're signed in but their role has no business on this
// page. Define the allowed-roles array as a module-level constant in the
// calling page (not inline in the render) so its reference is stable across
// renders — that's what keeps this effect from re-running every render.

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { getHomeRoute, type AppRole } from '@/lib/roles';

const ACCOUNT_DELETION_PENDING_PATH = '/account-deletion-pending';

export function useRequireRole(allowedRoles: AppRole[]) {
  const router = useRouter();
  const pathname = usePathname();
  const { firebaseUser, userData, loading } = useAuth();

  const roles = userData ? [userData.role, ...(userData.roles ?? [])] : [];
  const isAllowed = roles.some((r) => allowedRoles.includes(r));
  // A account-deletion grace period (server/src/services/accountDeletion.ts)
  // takes priority over the normal role gate — reachable by any role, so
  // this redirect fires regardless of whether the current page's
  // allowedRoles would otherwise have permitted this user in.
  const pendingDeletion = !!userData?.pendingDeletion;

  useEffect(() => {
    if (loading) return;
    if (!firebaseUser || !userData) {
      router.replace('/login');
      return;
    }
    if (pendingDeletion && pathname !== ACCOUNT_DELETION_PENDING_PATH) {
      router.replace(ACCOUNT_DELETION_PENDING_PATH);
      return;
    }
    if (!isAllowed) {
      router.replace(getHomeRoute(userData.role));
    }
  }, [loading, firebaseUser, userData, isAllowed, pendingDeletion, pathname, router, allowedRoles]);

  const showAsLoading =
    loading || (!!firebaseUser && !!userData && ((pendingDeletion && pathname !== ACCOUNT_DELETION_PENDING_PATH) || !isAllowed));
  return { firebaseUser, userData, loading: showAsLoading, isAllowed };
}
