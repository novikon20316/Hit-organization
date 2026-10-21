'use client';

// hooks/useUsersLiveRefresh.ts
// Calls `refetch` whenever any user account is added, edited or removed —
// including ones created behind the scenes (an Admin-SDK seed script, a bulk
// import, another staff member). Sibling of useLiveRefresh.ts, which only
// fires on the signed-in user's own notifications and so never sees a new
// account appear. Driven by config/usersChangeSignal (see
// server/src/services/usersChangeSignal.ts and useChangeSignalRefresh.ts).

import { useChangeSignalRefresh } from './useChangeSignalRefresh';

export function useUsersLiveRefresh(refetch: () => unknown) {
  useChangeSignalRefresh('usersChangeSignal', refetch);
}
