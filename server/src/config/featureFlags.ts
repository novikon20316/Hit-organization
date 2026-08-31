// src/config/featureFlags.ts
//
// Temporary debug-tooling flags — not meant to live long-term. Flip to
// `false` (and redeploy) to kill the feature instantly without a code
// revert.

// system_admin "impersonate user" (see adminController.ts's impersonateUser)
// — lets a system_admin sign in as another user from the web Users tab for
// debugging. Turn off once the current debugging push is done.
export const IMPERSONATION_ENABLED = true;
