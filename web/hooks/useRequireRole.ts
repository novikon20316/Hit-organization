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
import { getHomeRoute, resolveActiveRole, type AppRole } from '@/lib/roles';

const ACCOUNT_DELETION_PENDING_PATH = '/account-deletion-pending';
const CHANGE_PASSWORD_PATH = '/change-password';
const CHOOSE_TRACK_PATH = '/choose-track';

export function useRequireRole(allowedRoles: AppRole[]) {
  const router = useRouter();
  const pathname = usePathname();
  const { firebaseUser, userData, loading } = useAuth();

  const roles = userData ? [userData.role, ...(userData.roles ?? [])] : [];
  const isAllowed = roles.some((r) => allowedRoles.includes(r));
  // A forced temp-password change (server/src/services/userImportExport.ts,
  // adminController.ts) takes priority over every other gate below — this
  // re-checks userData (a live Firestore onSnapshot, not a one-time login
  // snapshot) on every navigation, so a user can't reach a protected page by
  // navigating away from /change-password (e.g. the browser back button)
  // before submitting a new password. The server independently rejects API
  // calls in this state too (see server/src/middleware/auth.ts) — this is
  // belt-and-suspenders so the page itself doesn't even render.
  const mustChangePassword = !!userData?.mustChangePassword;
  // A account-deletion grace period (server/src/services/accountDeletion.ts)
  // takes priority over the normal role gate — reachable by any role, so
  // this redirect fires regardless of whether the current page's
  // allowedRoles would otherwise have permitted this user in.
  const pendingDeletion = !!userData?.pendingDeletion;
  // A computer_science masters student whose average qualified them for the
  // thesis track (see config/studentTrack.ts's coordinator_gated policy)
  // must decide thesis-vs-project before doing anything else — same
  // "re-checks the live Firestore snapshot on every navigation" belt-and-
  // suspenders reasoning as mustChangePassword above, so the decision can't
  // be dodged by navigating away from /choose-track and it reappears on
  // every reopen until trackLocked flips true. Excludes a student who
  // already has an active project — enrollment never sets trackLocked (see
  // services/projectEnrollment.ts), so a coordinator entering/correcting an
  // average AFTER enrollment must not yank an already-enrolled student into
  // this screen; the track question only matters before they have one.
  const pendingTrackChoice =
    userData?.role === 'student' &&
    userData?.trackPolicy === 'coordinator_gated' &&
    userData?.thesisEligibility?.eligible === true &&
    !userData?.trackLocked &&
    !userData?.hasActiveProject;

  useEffect(() => {
    if (loading) return;
    if (!firebaseUser || !userData) {
      router.replace('/login');
      return;
    }
    if (mustChangePassword && pathname !== CHANGE_PASSWORD_PATH) {
      router.replace(CHANGE_PASSWORD_PATH);
      return;
    }
    if (pendingDeletion && pathname !== ACCOUNT_DELETION_PENDING_PATH) {
      router.replace(ACCOUNT_DELETION_PENDING_PATH);
      return;
    }
    if (pendingTrackChoice && pathname !== CHOOSE_TRACK_PATH) {
      router.replace(CHOOSE_TRACK_PATH);
      return;
    }
    if (!isAllowed) {
      router.replace(getHomeRoute(resolveActiveRole(userData)));
    }
  }, [loading, firebaseUser, userData, isAllowed, mustChangePassword, pendingDeletion, pendingTrackChoice, pathname, router, allowedRoles]);

  const showAsLoading =
    loading ||
    (!!firebaseUser &&
      !!userData &&
      ((mustChangePassword && pathname !== CHANGE_PASSWORD_PATH) ||
        (pendingDeletion && pathname !== ACCOUNT_DELETION_PENDING_PATH) ||
        (pendingTrackChoice && pathname !== CHOOSE_TRACK_PATH) ||
        !isAllowed));
  return { firebaseUser, userData, loading: showAsLoading, isAllowed };
}
