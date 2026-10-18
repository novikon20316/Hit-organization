// src/config/featureFlags.ts
//
// Temporary debug-tooling flags — not meant to live long-term. Flip to
// `false` (and redeploy) to kill the feature instantly without a code
// revert.

import { userBelongsToFaculties } from '../services/facultyMembership.js';

// system_admin "impersonate user" (see adminController.ts's impersonateUser)
// — lets a system_admin sign in as another user from the web Users tab for
// debugging. Turn off once the current debugging push is done.
export const IMPERSONATION_ENABLED = true;

// Faculties whose users are REAL people already using the system — no one
// in them may be impersonated, even while IMPERSONATION_ENABLED is on.
// Other faculties are still test-only. Add a faculty here when it goes live.
export const IMPERSONATION_PROTECTED_FACULTIES: readonly string[] = ['data_science'];

/** True when a user belongs to, or works on, a protected faculty — by home
 *  faculty, program, assigned programs, coordinator scopes, or any per-role
 *  faculty list. An institution-wide account ('all') with no narrowing
 *  scope covers every faculty, so it counts as protected too. */
export function isImpersonationProtected(u: Record<string, any>): boolean {
  return userBelongsToFaculties(u, IMPERSONATION_PROTECTED_FACULTIES);
}
